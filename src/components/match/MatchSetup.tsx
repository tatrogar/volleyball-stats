import { useMemo, useState } from "react";
import { allLayouts, findLayout } from "../../lib/catalog";
import { describeFormat } from "../../lib/format";
import { newId, now, todayLocal } from "../../lib/id";
import { navigate } from "../../lib/router";
import { sortRoster, useApp } from "../../state/store";
import type { Match } from "../../types";
import { Section, Segmented, Toggle, Warnings } from "../common/Fields";
import { PageTitle } from "../common/Shell";
import { FormatEditor } from "../settings/FormatEditor";

export function MatchSetup({ teamId }: { teamId: string | undefined }) {
  const teams = useApp((s) => s.teams);
  const [pickedTeam, setPickedTeam] = useState(teamId ?? (teams.length === 1 ? teams[0].id : ""));
  const team = teams.find((t) => t.id === pickedTeam);

  if (!team)
    return (
      <>
        <PageTitle>Start a match</PageTitle>
        {teams.length === 0 ? (
          <p>Add a team first, under Home → Add team.</p>
        ) : (
          <Section title="Which team?">
            <div className="grid sm:grid-cols-2 gap-3">
              {teams.map((t) => (
                <button key={t.id} className="btn-secondary text-lg justify-start" onClick={() => setPickedTeam(t.id)}>
                  {t.name}
                </button>
              ))}
            </div>
          </Section>
        )}
      </>
    );

  return <MatchForm key={team.id} teamId={team.id} />;
}

function MatchForm({ teamId }: { teamId: string }) {
  const { teams, seasons, players, settings, createMatch } = useApp();
  const team = teams.find((t) => t.id === teamId)!;
  const teamSeasons = seasons
    .filter((s) => s.teamId === teamId)
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || b.createdAt.localeCompare(a.createdAt));
  const roster = useMemo(() => sortRoster(players.filter((p) => p.teamId === teamId && p.active)), [players, teamId]);

  const [opponent, setOpponent] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [location, setLocation] = useState("");
  const [event, setEvent] = useState("");
  const [seasonId, setSeasonId] = useState<string>(teamSeasons[0]?.id ?? "");
  const [liberoIds, setLiberoIds] = useState<string[]>(() => {
    const ls = roster.filter((p) => p.positions.includes("L"));
    return ls.length <= 2 ? ls.map((p) => p.id) : [];
  });
  const [format, setFormat] = useState(team.defaultFormat);
  const [editFormat, setEditFormat] = useState(false);
  const [liveLayoutId, setLiveLayoutId] = useState(team.defaultLiveLayoutId);
  const [reviewLayoutId, setReviewLayoutId] = useState(team.defaultReviewLayoutId);
  const [practice, setPractice] = useState(false);
  const layouts = allLayouts(settings);

  const warnings: string[] = [];
  if (roster.length < 6) warnings.push(`${team.name} has ${roster.length} active players. A lineup needs six.`);

  const toggleLibero = (id: string) =>
    setLiberoIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 2 ? [cur[1], id] : [...cur, id]));

  const start = async () => {
    const t = now();
    const match: Match = {
      id: newId(),
      teamId,
      seasonId: seasonId || null,
      opponent: opponent.trim() || "Opponent",
      date,
      location: location.trim(),
      event: event.trim(),
      format,
      liberoIds,
      liveButtons: [...findLayout(settings, liveLayoutId).buttons],
      reviewButtons: [...findLayout(settings, reviewLayoutId).buttons],
      passRatingMode: settings.passRatingMode,
      practice,
      status: "in_progress",
      endedAction: null,
      createdAt: t,
      updatedAt: t,
    };
    await createMatch(match);
    navigate(`/match/${match.id}`);
  };

  return (
    <>
      <PageTitle
        actions={
          <button className="btn-primary text-lg px-6" onClick={start}>
            Set lineup →
          </button>
        }
      >
        {team.name} match
      </PageTitle>
      <Warnings items={warnings} />

      <Section title="Match">
        <div className="grid md:grid-cols-2 gap-4">
          <label>
            <span className="label">Opponent</span>
            <input className="field" value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="e.g. Westside 14U" autoFocus />
          </label>
          <label>
            <span className="label">Date</span>
            <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value || todayLocal())} />
          </label>
          <label>
            <span className="label">Location (optional)</span>
            <input className="field" value={location} onChange={(e) => setLocation(e.target.value)} />
          </label>
          <label>
            <span className="label">Event or tournament (optional)</span>
            <input className="field" value={event} onChange={(e) => setEvent(e.target.value)} />
          </label>
        </div>
        <div className="mt-4">
          <span className="label">Season</span>
          <Segmented
            value={seasonId}
            onChange={setSeasonId}
            options={[...teamSeasons.map((s) => ({ value: s.id, label: s.name })), { value: "", label: "No season" }]}
          />
        </div>
        <div className="mt-4 max-w-xl">
          <Toggle
            checked={practice}
            onChange={setPractice}
            label="Practice match"
            hint="For trying the app out or practicing stat-keeping. Scored the same, but labelled practice and left out of season stats."
          />
        </div>
      </Section>

      <Section title="Libero">
        <p className="text-sm text-slate-500 mb-2">Up to two. Only one is on court at a time.</p>
        <div className="flex flex-wrap gap-2">
          {roster.map((p) => (
            <button key={p.id} className={liberoIds.includes(p.id) ? "chip-on" : "chip-off"} onClick={() => toggleLibero(p.id)}>
              #{p.number} {p.name}
            </button>
          ))}
        </div>
        {liberoIds.length === 0 && <p className="text-sm text-slate-500 mt-2">No libero this match.</p>}
      </Section>

      <Section
        title="Format"
        actions={
          <button className="btn-ghost" onClick={() => setEditFormat(!editFormat)}>
            {editFormat ? "Done" : "Change for this match"}
          </button>
        }
      >
        {editFormat ? <FormatEditor value={format} onChange={setFormat} /> : <p>{describeFormat(format)}</p>}
      </Section>

      <Section title="Stat buttons">
        <div className="space-y-4">
          <div>
            <span className="label">Live, courtside</span>
            <Segmented value={liveLayoutId} onChange={setLiveLayoutId} options={layouts.map((l) => ({ value: l.id, label: l.name }))} />
          </div>
          <div>
            <span className="label">Review, with film</span>
            <Segmented value={reviewLayoutId} onChange={setReviewLayoutId} options={layouts.map((l) => ({ value: l.id, label: l.name }))} />
          </div>
        </div>
      </Section>

      <div className="flex justify-end">
        <button className="btn-primary text-lg px-6" onClick={start}>
          Set lineup →
        </button>
      </div>
    </>
  );
}
