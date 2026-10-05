import { useState } from "react";
import { navigate } from "../../lib/router";
import { useApp } from "../../state/store";
import { BackupStatus } from "../backup/BackupStatus";
import { Modal } from "../common/Dialog";
import { PageTitle } from "../common/Shell";

export function Home() {
  const { teams, players, seasons, matches } = useApp();
  const [adding, setAdding] = useState(false);
  const recent = [...matches].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? "";

  return (
    <>
      <BackupStatus />
      <PageTitle
        actions={
          <>
            <button className="btn-secondary" onClick={() => setAdding(true)}>
              Add team
            </button>
            <button className="btn-primary" disabled title="Comes in the next build">
              Start a match
            </button>
          </>
        }
      >
        Teams
      </PageTitle>

      {teams.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-lg mb-4">No teams yet. Add your team to get started.</p>
          <button className="btn-primary" onClick={() => setAdding(true)}>
            Add team
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => {
            const roster = players.filter((p) => p.teamId === t.id && p.active).length;
            const teamSeasons = seasons.filter((s) => s.teamId === t.id).length;
            return (
              <button key={t.id} className="card p-5 text-left active:bg-slate-50" onClick={() => navigate(`/teams/${t.id}`)}>
                <p className="text-xl font-bold">{t.name}</p>
                <p className="text-slate-600 mt-1">
                  {roster} player{roster === 1 ? "" : "s"} · {teamSeasons} season{teamSeasons === 1 ? "" : "s"}
                </p>
              </button>
            );
          })}
        </div>
      )}

      <h2 className="text-xl font-bold mt-8 mb-3">Recent matches</h2>
      {recent.length === 0 ? (
        <p className="text-slate-500">No matches yet. Match tracking arrives in the next build.</p>
      ) : (
        <div className="card divide-y">
          {recent.map((m) => (
            <div key={m.id} className="p-4 flex justify-between">
              <span>
                {teamName(m.teamId)} vs {m.opponent}
              </span>
              <span className="text-slate-500">{m.date}</span>
            </div>
          ))}
        </div>
      )}

      <AddTeamDialog open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

export function AddTeamDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createTeam = useApp((s) => s.createTeam);
  const [name, setName] = useState("");
  const save = async () => {
    if (!name.trim()) return;
    const team = await createTeam(name);
    setName("");
    onClose();
    navigate(`/teams/${team.id}`);
  };
  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="text-xl font-bold mb-4">Add team</h2>
      <label className="block mb-4">
        <span className="label">Team name</span>
        <input className="field" value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="e.g. 14U Gold" />
      </label>
      <div className="flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" disabled={!name.trim()} onClick={save}>
          Add
        </button>
      </div>
    </Modal>
  );
}
