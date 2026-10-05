import { create } from "zustand";
import * as db from "../db/db";
import { DEFAULT_LIVE_LAYOUT_ID, DEFAULT_REVIEW_LAYOUT_ID, defaultFormat, defaultSettings } from "../lib/catalog";
import { newId, now } from "../lib/id";
import type { ID, Match, Meta, Player, Season, Settings, Team } from "../types";

// Edits update the in-memory state first and then write to IndexedDB, so a
// quick second tap always builds on the first one instead of on stale data.
// IndexedDB runs write transactions on a store in the order they're opened,
// so the disk ends up in the same order.
interface AppState {
  loaded: boolean;
  teams: Team[];
  seasons: Season[];
  players: Player[];
  matches: Match[];
  settings: Settings;
  meta: Meta;
  /** null = browser doesn't say. */
  persisted: boolean | null;

  load(): Promise<void>;

  createTeam(name: string): Promise<Team>;
  updateTeam(team: Team): Promise<void>;
  deleteTeam(id: ID): Promise<void>;

  createSeason(teamId: ID, name: string, year: number | null): Promise<Season>;
  updateSeason(season: Season): Promise<void>;
  deleteSeason(id: ID): Promise<void>;

  createPlayer(teamId: ID, fields: Pick<Player, "name" | "number" | "positions">): Promise<Player>;
  updatePlayer(player: Player): Promise<void>;
  deletePlayer(id: ID): Promise<void>;

  updateSettings(patch: Partial<Settings>): Promise<void>;
  markBackedUp(at?: string): Promise<void>;
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

export const useApp = create<AppState>((set, get) => ({
  loaded: false,
  teams: [],
  seasons: [],
  players: [],
  matches: [],
  settings: defaultSettings(),
  meta: { lastBackupAt: null },
  persisted: null,

  async load() {
    const [teams, seasons, players, matches, settings, meta] = await Promise.all([
      db.listTeams(),
      db.listSeasons(),
      db.listPlayers(),
      db.listMatches(),
      db.getSettings(),
      db.getMeta(),
    ]);
    set({ loaded: true, teams: teams.sort(byName), seasons, players, matches, settings, meta });
    // Don't hold the first render up on this.
    void db.requestPersistence().then((persisted) => set({ persisted }));
  },

  async createTeam(name) {
    const t = now();
    const team: Team = {
      id: newId(),
      name: name.trim(),
      notes: "",
      defaultFormat: defaultFormat(),
      defaultLiveLayoutId: DEFAULT_LIVE_LAYOUT_ID,
      defaultReviewLayoutId: DEFAULT_REVIEW_LAYOUT_ID,
      createdAt: t,
      updatedAt: t,
    };
    set({ teams: [...get().teams, team].sort(byName) });
    await db.putTeam(team);
    return team;
  },

  async updateTeam(team) {
    const next = { ...team, updatedAt: now() };
    set({ teams: get().teams.map((t) => (t.id === team.id ? next : t)).sort(byName) });
    await db.putTeam(next);
  },

  async deleteTeam(id) {
    await db.deleteTeamCascade(id);
    const s = get();
    set({
      teams: s.teams.filter((t) => t.id !== id),
      seasons: s.seasons.filter((x) => x.teamId !== id),
      players: s.players.filter((x) => x.teamId !== id),
      matches: s.matches.filter((x) => x.teamId !== id),
    });
  },

  async createSeason(teamId, name, year) {
    const t = now();
    const season: Season = { id: newId(), teamId, name: name.trim(), year, createdAt: t, updatedAt: t };
    set({ seasons: [...get().seasons, season] });
    await db.putSeason(season);
    return season;
  },

  async updateSeason(season) {
    const next = { ...season, updatedAt: now() };
    set({ seasons: get().seasons.map((s) => (s.id === season.id ? next : s)) });
    await db.putSeason(next);
  },

  async deleteSeason(id) {
    await db.deleteSeason(id);
    const s = get();
    set({
      seasons: s.seasons.filter((x) => x.id !== id),
      matches: s.matches.map((m) => (m.seasonId === id ? { ...m, seasonId: null } : m)),
    });
  },

  async createPlayer(teamId, fields) {
    const t = now();
    const player: Player = {
      id: newId(),
      teamId,
      name: fields.name.trim(),
      number: fields.number.trim(),
      positions: fields.positions,
      active: true,
      createdAt: t,
      updatedAt: t,
    };
    set({ players: [...get().players, player] });
    await db.putPlayer(player);
    return player;
  },

  async updatePlayer(player) {
    const next = { ...player, updatedAt: now() };
    set({ players: get().players.map((p) => (p.id === player.id ? next : p)) });
    await db.putPlayer(next);
  },

  async deletePlayer(id) {
    await db.deletePlayer(id);
    set({ players: get().players.filter((p) => p.id !== id) });
  },

  async updateSettings(patch) {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    await db.saveSettings(next);
  },

  async markBackedUp(at = now()) {
    const meta = { ...get().meta, lastBackupAt: at };
    set({ meta });
    await db.saveMeta(meta);
  },
}));

/** Roster sorted by jersey number (numerically where possible), then name. */
export function sortRoster(players: Player[]): Player[] {
  return [...players].sort((a, b) => {
    const na = parseInt(a.number, 10);
    const nb = parseInt(b.number, 10);
    if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
    if (isNaN(na) !== isNaN(nb)) return isNaN(na) ? 1 : -1;
    return a.number.localeCompare(b.number) || a.name.localeCompare(b.name);
  });
}

/** Jersey numbers used by more than one active player. Warned about, not blocked. */
export function duplicateNumbers(players: Player[]): Set<string> {
  const seen = new Map<string, number>();
  for (const p of players) {
    if (!p.active || !p.number) continue;
    seen.set(p.number, (seen.get(p.number) ?? 0) + 1);
  }
  return new Set([...seen].filter(([, n]) => n > 1).map(([num]) => num));
}
