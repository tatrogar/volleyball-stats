// The match engine. Everything here is pure: commands take the match's data
// and return a Mutation describing what to write. The current state of a set
// (score, who serves, who is where) is never stored; it is replayed from the
// rallies and lineup events, so undo is just "remove the last action".

import { resolveButton, type StatButton } from "./catalog";
import { newId } from "./id";
import type {
  CourtPosition,
  CustomStat,
  ID,
  LineupChangeEvent,
  Lineup,
  Match,
  MatchEvent,
  MatchFormat,
  PointReason,
  Rally,
  SetRecord,
  StatEvent,
  TeamSide,
} from "../types";

export interface MatchData {
  match: Match;
  sets: SetRecord[];
  rallies: Rally[];
  events: MatchEvent[];
}

export interface Mutation {
  put: { matches: Match[]; sets: SetRecord[]; rallies: Rally[]; events: MatchEvent[] };
  del: { sets: ID[]; rallies: ID[]; events: ID[] };
}

export const emptyMutation = (): Mutation => ({
  put: { matches: [], sets: [], rallies: [], events: [] },
  del: { sets: [], rallies: [], events: [] },
});

export function applyMutation(data: MatchData, m: Mutation): MatchData {
  const merge = <T extends { id: ID }>(list: T[], puts: T[], dels: ID[]): T[] => {
    const gone = new Set(dels);
    const byId = new Map(puts.map((p) => [p.id, p]));
    const out = list.filter((x) => !gone.has(x.id)).map((x) => byId.get(x.id) ?? x);
    for (const p of puts) if (!list.some((x) => x.id === p.id) && !gone.has(p.id)) out.push(p);
    return out;
  };
  return {
    match: m.put.matches.find((x) => x.id === data.match.id) ?? data.match,
    sets: merge(data.sets, m.put.sets, m.del.sets),
    rallies: merge(data.rallies, m.put.rallies, m.del.rallies),
    events: merge(data.events, m.put.events, m.del.events),
  };
}

// ---------------------------------------------------------------- court

/** Lineup index (0–5) of court positions 2, 3, 4. */
export const FRONT_ROW = [1, 2, 3];
export const isFrontRow = (index: number) => FRONT_ROW.includes(index);

/**
 * One rotation clockwise: the player in position 2 moves to 1 and serves,
 * 1 moves to 6, and so on.
 */
export function rotate(l: Lineup): Lineup {
  return [l[1], l[2], l[3], l[4], l[5], l[0]];
}

// ---------------------------------------------------------------- format rules

export function isDecidingSet(f: MatchFormat, setNumber: number): boolean {
  if (setNumber !== f.setCount) return false;
  return f.setsMode === "bestOf" || f.fixedLastSetIsDeciding;
}

export function targetPoints(f: MatchFormat, setNumber: number): number {
  return isDecidingSet(f, setNumber) ? f.decidingSetPoints : f.pointsPerSet;
}

/** Who has won the set at this score under the format, or null if it isn't over. */
export function setWinner(f: MatchFormat, setNumber: number, score: { us: number; them: number }): TeamSide | null {
  const hi = Math.max(score.us, score.them);
  const lead = Math.abs(score.us - score.them);
  if (lead === 0) return null;
  const leader: TeamSide = score.us > score.them ? "us" : "them";
  if (hi < targetPoints(f, setNumber)) return null;
  if (!f.winBy2 || lead >= 2) return leader;
  if (f.pointCap != null && hi >= f.pointCap) return leader;
  return null;
}

export interface MatchResult {
  over: boolean;
  setsWon: { us: number; them: number };
  winner: TeamSide | "tie" | null;
}

export function matchResult(f: MatchFormat, sets: SetRecord[]): MatchResult {
  const done = sets.filter((s) => s.status === "complete");
  const setsWon = {
    us: done.filter((s) => s.winner === "us").length,
    them: done.filter((s) => s.winner === "them").length,
  };
  if (f.setsMode === "bestOf") {
    const need = Math.floor(f.setCount / 2) + 1;
    if (setsWon.us >= need) return { over: true, setsWon, winner: "us" };
    if (setsWon.them >= need) return { over: true, setsWon, winner: "them" };
    return { over: false, setsWon, winner: null };
  }
  if (done.length >= f.setCount) {
    const winner = setsWon.us === setsWon.them ? "tie" : setsWon.us > setsWon.them ? "us" : "them";
    return { over: true, setsWon, winner };
  }
  return { over: false, setsWon, winner: null };
}

// ---------------------------------------------------------------- replay

export interface LiberoState {
  liberoId: ID;
  /** The player she replaced, who comes back when she leaves. null if unknown (after a lineup fix). */
  replacedId: ID | null;
}

export interface SetState {
  set: SetRecord;
  score: { us: number; them: number };
  serving: TeamSide;
  lineup: Lineup;
  libero: LiberoState | null;
  setterId: ID | null;
  rotationIndex: number;
  subsUsed: number;
  completed: Rally[];
  openRally: Rally | null;
  /** Number of the rally being played now. */
  rallyNumber: number;
}

const byNumber = (a: Rally, b: Rally) => a.number - b.number;
const bySeq = (a: MatchEvent, b: MatchEvent) => a.seq - b.seq;

export function deriveSetState(data: MatchData, setId: ID): SetState {
  const set = data.sets.find((s) => s.id === setId);
  if (!set) throw new Error("Unknown set");
  const st: SetState = {
    set,
    score: { us: 0, them: 0 },
    serving: set.firstServer,
    lineup: [...set.startingLineup] as Lineup,
    libero: null,
    setterId: set.setterId,
    rotationIndex: 0,
    subsUsed: 0,
    completed: [],
    openRally: null,
    rallyNumber: 1,
  };
  const rallies = data.rallies.filter((r) => r.setId === setId).sort(byNumber);
  const events = data.events.filter((e) => e.setId === setId).sort(bySeq);
  for (const r of rallies) {
    for (const e of events) if (e.rallyId === r.id && e.type === "lineup") applyLineup(st, e, data.match.liberoIds);
    if (r.winner) {
      st.score[r.winner]++;
      if (r.winner === "us" && st.serving === "them") {
        st.lineup = rotate(st.lineup);
        st.rotationIndex = (st.rotationIndex + 1) % 6;
      }
      st.serving = r.winner;
      st.completed.push(r);
    } else {
      st.openRally = r;
    }
  }
  st.rallyNumber = st.completed.length + 1;
  return st;
}

function applyLineup(st: SetState, e: LineupChangeEvent, liberoIds: ID[]): void {
  const at = (id: ID | null) => (id == null ? -1 : st.lineup.indexOf(id));
  switch (e.kind) {
    case "sub": {
      const i = at(e.playerOutId);
      if (i < 0) return;
      st.lineup[i] = e.playerInId;
      st.subsUsed++;
      // A setter coming off is usually replaced by the incoming setter, and
      // rotations are named after wherever the setter is.
      if (st.setterId && st.setterId === e.playerOutId) st.setterId = e.playerInId;
      return;
    }
    case "libero_in": {
      const i = at(e.playerOutId);
      if (i < 0 || !e.playerInId) return;
      const swappingLiberos = st.libero && st.libero.liberoId === e.playerOutId;
      st.lineup[i] = e.playerInId;
      st.libero = { liberoId: e.playerInId, replacedId: swappingLiberos ? st.libero!.replacedId : e.playerOutId };
      return;
    }
    case "libero_out": {
      if (!st.libero) return;
      const i = at(st.libero.liberoId);
      if (i >= 0) st.lineup[i] = e.playerInId ?? st.libero.replacedId;
      st.libero = null;
      return;
    }
    case "correction": {
      if (e.lineupAfter) st.lineup = [...e.lineupAfter] as Lineup;
      if (e.servingAfter) st.serving = e.servingAfter;
      if (e.setterAfter !== undefined) st.setterId = e.setterAfter;
      const onCourt = st.lineup.find((id) => id != null && liberoIds.includes(id)) ?? null;
      if (!onCourt) st.libero = null;
      else if (!st.libero || st.libero.liberoId !== onCourt) st.libero = { liberoId: onCourt, replacedId: null };
      return;
    }
  }
}

export function setterPosition(st: Pick<SetState, "lineup" | "setterId">): CourtPosition | null {
  if (!st.setterId) return null;
  const i = st.lineup.indexOf(st.setterId);
  return i < 0 ? null : ((i + 1) as CourtPosition);
}

/** "S1"–"S6" by where the setter is, or "Rotation 1"–"6" counted from the set's start. */
export function rotationLabel(r: { index: number; setterPosition: CourtPosition | null }): string {
  return r.setterPosition ? `S${r.setterPosition}` : `Rotation ${r.index + 1}`;
}

export function currentSet(data: MatchData): SetRecord | null {
  return data.sets.find((s) => s.status === "in_progress") ?? null;
}

// ---------------------------------------------------------------- building mutations

/** Collects the writes for one user action, keeping a working copy of the data up to date. */
class Tx {
  data: MatchData;
  readonly action: number;
  private seq: number;
  private mut = emptyMutation();
  constructor(
    data: MatchData,
    readonly now: string,
    action?: number,
  ) {
    this.data = data;
    this.action = action ?? nextAction(data);
    this.seq = data.events.reduce((m, e) => Math.max(m, e.seq), 0) + 1;
  }
  nextSeq() {
    return this.seq++;
  }
  private step(m: Mutation) {
    this.data = applyMutation(this.data, m);
    const keep = <T extends { id: ID }>(list: T[], items: T[]) => {
      for (const it of items) {
        const i = list.findIndex((x) => x.id === it.id);
        if (i >= 0) list[i] = it;
        else list.push(it);
      }
    };
    keep(this.mut.put.matches, m.put.matches);
    keep(this.mut.put.sets, m.put.sets);
    keep(this.mut.put.rallies, m.put.rallies);
    keep(this.mut.put.events, m.put.events);
    for (const k of ["sets", "rallies", "events"] as const) {
      for (const id of m.del[k]) {
        // Something made and removed in the same action never reaches the disk.
        const list = this.mut.put[k] as { id: ID }[];
        const i = list.findIndex((x) => x.id === id);
        if (i >= 0) list.splice(i, 1);
        this.mut.del[k].push(id);
      }
    }
  }
  put(kind: "matches" | "sets" | "rallies" | "events", item: Match | SetRecord | Rally | MatchEvent) {
    const m = emptyMutation();
    (m.put[kind] as unknown[]).push(item);
    this.step(m);
  }
  del(kind: "sets" | "rallies" | "events", id: ID) {
    const m = emptyMutation();
    m.del[kind].push(id);
    this.step(m);
  }
  result(): Mutation {
    return this.mut;
  }
}

/** Every user action in a match gets the next number; undo removes the highest. */
export function nextAction(data: MatchData): number {
  let m = data.match.endedAction ?? 0;
  for (const s of data.sets) m = Math.max(m, s.createdAction, s.endedAction ?? 0);
  for (const r of data.rallies) m = Math.max(m, r.createdAction, r.completedAction ?? 0);
  for (const e of data.events) m = Math.max(m, e.step);
  return m + 1;
}

function openRally(tx: Tx, setId: ID): Rally {
  const st = deriveSetState(tx.data, setId);
  if (st.openRally) return st.openRally;
  const last = st.completed[st.completed.length - 1];
  const rally: Rally = {
    id: newId(),
    matchId: tx.data.match.id,
    setId,
    number: st.rallyNumber,
    servingTeam: st.serving,
    scoreBefore: { ...st.score },
    lineup: [...st.lineup] as Lineup,
    winner: null,
    pointReason: null,
    rotation: null,
    startedAt: last?.endedAt ?? st.set.createdAt,
    endedAt: null,
    createdAction: tx.action,
    completedAction: null,
  };
  tx.put("rallies", rally);
  return rally;
}

function lineupEvent(tx: Tx, rally: Rally, fields: Partial<LineupChangeEvent> & Pick<LineupChangeEvent, "kind">): LineupChangeEvent {
  const e: LineupChangeEvent = {
    id: newId(),
    matchId: rally.matchId,
    setId: rally.setId,
    rallyId: rally.id,
    type: "lineup",
    playerInId: null,
    playerOutId: null,
    courtPosition: null,
    lineupAfter: null,
    servingAfter: null,
    auto: false,
    videoTime: null,
    wallClock: tx.now,
    source: "live",
    step: tx.action,
    seq: tx.nextSeq(),
    createdAt: tx.now,
    updatedAt: tx.now,
    ...fields,
  };
  tx.put("events", e);
  return e;
}

export type Notice = { kind: "libero_out"; liberoId: ID; returnedId: ID } | { kind: "libero_front_row"; liberoId: ID };

export interface CommandResult {
  mutation: Mutation;
  /** Set when this action ended a rally. */
  completedRallyId?: ID;
  notice?: Notice;
}

/** Ends the open rally, then sends the libero out if she has rotated to the front row. */
function completeRally(tx: Tx, setId: ID, winner: TeamSide, reason: PointReason): { rallyId: ID; notice?: Notice } {
  const rally = openRally(tx, setId);
  const st = deriveSetState(tx.data, setId);
  tx.put("rallies", {
    ...rally,
    servingTeam: st.serving,
    scoreBefore: { ...st.score },
    lineup: [...st.lineup] as Lineup,
    winner,
    pointReason: reason,
    rotation: { index: st.rotationIndex, setterPosition: setterPosition(st) },
    endedAt: tx.now,
    completedAction: tx.action,
  });

  const after = deriveSetState(tx.data, setId);
  if (!after.libero) return { rallyId: rally.id };
  const i = after.lineup.indexOf(after.libero.liberoId);
  if (i < 0 || !isFrontRow(i)) return { rallyId: rally.id };
  if (!after.libero.replacedId) return { rallyId: rally.id, notice: { kind: "libero_front_row", liberoId: after.libero.liberoId } };
  const next = openRally(tx, setId);
  lineupEvent(tx, next, {
    kind: "libero_out",
    playerInId: after.libero.replacedId,
    playerOutId: after.libero.liberoId,
    courtPosition: (i + 1) as CourtPosition,
    auto: true,
  });
  return {
    rallyId: rally.id,
    notice: { kind: "libero_out", liberoId: after.libero.liberoId, returnedId: after.libero.replacedId },
  };
}

// ---------------------------------------------------------------- commands

export interface StatInput {
  buttonId: string;
  playerId: ID | null;
  passRating?: 0 | 1 | 2 | 3 | null;
  subtypeId?: ID | null;
  /** Other players sharing a block assist. */
  alsoPlayerIds?: ID[];
}

/** What a button does once its rating is known: a 0 pass is a reception error. */
export function effectiveEffect(button: StatButton, passRating: number | null | undefined) {
  if (button.action === "pass" && passRating === 0) return "point_them" as const;
  return button.effect;
}

export function logStat(data: MatchData, setId: ID, input: StatInput, customStats: CustomStat[], now: string): CommandResult {
  const button = resolveButton(input.buttonId, customStats);
  if (!button) throw new Error(`Unknown stat ${input.buttonId}`);
  const tx = new Tx(data, now);
  const rally = openRally(tx, setId);
  const rating = button.action === "pass" ? (button.outcome === "error" ? 0 : input.passRating ?? null) : null;
  const outcome = button.action === "pass" && rating === 0 ? "error" : button.outcome;
  const make = (playerId: ID | null): StatEvent => ({
    id: newId(),
    matchId: data.match.id,
    setId,
    rallyId: rally.id,
    type: "stat",
    team: button.opponent ? "them" : "us",
    playerId: button.opponent ? null : playerId,
    action: button.action,
    outcome,
    passRating: rating,
    errorSubtypeId: input.subtypeId ?? null,
    customStatId: button.action === "custom" ? button.id.slice("custom:".length) : null,
    videoTime: null,
    wallClock: now,
    source: "live",
    step: tx.action,
    seq: tx.nextSeq(),
    createdAt: now,
    updatedAt: now,
  });
  const first = make(input.playerId);
  tx.put("events", first);
  for (const pid of input.alsoPlayerIds ?? []) tx.put("events", make(pid));

  const effect = effectiveEffect(button, rating);
  if (effect === "neutral") return { mutation: tx.result() };
  const done = completeRally(tx, setId, effect === "point_us" ? "us" : "them", { kind: "stat", eventId: first.id });
  return { mutation: tx.result(), completedRallyId: done.rallyId, notice: done.notice };
}

/** We won / They won with no stat. */
export function awardPoint(data: MatchData, setId: ID, winner: TeamSide, now: string): CommandResult {
  const tx = new Tx(data, now);
  const done = completeRally(tx, setId, winner, null);
  return { mutation: tx.result(), completedRallyId: done.rallyId, notice: done.notice };
}

export type ReasonInput =
  | { kind: "earned" }
  | { kind: "our_error"; playerId: ID | null; subtypeId: ID | null }
  | { kind: "their_error"; subtypeId: ID | null };

/**
 * Fills in why a point logged with We won / They won happened. Part of the
 * same undo step as the point itself.
 */
export function addPointReason(data: MatchData, rallyId: ID, input: ReasonInput, now: string): CommandResult {
  const rally = data.rallies.find((r) => r.id === rallyId);
  if (!rally || rally.completedAction == null) throw new Error("Rally isn't finished");
  const tx = new Tx(data, now, rally.completedAction);
  if (input.kind === "earned") {
    tx.put("rallies", { ...rally, pointReason: { kind: "earned" } });
    return { mutation: tx.result() };
  }
  const ours = input.kind === "our_error";
  const e: StatEvent = {
    id: newId(),
    matchId: rally.matchId,
    setId: rally.setId,
    rallyId,
    type: "stat",
    team: ours ? "us" : "them",
    playerId: ours ? input.playerId : null,
    action: ours ? "error" : "opponent_error",
    outcome: "error",
    passRating: null,
    errorSubtypeId: input.subtypeId,
    customStatId: null,
    videoTime: null,
    wallClock: now,
    source: "live",
    step: tx.action,
    seq: tx.nextSeq(),
    createdAt: now,
    updatedAt: now,
  };
  tx.put("events", e);
  tx.put("rallies", { ...rally, pointReason: { kind: "stat", eventId: e.id } });
  return { mutation: tx.result() };
}

export function substitute(data: MatchData, setId: ID, inId: ID, outId: ID, now: string): CommandResult {
  const tx = new Tx(data, now);
  const rally = openRally(tx, setId);
  const st = deriveSetState(tx.data, setId);
  const i = st.lineup.indexOf(outId);
  lineupEvent(tx, rally, { kind: "sub", playerInId: inId, playerOutId: outId, courtPosition: i >= 0 ? ((i + 1) as CourtPosition) : null });
  return { mutation: tx.result() };
}

export function liberoIn(data: MatchData, setId: ID, liberoId: ID, outId: ID, now: string): CommandResult {
  const tx = new Tx(data, now);
  const rally = openRally(tx, setId);
  const st = deriveSetState(tx.data, setId);
  const i = st.lineup.indexOf(outId);
  lineupEvent(tx, rally, { kind: "libero_in", playerInId: liberoId, playerOutId: outId, courtPosition: i >= 0 ? ((i + 1) as CourtPosition) : null });
  return { mutation: tx.result() };
}

/** returningId is needed when the app doesn't know who she replaced (after a lineup fix). */
export function liberoOut(data: MatchData, setId: ID, now: string, returningId?: ID): CommandResult {
  const st = deriveSetState(data, setId);
  if (!st.libero) throw new Error("No libero on court");
  const tx = new Tx(data, now);
  const rally = openRally(tx, setId);
  const i = st.lineup.indexOf(st.libero.liberoId);
  lineupEvent(tx, rally, {
    kind: "libero_out",
    playerInId: returningId ?? st.libero.replacedId,
    playerOutId: st.libero.liberoId,
    courtPosition: i >= 0 ? ((i + 1) as CourtPosition) : null,
  });
  return { mutation: tx.result() };
}

export function correctLineup(
  data: MatchData,
  setId: ID,
  fix: { lineup: Lineup; serving: TeamSide; setterId: ID | null },
  now: string,
): CommandResult {
  const tx = new Tx(data, now);
  const rally = openRally(tx, setId);
  lineupEvent(tx, rally, { kind: "correction", lineupAfter: [...fix.lineup] as Lineup, servingAfter: fix.serving, setterAfter: fix.setterId });
  return { mutation: tx.result() };
}

export function startSet(
  data: MatchData,
  fields: { number: number; lineup: Lineup; setterId: ID | null; firstServer: TeamSide },
  now: string,
): { mutation: Mutation; setId: ID } {
  const tx = new Tx(data, now);
  const set: SetRecord = {
    id: newId(),
    matchId: data.match.id,
    number: fields.number,
    startingLineup: [...fields.lineup] as Lineup,
    setterId: fields.setterId,
    firstServer: fields.firstServer,
    finalScore: null,
    winner: null,
    status: "in_progress",
    videos: [],
    createdAction: tx.action,
    endedAction: null,
    createdAt: now,
    updatedAt: now,
  };
  tx.put("sets", set);
  return { mutation: tx.result(), setId: set.id };
}

/** With alsoEndMatch, the set and the match end in one step, so one undo reopens both. */
export function endSet(data: MatchData, setId: ID, now: string, alsoEndMatch = false): CommandResult {
  const st = deriveSetState(data, setId);
  const tx = new Tx(data, now);
  const winner: TeamSide | null = st.score.us === st.score.them ? null : st.score.us > st.score.them ? "us" : "them";
  tx.put("sets", { ...st.set, status: "complete", finalScore: { ...st.score }, winner, endedAction: tx.action, updatedAt: now });
  if (alsoEndMatch) tx.put("matches", { ...data.match, status: "complete", endedAction: tx.action, updatedAt: now });
  return { mutation: tx.result() };
}

export function endMatch(data: MatchData, now: string): CommandResult {
  const tx = new Tx(data, now);
  tx.put("matches", { ...data.match, status: "complete", endedAction: tx.action, updatedAt: now });
  return { mutation: tx.result() };
}

// ---------------------------------------------------------------- undo

export interface UndoInfo {
  mutation: Mutation;
  /** Plain-language description of what was undone. */
  label: string;
}

/** Undoes the most recent action in the match, whatever it was. null if there's nothing to undo. */
export function undo(data: MatchData, customStats: CustomStat[], playerName: (id: ID | null) => string): UndoInfo | null {
  const a = nextAction(data) - 1;
  if (a <= 0) return null;
  const m = emptyMutation();
  const labels: string[] = [];

  const endsSetToo = data.sets.some((x) => x.endedAction === a);
  if (data.match.endedAction === a) {
    m.put.matches.push({ ...data.match, status: "in_progress", endedAction: null });
    if (!endsSetToo) labels.push("end of match");
  }
  for (const s of data.sets) {
    if (s.createdAction === a) {
      m.del.sets.push(s.id);
      labels.push(`start of set ${s.number}`);
    } else if (s.endedAction === a) {
      m.put.sets.push({ ...s, status: "in_progress", finalScore: null, winner: null, endedAction: null });
      labels.push(data.match.endedAction === a ? `end of set ${s.number} and the match` : `end of set ${s.number}`);
    }
  }
  const evs = data.events.filter((e) => e.step === a).sort(bySeq);
  for (const e of evs) {
    m.del.events.push(e.id);
    if (e.type === "stat") {
      const b = describeStat(e, customStats);
      labels.push(`${b}${e.playerId ? ` · ${playerName(e.playerId)}` : ""}`);
    } else if (!e.auto) {
      labels.push(
        e.kind === "sub"
          ? `sub ${playerName(e.playerInId)} for ${playerName(e.playerOutId)}`
          : e.kind === "libero_in"
            ? `libero in for ${playerName(e.playerOutId)}`
            : e.kind === "libero_out"
              ? "libero out"
              : "lineup fix",
      );
    }
  }
  for (const r of data.rallies) {
    if (r.createdAction === a) m.del.rallies.push(r.id);
    else if (r.completedAction === a)
      m.put.rallies.push({ ...r, winner: null, pointReason: null, rotation: null, endedAt: null, completedAction: null });
    if (r.completedAction === a && r.winner && !evs.some((e) => e.type === "stat")) labels.push(`point to ${r.winner === "us" ? "us" : "them"}`);
  }
  // Rallies opened by this action may have been completed by it too; both go.
  m.put.rallies = m.put.rallies.filter((r) => !m.del.rallies.includes(r.id));
  return { mutation: m, label: labels.join(", ") || "last action" };
}

/** Short plain name for a logged stat, e.g. "kill", "pass (2)". */
export function describeStat(e: StatEvent, customStats: CustomStat[]): string {
  if (e.customStatId) return customStats.find((c) => c.id === e.customStatId)?.name ?? "custom stat";
  if (e.action === "pass" && e.passRating != null) return `pass (${e.passRating})`;
  const names: Record<string, string> = {
    "serve:attempt": "serve",
    "serve:ace": "ace",
    "serve:error": "serve error",
    "pass:attempt": "pass",
    "pass:error": "reception error",
    "set:attempt": "set",
    "set:assist": "assist",
    "set:error": "ball-handling error",
    "attack:attempt": "attack",
    "attack:kill": "kill",
    "attack:error": "attack error",
    "block:solo": "solo block",
    "block:assist": "block assist",
    "block:error": "block error",
    "dig:dig": "dig",
    "dig:error": "dig error",
    "error:error": "our error",
    "opponent_error:error": "their error",
  };
  return names[`${e.action}:${e.outcome}`] ?? e.action;
}
