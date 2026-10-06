import { useState, type ReactNode } from "react";
import type { ErrorSubtype, Lineup, Player } from "../../types";
import { Modal } from "../common/Dialog";
import { Court, PlayerTile } from "./Court";

/** A bottom-of-screen style sheet for quick choices during play. */
export function Sheet({ title, children, onClose, wide }: { title: ReactNode; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <Modal open onClose={onClose} wide={wide}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-bold">{title}</h2>
        <button className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
      {children}
    </Modal>
  );
}

export function PickOnCourt({
  title,
  lineup,
  byId,
  liberoIds,
  onPick,
  onClose,
  allowTeam,
  exclude = [],
  dimFrontRow,
}: {
  title: ReactNode;
  lineup: Lineup;
  byId: (id: string | null) => Player | undefined;
  liberoIds: string[];
  onPick: (playerId: string | null) => void;
  onClose: () => void;
  allowTeam?: boolean;
  exclude?: string[];
  dimFrontRow?: boolean;
}) {
  return (
    <Sheet title={title} onClose={onClose} wide>
      <Court
        slot={(i) => {
          const id = lineup[i];
          const off = id == null || exclude.includes(id);
          return (
            <PlayerTile
              big
              position={i + 1}
              player={byId(id)}
              libero={id != null && liberoIds.includes(id)}
              dim={off || (dimFrontRow && [1, 2, 3].includes(i))}
              onClick={() => !off && onPick(id)}
            />
          );
        }}
      />
      {allowTeam && (
        <button className="btn-secondary w-full mt-4 text-lg" onClick={() => onPick(null)}>
          Team · no single player
        </button>
      )}
    </Sheet>
  );
}

export function PassRating({ required, onPick, onClose }: { required: boolean; onPick: (r: 0 | 1 | 2 | 3 | null) => void; onClose: () => void }) {
  const opts: { r: 0 | 1 | 2 | 3; label: string; hint: string; cls: string }[] = [
    { r: 3, label: "3", hint: "Perfect", cls: "bg-green-600 text-white" },
    { r: 2, label: "2", hint: "Good", cls: "bg-lime-500 text-white" },
    { r: 1, label: "1", hint: "Poor", cls: "bg-amber-500 text-white" },
    { r: 0, label: "0", hint: "Error, point lost", cls: "bg-red-600 text-white" },
  ];
  return (
    <Sheet title="How good was the pass?" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        {opts.map((o) => (
          <button key={o.r} className={`rounded-2xl min-h-[96px] flex flex-col items-center justify-center ${o.cls}`} onClick={() => onPick(o.r)}>
            <span className="text-4xl font-black">{o.label}</span>
            <span className="text-sm font-semibold">{o.hint}</span>
          </button>
        ))}
      </div>
      {!required && (
        <button className="btn-secondary w-full mt-3" onClick={() => onPick(null)}>
          Skip rating
        </button>
      )}
    </Sheet>
  );
}

export function SubtypePicker({ title, subtypes, onPick, onClose }: { title: ReactNode; subtypes: ErrorSubtype[]; onPick: (id: string | null) => void; onClose: () => void }) {
  return (
    <Sheet title={title} onClose={onClose} wide>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {subtypes
          .filter((s) => !s.archived)
          .map((s) => (
            <button key={s.id} className="btn-secondary min-h-[56px]" onClick={() => onPick(s.id)}>
              {s.label}
            </button>
          ))}
      </div>
      <button className="btn-ghost w-full mt-3" onClick={() => onPick(null)}>
        Skip, don't know
      </button>
    </Sheet>
  );
}

export function BlockPartners({
  lineup,
  byId,
  first,
  onDone,
  onClose,
}: {
  lineup: Lineup;
  byId: (id: string | null) => Player | undefined;
  first: string;
  onDone: (others: string[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  // Front row first: that's who can block.
  const order = [3, 2, 1, 4, 5, 0];
  return (
    <Sheet title="Who else was in the block?" onClose={onClose}>
      <div className="grid grid-cols-3 gap-2">
        {order.map((i) => {
          const id = lineup[i];
          if (!id || id === first) return null;
          const on = picked.includes(id);
          const p = byId(id);
          return (
            <button
              key={id}
              className={`rounded-xl border-2 min-h-[64px] ${on ? "bg-blue-700 text-white border-blue-900" : "bg-white border-slate-300"} ${[1, 2, 3].includes(i) ? "" : "opacity-60"}`}
              onClick={() => setPicked(on ? picked.filter((x) => x !== id) : [...picked, id].slice(-2))}
            >
              <span className="text-2xl font-black">{p?.number}</span>
              <span className="block text-sm">{p?.name}</span>
            </button>
          );
        })}
      </div>
      <button className="btn-primary w-full mt-3 text-lg" onClick={() => onDone(picked)}>
        {picked.length ? "Done" : "Skip, just log this player"}
      </button>
    </Sheet>
  );
}

/** After We won / They won with no stat: a quick, skippable "why?". */
export function ReasonPrompt({
  winner,
  opponent,
  onEarned,
  onOurError,
  onTheirError,
  onSkip,
}: {
  winner: "us" | "them";
  opponent: string;
  onEarned: () => void;
  onOurError: () => void;
  onTheirError: () => void;
  onSkip: () => void;
}) {
  return (
    <Sheet title={winner === "them" ? `Point to ${opponent}. Why?` : "Point to us. Why?"} onClose={onSkip}>
      <div className="grid gap-3">
        {winner === "them" ? (
          <>
            <button className="btn-secondary min-h-[72px] text-lg" onClick={onEarned}>
              They earned it
              <span className="block text-sm font-normal text-slate-500">their kill, ace or block</span>
            </button>
            <button className="btn-secondary min-h-[72px] text-lg" onClick={onOurError}>
              Our error…
            </button>
          </>
        ) : (
          <button className="btn-secondary min-h-[72px] text-lg" onClick={onTheirError}>
            Their error…
          </button>
        )}
        <button className="btn-ghost" onClick={onSkip}>
          Skip
        </button>
      </div>
    </Sheet>
  );
}
