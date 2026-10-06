import type { ReactNode } from "react";
import type { Player } from "../../types";

/**
 * Our half of the court, seen from behind our baseline with the net at the
 * top: front row 4 3 2, back row 5 6 1. Slots are lineup indexes (position − 1).
 */
const ROWS = [
  [3, 2, 1],
  [4, 5, 0],
];

export function Court({ slot, compact }: { slot: (index: number) => ReactNode; compact?: boolean }) {
  return (
    <div className="rounded-2xl bg-amber-100 border-4 border-amber-300 p-2">
      <div className="h-2 -mt-2 mb-2 mx-[-8px] bg-slate-700 rounded-t-xl" title="Net" />
      <div className={`grid grid-cols-3 ${compact ? "gap-1" : "gap-2"}`}>
        {ROWS.flat().map((i) => (
          <div key={i}>{slot(i)}</div>
        ))}
      </div>
    </div>
  );
}

export function PlayerTile({
  player,
  position,
  selected,
  libero,
  setter,
  serving,
  onClick,
  dim,
  big,
}: {
  player: Player | undefined;
  position: number;
  selected?: boolean;
  libero?: boolean;
  setter?: boolean;
  serving?: boolean;
  onClick?: () => void;
  dim?: boolean;
  big?: boolean;
}) {
  const colors = selected
    ? "bg-blue-700 text-white border-blue-900"
    : libero
      ? "bg-emerald-100 border-emerald-500 text-emerald-950"
      : "bg-white border-slate-300 text-slate-900";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full rounded-xl border-2 ${colors} ${big ? "min-h-[96px]" : "min-h-[72px]"} px-1 py-1 flex flex-col items-center justify-center active:scale-[0.98] transition ${dim ? "opacity-40" : ""}`}
    >
      <span className="absolute top-1 left-2 text-xs font-semibold opacity-60">{position}</span>
      {serving && <span className="absolute top-1 right-2 text-xs font-bold" title="Serving">● serve</span>}
      {player ? (
        <>
          <span className={`${big ? "text-4xl" : "text-2xl"} font-black leading-none`}>{player.number || "–"}</span>
          <span className="text-sm truncate max-w-full">{player.name}</span>
          {(setter || libero) && (
            <span className="text-[11px] font-bold uppercase tracking-wide opacity-80">{libero ? "Libero" : "Setter"}</span>
          )}
        </>
      ) : (
        <span className="text-slate-400">Empty</span>
      )}
    </button>
  );
}
