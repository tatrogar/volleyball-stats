import { useState } from "react";
import { isFrontRow, type SetState } from "../../lib/engine";
import type { Lineup, Player, TeamSide } from "../../types";
import { Segmented, Warnings } from "../common/Fields";
import { Court, PlayerTile } from "./Court";
import { Sheet } from "./Pickers";

interface Common {
  st: SetState;
  roster: Player[];
  liberoIds: string[];
  byId: (id: string | null) => Player | undefined;
  onClose: () => void;
}

export function SubDialog({ st, roster, liberoIds, byId, onClose, maxSubs, onSub }: Common & { maxSubs: number | null; onSub: (inId: string, outId: string) => void }) {
  const [inId, setInId] = useState<string | null>(null);
  const bench = roster.filter((p) => !st.lineup.includes(p.id) && !liberoIds.includes(p.id) && p.id !== st.libero?.replacedId);
  const warn: string[] = [];
  if (maxSubs != null && st.subsUsed >= maxSubs) warn.push(`This is sub ${st.subsUsed + 1} this set. The limit is ${maxSubs}.`);

  if (!inId)
    return (
      <Sheet title="Sub: who's coming in?" onClose={onClose} wide>
        <Warnings items={warn} />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
          {bench.map((p) => (
            <button key={p.id} className="rounded-xl border-2 border-slate-300 bg-white min-h-[64px] text-left px-3" onClick={() => setInId(p.id)}>
              <span className="text-2xl font-black mr-2">{p.number}</span>
              {p.name}
            </button>
          ))}
          {bench.length === 0 && <p className="text-slate-500">Everyone's on court.</p>}
        </div>
        <p className="text-sm text-slate-500 mt-3">Subs so far this set: {st.subsUsed}{maxSubs != null ? ` of ${maxSubs}` : ""}.</p>
      </Sheet>
    );
  return (
    <Sheet title={`#${byId(inId)?.number} ${byId(inId)?.name} in. Who's going out?`} onClose={onClose} wide>
      <Warnings items={warn} />
      <div className="mt-2">
        <Court
          slot={(i) => {
            const id = st.lineup[i];
            const isLib = id != null && liberoIds.includes(id);
            return <PlayerTile big position={i + 1} player={byId(id)} libero={isLib} dim={isLib || id == null} onClick={() => id && !isLib && onSub(inId, id)} />;
          }}
        />
      </div>
      {st.libero && <p className="text-sm text-slate-500 mt-3">The libero goes off with the Libero button, not a sub.</p>}
    </Sheet>
  );
}

export function LiberoDialog({
  st,
  roster,
  liberoIds,
  byId,
  onClose,
  onIn,
  onOut,
}: Common & { onIn: (liberoId: string, outId: string) => void; onOut: (returningId?: string) => void }) {
  const liberos = liberoIds.map((id) => byId(id)).filter((p): p is Player => !!p);
  const [chosen, setChosen] = useState<string | null>(liberos.length === 1 ? liberos[0].id : null);
  const [target, setTarget] = useState<number | null>(null);

  if (liberos.length === 0)
    return (
      <Sheet title="Libero" onClose={onClose}>
        <p>No libero was picked for this match. You can still use a regular sub.</p>
      </Sheet>
    );

  // A libero is on: she can go out, or swap with the other libero.
  if (st.libero) {
    const on = byId(st.libero.liberoId);
    const back = byId(st.libero.replacedId);
    const other = liberos.find((l) => l.id !== st.libero!.liberoId);
    const bench = roster.filter((p) => !st.lineup.includes(p.id) && !liberoIds.includes(p.id));
    return (
      <Sheet title={`#${on?.number} ${on?.name} is on`} onClose={onClose}>
        <div className="grid gap-3">
          {back ? (
            <button className="btn-primary min-h-[64px] text-lg" onClick={() => onOut()}>
              Libero out · #{back.number} {back.name} back in
            </button>
          ) : (
            <>
              <p className="text-slate-600">Who comes back on for her?</p>
              <div className="grid grid-cols-2 gap-2">
                {bench.map((p) => (
                  <button key={p.id} className="btn-secondary" onClick={() => onOut(p.id)}>
                    #{p.number} {p.name}
                  </button>
                ))}
              </div>
            </>
          )}
          {other && (
            <button className="btn-secondary min-h-[64px] text-lg" onClick={() => onIn(other.id, st.libero!.liberoId)}>
              Switch to #{other.number} {other.name}
            </button>
          )}
        </div>
      </Sheet>
    );
  }

  if (!chosen)
    return (
      <Sheet title="Which libero?" onClose={onClose}>
        <div className="grid grid-cols-2 gap-3">
          {liberos.map((l) => (
            <button key={l.id} className="btn-secondary min-h-[72px] text-lg" onClick={() => setChosen(l.id)}>
              #{l.number} {l.name}
            </button>
          ))}
        </div>
      </Sheet>
    );

  const warn: string[] = [];
  if (target != null && isFrontRow(target)) warn.push("That's a front-row spot. The libero normally only replaces back-row players.");
  if (target === 0 && st.serving === "us") warn.push("She'd be serving. Some rules allow the libero to serve in one rotation.");

  return (
    <Sheet title={`#${byId(chosen)?.number} ${byId(chosen)?.name} in for…`} onClose={onClose} wide>
      <Court
        slot={(i) => {
          const id = st.lineup[i];
          return (
            <PlayerTile
              big
              position={i + 1}
              player={byId(id)}
              selected={target === i}
              dim={isFrontRow(i) || id == null}
              onClick={() => id && setTarget(i)}
            />
          );
        }}
      />
      <div className="mt-3 space-y-3">
        <Warnings items={warn} />
        {target == null ? (
          <p className="text-slate-500">Tap the back-row player she's replacing.</p>
        ) : (
          <button className="btn-primary w-full min-h-[64px] text-lg" onClick={() => onIn(chosen, st.lineup[target]!)}>
            Libero in for #{byId(st.lineup[target])?.number} {byId(st.lineup[target])?.name}
          </button>
        )}
      </div>
    </Sheet>
  );
}

/** For when tracking has drifted from what's on court. */
export function FixLineupDialog({
  st,
  roster,
  liberoIds,
  byId,
  onClose,
  opponent,
  onSave,
}: Common & { opponent: string; onSave: (fix: { lineup: Lineup; serving: TeamSide; setterId: string | null }) => void }) {
  const [lineup, setLineup] = useState<Lineup>([...st.lineup] as Lineup);
  const [serving, setServing] = useState<TeamSide>(st.serving);
  const [setterId, setSetterId] = useState<string | null>(st.setterId);
  const [slot, setSlot] = useState<number | null>(null);
  const [markSetter, setMarkSetter] = useState(false);

  const place = (id: string) => {
    if (slot == null) return;
    const next = [...lineup] as Lineup;
    const j = next.indexOf(id);
    if (j >= 0) next[j] = next[slot];
    next[slot] = id;
    setLineup(next);
    setSlot(null);
  };
  const rotateBy = (dir: 1 | -1) => {
    const l = lineup;
    setLineup((dir === 1 ? [l[1], l[2], l[3], l[4], l[5], l[0]] : [l[5], l[0], l[1], l[2], l[3], l[4]]) as Lineup);
  };

  return (
    <Sheet title="Fix the lineup" onClose={onClose} wide>
      <p className="text-sm text-slate-500 mb-3">Make this match what's on court now. It applies from this rally on; earlier rallies keep what was recorded.</p>
      <Court
        slot={(i) => (
          <PlayerTile
            position={i + 1}
            player={byId(lineup[i])}
            selected={slot === i}
            setter={lineup[i] != null && lineup[i] === setterId}
            libero={lineup[i] != null && liberoIds.includes(lineup[i]!)}
            serving={i === 0 && serving === "us"}
            onClick={() => {
              if (markSetter) {
                setSetterId(lineup[i]);
                setMarkSetter(false);
              } else setSlot(slot === i ? null : i);
            }}
          />
        )}
      />
      <div className="flex flex-wrap gap-2 mt-3">
        <button className="btn-secondary" onClick={() => rotateBy(1)}>
          Rotate forward
        </button>
        <button className="btn-secondary" onClick={() => rotateBy(-1)}>
          Rotate back
        </button>
        <button className={markSetter ? "btn-primary" : "btn-secondary"} onClick={() => setMarkSetter(!markSetter)}>
          {markSetter ? "Tap the setter…" : "Mark setter"}
        </button>
        <Segmented
          value={serving}
          onChange={setServing}
          options={[
            { value: "us", label: "We serve" },
            { value: "them", label: `${opponent} serves` },
          ]}
        />
      </div>
      {slot != null && (
        <div className="mt-3">
          <p className="font-semibold mb-2">Who's in position {slot + 1}?</p>
          <div className="grid grid-cols-3 gap-2">
            {roster.map((p) => (
              <button key={p.id} className="btn-secondary justify-start" onClick={() => place(p.id)}>
                #{p.number} {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <button className="btn-primary w-full mt-4 min-h-[56px] text-lg" onClick={() => onSave({ lineup, serving, setterId })}>
        Save lineup
      </button>
    </Sheet>
  );
}
