import { useMemo, useState } from "react";
import { matchResult, startSet, undo, type MatchData } from "../../lib/engine";
import { now } from "../../lib/id";
import { navigate } from "../../lib/router";
import { useLive } from "../../state/live";
import { sortRoster, useApp } from "../../state/store";
import type { Lineup, TeamSide } from "../../types";
import { Confirm } from "../common/Dialog";
import { Segmented, Warnings } from "../common/Fields";
import { Court, PlayerTile } from "./Court";

/** Starting lineup, setter and first server for the next set. */
export function SetStart({ data }: { data: MatchData }) {
  const { players, settings } = useApp();
  const run = useLive((s) => s.run);
  const roster = useMemo(() => sortRoster(players.filter((p) => p.teamId === data.match.teamId && p.active)), [players, data.match.teamId]);
  const byId = (id: string | null) => players.find((p) => p.id === id);
  const done = [...data.sets].filter((s) => s.status === "complete").sort((a, b) => a.number - b.number);
  const prev = done[done.length - 1];
  const number = done.length + 1;
  const result = matchResult(data.match.format, data.sets);

  const [lineup, setLineup] = useState<Lineup>(() => (prev ? ([...prev.startingLineup] as Lineup) : [null, null, null, null, null, null]));
  const [setterId, setSetterId] = useState<string | null>(() => prev?.setterId ?? null);
  // Teams usually swap first serve each set.
  const [firstServer, setFirstServer] = useState<TeamSide>(prev ? (prev.firstServer === "us" ? "them" : "us") : "us");
  const [slot, setSlot] = useState<number | null>(() => lineup.findIndex((x) => x == null) >= 0 ? lineup.findIndex((x) => x == null) : null);
  const [markingSetter, setMarkingSetter] = useState(false);
  const [confirmStart, setConfirmStart] = useState(false);

  const place = (playerId: string) => {
    if (slot == null) return;
    const next = [...lineup] as Lineup;
    const already = next.indexOf(playerId);
    if (already >= 0) next[already] = next[slot]; // swap
    next[slot] = playerId;
    setLineup(next);
    if (!setterId && roster.find((p) => p.id === playerId)?.positions.includes("S")) setSetterId(playerId);
    const empty = next.findIndex((x, i) => x == null && i !== slot);
    setSlot(empty >= 0 ? empty : null);
  };

  const tapSlot = (i: number) => {
    if (markingSetter) {
      setSetterId(lineup[i]);
      setMarkingSetter(false);
      return;
    }
    setSlot(slot === i ? null : i);
  };

  const warnings: string[] = [];
  const empties = lineup.filter((x) => x == null).length;
  if (empties) warnings.push(`${empties} position${empties === 1 ? " is" : "s are"} empty.`);
  const liberosIn = lineup.filter((id) => id && data.match.liberoIds.includes(id));
  if (liberosIn.length)
    warnings.push("The libero is in the starting six. Usually she comes on after the lineup check, using the Libero button.");
  if (setterId && !lineup.includes(setterId)) warnings.push("The marked setter isn't in the lineup.");
  if (!setterId) warnings.push("No setter marked. Rotations will be numbered 1–6 instead of S1–S6.");
  if (result.over) warnings.push(`The match is already decided (${result.setsWon.us}–${result.setsWon.them} in sets). You can still play another.`);

  const begin = () => {
    const r = startSet(data, { number, lineup, setterId: setterId && lineup.includes(setterId) ? setterId : null, firstServer }, now());
    run(r.mutation);
  };

  const undoEnd = () => {
    const u = undo(data, settings.customStats, (id) => byId(id)?.name ?? "");
    if (u) run(u.mutation);
  };

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <button className="btn-ghost -ml-4" onClick={() => navigate("/")}>
            ‹ Home
          </button>
          <h1 className="text-2xl font-bold">
            Set {number} lineup <span className="text-slate-500 font-normal">vs {data.match.opponent}</span>
            {data.match.practice && <span className="ml-2 chip-off">Practice</span>}
          </h1>
          {done.length > 0 && (
            <p className="text-slate-600">
              Sets so far: {done.map((s) => `${s.finalScore?.us}–${s.finalScore?.them}`).join(", ")}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {prev && (
            <button className="btn-secondary" onClick={undoEnd}>
              Undo end of set {prev.number}
            </button>
          )}
          <button className="btn-primary text-lg px-6" onClick={() => (warnings.length ? setConfirmStart(true) : begin())}>
            Start set {number}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_1fr] gap-6">
        <div>
          <Court
            slot={(i) => (
              <PlayerTile
                big
                position={i + 1}
                player={byId(lineup[i])}
                selected={slot === i}
                setter={lineup[i] != null && lineup[i] === setterId}
                libero={lineup[i] != null && data.match.liberoIds.includes(lineup[i]!)}
                serving={i === 0 && firstServer === "us"}
                onClick={() => tapSlot(i)}
              />
            )}
          />
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <button className={markingSetter ? "btn-primary" : "btn-secondary"} onClick={() => setMarkingSetter(!markingSetter)}>
              {markingSetter ? "Tap the setter…" : "Mark setter"}
            </button>
            <div>
              <span className="label">First serve</span>
              <Segmented
                value={firstServer}
                onChange={setFirstServer}
                options={[
                  { value: "us", label: "We serve" },
                  { value: "them", label: `${data.match.opponent} serves` },
                ]}
              />
            </div>
          </div>
          <p className="text-sm text-slate-500 mt-3">Position 1 is right back, the server. Tap a spot, then a player.</p>
        </div>

        <div>
          <p className="font-semibold mb-2">{slot != null ? `Who starts in position ${slot + 1}?` : "Tap a spot on the court to fill or change it."}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {roster.map((p) => {
              const at = lineup.indexOf(p.id);
              return (
                <button
                  key={p.id}
                  disabled={slot == null}
                  onClick={() => place(p.id)}
                  className={`rounded-xl border-2 p-2 min-h-[64px] text-left ${at >= 0 ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"} disabled:opacity-60`}
                >
                  <span className="text-xl font-black mr-2">{p.number}</span>
                  <span>{p.name}</span>
                  <span className="block text-xs text-slate-500">
                    {p.positions.join(", ")}
                    {at >= 0 && ` · in ${at + 1}`}
                    {data.match.liberoIds.includes(p.id) && " · libero"}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-4">
            <Warnings items={warnings} />
          </div>
        </div>
      </div>

      <Confirm
        open={confirmStart}
        title={`Start set ${number} anyway?`}
        confirmLabel={`Start set ${number}`}
        body={
          <ul className="list-disc pl-5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        }
        onCancel={() => setConfirmStart(false)}
        onConfirm={() => {
          setConfirmStart(false);
          begin();
        }}
      />
    </div>
  );
}
