import { useState } from "react";
import { customButtonId, PRESET_LAYOUTS, resolveButton, STAT_BUTTONS, type StatButton } from "../../lib/catalog";
import { newId } from "../../lib/id";
import { useApp } from "../../state/store";
import type { Layout } from "../../types";
import { Confirm, Modal } from "../common/Dialog";
import { LazyText, Section } from "../common/Fields";

/** Every button that can be placed: built-ins plus non-archived custom stats. */
function placeableButtons(customStats: ReturnType<typeof useApp.getState>["settings"]["customStats"]): StatButton[] {
  return [
    ...STAT_BUTTONS,
    ...customStats.filter((c) => !c.archived).map((c) => resolveButton(customButtonId(c), customStats)!),
  ];
}

export function LayoutsSection() {
  const { settings, teams, updateSettings, updateTeam } = useApp();
  const [editing, setEditing] = useState<Layout | null>(null);
  const [deleting, setDeleting] = useState<Layout | null>(null);

  const saveLayout = async (layout: Layout) => {
    // Read the latest list, not this render's, so back-to-back edits stack.
    const current = useApp.getState().settings.customLayouts;
    const exists = current.some((l) => l.id === layout.id);
    await updateSettings({
      customLayouts: exists ? current.map((l) => (l.id === layout.id ? layout : l)) : [...current, layout],
    });
  };

  const duplicate = (from: Layout, name = `${from.name} (copy)`) => {
    const copy: Layout = { id: newId(), name, buttons: [...from.buttons] };
    void saveLayout(copy);
    setEditing(copy);
  };

  const usedBy = (id: string) => teams.filter((t) => t.defaultLiveLayoutId === id || t.defaultReviewLayoutId === id);

  const describe = (l: Layout) => {
    const names = l.buttons.map((b) => resolveButton(b, settings.customStats)?.label).filter(Boolean);
    return names.length ? names.join(" · ") : "No stat buttons. Just We won / They won.";
  };

  return (
    <>
      <Section title="Presets">
        <p className="text-sm text-slate-500 mb-3">
          A layout is the set of stat buttons on a screen, in order. Each team picks one for the live screen and one for review
          (team → Details). Presets can't be changed, but you can copy one and edit the copy.
        </p>
        <div className="divide-y">
          {PRESET_LAYOUTS.map((l) => (
            <div key={l.id} className="py-3 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[240px]">
                <p className="font-semibold">{l.name}</p>
                <p className="text-sm text-slate-500">{describe(l)}</p>
              </div>
              <button className="btn-secondary" onClick={() => duplicate(l)}>
                Copy and edit
              </button>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Your layouts"
        actions={
          <button className="btn-primary" onClick={() => duplicate({ id: "", name: "", buttons: [] }, "New layout")}>
            New layout
          </button>
        }
      >
        <div className="divide-y">
          {settings.customLayouts.map((l) => (
            <div key={l.id} className="py-3 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[240px]">
                <p className="font-semibold">{l.name}</p>
                <p className="text-sm text-slate-500">{describe(l)}</p>
              </div>
              <button className="btn-secondary" onClick={() => setEditing(l)}>
                Edit
              </button>
              <button className="btn-ghost" onClick={() => duplicate(l)}>
                Copy
              </button>
              <button className="btn-ghost text-red-700" onClick={() => setDeleting(l)}>
                Delete
              </button>
            </div>
          ))}
          {settings.customLayouts.length === 0 && <p className="text-slate-500 py-2">None yet.</p>}
        </div>
      </Section>

      {editing && (
        <LayoutEditor
          layout={settings.customLayouts.find((l) => l.id === editing.id) ?? editing}
          onChange={saveLayout}
          onClose={() => setEditing(null)}
        />
      )}

      <Confirm
        open={deleting != null}
        title={`Delete layout “${deleting?.name}”?`}
        danger
        confirmLabel="Delete"
        body={
          deleting && usedBy(deleting.id).length > 0 ? (
            <p>
              {usedBy(deleting.id)
                .map((t) => t.name)
                .join(", ")}{" "}
              use{usedBy(deleting.id).length === 1 ? "s" : ""} it. They'll switch to the Standard preset. Matches already recorded aren't affected.
            </p>
          ) : (
            <p>Matches already recorded aren't affected.</p>
          )
        }
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          for (const t of usedBy(deleting.id)) {
            await updateTeam({
              ...t,
              defaultLiveLayoutId: t.defaultLiveLayoutId === deleting.id ? "preset:standard" : t.defaultLiveLayoutId,
              defaultReviewLayoutId: t.defaultReviewLayoutId === deleting.id ? "preset:standard" : t.defaultReviewLayoutId,
            });
          }
          await updateSettings({ customLayouts: settings.customLayouts.filter((l) => l.id !== deleting.id) });
          setDeleting(null);
        }}
      />
    </>
  );
}

function LayoutEditor({ layout, onChange, onClose }: { layout: Layout; onChange: (l: Layout) => void; onClose: () => void }) {
  const customStats = useApp((s) => s.settings.customStats);
  const all = placeableButtons(customStats);
  const onButtons = layout.buttons.map((id) => resolveButton(id, customStats)).filter((b): b is StatButton => b != null);
  const off = all.filter((b) => !layout.buttons.includes(b.id));

  const setButtons = (buttons: string[]) => onChange({ ...layout, buttons });
  const move = (i: number, d: -1 | 1) => {
    const next = [...layout.buttons];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setButtons(next);
  };

  return (
    <Modal open onClose={onClose} wide>
      <div className="flex items-center justify-between gap-3 mb-4">
        <LazyText className="text-lg font-bold" value={layout.name} onSave={(name) => name.trim() && onChange({ ...layout, name: name.trim() })} />
        <button className="btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
      <p className="text-sm text-slate-500 mb-3">We won / They won, Undo, Sub and Libero are always on the live screen. These are the extra stat buttons.</p>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <p className="font-semibold mb-2">On this screen, in order</p>
          <div className="space-y-1">
            {onButtons.map((b, i) => (
              <div key={b.id} className="flex items-center gap-1 rounded-xl bg-blue-50 border border-blue-200 pl-3">
                <span className="flex-1 font-medium">{b.label}</span>
                <button className="btn-ghost px-3" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                  ↑
                </button>
                <button className="btn-ghost px-3" onClick={() => move(i, 1)} disabled={i === onButtons.length - 1} aria-label="Move down">
                  ↓
                </button>
                <button className="btn-ghost px-3 text-red-700" onClick={() => setButtons(layout.buttons.filter((x) => x !== b.id))} aria-label="Remove">
                  ✕
                </button>
              </div>
            ))}
            {onButtons.length === 0 && <p className="text-slate-500">None. Points only.</p>}
          </div>
        </div>
        <div>
          <p className="font-semibold mb-2">Available</p>
          <div className="space-y-1">
            {off.map((b) => (
              <button key={b.id} className="w-full text-left rounded-xl border border-slate-200 px-3 py-2 min-h-touch active:bg-slate-50" onClick={() => setButtons([...layout.buttons, b.id])}>
                <span className="font-medium">+ {b.label}</span>
                <span className="text-slate-400 text-sm"> · {b.group}</span>
              </button>
            ))}
            {off.length === 0 && <p className="text-slate-500">Everything is on.</p>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
