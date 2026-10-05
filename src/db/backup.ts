import type { Match, MatchEvent, Player, Rally, Season, SetRecord, Settings, Team } from "../types";
import { DB_VERSION, getDb, getMeta, normalizeSettings, RECORD_STORES, saveMeta, type RecordStore } from "./db";

export const BACKUP_APP = "volleyball-stats";
/** Bump when the file layout changes in a way older versions can't read. */
export const BACKUP_FORMAT = 1;

export interface BackupData {
  teams: Team[];
  seasons: Season[];
  players: Player[];
  matches: Match[];
  sets: SetRecord[];
  rallies: Rally[];
  events: MatchEvent[];
  settings: Settings;
}

export interface BackupFile {
  app: typeof BACKUP_APP;
  format: number;
  dbVersion: number;
  exportedAt: string;
  data: BackupData;
}

export interface BackupSummary {
  exportedAt: string;
  counts: Record<RecordStore, number>;
  teamNames: string[];
  /** Problems found that don't stop a restore, e.g. a player whose team is missing. */
  warnings: string[];
}

export async function buildBackup(): Promise<BackupFile> {
  const db = await getDb();
  const tx = db.transaction([...RECORD_STORES, "kv"], "readonly");
  const [teams, seasons, players, matches, sets, rallies, events, settings] = await Promise.all([
    tx.objectStore("teams").getAll(),
    tx.objectStore("seasons").getAll(),
    tx.objectStore("players").getAll(),
    tx.objectStore("matches").getAll(),
    tx.objectStore("sets").getAll(),
    tx.objectStore("rallies").getAll(),
    tx.objectStore("events").getAll(),
    tx.objectStore("kv").get("settings"),
  ]);
  await tx.done;
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    dbVersion: DB_VERSION,
    exportedAt: new Date().toISOString(),
    data: { teams, seasons, players, matches, sets, rallies, events, settings: normalizeSettings(settings) },
  };
}

export function backupFileName(exportedAt: string): string {
  // Local time, so the name matches the day the user made it.
  const d = new Date(exportedAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `volleyball-stats-backup-${stamp}.json`;
}

export function serializeBackup(b: BackupFile): string {
  return JSON.stringify(b);
}

export type ParseResult =
  | { ok: true; backup: BackupFile; summary: BackupSummary }
  | { ok: false; error: string };

/** Checks a file's contents before anything is touched. */
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file isn't a backup: it couldn't be read as JSON." };
  }
  if (!isObject(raw) || raw.app !== BACKUP_APP)
    return { ok: false, error: "This file isn't a Volleyball Stats backup." };
  if (typeof raw.format !== "number" || raw.format > BACKUP_FORMAT)
    return {
      ok: false,
      error: "This backup was made by a newer version of the app. Update the app, then try again.",
    };
  if (!isObject(raw.data)) return { ok: false, error: "The backup is missing its data." };
  const data = raw.data;

  for (const store of RECORD_STORES) {
    const list = data[store];
    if (list === undefined) {
      data[store] = [];
      continue;
    }
    if (!Array.isArray(list)) return { ok: false, error: `The backup's ${store} list is damaged.` };
    for (const rec of list) {
      if (!isObject(rec) || typeof rec.id !== "string" || rec.id === "")
        return { ok: false, error: `The backup has a damaged entry in ${store}.` };
    }
  }

  const backup: BackupFile = {
    app: BACKUP_APP,
    format: raw.format,
    dbVersion: typeof raw.dbVersion === "number" ? raw.dbVersion : DB_VERSION,
    exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : new Date(0).toISOString(),
    data: {
      ...(data as unknown as BackupData),
      settings: normalizeSettings(data.settings),
    },
  };
  return { ok: true, backup, summary: summarize(backup) };
}

function summarize(b: BackupFile): BackupSummary {
  const d = b.data;
  const counts = Object.fromEntries(RECORD_STORES.map((s) => [s, d[s].length])) as Record<RecordStore, number>;
  const warnings: string[] = [];
  const teamIds = new Set(d.teams.map((t) => t.id));
  const matchIds = new Set(d.matches.map((m) => m.id));
  const orphan = (n: number, what: string) => {
    if (n > 0) warnings.push(`${n} ${what}`);
  };
  orphan(d.seasons.filter((s) => !teamIds.has(s.teamId)).length, "season(s) belong to a team that isn't in the file.");
  orphan(d.players.filter((p) => !teamIds.has(p.teamId)).length, "player(s) belong to a team that isn't in the file.");
  orphan(d.matches.filter((m) => !teamIds.has(m.teamId)).length, "match(es) belong to a team that isn't in the file.");
  orphan(
    d.sets.filter((s) => !matchIds.has(s.matchId)).length + d.rallies.filter((r) => !matchIds.has(r.matchId)).length,
    "set or rally record(s) belong to a match that isn't in the file.",
  );
  orphan(d.events.filter((e) => !matchIds.has(e.matchId)).length, "stat(s) belong to a match that isn't in the file.");
  return {
    exportedAt: b.exportedAt,
    counts,
    teamNames: d.teams.map((t) => t.name).sort((a, z) => a.localeCompare(z)),
    warnings,
  };
}

/**
 * Replaces everything on this device with the backup. One transaction, so a
 * failure part-way leaves the existing data as it was.
 */
export async function restoreBackup(b: BackupFile): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([...RECORD_STORES, "kv"], "readwrite");
  for (const store of RECORD_STORES) {
    const os = tx.objectStore(store);
    await os.clear();
    for (const rec of b.data[store]) await (os as unknown as { put(v: unknown): Promise<unknown> }).put(rec);
  }
  await tx.objectStore("kv").put(b.data.settings, "settings");
  await tx.done;
  // The data on the device now matches a backup made at exportedAt. Keep the
  // later of that and any backup this device made itself.
  const meta = await getMeta();
  const last = meta.lastBackupAt && meta.lastBackupAt > b.exportedAt ? meta.lastBackupAt : b.exportedAt;
  await saveMeta({ ...meta, lastBackupAt: last });
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Days since the last backup, or null if there has never been one. */
export function daysSince(iso: string | null, now = new Date()): number | null {
  if (!iso) return null;
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}

export function backupIsStale(lastBackupAt: string | null, reminderDays: number, now = new Date()): boolean {
  const d = daysSince(lastBackupAt, now);
  return d === null || d >= reminderDays;
}
