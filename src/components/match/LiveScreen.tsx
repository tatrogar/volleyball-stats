import { useEffect, useMemo, useRef, useState } from "react";
import { resolveButton, type StatButton } from "../../lib/catalog";
import {
  addPointReason,
  awardPoint,
  correctLineup,
  deriveSetState,
  describeStat,
  effectiveEffect,
  endSet,
  liberoIn,
  liberoOut,
  logStat,
  matchResult,
  rotationLabel,
  setterPosition,
  setWinner,
  substitute,
  undo,
  type CommandResult,
  type MatchData,
  type Notice,
  type StatInput,
} from "../../lib/engine";
import { now } from "../../lib/id";
import { navigate } from "../../lib/router";
import { useLive } from "../../state/live";
import { sortRoster, useApp } from "../../state/store";
import type { SetRecord, StatEvent, TeamSide } from "../../types";
import { Modal } from "../common/Dialog";
import { Court, PlayerTile } from "./Court";
import { FixLineupDialog, LiberoDialog, SubDialog } from "./LineupDialogs";
import { BlockPartners, PassRating, PickOnCourt, ReasonPrompt, SubtypePicker } from "./Pickers";

type Flow =
  | null
  | { kind: "player"; input: StatInput }
  | { kind: "rating"; input: StatInput }
  | { kind: "subtype"; input: StatInput }
  | { kind: "partners"; input: StatInput }
  | { kind: "reason"; rallyId: string; winner: TeamSide }
  | { kind: "reasonSubtype"; rallyId: string; side: "ours" | "theirs" }
  | { kind: "reasonPlayer"; rallyId: string; subtypeId: string | null }
  | { kind: "sub" }
  | { kind: "libero" }
  | { kind: "fix" };

type Toast = { text: string; action?: { label: string; run: () => void } };

export function LiveScreen({ data, set }: { data: MatchData; set: SetRecord }) {
  const { players, settings } = useApp();
  const run = useLive((s) => s.run);
  const writeError = useLive((s) => s.writeError);
  const { match } = data;
  const st = deriveSetState(data, set.id);
  const roster = useMemo(() => sortRoster(players.filter((p) => p.teamId === match.teamId && p.active)), [players, match.teamId]);
  const byId = (id: string | null) => players.find((p) => p.id === id);
  const name = (id: string | null) => {
    const p = byId(id);
    return p ? `#${p.number} ${p.name}`.trim() : "team";
  };

  const [selected, setSelected] = useState<string | null>(null);
  const [flow, setFlow] = useState<Flow>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  // "Keep playing" on the set-end prompt hides it until the score changes.
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);
  const toastTimer = useRef<number>();

  useWakeLock();

  const showToast = (t: Toast) => {
    setToast(t);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 6000);
  };

  const buttons = match.liveButtons.map((id) => resolveButton(id, settings.customStats)).filter((b): b is StatButton => b != null);
  const playerFirst = settings.entryOrder === "player_first";
  const at = now;

  // ------------------------------------------------------------ results of an action

  const afterAction = (r: CommandResult) => {
    run(r.mutation);
    if (r.notice) showNotice(r.notice);
  };

  const showNotice = (n: Notice) => {
    if (n.kind === "libero_out")
      showToast({
        text: `Libero out: ${name(n.returnedId)} back in for the front row.`,
        action: {
          label: "Keep libero in",
          run: () => {
            const d = useLive.getState().data!;
            run(liberoIn(d, set.id, n.liberoId, n.returnedId, at()).mutation);
          },
        },
      });
    else showToast({ text: "The libero has rotated to the front row. Tap Libero to bring someone back." });
  };

  // ------------------------------------------------------------ stats

  const tapStat = (b: StatButton) => {
    let playerId = playerFirst ? selected : null;
    // The server is the only one who can serve.
    if (!playerId && b.action === "serve" && st.serving === "us") playerId = st.lineup[0];
    continueStat({ buttonId: b.id, playerId }, b, !!playerId || !!b.opponent);
  };

  /** Asks for whatever the stat still needs, one sheet at a time, then logs it. */
  const continueStat = (input: StatInput, b: StatButton, havePlayer: boolean) => {
    if (!havePlayer) return setFlow({ kind: "player", input });
    if (b.id === "pass" && match.passRatingMode !== "off" && input.passRating === undefined) return setFlow({ kind: "rating", input });
    if (b.needsSubtype && input.subtypeId === undefined) return setFlow({ kind: "subtype", input });
    if (b.id === "block_assist" && input.alsoPlayerIds === undefined && input.playerId) return setFlow({ kind: "partners", input });
    setFlow(null);
    setSelected(null);
    const r = logStat(data, set.id, input, settings.customStats, at());
    afterAction(r);
    if (effectiveEffect(b, input.passRating) === "neutral")
      showToast({ text: `${b.label}${input.playerId ? ` · ${name(input.playerId)}` : ""}${input.passRating != null ? ` (${input.passRating})` : ""}` });
  };

  const flowButton = flow && "input" in flow ? resolveButton(flow.input.buttonId, settings.customStats)! : null;

  // ------------------------------------------------------------ points

  const tapWinner = (w: TeamSide) => {
    setSelected(null);
    const r = awardPoint(data, set.id, w, at());
    afterAction(r);
    if (settings.promptForPointReason && r.completedRallyId) setFlow({ kind: "reason", rallyId: r.completedRallyId, winner: w });
  };

  const addReason = (rallyId: string, input: Parameters<typeof addPointReason>[2]) => {
    const d = useLive.getState().data!;
    run(addPointReason(d, rallyId, input, at()).mutation);
    setFlow(null);
  };

  // ------------------------------------------------------------ undo

  const doUndo = () => {
    setFlow(null);
    setSelected(null);
    const u = undo(data, settings.customStats, name);
    if (!u) return;
    run(u.mutation);
    showToast({ text: `Undone: ${u.label}` });
  };

  // ------------------------------------------------------------ set and match end

  const scoreKey = `${st.score.us}-${st.score.them}`;
  const winner = setWinner(match.format, set.number, st.score);
  const showSetEnd = winner != null && dismissedAt !== scoreKey && flow?.kind !== "reason" && !flow?.kind?.startsWith("reason");
  const wouldEndMatch = winner != null && matchResult(match.format, [...data.sets.filter((s) => s.id !== set.id), { ...set, status: "complete", winner }]).over;

  const finishSet = (alsoMatch: boolean) => run(endSet(data, set.id, at(), alsoMatch).mutation);

  // ------------------------------------------------------------ render

  const label = rotationLabel({ index: st.rotationIndex, setterPosition: setterPosition(st) });
  const max = match.format.maxSubsPerSet;
  const setsWon = matchResult(match.format, data.sets).setsWon;

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col select-none" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      {/* Score bar */}
      <div className="flex items-center gap-3 px-3 py-2 bg-slate-950">
        <button className="btn text-slate-300 active:bg-white/10" onClick={() => navigate("/")}>
          ‹ Exit
        </button>
        <div className="text-slate-300 text-sm leading-tight">
          <div className="font-bold text-white">
            Set {set.number} · {label}
            {match.practice && <span className="ml-2 text-amber-300">Practice</span>}
          </div>
          <div>
            Sets {setsWon.us}–{setsWon.them} · Subs {st.subsUsed}
            {max != null ? `/${max}` : ""}
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center gap-4">
          <ScoreSide label="Us" score={st.score.us} serving={st.serving === "us"} />
          <span className="text-3xl text-slate-500">–</span>
          <ScoreSide label={match.opponent} score={st.score.them} serving={st.serving === "them"} />
        </div>
        <button className="btn bg-slate-700 text-white text-lg px-5 active:bg-slate-600" onClick={doUndo}>
          ↶ Undo
        </button>
      </div>

      {writeError && <div className="bg-red-700 text-white px-4 py-2">{writeError}</div>}

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-3 p-3">
        {/* Court */}
        <div className="flex flex-col gap-3 text-slate-900">
          <Court
            slot={(i) => {
              const id = st.lineup[i];
              return (
                <PlayerTile
                  big
                  position={i + 1}
                  player={byId(id)}
                  selected={id != null && selected === id}
                  setter={id != null && id === st.setterId}
                  libero={id != null && match.liberoIds.includes(id)}
                  serving={i === 0 && st.serving === "us"}
                  onClick={() => playerFirst && id && setSelected(selected === id ? null : id)}
                />
              );
            }}
          />
          <div className="grid grid-cols-3 gap-2">
            <button className="btn bg-slate-700 text-white min-h-[56px] active:bg-slate-600" onClick={() => setFlow({ kind: "sub" })}>
              Sub
            </button>
            <button className="btn bg-emerald-700 text-white min-h-[56px] active:bg-emerald-600" onClick={() => setFlow({ kind: "libero" })}>
              Libero
            </button>
            <button className="btn bg-slate-700 text-white min-h-[56px] active:bg-slate-600" onClick={() => setFlow({ kind: "fix" })}>
              Fix lineup
            </button>
          </div>
          <RecentRallies data={data} setId={set.id} opponent={match.opponent} describe={(e) => `${describeStat(e, settings.customStats)}${e.playerId ? ` ${name(e.playerId)}` : e.team === "us" ? " (team)" : ""}`} />
          <p className="text-slate-400 text-sm">
            {playerFirst
              ? selected
                ? `${name(selected)} selected. Tap a stat.`
                : "Tap a player, then a stat."
              : "Tap a stat, then the player."}
          </p>
        </div>

        {/* Stats and point buttons */}
        <div className="flex flex-col gap-3">
          {buttons.length > 0 && (
            <div className="grid grid-cols-3 lg:grid-cols-4 gap-2">
              {buttons.map((b) => (
                <button
                  key={b.id}
                  onClick={() => tapStat(b)}
                  className={`btn min-h-[64px] text-base leading-tight ${
                    b.effect === "point_us"
                      ? "bg-green-800 text-white active:bg-green-700"
                      : b.effect === "point_them"
                        ? "bg-red-900 text-white active:bg-red-800"
                        : "bg-slate-700 text-white active:bg-slate-600"
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          )}
          <div className={`grid grid-cols-2 gap-3 ${buttons.length ? "mt-auto" : "flex-1"}`}>
            <button className="btn bg-green-600 text-white text-2xl min-h-[120px] h-full active:bg-green-500" onClick={() => tapWinner("us")}>
              We won
            </button>
            <button className="btn bg-red-600 text-white text-2xl min-h-[120px] h-full active:bg-red-500" onClick={() => tapWinner("them")}>
              They won
            </button>
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-white text-slate-900 rounded-2xl shadow-xl px-4 py-3 flex items-center gap-4 max-w-[90vw]">
          <span>{toast.text}</span>
          {toast.action && (
            <button
              className="btn-ghost"
              onClick={() => {
                toast.action!.run();
                setToast(null);
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}

      {/* ---------------- sheets ---------------- */}
      <div className="text-slate-900">
        {flow?.kind === "player" && flowButton && (
          <PickOnCourt
            title={`${flowButton.label}: who?`}
            lineup={st.lineup}
            byId={byId}
            liberoIds={match.liberoIds}
            allowTeam={flowButton.action === "error" || flowButton.action === "custom"}
            onClose={() => setFlow(null)}
            onPick={(pid) => continueStat({ ...flow.input, playerId: pid }, flowButton, true)}
          />
        )}
        {flow?.kind === "rating" && flowButton && (
          <PassRating
            required={match.passRatingMode === "required"}
            onClose={() => setFlow(null)}
            onPick={(r) => continueStat({ ...flow.input, passRating: r }, flowButton, true)}
          />
        )}
        {flow?.kind === "subtype" && flowButton && (
          <SubtypePicker
            title={`${flowButton.label}: what kind?`}
            subtypes={settings.errorSubtypes}
            onClose={() => setFlow(null)}
            onPick={(id) => continueStat({ ...flow.input, subtypeId: id }, flowButton, true)}
          />
        )}
        {flow?.kind === "partners" && flowButton && (
          <BlockPartners
            lineup={st.lineup}
            byId={byId}
            first={flow.input.playerId!}
            onClose={() => setFlow(null)}
            onDone={(others) => continueStat({ ...flow.input, alsoPlayerIds: others }, flowButton, true)}
          />
        )}
        {flow?.kind === "reason" && (
          <ReasonPrompt
            winner={flow.winner}
            opponent={match.opponent}
            onSkip={() => setFlow(null)}
            onEarned={() => addReason(flow.rallyId, { kind: "earned" })}
            onOurError={() => setFlow({ kind: "reasonSubtype", rallyId: flow.rallyId, side: "ours" })}
            onTheirError={() => setFlow({ kind: "reasonSubtype", rallyId: flow.rallyId, side: "theirs" })}
          />
        )}
        {flow?.kind === "reasonSubtype" && (
          <SubtypePicker
            title={flow.side === "ours" ? "Our error: what kind?" : "Their error: what kind?"}
            subtypes={settings.errorSubtypes}
            onClose={() => setFlow(null)}
            onPick={(id) =>
              flow.side === "theirs"
                ? addReason(flow.rallyId, { kind: "their_error", subtypeId: id })
                : setFlow({ kind: "reasonPlayer", rallyId: flow.rallyId, subtypeId: id })
            }
          />
        )}
        {flow?.kind === "reasonPlayer" && (
          <PickOnCourt
            title="Whose error?"
            lineup={data.rallies.find((r) => r.id === flow.rallyId)?.lineup ?? st.lineup}
            byId={byId}
            liberoIds={match.liberoIds}
            allowTeam
            onClose={() => setFlow(null)}
            onPick={(pid) => addReason(flow.rallyId, { kind: "our_error", playerId: pid, subtypeId: flow.subtypeId })}
          />
        )}
        {flow?.kind === "sub" && (
          <SubDialog
            st={st}
            roster={roster}
            liberoIds={match.liberoIds}
            byId={byId}
            maxSubs={max}
            onClose={() => setFlow(null)}
            onSub={(i, o) => {
              setFlow(null);
              afterAction(substitute(data, set.id, i, o, at()));
              showToast({ text: `Sub: ${name(i)} in for ${name(o)}` });
            }}
          />
        )}
        {flow?.kind === "libero" && (
          <LiberoDialog
            st={st}
            roster={roster}
            liberoIds={match.liberoIds}
            byId={byId}
            onClose={() => setFlow(null)}
            onIn={(l, o) => {
              setFlow(null);
              afterAction(liberoIn(data, set.id, l, o, at()));
              showToast({ text: `Libero ${name(l)} in for ${name(o)}` });
            }}
            onOut={(back) => {
              setFlow(null);
              afterAction(liberoOut(data, set.id, at(), back));
            }}
          />
        )}
        {flow?.kind === "fix" && (
          <FixLineupDialog
            st={st}
            roster={roster}
            liberoIds={match.liberoIds}
            byId={byId}
            opponent={match.opponent}
            onClose={() => setFlow(null)}
            onSave={(fix) => {
              setFlow(null);
              afterAction(correctLineup(data, set.id, fix, at()));
              showToast({ text: "Lineup fixed" });
            }}
          />
        )}

        <Modal open={showSetEnd && flow == null} onClose={() => setDismissedAt(scoreKey)}>
          <h2 className="text-2xl font-bold mb-2">
            Set {set.number} to {winner === "us" ? "us" : match.opponent}, {st.score.us}–{st.score.them}
          </h2>
          <p className="text-slate-600 mb-4">
            {wouldEndMatch ? "That also decides the match." : "End the set and set up the next lineup?"}
          </p>
          <div className="grid gap-2">
            <button className="btn-primary min-h-[56px] text-lg" onClick={() => finishSet(wouldEndMatch)}>
              {wouldEndMatch ? "End set and match" : `End set ${set.number}`}
            </button>
            {wouldEndMatch && (
              <button className="btn-secondary" onClick={() => finishSet(false)}>
                End set, play another anyway
              </button>
            )}
            <button className="btn-secondary" onClick={() => setDismissedAt(scoreKey)}>
              Not yet, keep playing
            </button>
            <button className="btn-ghost" onClick={doUndo}>
              Undo the last point
            </button>
          </div>
        </Modal>
      </div>
    </div>
  );
}

/** The last few rallies, newest first, so a mis-tap is easy to spot. */
function RecentRallies({ data, setId, opponent, describe }: { data: MatchData; setId: string; opponent: string; describe: (e: StatEvent) => string }) {
  const done = data.rallies.filter((r) => r.setId === setId && r.winner).sort((a, b) => b.number - a.number).slice(0, 5);
  if (done.length === 0) return null;
  return (
    <div className="rounded-xl bg-slate-800 p-3 text-sm text-slate-200">
      <p className="text-slate-400 mb-1">Recent</p>
      <ul className="space-y-1">
        {done.map((r) => {
          const stats = data.events.filter((e): e is StatEvent => e.type === "stat" && e.rallyId === r.id).sort((a, b) => a.seq - b.seq);
          const after = { us: r.scoreBefore.us + (r.winner === "us" ? 1 : 0), them: r.scoreBefore.them + (r.winner === "them" ? 1 : 0) };
          const why = stats.length ? stats.map(describe).join(", ") : r.pointReason?.kind === "earned" ? `${opponent} earned it` : "";
          return (
            <li key={r.id} className="flex gap-2">
              <span className={`font-bold tabular-nums w-14 ${r.winner === "us" ? "text-green-400" : "text-red-400"}`}>
                {after.us}–{after.them}
              </span>
              <span className="truncate">{why}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ScoreSide({ label, score, serving }: { label: string; score: number; serving: boolean }) {
  return (
    <div className="flex flex-col items-center min-w-[96px]">
      <span className="text-sm text-slate-300 truncate max-w-[160px]">
        {serving && <span className="text-yellow-300 mr-1">●</span>}
        {label}
      </span>
      <span className="text-5xl font-black tabular-nums leading-none">{score}</span>
    </div>
  );
}

/** Keeps the iPad screen awake during a match, where the browser allows it. */
function useWakeLock() {
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } };
    const get = () => {
      if (document.visibilityState === "visible" && nav.wakeLock)
        nav.wakeLock.request("screen").then(
          (l) => (lock = l),
          () => {},
        );
    };
    get();
    document.addEventListener("visibilitychange", get);
    return () => {
      document.removeEventListener("visibilitychange", get);
      void lock?.release().catch(() => {});
    };
  }, []);
}
