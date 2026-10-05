import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { defaultSettings } from "../lib/catalog";
import type {
  ID,
  Match,
  MatchEvent,
  Meta,
  Player,
  Rally,
  Season,
  SetRecord,
  Settings,
  Team,
} from "../types";

export const DB_NAME = "volleyball-stats";
export const DB_VERSION = 1;

interface VBSchema extends DBSchema {
  teams: { key: ID; value: Team };
  seasons: { key: ID; value: Season; indexes: { teamId: ID } };
  players: { key: ID; value: Player; indexes: { teamId: ID } };
  matches: { key: ID; value: Match; indexes: { teamId: ID; seasonId: ID; date: string } };
  sets: { key: ID; value: SetRecord; indexes: { matchId: ID } };
  rallies: { key: ID; value: Rally; indexes: { matchId: ID; setId: ID } };
  events: {
    key: ID;
    value: MatchEvent;
    indexes: { matchId: ID; setId: ID; rallyId: ID; playerId: ID; playerInId: ID; playerOutId: ID };
  };
  /** Singletons: "settings" and "meta". */
  kv: { key: string; value: unknown };
}

export type RecordStore = "teams" | "seasons" | "players" | "matches" | "sets" | "rallies" | "events";
export const RECORD_STORES: RecordStore[] = [
  "teams",
  "seasons",
  "players",
  "matches",
  "sets",
  "rallies",
  "events",
];

export type VBDB = IDBPDatabase<VBSchema>;

let dbPromise: Promise<VBDB> | null = null;

export function getDb(): Promise<VBDB> {
  if (!dbPromise) dbPromise = openAppDb(DB_NAME);
  return dbPromise;
}

/** For tests: drop the cached connection so the next getDb() opens fresh. */
export async function resetDbForTests(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function openAppDb(name: string): Promise<VBDB> {
  return openDB<VBSchema>(name, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore("teams", { keyPath: "id" });
        db.createObjectStore("seasons", { keyPath: "id" }).createIndex("teamId", "teamId");
        db.createObjectStore("players", { keyPath: "id" }).createIndex("teamId", "teamId");
        const matches = db.createObjectStore("matches", { keyPath: "id" });
        matches.createIndex("teamId", "teamId");
        matches.createIndex("seasonId", "seasonId");
        matches.createIndex("date", "date");
        db.createObjectStore("sets", { keyPath: "id" }).createIndex("matchId", "matchId");
        const rallies = db.createObjectStore("rallies", { keyPath: "id" });
        rallies.createIndex("matchId", "matchId");
        rallies.createIndex("setId", "setId");
        const events = db.createObjectStore("events", { keyPath: "id" });
        events.createIndex("matchId", "matchId");
        events.createIndex("setId", "setId");
        events.createIndex("rallyId", "rallyId");
        // Records without the field are simply left out of these indexes.
        events.createIndex("playerId", "playerId");
        events.createIndex("playerInId", "playerInId");
        events.createIndex("playerOutId", "playerOutId");
        db.createObjectStore("kv");
      }
    },
  });
}

// ---------------------------------------------------------------- settings / meta

/**
 * Fills in any keys added in later versions, so an old backup or an old
 * install never hands the app a settings object with holes in it.
 */
export function normalizeSettings(raw: unknown): Settings {
  const base = defaultSettings();
  if (!raw || typeof raw !== "object") return base;
  return { ...base, ...(raw as Partial<Settings>) };
}

export async function getSettings(): Promise<Settings> {
  const db = await getDb();
  return normalizeSettings(await db.get("kv", "settings"));
}

export async function saveSettings(settings: Settings): Promise<void> {
  const db = await getDb();
  await db.put("kv", settings, "settings");
}

export async function getMeta(): Promise<Meta> {
  const db = await getDb();
  const raw = (await db.get("kv", "meta")) as Partial<Meta> | undefined;
  return { lastBackupAt: raw?.lastBackupAt ?? null };
}

export async function saveMeta(meta: Meta): Promise<void> {
  const db = await getDb();
  await db.put("kv", meta, "meta");
}

// ---------------------------------------------------------------- records

export async function listTeams(): Promise<Team[]> {
  return (await getDb()).getAll("teams");
}

export async function listSeasons(): Promise<Season[]> {
  return (await getDb()).getAll("seasons");
}

export async function listPlayers(): Promise<Player[]> {
  return (await getDb()).getAll("players");
}

export async function listMatches(): Promise<Match[]> {
  return (await getDb()).getAll("matches");
}

export async function putTeam(t: Team): Promise<void> {
  await (await getDb()).put("teams", t);
}

export async function putSeason(s: Season): Promise<void> {
  await (await getDb()).put("seasons", s);
}

export async function putPlayer(p: Player): Promise<void> {
  await (await getDb()).put("players", p);
}

/** Deletes the team and everything that belongs to it, in one transaction. */
export async function deleteTeamCascade(teamId: ID): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(RECORD_STORES, "readwrite");
  const matchIds = await tx.objectStore("matches").index("teamId").getAllKeys(teamId);
  for (const matchId of matchIds) {
    for (const store of ["sets", "rallies", "events"] as const) {
      const keys = await tx.objectStore(store).index("matchId").getAllKeys(matchId);
      for (const k of keys) await tx.objectStore(store).delete(k);
    }
    await tx.objectStore("matches").delete(matchId);
  }
  for (const store of ["seasons", "players"] as const) {
    const keys = await tx.objectStore(store).index("teamId").getAllKeys(teamId);
    for (const k of keys) await tx.objectStore(store).delete(k);
  }
  await tx.objectStore("teams").delete(teamId);
  await tx.done;
}

/** Matches in the season are kept and become "no season". */
export async function deleteSeason(seasonId: ID): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["seasons", "matches"], "readwrite");
  const matches = await tx.objectStore("matches").index("seasonId").getAll(seasonId);
  for (const m of matches) await tx.objectStore("matches").put({ ...m, seasonId: null });
  await tx.objectStore("seasons").delete(seasonId);
  await tx.done;
}

export async function countMatchesInSeason(seasonId: ID): Promise<number> {
  return (await getDb()).countFromIndex("matches", "seasonId", seasonId);
}

/** True if any match record mentions the player, so deleting would orphan stats. */
export async function playerHasHistory(player: Player): Promise<boolean> {
  const db = await getDb();
  for (const index of ["playerId", "playerInId", "playerOutId"] as const) {
    if ((await db.countFromIndex("events", index, player.id)) > 0) return true;
  }
  const matches = await db.getAllFromIndex("matches", "teamId", player.teamId);
  for (const m of matches) {
    if (m.liberoIds.includes(player.id)) return true;
    const sets = await db.getAllFromIndex("sets", "matchId", m.id);
    if (sets.some((s) => s.setterId === player.id || s.startingLineup.includes(player.id))) return true;
  }
  return false;
}

export async function deletePlayer(playerId: ID): Promise<void> {
  await (await getDb()).delete("players", playerId);
}

// ---------------------------------------------------------------- storage

/**
 * Asks the browser not to evict our data under storage pressure. Safari grants
 * this more readily once the app is on the home screen.
 */
export async function requestPersistence(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
