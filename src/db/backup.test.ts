import { beforeEach, describe, expect, it } from "vitest";
import { defaultSettings } from "../lib/catalog";
import { useApp } from "../state/store";
import type { Match, MatchEvent, Rally, SetRecord } from "../types";
import { backupIsStale, buildBackup, daysSince, parseBackup, restoreBackup, serializeBackup } from "./backup";
import { getDb, getMeta, getSettings, resetDbForTests } from "./db";

beforeEach(async () => {
  await resetDbForTests();
  await useApp.getState().load();
});

/** Builds a team with a roster, a season and one match with a set, rally and event. */
async function seed() {
  const app = useApp.getState();
  const team = await app.createTeam("14U Gold");
  const season = await app.createSeason(team.id, "Club 2026", 2026);
  const ava = await app.createPlayer(team.id, { name: "Ava", number: "7", positions: ["OH"] });
  await app.createPlayer(team.id, { name: "Bea", number: "12", positions: ["S"] });
  await app.updateSettings({ backupReminderDays: 3, entryOrder: "stat_first" });

  const t = new Date().toISOString();
  const match: Match = {
    id: "m1", teamId: team.id, seasonId: season.id, opponent: "Rivals", date: "2026-10-04", location: "Gym",
    event: "", format: team.defaultFormat, liberoIds: [], liveButtons: ["attack_kill"], reviewButtons: [],
    passRatingMode: "optional", status: "complete", createdAt: t, updatedAt: t,
  };
  const set: SetRecord = {
    id: "s1", matchId: "m1", number: 1, startingLineup: [ava.id, null, null, null, null, null], setterId: null,
    firstServer: "us", finalScore: { us: 25, them: 20 }, winner: "us", videos: [], createdAt: t, updatedAt: t,
  };
  const rally: Rally = {
    id: "r1", matchId: "m1", setId: "s1", number: 1, servingTeam: "us", scoreBefore: { us: 0, them: 0 },
    lineup: set.startingLineup, winner: "us", pointReason: { kind: "stat", eventId: "e1" }, startedAt: t,
  };
  const event: MatchEvent = {
    id: "e1", matchId: "m1", setId: "s1", rallyId: "r1", type: "stat", team: "us", playerId: ava.id,
    action: "attack", outcome: "kill", passRating: null, errorSubtypeId: null, customStatId: null,
    videoTime: null, wallClock: t, source: "live", createdAt: t, updatedAt: t,
  };
  const db = await getDb();
  await db.put("matches", match);
  await db.put("sets", set);
  await db.put("rallies", rally);
  await db.put("events", event);
  return { team, ava };
}

describe("backup round trip", () => {
  it("restores exactly what was backed up after a wipe", async () => {
    await seed();
    const before = await buildBackup();
    const text = serializeBackup(before);

    await resetDbForTests();
    await useApp.getState().load();
    expect(useApp.getState().teams).toHaveLength(0);

    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.summary.counts).toMatchObject({ teams: 1, players: 2, seasons: 1, matches: 1, sets: 1, rallies: 1, events: 1 });
    expect(parsed.summary.teamNames).toEqual(["14U Gold"]);
    expect(parsed.summary.warnings).toEqual([]);

    await restoreBackup(parsed.backup);
    const after = await buildBackup();
    expect(after.data).toEqual(before.data);
    expect((await getSettings()).entryOrder).toBe("stat_first");
    expect((await getMeta()).lastBackupAt).toBe(before.exportedAt);
  });

  it("replaces existing data rather than merging", async () => {
    await seed();
    const text = serializeBackup(await buildBackup());
    await useApp.getState().createTeam("Made after the backup");
    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    await restoreBackup(parsed.backup);
    await useApp.getState().load();
    expect(useApp.getState().teams.map((t) => t.name)).toEqual(["14U Gold"]);
  });

  it("keeps a later device backup date when restoring an older file", async () => {
    await seed();
    const old = await buildBackup();
    old.exportedAt = "2026-01-01T00:00:00.000Z";
    await useApp.getState().markBackedUp("2026-06-01T00:00:00.000Z");
    await restoreBackup(old);
    expect((await getMeta()).lastBackupAt).toBe("2026-06-01T00:00:00.000Z");
  });
});

describe("parseBackup", () => {
  it("rejects files that aren't JSON", () => {
    const r = parseBackup("not json");
    expect(r.ok).toBe(false);
  });

  it("rejects other apps' JSON", () => {
    expect(parseBackup(JSON.stringify({ hello: 1 })).ok).toBe(false);
  });

  it("rejects backups from a newer format", () => {
    const r = parseBackup(JSON.stringify({ app: "volleyball-stats", format: 999, data: {} }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/newer version/);
  });

  it("rejects damaged records", () => {
    const r = parseBackup(JSON.stringify({ app: "volleyball-stats", format: 1, data: { teams: [{ name: "no id" }] } }));
    expect(r.ok).toBe(false);
  });

  it("fills in missing lists and settings", () => {
    const r = parseBackup(JSON.stringify({ app: "volleyball-stats", format: 1, exportedAt: "2026-01-01T00:00:00Z", data: {} }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backup.data.events).toEqual([]);
    expect(r.backup.data.settings).toEqual(defaultSettings());
  });

  it("warns about orphaned records without refusing", () => {
    const r = parseBackup(
      JSON.stringify({ app: "volleyball-stats", format: 1, data: { players: [{ id: "p", teamId: "gone", name: "X" }] } }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.summary.warnings).toHaveLength(1);
  });
});

describe("cascade delete", () => {
  it("removes a team's seasons, players, matches, sets, rallies and events", async () => {
    const { team } = await seed();
    await useApp.getState().deleteTeam(team.id);
    const b = await buildBackup();
    for (const store of ["teams", "seasons", "players", "matches", "sets", "rallies", "events"] as const) {
      expect(b.data[store]).toHaveLength(0);
    }
  });

  it("keeps matches when their season is deleted", async () => {
    await seed();
    const season = useApp.getState().seasons[0];
    await useApp.getState().deleteSeason(season.id);
    const db = await getDb();
    expect((await db.get("matches", "m1"))?.seasonId).toBeNull();
  });
});

describe("backup reminder", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  it("is stale when there has never been a backup", () => {
    expect(daysSince(null, now)).toBeNull();
    expect(backupIsStale(null, 7, now)).toBe(true);
  });
  it("is stale once the interval has passed", () => {
    expect(backupIsStale("2026-10-03T12:00:00Z", 7, now)).toBe(true);
    expect(backupIsStale("2026-10-04T12:00:00Z", 7, now)).toBe(false);
  });
});
