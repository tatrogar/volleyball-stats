import { useState } from "react";
import { navigate } from "../../lib/router";
import { useApp } from "../../state/store";
import { NumberField, Section, Segmented, Toggle } from "../common/Fields";
import { PageTitle } from "../common/Shell";
import { AddTeamDialog } from "../home/Home";
import { LayoutsSection } from "./LayoutsSection";
import { StatsSection } from "./StatsSection";

type Tab = "teams" | "layouts" | "stats" | "prefs";
const TABS: { value: Tab; label: string }[] = [
  { value: "teams", label: "Teams" },
  { value: "layouts", label: "Layouts" },
  { value: "stats", label: "Stats & errors" },
  { value: "prefs", label: "Preferences" },
];

export function SettingsPage({ tab }: { tab: string | undefined }) {
  const current = (TABS.find((t) => t.value === tab)?.value ?? "teams") as Tab;
  return (
    <>
      <PageTitle>Settings</PageTitle>
      <div className="mb-4">
        <Segmented value={current} options={TABS} onChange={(t) => navigate(`/settings/${t}`)} />
      </div>
      {current === "teams" && <TeamsSection />}
      {current === "layouts" && <LayoutsSection />}
      {current === "stats" && <StatsSection />}
      {current === "prefs" && <Preferences />}
    </>
  );
}

function TeamsSection() {
  const { teams, players } = useApp();
  const [adding, setAdding] = useState(false);
  return (
    <Section
      title="Teams"
      actions={
        <button className="btn-primary" onClick={() => setAdding(true)}>
          Add team
        </button>
      }
    >
      <p className="text-sm text-slate-500 mb-2">Open a team to edit its roster, seasons, default match format and default layouts.</p>
      <div className="divide-y">
        {teams.map((t) => (
          <button key={t.id} className="w-full flex justify-between items-center py-3 min-h-touch text-left active:bg-slate-50" onClick={() => navigate(`/teams/${t.id}`)}>
            <span className="font-semibold text-lg">{t.name}</span>
            <span className="text-slate-500">{players.filter((p) => p.teamId === t.id && p.active).length} players ›</span>
          </button>
        ))}
        {teams.length === 0 && <p className="text-slate-500 py-2">No teams yet.</p>}
      </div>
      <AddTeamDialog open={adding} onClose={() => setAdding(false)} />
    </Section>
  );
}

function Preferences() {
  const { settings, updateSettings } = useApp();
  return (
    <>
      <Section title="Live entry">
        <div className="space-y-5">
          <div>
            <span className="label">Tap order for a stat</span>
            <Segmented
              value={settings.entryOrder}
              onChange={(entryOrder) => updateSettings({ entryOrder })}
              options={[
                { value: "player_first", label: "Player, then stat" },
                { value: "stat_first", label: "Stat, then player" },
              ]}
            />
          </div>
          <div>
            <span className="label">Pass ratings (0–3)</span>
            <Segmented
              value={settings.passRatingMode}
              onChange={(passRatingMode) => updateSettings({ passRatingMode })}
              options={[
                { value: "off", label: "Off" },
                { value: "optional", label: "Optional" },
                { value: "required", label: "Required" },
              ]}
            />
            <p className="text-sm text-slate-500 mt-1">
              {settings.passRatingMode === "off"
                ? "Passes are counted without a rating."
                : settings.passRatingMode === "optional"
                  ? "You'll be offered a rating after each pass, and can skip it."
                  : "Every pass needs a rating before moving on."}
            </p>
          </div>
          <div className="max-w-xl">
            <Toggle
              checked={settings.promptForPointReason}
              onChange={(promptForPointReason) => updateSettings({ promptForPointReason })}
              label="Ask why, when a point is logged without a stat"
              hint="After tapping We won / They won, offer a quick “whose error, what kind” prompt. You can always skip it."
            />
          </div>
        </div>
      </Section>

      <Section title="Video review">
        <label className="flex flex-wrap items-center gap-3">
          <NumberField value={settings.videoLeadInSeconds} min={0} max={30} onChange={(n) => n != null && updateSettings({ videoLeadInSeconds: n })} />
          <span>seconds of lead-in when jumping to a stat</span>
        </label>
      </Section>

      <Section title="Backup reminder">
        <label className="flex flex-wrap items-center gap-3">
          <span>Warn on the home screen when the last backup is</span>
          <NumberField value={settings.backupReminderDays} min={1} max={365} onChange={(n) => n != null && updateSettings({ backupReminderDays: Math.max(1, n) })} />
          <span>or more days old</span>
        </label>
      </Section>
    </>
  );
}
