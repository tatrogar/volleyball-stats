import { useState } from "react";
import { playerHasHistory, countMatchesInSeason } from "../../db/db";
import { allLayouts } from "../../lib/catalog";
import { navigate } from "../../lib/router";
import { duplicateNumbers, sortRoster, useApp } from "../../state/store";
import { POSITIONS, type Player, type Position, type Season, type Team } from "../../types";
import { Confirm } from "../common/Dialog";
import { LazyText, NumberField, Section, Segmented, Warnings } from "../common/Fields";
import { PageTitle } from "../common/Shell";
import { FormatEditor } from "./FormatEditor";

type Tab = "roster" | "seasons" | "format" | "details";

export function TeamPage({ teamId }: { teamId: string }) {
  const team = useApp((s) => s.teams.find((t) => t.id === teamId));
  const [tab, setTab] = useState<Tab>("roster");
  if (!team)
    return (
      <div className="card p-8 text-center">
        <p className="mb-4">That team doesn't exist any more.</p>
        <button className="btn-primary" onClick={() => navigate("/")}>
          Home
        </button>
      </div>
    );
  return (
    <>
      <PageTitle>
        <button className="btn-ghost -ml-4 mr-1" onClick={() => navigate("/settings")} aria-label="Back to settings">
          ‹
        </button>
        {team.name}
      </PageTitle>
      <div className="mb-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "roster", label: "Roster" },
            { value: "seasons", label: "Seasons" },
            { value: "format", label: "Match format" },
            { value: "details", label: "Details" },
          ]}
        />
      </div>
      {tab === "roster" && <Roster team={team} />}
      {tab === "seasons" && <Seasons team={team} />}
      {tab === "format" && <FormatTab team={team} />}
      {tab === "details" && <Details team={team} />}
    </>
  );
}

// ---------------------------------------------------------------- roster

function PositionChips({ value, onChange }: { value: Position[]; onChange: (v: Position[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {POSITIONS.map((p) => {
        const on = value.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            title={p.label}
            className={on ? "chip-on" : "chip-off"}
            onClick={() => onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])}
          >
            {p.id === "OPP" ? "OPP/RS" : p.id}
          </button>
        );
      })}
    </div>
  );
}

function Roster({ team }: { team: Team }) {
  const { players, createPlayer, updatePlayer, deletePlayer } = useApp();
  const roster = sortRoster(players.filter((p) => p.teamId === team.id));
  const active = roster.filter((p) => p.active);
  const inactive = roster.filter((p) => !p.active);
  const dupes = duplicateNumbers(roster);

  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [positions, setPositions] = useState<Position[]>([]);
  const [pendingDelete, setPendingDelete] = useState<{ player: Player; hasHistory: boolean } | null>(null);

  const add = async () => {
    if (!name.trim() && !number.trim()) return;
    // Clear first, so anything typed while the save runs isn't wiped.
    const fields = { name, number, positions };
    setNumber("");
    setName("");
    setPositions([]);
    document.getElementById("new-player-number")?.focus();
    await createPlayer(team.id, fields);
  };

  const askDelete = async (player: Player) => {
    setPendingDelete({ player, hasHistory: await playerHasHistory(player) });
  };

  const warnings = [...dupes].map((n) => `More than one active player wears #${n}.`);

  return (
    <>
      <Section title={`Roster (${active.length} active)`}>
        <Warnings items={warnings} />
        <div className="divide-y">
          {active.map((p) => (
            <PlayerRow key={p.id} player={p} dupe={dupes.has(p.number)} onChange={updatePlayer} onDelete={() => askDelete(p)} />
          ))}
        </div>
        {active.length === 0 && <p className="text-slate-500 py-2">No players yet. Add them below.</p>}

        <div className="mt-4 pt-4 border-t-2 border-dashed">
          <p className="font-semibold mb-2">Add a player</p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              id="new-player-number"
              className="field w-20 text-center"
              inputMode="numeric"
              placeholder="#"
              value={number}
              onChange={(e) => setNumber(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
            />
            <input className="field flex-1 min-w-[180px]" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
            <PositionChips value={positions} onChange={setPositions} />
            <button className="btn-primary" disabled={!name.trim() && !number.trim()} onClick={add}>
              Add
            </button>
          </div>
        </div>
      </Section>

      {inactive.length > 0 && (
        <Section title={`Inactive (${inactive.length})`}>
          <p className="text-sm text-slate-500 mb-2">Kept for past stats. They don't appear when picking lineups.</p>
          <div className="divide-y opacity-70">
            {inactive.map((p) => (
              <PlayerRow key={p.id} player={p} dupe={false} onChange={updatePlayer} onDelete={() => askDelete(p)} />
            ))}
          </div>
        </Section>
      )}

      <Confirm
        open={pendingDelete != null}
        title={`Delete ${pendingDelete?.player.name || "#" + pendingDelete?.player.number}?`}
        danger
        confirmLabel="Delete"
        body={
          pendingDelete?.hasHistory ? (
            <>
              <p>This player appears in recorded matches. Deleting them would leave those stats without a name.</p>
              <p>
                <strong>Mark them inactive instead</strong> to keep their history and hide them from lineups.
              </p>
            </>
          ) : (
            <p>This can't be undone.</p>
          )
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) await deletePlayer(pendingDelete.player.id);
          setPendingDelete(null);
        }}
      />
    </>
  );
}

function PlayerRow({ player, dupe, onChange, onDelete }: { player: Player; dupe: boolean; onChange: (p: Player) => void; onDelete: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <LazyText
        className={`w-20 text-center font-bold ${dupe ? "border-amber-500 bg-amber-50" : ""}`}
        value={player.number}
        placeholder="#"
        onSave={(v) => onChange({ ...player, number: v.replace(/[^0-9]/g, "").slice(0, 3) })}
      />
      <LazyText className="flex-1 min-w-[160px]" value={player.name} placeholder="Name" onSave={(v) => onChange({ ...player, name: v.trim() })} />
      <PositionChips value={player.positions} onChange={(positions) => onChange({ ...player, positions })} />
      <button className="btn-secondary" onClick={() => onChange({ ...player, active: !player.active })}>
        {player.active ? "Make inactive" : "Make active"}
      </button>
      <button className="btn-ghost text-red-700" onClick={onDelete} aria-label="Delete player">
        Delete
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- seasons

function Seasons({ team }: { team: Team }) {
  const { seasons, matches, createSeason, updateSeason, deleteSeason } = useApp();
  const list = seasons
    .filter((s) => s.teamId === team.id)
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || b.createdAt.localeCompare(a.createdAt));
  const [name, setName] = useState("");
  const [year, setYear] = useState<number | null>(new Date().getFullYear());
  const [pendingDelete, setPendingDelete] = useState<{ season: Season; matches: number } | null>(null);

  const add = async () => {
    if (!name.trim()) return;
    const n = name;
    setName("");
    await createSeason(team.id, n, year);
  };

  return (
    <Section title="Seasons">
      <p className="text-sm text-slate-500 mb-3">Stats add up per season. Each match is filed under one.</p>
      <div className="divide-y">
        {list.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-3 py-3">
            <LazyText className="flex-1 min-w-[200px]" value={s.name} onSave={(v) => v.trim() && updateSeason({ ...s, name: v.trim() })} />
            <NumberField value={s.year} allowEmpty placeholder="Year" max={2999} onChange={(y) => updateSeason({ ...s, year: y })} />
            <span className="text-slate-500 w-28">{matches.filter((m) => m.seasonId === s.id).length} matches</span>
            <button className="btn-ghost text-red-700" onClick={async () => setPendingDelete({ season: s, matches: await countMatchesInSeason(s.id) })}>
              Delete
            </button>
          </div>
        ))}
        {list.length === 0 && <p className="text-slate-500 py-2">No seasons yet.</p>}
      </div>
      <div className="mt-4 pt-4 border-t-2 border-dashed flex flex-wrap items-center gap-3">
        <input className="field flex-1 min-w-[200px]" placeholder="Season name, e.g. Club 2026–27" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <NumberField value={year} allowEmpty placeholder="Year" max={2999} onChange={setYear} />
        <button className="btn-primary" disabled={!name.trim()} onClick={add}>
          Add season
        </button>
      </div>
      <Confirm
        open={pendingDelete != null}
        title={`Delete season “${pendingDelete?.season.name}”?`}
        danger
        confirmLabel="Delete season"
        body={
          pendingDelete && pendingDelete.matches > 0 ? (
            <p>
              Its {pendingDelete.matches} match{pendingDelete.matches === 1 ? "" : "es"} will be kept, filed under no season.
            </p>
          ) : (
            <p>It has no matches.</p>
          )
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) await deleteSeason(pendingDelete.season.id);
          setPendingDelete(null);
        }}
      />
    </Section>
  );
}

// ---------------------------------------------------------------- format & details

function FormatTab({ team }: { team: Team }) {
  const updateTeam = useApp((s) => s.updateTeam);
  return (
    <Section title="Default match format">
      <p className="text-sm text-slate-500 mb-4">New matches start with this. You can change it for any single match when you set it up.</p>
      <FormatEditor value={team.defaultFormat} onChange={(f) => updateTeam({ ...team, defaultFormat: f })} />
    </Section>
  );
}

function Details({ team }: { team: Team }) {
  const { settings, updateTeam, deleteTeam, matches } = useApp();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const layouts = allLayouts(settings);
  const matchCount = matches.filter((m) => m.teamId === team.id).length;

  return (
    <>
      <Section title="Team">
        <label className="block mb-4">
          <span className="label">Name</span>
          <LazyText value={team.name} onSave={(v) => v.trim() && updateTeam({ ...team, name: v.trim() })} />
        </label>
        <label className="block">
          <span className="label">Notes</span>
          <LazyText multiline value={team.notes} placeholder="Coach, practice times, anything else" onSave={(v) => updateTeam({ ...team, notes: v })} />
        </label>
      </Section>

      <Section title="Default screen layouts">
        <p className="text-sm text-slate-500 mb-3">Which stat buttons this team's matches start with. Edit layouts under Settings → Layouts.</p>
        <div className="space-y-4">
          <div>
            <span className="label">Live (courtside)</span>
            <Segmented value={team.defaultLiveLayoutId} onChange={(id) => updateTeam({ ...team, defaultLiveLayoutId: id })} options={layouts.map((l) => ({ value: l.id, label: l.name }))} />
          </div>
          <div>
            <span className="label">Review (watching film)</span>
            <Segmented value={team.defaultReviewLayoutId} onChange={(id) => updateTeam({ ...team, defaultReviewLayoutId: id })} options={layouts.map((l) => ({ value: l.id, label: l.name }))} />
          </div>
        </div>
      </Section>

      <Section title="Delete team">
        <p className="text-slate-600 mb-3">Removes the team, its roster, seasons and all {matchCount} of its matches from this iPad.</p>
        <button className="btn-danger" onClick={() => setConfirmDelete(true)}>
          Delete {team.name}
        </button>
      </Section>

      <Confirm
        open={confirmDelete}
        title={`Delete ${team.name}?`}
        danger
        requireText="delete"
        confirmLabel="Delete team"
        body={
          <>
            <p>Everything for this team goes: roster, seasons and {matchCount} match{matchCount === 1 ? "" : "es"} of stats.</p>
            <p>The only way back is restoring a backup.</p>
          </>
        }
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await deleteTeam(team.id);
          navigate("/");
        }}
      />
    </>
  );
}

