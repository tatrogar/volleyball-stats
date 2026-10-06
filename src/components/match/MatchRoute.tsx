import { useEffect } from "react";
import { currentSet } from "../../lib/engine";
import { navigate } from "../../lib/router";
import { useLive } from "../../state/live";
import { LiveScreen } from "./LiveScreen";
import { MatchSummary } from "./MatchSummary";
import { SetStart } from "./SetStart";

/** Shows whichever screen the match is at: next set's lineup, live, or the summary. */
export function MatchRoute({ matchId }: { matchId: string }) {
  const { data, loadedId, load } = useLive();
  useEffect(() => {
    void load(matchId);
  }, [matchId, load]);

  if (loadedId !== matchId) return <div className="p-8 text-slate-500">Loading…</div>;
  if (!data)
    return (
      <div className="p-8">
        <p className="mb-4">That match isn't on this iPad.</p>
        <button className="btn-primary" onClick={() => navigate("/")}>
          Home
        </button>
      </div>
    );
  if (data.match.status === "complete") return <MatchSummary data={data} />;
  const set = currentSet(data);
  if (set) return <LiveScreen data={data} set={set} />;
  return <SetStart data={data} />;
}
