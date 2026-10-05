import { create } from "zustand";
import * as db from "../db/db";
import { applyMutation, type MatchData, type Mutation } from "../lib/engine";
import { useApp } from "./store";

interface LiveState {
  data: MatchData | null;
  loadedId: string | null;
  /** Set if a write failed. The screen shows it; nothing is silently lost. */
  writeError: string | null;
  load(matchId: string): Promise<void>;
  /** Applies a mutation to the screen now and to storage in order. */
  run(m: Mutation): void;
}

// Writes go one at a time, in the order the taps happened.
let queue: Promise<void> = Promise.resolve();

export const useLive = create<LiveState>((set, get) => ({
  data: null,
  loadedId: null,
  writeError: null,

  async load(matchId) {
    if (get().loadedId === matchId && get().data) return;
    await queue;
    const data = await db.loadMatchData(matchId);
    set({ data, loadedId: matchId, writeError: null });
  },

  run(m) {
    const data = get().data;
    if (!data) return;
    const next = applyMutation(data, m);
    set({ data: next });
    if (m.put.matches.length) useApp.getState().upsertMatchLocal(next.match);
    queue = queue
      .then(() => db.writeMutation(m))
      .catch((err) => {
        console.error(err);
        set({ writeError: "The last change couldn't be saved to the iPad's storage. Back up now and reload the app." });
      });
  },
}));

export function flushLiveWrites(): Promise<void> {
  return queue;
}
