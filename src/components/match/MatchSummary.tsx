import { useState } from "react";
import { matchResult, undo, type MatchData } from "../../lib/engine";
import { navigate } from "../../lib/router";
import { useLive } from "../../state/live";
import { sortRoster, useApp } from "../../state/store";
import type { StatEvent } from "../../types";
import { BackupNow } from "../backup/BackupNow";
import { Confirm } from "../common/Dialog";
import { Section } from "../common/Fields";

/** End-of-match screen: result, a quick look at who did what, and the backup prompt. */
export function MatchSummary({ data }: { data: MatchData }) {
  const { players, settings, deleteMatch } = useApp();
  const run = useLive((s) => s.run);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { match } = data;
  const sets = [...data.sets].filter((s) => s.status === "complete").sort((a, b) => a.number - b.number);
  const result = matchResult(match.format, data.sets);
  // Only stats from rallies that were finished count.
  const done = new Set(data.rallies.filter((r) => r.winner).map((r) => r.id));
  const stats = data.events.filter((e): e is StatEvent => e.type === "stat" && done.has(e.rallyId));
  const roster = sortRoster(players.filter((p) => p.teamId === match.teamId));
  const count = (pid: string | null, action: string, outcome?: string) =>
    stats.filter((e) => e.playerId === pid && e.team === "us" && e.action === action && (!outcome || e.outcome === outcome)).length;

  const rows = roster
    .map((p) => {
      const kills = count(p.id, "attack", "kill");
      const aces = count(p.id, "serve", "ace");
      const solo = count(p.id, "block", "solo");
      const assist = count(p.id, "block", "assist");
      const errors = stats.filter((e) => e.playerId === p.id && e.team === "us" && e.outcome === "error").length;
      return { p, kills, aces, blocks: solo + assist / 2, errors, points: kills + aces + solo + assist / 2 };
    })
    .filter((r) => r.kills + r.aces + r.blocks + r.errors > 0);
  const teamErrors = stats.filter((e) => e.team === "us" && e.playerId == null && e.outcome === "error").length;
  const theirErrors = stats.filter((e) => e.team === "them").length;
  const verdict = result.winner === "us" ? "Won" : result.winner === "them" ? "Lost" : result.winner === "tie" ? "Tied" : "Ended";
  const name = (id: string | null) => players.find((p) => p.id === id)?.name ?? "team";

  return (
    <div className="max-w-4xl mx-auto p-4">
      <button className="btn-ghost -ml-4" onClick={() => navigate("/")}>
        ‹ Home
      </button>
      <h1 className="text-3xl font-bold mt-1">
        {verdict} {result.setsWon.us}–{result.setsWon.them} vs {match.opponent}
      </h1>
      <p className="text-slate-600 mb-4">
        {match.date}
        {match.event && ` · ${match.event}`}
        {match.practice && " · Practice"} · Sets: {sets.map((s) => `${s.finalScore?.us}–${s.finalScore?.them}`).join(", ")}
      </p>

      {!match.practice && (
        <div className="rounded-2xl bg-blue-50 border border-blue-300 p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-bold">Back up this match</p>
            <p className="text-sm text-slate-600">Save a backup to Files now, so these stats aren't only on this iPad.</p>
          </div>
          <BackupNow className="btn-primary text-lg px-6" />
        </div>
      )}

      <Section title="Quick look">
        {rows.length === 0 ? (
          <p className="text-slate-500">No player stats logged. Only the score was kept.</p>
        ) : (
          <table className="w-full text-left">
            <thead className="text-sm text-slate-500">
              <tr>
                <th className="py-1">Player</th>
                <th>Kills</th>
                <th>Aces</th>
                <th>Blocks</th>
                <th>Errors</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.p.id}>
                  <td className="py-2 font-semibold">
                    #{r.p.number} {r.p.name}
                  </td>
                  <td>{r.kills}</td>
                  <td>{r.aces}</td>
                  <td>{r.blocks}</td>
                  <td>{r.errors}</td>
                  <td className="font-bold">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-sm text-slate-500 mt-3">
          Team errors (no player): {teamErrors} · Points from their errors: {theirErrors}. Full reports come in a later build.
        </p>
      </Section>

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => navigate("/")}>
          Done
        </button>
        <button
          className="btn-secondary"
          onClick={() => {
            const u = undo(data, settings.customStats, name);
            if (u) run(u.mutation);
          }}
        >
          Undo end of match
        </button>
        <button className="btn-ghost text-red-700" onClick={() => setConfirmDelete(true)}>
          Delete match
        </button>
      </div>

      <Confirm
        open={confirmDelete}
        title="Delete this match?"
        danger
        requireText={match.practice ? undefined : "delete"}
        confirmLabel="Delete match"
        body={<p>All its sets and stats are removed from this iPad.</p>}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await deleteMatch(match.id);
          navigate("/");
        }}
      />
    </div>
  );
}
