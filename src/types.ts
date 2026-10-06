// The stored data model. Storage holds every ball contact even when the live
// screen only records who won each rally, so nothing here is shaped around a
// particular screen.

export type ID = string;
/** ISO-8601 timestamp, e.g. "2026-10-05T18:30:00.000Z". */
export type Timestamp = string;
export type TeamSide = "us" | "them";

export type Position = "OH" | "MB" | "OPP" | "S" | "L" | "DS";
export const POSITIONS: { id: Position; label: string }[] = [
  { id: "OH", label: "Outside hitter" },
  { id: "MB", label: "Middle blocker" },
  { id: "OPP", label: "Opposite / right side" },
  { id: "S", label: "Setter" },
  { id: "L", label: "Libero" },
  { id: "DS", label: "Defensive specialist" },
];

/** Court positions 1–6. Index 0 of a lineup array is position 1. */
export type CourtPosition = 1 | 2 | 3 | 4 | 5 | 6;
/** Player IDs in court positions 1–6, in that order. null = empty slot. */
export type Lineup = [ID | null, ID | null, ID | null, ID | null, ID | null, ID | null];

// ---------------------------------------------------------------- format

export interface MatchFormat {
  /** bestOf: match ends when one side wins a majority. fixed: every set is played. */
  setsMode: "bestOf" | "fixed";
  /** 3 or 5 for bestOf; any number ≥ 1 for fixed. */
  setCount: number;
  pointsPerSet: number;
  decidingSetPoints: number;
  /**
   * In fixed mode there is no true deciding set; some clubs still play the last
   * one short. Ignored in bestOf mode, where the last possible set always uses
   * decidingSetPoints.
   */
  fixedLastSetIsDeciding: boolean;
  winBy2: boolean;
  /** A set ends when either side reaches this, even if not ahead by 2. null = no cap. */
  pointCap: number | null;
  /** Warn when exceeded. null = no limit. */
  maxSubsPerSet: number | null;
}

// ---------------------------------------------------------------- stats

export type StatAction =
  | "serve"
  | "pass"
  | "set"
  | "attack"
  | "block"
  | "dig"
  | "error" // one of our errors not tied to another action (net touch, etc.)
  | "opponent_error"
  | "custom";

/**
 * "attempt" means the contact happened and stayed in play. Attempt totals for
 * a stat (e.g. attack attempts) count every event of that action, whatever the
 * outcome, which matches the college convention where kills and errors are
 * also attempts.
 */
export type StatOutcome =
  | "attempt"
  | "ace"
  | "kill"
  | "assist"
  | "solo"
  | "error"
  | "dig"
  | "neutral"
  | "point_won"
  | "point_lost";

export type PointEffect = "neutral" | "point_us" | "point_them";

export interface ErrorSubtype {
  id: ID;
  label: string;
  /** Hidden from pickers but kept so old stats still have a name. */
  archived?: boolean;
}

export interface CustomStat {
  id: ID;
  name: string;
  effect: PointEffect;
  help: string;
  archived?: boolean;
}

/** A button the user can place on the live or review screen. */
export type StatButtonId = string;

export interface Layout {
  id: ID;
  name: string;
  /** Ordered. Built-in button IDs or "custom:<customStatId>". */
  buttons: StatButtonId[];
  builtIn?: boolean;
}

export type PassRatingMode = "off" | "optional" | "required";
export type EntryOrder = "player_first" | "stat_first";

// ---------------------------------------------------------------- records

export interface Team {
  id: ID;
  name: string;
  notes: string;
  defaultFormat: MatchFormat;
  defaultLiveLayoutId: ID;
  defaultReviewLayoutId: ID;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Season {
  id: ID;
  teamId: ID;
  name: string;
  year: number | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Player {
  id: ID;
  teamId: ID;
  name: string;
  /** Text, so "00" and "07" survive. */
  number: string;
  positions: Position[];
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Match {
  id: ID;
  teamId: ID;
  seasonId: ID | null;
  opponent: string;
  /** Local date, YYYY-MM-DD. */
  date: string;
  location: string;
  event: string;
  /** Copied from the team default at creation, then editable. */
  format: MatchFormat;
  /** Up to two. Only one on court at a time. */
  liberoIds: ID[];
  /**
   * Buttons on each screen when the match was set up. Reports use these to tell
   * "not tracked" from zero, so they are snapshots, not layout references.
   */
  liveButtons: StatButtonId[];
  reviewButtons: StatButtonId[];
  passRatingMode: PassRatingMode;
  /** Practice matches are labelled and left out of season stats. */
  practice: boolean;
  status: "in_progress" | "complete";
  /** The undo step that ended the match, so undo can reopen it. */
  endedAction: number | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface VideoAnchor {
  rallyId: ID;
  /** Seconds into the video file where that rally's first serve happens. */
  videoTime: number;
}

/**
 * Safari cannot keep a handle to a file picked from the Files app, so the
 * video is identified by name, size and modified time and re-picked each
 * review session.
 */
export interface VideoRef {
  id: ID;
  fileName: string;
  size: number;
  lastModified: number;
  anchor: VideoAnchor | null;
}

export interface SetRecord {
  id: ID;
  matchId: ID;
  number: number;
  startingLineup: Lineup;
  setterId: ID | null;
  firstServer: TeamSide;
  finalScore: { us: number; them: number } | null;
  winner: TeamSide | null;
  status: "in_progress" | "complete";
  videos: VideoRef[];
  /** Undo steps: every user action in a match gets the next number. */
  createdAction: number;
  endedAction: number | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Why a rally ended. Errors are stat events (ours or theirs), so they count in
 * reports; "earned" means the other side won it with a play we don't track.
 */
export type PointReason = { kind: "stat"; eventId: ID } | { kind: "earned" } | null;

export interface RotationInfo {
  /** Rotations since the set's first serve, 0–5. */
  index: number;
  /** The setter's court position, for S1–S6 labels. null if no setter is marked or on court. */
  setterPosition: CourtPosition | null;
}

export interface Rally {
  id: ID;
  matchId: ID;
  setId: ID;
  number: number;
  servingTeam: TeamSide;
  scoreBefore: { us: number; them: number };
  /** Who is on court in positions 1–6 when the rally starts, libero included. */
  lineup: Lineup;
  winner: TeamSide | null;
  pointReason: PointReason;
  rotation: RotationInfo | null;
  startedAt: Timestamp;
  /** When the point was logged. */
  endedAt: Timestamp | null;
  createdAction: number;
  completedAction: number | null;
}

interface EventBase {
  id: ID;
  matchId: ID;
  setId: ID;
  rallyId: ID;
  /** Seconds into the set's video, once known. */
  videoTime: number | null;
  wallClock: Timestamp;
  source: "live" | "review";
  /** The undo step this was created in. */
  step: number;
  /** Order within the match. */
  seq: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** One contact or stat. */
export interface StatEvent extends EventBase {
  type: "stat";
  team: TeamSide;
  /** null when team is "them" (opponent). */
  playerId: ID | null;
  action: StatAction;
  outcome: StatOutcome;
  passRating: 0 | 1 | 2 | 3 | null;
  errorSubtypeId: ID | null;
  customStatId: ID | null;
}

/** Substitutions and libero replacements live in the same stream as stats. */
export interface LineupChangeEvent extends EventBase {
  type: "lineup";
  kind: "sub" | "libero_in" | "libero_out" | "correction";
  playerInId: ID | null;
  playerOutId: ID | null;
  courtPosition: CourtPosition | null;
  /** For "correction": the whole lineup after the fix. */
  lineupAfter: Lineup | null;
  /** For "correction": who serves next, if that was fixed too. */
  servingAfter: TeamSide | null;
  /** For "correction": the setter after the fix. undefined = unchanged. */
  setterAfter?: ID | null;
  /** Made by the app (libero going back out when she'd rotate to the front row). */
  auto: boolean;
}

export type MatchEvent = StatEvent | LineupChangeEvent;

// ---------------------------------------------------------------- settings

export interface Settings {
  entryOrder: EntryOrder;
  passRatingMode: PassRatingMode;
  errorSubtypes: ErrorSubtype[];
  customStats: CustomStat[];
  /** User-made layouts. Built-in presets are not stored. */
  customLayouts: Layout[];
  videoLeadInSeconds: number;
  backupReminderDays: number;
  /** After a point without a terminal stat, ask why (skippable). */
  promptForPointReason: boolean;
}

/** Per-device bookkeeping. Not part of a backup's restorable data. */
export interface Meta {
  lastBackupAt: Timestamp | null;
}
