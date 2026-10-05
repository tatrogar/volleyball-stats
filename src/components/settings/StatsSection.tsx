import { useState } from "react";
import { defaultErrorSubtypes, STAT_BUTTONS } from "../../lib/catalog";
import { newId } from "../../lib/id";
import { useApp } from "../../state/store";
import type { CustomStat, ErrorSubtype, PointEffect } from "../../types";
import { Confirm } from "../common/Dialog";
import { LazyText, Section, Segmented } from "../common/Fields";

const EFFECTS: { value: PointEffect; label: string }[] = [
  { value: "neutral", label: "Neutral" },
  { value: "point_us", label: "Point won" },
  { value: "point_them", label: "Point lost" },
];

export function StatsSection() {
  return (
    <>
      <ErrorSubtypes />
      <CustomStats />
      <StatHelp />
    </>
  );
}

function ErrorSubtypes() {
  const { settings, updateSettings } = useApp();
  const [label, setLabel] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const list = settings.errorSubtypes;
  const live = list.filter((s) => !s.archived);
  const removed = list.filter((s) => s.archived);

  const save = (errorSubtypes: ErrorSubtype[]) => updateSettings({ errorSubtypes });
  const patch = (id: string, p: Partial<ErrorSubtype>) => save(list.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const move = (id: string, d: -1 | 1) => {
    const i = list.findIndex((s) => s.id === id);
    // Step over removed entries so the visible order changes.
    let j = i + d;
    while (j >= 0 && j < list.length && list[j].archived) j += d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };
  const add = () => {
    if (!label.trim()) return;
    save([...list, { id: newId(), label: label.trim() }]);
    setLabel("");
  };

  return (
    <Section title="Error types">
      <p className="text-sm text-slate-500 mb-3">
        One list for both teams. When an error is logged you pick a type, and mark it ours or theirs. Removing a type hides it from the
        pickers; stats already logged with it keep the name.
      </p>
      <div className="divide-y">
        {live.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2 py-2">
            <LazyText className="flex-1" value={s.label} onSave={(v) => v.trim() && patch(s.id, { label: v.trim() })} />
            <button className="btn-ghost px-3" disabled={i === 0} onClick={() => move(s.id, -1)} aria-label="Move up">
              ↑
            </button>
            <button className="btn-ghost px-3" disabled={i === live.length - 1} onClick={() => move(s.id, 1)} aria-label="Move down">
              ↓
            </button>
            <button className="btn-ghost text-red-700" onClick={() => patch(s.id, { archived: true })}>
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input className="field flex-1" placeholder="New error type" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn-primary" disabled={!label.trim()} onClick={add}>
          Add
        </button>
      </div>
      {removed.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-slate-500 mb-1">Removed</p>
          <div className="flex flex-wrap gap-2">
            {removed.map((s) => (
              <button key={s.id} className="chip-off" onClick={() => patch(s.id, { archived: false })}>
                {s.label} · restore
              </button>
            ))}
          </div>
        </div>
      )}
      <button className="btn-ghost mt-3 -ml-4" onClick={() => setConfirmReset(true)}>
        Bring back the default types
      </button>
      <Confirm
        open={confirmReset}
        title="Bring back the default error types?"
        confirmLabel="Restore defaults"
        body={<p>Any default types you removed or renamed come back as they were. Types you added yourself are kept.</p>}
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          const defaults = defaultErrorSubtypes();
          const ids = new Set(defaults.map((d) => d.id));
          save([...defaults, ...list.filter((s) => !ids.has(s.id))]);
          setConfirmReset(false);
        }}
      />
    </Section>
  );
}

function CustomStats() {
  const { settings, updateSettings } = useApp();
  const list = settings.customStats;
  const [name, setName] = useState("");
  const [effect, setEffect] = useState<PointEffect>("neutral");

  const save = (customStats: CustomStat[]) => updateSettings({ customStats });
  const patch = (id: string, p: Partial<CustomStat>) => save(list.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const add = () => {
    if (!name.trim()) return;
    save([...list, { id: newId(), name: name.trim(), effect, help: "" }]);
    setName("");
    setEffect("neutral");
  };

  return (
    <Section title="Custom stats">
      <p className="text-sm text-slate-500 mb-3">
        Your own buttons, e.g. “Free ball” or “Tip”. Say whether logging one wins the point, loses it, or neither. Add them to a layout
        to put them on screen.
      </p>
      <div className="divide-y">
        {list
          .filter((s) => !s.archived)
          .map((s) => (
            <div key={s.id} className="py-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <LazyText className="flex-1 min-w-[160px] font-semibold" value={s.name} onSave={(v) => v.trim() && patch(s.id, { name: v.trim() })} />
                <Segmented value={s.effect} options={EFFECTS} onChange={(e) => patch(s.id, { effect: e })} />
                <button className="btn-ghost text-red-700" onClick={() => patch(s.id, { archived: true })}>
                  Remove
                </button>
              </div>
              <LazyText value={s.help} placeholder="What it means (shown in help)" onSave={(help) => patch(s.id, { help })} />
            </div>
          ))}
      </div>
      <div className="mt-3 pt-3 border-t-2 border-dashed flex flex-wrap items-center gap-2">
        <input className="field flex-1 min-w-[160px]" placeholder="Stat name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <Segmented value={effect} options={EFFECTS} onChange={setEffect} />
        <button className="btn-primary" disabled={!name.trim()} onClick={add}>
          Add
        </button>
      </div>
      {list.some((s) => s.archived) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {list
            .filter((s) => s.archived)
            .map((s) => (
              <button key={s.id} className="chip-off" onClick={() => patch(s.id, { archived: false })}>
                {s.name} · restore
              </button>
            ))}
        </div>
      )}
    </Section>
  );
}

function StatHelp() {
  const groups = [...new Set(STAT_BUTTONS.map((b) => b.group))];
  return (
    <Section title="What each stat means">
      <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
        {groups.map((g) => (
          <div key={g}>
            <p className="font-bold mb-1">{g}</p>
            <dl className="space-y-2">
              {STAT_BUTTONS.filter((b) => b.group === g).map((b) => (
                <div key={b.id}>
                  <dt className="font-semibold">
                    {b.label}
                    {b.effect !== "neutral" && (
                      <span className={`ml-2 text-xs font-bold ${b.effect === "point_us" ? "text-green-700" : "text-red-700"}`}>
                        {b.effect === "point_us" ? "WE SCORE" : "THEY SCORE"}
                      </span>
                    )}
                  </dt>
                  <dd className="text-slate-600 text-sm">{b.help}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </Section>
  );
}
