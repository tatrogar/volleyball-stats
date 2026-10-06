import { useState } from "react";
import { navigate } from "../../lib/router";
import { useApp } from "../../state/store";
import { BackupStatus } from "../backup/BackupStatus";
import { Modal } from "../common/Dialog";
import { PageTitle } from "../common/Shell";

export function Home() {
  const { teams, players, seasons, matches } = useApp();
  const [adding, setAdding] = useState(false);
  const recent = [...matches].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 10);
  const live = matches.filter((m) => m.status === "in_progress");
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? "";

  return (
    <>
      <BackupStatus />
      {live.map((m) => (
        <button
          key={m.id}
          className="w-full rounded-2xl bg-green-700 text-white p-4 mb-4 flex items-center justify-between text-left active:bg-green-800"
          onClick={() => navigate(`/match/${m.id}`)}
        >
          <span>
            <span className="block text-sm opacity-80">In progress{m.practice ? " · practice" : ""}</span>
            <span className="text-xl font-bold">
              {teamName(m.teamId)} vs {m.opponent}
            </span>
          </span>
          <span className="text-lg font-bold">Resume ›</span>
        </button>
      ))}
      <PageTitle
        actions={
          <>
            <button className="btn-secondary" onClick={() => setAdding(true)}>
              Add team
            </button>
            <button className="btn-primary" disabled={teams.length === 0} onClick={() => navigate("/match/new")}>
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
        <p className="text-slate-500">No matches yet. Tap Start a match. Turn on “Practice match” to try it out without it counting.</p>
      ) : (
        <div className="card divide-y">
          {recent.map((m) => (
            <button key={m.id} className="w-full p-4 flex justify-between items-center text-left active:bg-slate-50" onClick={() => navigate(`/match/${m.id}`)}>
              <span>
                <span className="font-semibold">
                  {teamName(m.teamId)} vs {m.opponent}
                </span>
                {m.practice && <span className="ml-2 text-xs font-bold uppercase text-amber-700">Practice</span>}
                {m.status === "in_progress" && <span className="ml-2 text-xs font-bold uppercase text-green-700">In progress</span>}
              </span>
              <span className="text-slate-500">{m.date} ›</span>
            </button>
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
