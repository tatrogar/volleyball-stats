import { describe, expect, it } from "vitest";
import { defaultFormat } from "./catalog";
import {
  addPointReason,
  applyMutation,
  awardPoint,
  correctLineup,
  deriveSetState,
  endMatch,
  endSet,
  liberoIn,
  liberoOut,
  logStat,
  matchResult,
  nextAction,
  rotate,
  rotationLabel,
  setWinner,
  startSet,
  substitute,
  undo,
  type CommandResult,
  type MatchData,
} from "./engine";
import type { Lineup, Match, MatchFormat, SetRecord, StatEvent, TeamSide } from "../types";

const T = "2026-10-05T10:00:00.000Z";
// Players p1..p6 start in positions 1..6. p7, p8 on the bench. L is the libero.
const START: Lineup = ["p1", "p2", "p3", "p4", "p5", "p6"];

function newMatch(format: Partial<MatchFormat> = {}): MatchData {
  const match: Match = {
    id: "m", teamId: "t", seasonId: null, opponent: "Rivals", date: "2026-10-05", location: "", event: "",
    format: { ...defaultFormat(), ...format }, liberoIds: ["L", "L2"], liveButtons: [], reviewButtons: [],
    passRatingMode: "optional", practice: false, status: "in_progress", endedAction: null, createdAt: T, updatedAt: T,
  };
  return { match, sets: [], rallies: [], events: [] };
}

/** A tiny driver: runs commands against the data and keeps the result. */
class Game {
  data: MatchData;
  setId = "";
  constructor(format: Partial<MatchFormat> = {}, firstServer: TeamSide = "us", setterId: string | null = "p1") {
    this.data = newMatch(format);
    this.startSet(1, firstServer, setterId);
  }
  apply<R extends { mutation: CommandResult["mutation"] }>(r: R): R {
    this.data = applyMutation(this.data, r.mutation);
    return r;
  }
  startSet(number: number, firstServer: TeamSide = "us", setterId: string | null = "p1", lineup = START) {
    const r = startSet(this.data, { number, lineup, setterId, firstServer }, T);
    this.apply(r);
    this.setId = r.setId;
  }
  get st() {
    return deriveSetState(this.data, this.setId);
  }
  point(w: TeamSide, n = 1) {
    let r: CommandResult | undefined;
    for (let i = 0; i < n; i++) r = this.apply(awardPoint(this.data, this.setId, w, T));
    return r!;
  }
  stat(buttonId: string, playerId: string | null, extra: Partial<Parameters<typeof logStat>[2]> = {}) {
    return this.apply(logStat(this.data, this.setId, { buttonId, playerId, ...extra }, [], T));
  }
  undo() {
    const u = undo(this.data, [], (id) => id ?? "team");
    if (!u) return null;
    this.data = applyMutation(this.data, u.mutation);
    return u.label;
  }
}

describe("rotation", () => {
  it("moves everyone one spot clockwise", () => {
    expect(rotate(START)).toEqual(["p2", "p3", "p4", "p5", "p6", "p1"]);
  });

  it("doesn't rotate when the serving team wins the rally", () => {
    const g = new Game({}, "us");
    g.point("us", 3);
    expect(g.st.lineup).toEqual(START);
    expect(g.st.serving).toBe("us");
  });

  it("rotates on a side-out, and the player moving into 1 serves", () => {
    const g = new Game({}, "them");
    g.point("us");
    expect(g.st.lineup[0]).toBe("p2");
    expect(g.st.serving).toBe("us");
    expect(g.st.rotationIndex).toBe(1);
  });

  it("doesn't rotate when we lose our serve", () => {
    const g = new Game({}, "us");
    g.point("them");
    expect(g.st.lineup).toEqual(START);
    expect(g.st.serving).toBe("them");
  });

  it("comes back round after six side-outs", () => {
    const g = new Game({}, "them");
    for (let i = 0; i < 6; i++) {
      g.point("us");
      g.point("them");
    }
    expect(g.st.lineup).toEqual(START);
    expect(g.st.rotationIndex).toBe(0);
  });

  it("labels rotations by the setter's position, or by count with no setter", () => {
    const g = new Game({}, "them", "p1");
    g.point("them");
    expect(g.data.rallies[0].rotation).toEqual({ index: 0, setterPosition: 1 });
    expect(rotationLabel(g.data.rallies[0].rotation!)).toBe("S1");
    g.point("us"); // side-out: setter p1 moves to position 6
    g.point("us");
    const third = g.data.rallies.find((r) => r.number === 3)!;
    expect(rotationLabel(third.rotation!)).toBe("S6");

    const n = new Game({}, "us", null);
    n.point("us");
    expect(rotationLabel(n.data.rallies[0].rotation!)).toBe("Rotation 1");
  });

  it("records the score, server and lineup on each rally", () => {
    const g = new Game({}, "them");
    g.point("them");
    g.point("us");
    const r2 = g.data.rallies.find((r) => r.number === 2)!;
    expect(r2.scoreBefore).toEqual({ us: 0, them: 1 });
    expect(r2.servingTeam).toBe("them");
    expect(r2.lineup).toEqual(START);
    expect(r2.winner).toBe("us");
  });
});

describe("substitutions", () => {
  it("puts the incoming player in the outgoing player's spot and counts it", () => {
    const g = new Game();
    g.apply(substitute(g.data, g.setId, "p7", "p3", T));
    expect(g.st.lineup).toEqual(["p1", "p2", "p7", "p4", "p5", "p6"]);
    expect(g.st.subsUsed).toBe(1);
  });

  it("hands the setter role to whoever replaces the setter", () => {
    const g = new Game({}, "us", "p1");
    g.apply(substitute(g.data, g.setId, "p7", "p1", T));
    expect(g.st.setterId).toBe("p7");
  });

  it("keeps subs from earlier rallies", () => {
    const g = new Game();
    g.apply(substitute(g.data, g.setId, "p7", "p3", T));
    g.point("us");
    g.point("them");
    expect(g.st.lineup[2]).toBe("p7");
  });
});

describe("libero", () => {
  it("replaces a back-row player and isn't a substitution", () => {
    const g = new Game();
    g.apply(liberoIn(g.data, g.setId, "L", "p5", T));
    expect(g.st.lineup[4]).toBe("L");
    expect(g.st.libero).toEqual({ liberoId: "L", replacedId: "p5" });
    expect(g.st.subsUsed).toBe(0);
  });

  it("goes out automatically when she'd rotate to the front row", () => {
    // Them serving, libero in position 5. A side-out moves 5 → 4 (front row).
    const g = new Game({}, "them");
    g.apply(liberoIn(g.data, g.setId, "L", "p5", T));
    const r = g.point("us");
    expect(r.notice).toEqual({ kind: "libero_out", liberoId: "L", returnedId: "p5" });
    expect(g.st.lineup[3]).toBe("p5");
    expect(g.st.libero).toBeNull();
  });

  it("stays on when rotating within the back row", () => {
    // Libero in position 1 moves to 6.
    const g = new Game({}, "them");
    g.apply(liberoIn(g.data, g.setId, "L", "p1", T));
    const r = g.point("us");
    expect(r.notice).toBeUndefined();
    expect(g.st.lineup[5]).toBe("L");
  });

  it("can be overridden by bringing her straight back in", () => {
    const g = new Game({}, "them");
    g.apply(liberoIn(g.data, g.setId, "L", "p5", T));
    g.point("us");
    g.apply(liberoIn(g.data, g.setId, "L", "p5", T));
    expect(g.st.lineup[3]).toBe("L");
  });

  it("goes out by hand, bringing back the player she replaced", () => {
    const g = new Game();
    g.apply(liberoIn(g.data, g.setId, "L", "p6", T));
    g.apply(liberoOut(g.data, g.setId, T));
    expect(g.st.lineup).toEqual(START);
  });

  it("swaps with the second libero, who inherits the replaced player", () => {
    const g = new Game();
    g.apply(liberoIn(g.data, g.setId, "L", "p6", T));
    g.apply(liberoIn(g.data, g.setId, "L2", "L", T));
    expect(g.st.libero).toEqual({ liberoId: "L2", replacedId: "p6" });
    g.apply(liberoOut(g.data, g.setId, T));
    expect(g.st.lineup[5]).toBe("p6");
  });

  it("warns rather than guesses when it doesn't know who she replaced", () => {
    const g = new Game({}, "them");
    g.apply(correctLineup(g.data, g.setId, { lineup: ["p1", "p2", "p3", "p4", "L", "p6"], serving: "them", setterId: "p1" }, T));
    const r = g.point("us");
    expect(r.notice).toEqual({ kind: "libero_front_row", liberoId: "L" });
    g.apply(liberoOut(g.data, g.setId, T, "p5"));
    expect(g.st.lineup[3]).toBe("p5");
  });
});

describe("stats and points", () => {
  it("a terminal stat awards the point with no second tap", () => {
    const g = new Game();
    const r = g.stat("attack_kill", "p4");
    expect(r.completedRallyId).toBeDefined();
    expect(g.st.score).toEqual({ us: 1, them: 0 });
    const rally = g.data.rallies[0];
    const ev = g.data.events.find((e) => e.type === "stat") as StatEvent;
    expect(rally.pointReason).toEqual({ kind: "stat", eventId: ev.id });
    expect(ev).toMatchObject({ playerId: "p4", action: "attack", outcome: "kill", team: "us" });
  });

  it("errors give the other side the point", () => {
    const g = new Game();
    g.stat("serve_error", "p1", { subtypeId: "st:serve-net" });
    expect(g.st.score).toEqual({ us: 0, them: 1 });
    expect((g.data.events[0] as StatEvent).errorSubtypeId).toBe("st:serve-net");
  });

  it("their error is logged against the opponent and wins us the point", () => {
    const g = new Game();
    g.stat("opp_error", "p1", { subtypeId: "st:net-touch" });
    expect(g.st.score.us).toBe(1);
    expect(g.data.events[0]).toMatchObject({ team: "them", playerId: null, action: "opponent_error" });
  });

  it("neutral stats stay in the open rally", () => {
    const g = new Game();
    g.stat("pass", "p5", { passRating: 3 });
    g.stat("set", "p1");
    g.stat("attack_kill", "p4");
    const rallyId = g.data.rallies[0].id;
    expect(g.data.events.filter((e) => e.rallyId === rallyId)).toHaveLength(3);
    expect(g.data.rallies).toHaveLength(1);
  });

  it("a pass rated 0 is a reception error and loses the point", () => {
    const g = new Game({}, "them");
    g.stat("pass", "p5", { passRating: 0 });
    expect(g.st.score.them).toBe(1);
    expect(g.data.events[0]).toMatchObject({ action: "pass", outcome: "error", passRating: 0 });
  });

  it("a block assist gives every blocker an assist but only one point", () => {
    const g = new Game();
    g.stat("block_assist", "p3", { alsoPlayerIds: ["p2"] });
    expect(g.st.score.us).toBe(1);
    expect(g.data.events.filter((e) => e.type === "stat" && e.outcome === "assist").map((e) => (e as StatEvent).playerId)).toEqual([
      "p3",
      "p2",
    ]);
  });

  it("an error can be charged to the team, with no player", () => {
    const g = new Game();
    const r = g.point("them");
    g.apply(addPointReason(g.data, r.completedRallyId!, { kind: "our_error", playerId: null, subtypeId: "st:other" }, T));
    expect(g.data.events[0]).toMatchObject({ team: "us", playerId: null, action: "error", errorSubtypeId: "st:other" });
  });

  it("'they earned it' records a reason without inventing an error", () => {
    const g = new Game();
    const r = g.point("them");
    g.apply(addPointReason(g.data, r.completedRallyId!, { kind: "earned" }, T));
    expect(g.data.rallies[0].pointReason).toEqual({ kind: "earned" });
    expect(g.data.events).toHaveLength(0);
  });
});

describe("undo", () => {
  it("undoes points one at a time, rotation included", () => {
    const g = new Game({}, "them");
    g.point("us");
    g.point("us");
    expect(g.undo()).toBe("point to us");
    expect(g.st.score).toEqual({ us: 1, them: 0 });
    expect(g.undo()).toBe("point to us");
    expect(g.st.score).toEqual({ us: 0, them: 0 });
    expect(g.st.lineup).toEqual(START);
    expect(g.st.serving).toBe("them");
  });

  it("undoes a terminal stat and its point together", () => {
    const g = new Game();
    g.stat("attack_kill", "p4");
    expect(g.undo()).toBe("kill · p4");
    expect(g.st.score.us).toBe(0);
    expect(g.data.events).toHaveLength(0);
    expect(g.data.rallies).toHaveLength(0);
  });

  it("undoes a neutral stat but leaves the earlier ones", () => {
    const g = new Game();
    g.stat("pass", "p5", { passRating: 2 });
    g.stat("set", "p1");
    g.undo();
    expect(g.data.events).toHaveLength(1);
    expect(g.data.rallies).toHaveLength(1);
  });

  it("undoes subs and libero swaps", () => {
    const g = new Game();
    g.apply(substitute(g.data, g.setId, "p7", "p3", T));
    g.apply(liberoIn(g.data, g.setId, "L", "p5", T));
    expect(g.undo()).toBe("libero in for p5");
    expect(g.undo()).toBe("sub p7 for p3");
    expect(g.st.lineup).toEqual(START);
    expect(g.st.subsUsed).toBe(0);
  });

  it("undoes the automatic libero exit together with the point that caused it", () => {
    const g = new Game({}, "them");
    g.apply(liberoIn(g.data, g.setId, "L", "p5", T));
    g.point("us");
    g.undo();
    expect(g.st.lineup[4]).toBe("L");
    expect(g.st.libero).toEqual({ liberoId: "L", replacedId: "p5" });
  });

  it("undoes a point and its reason together", () => {
    const g = new Game();
    const r = g.point("them");
    g.apply(addPointReason(g.data, r.completedRallyId!, { kind: "our_error", playerId: "p2", subtypeId: null }, T));
    g.undo();
    expect(g.st.score.them).toBe(0);
    expect(g.data.events).toHaveLength(0);
  });

  it("reopens a set and a match", () => {
    const g = new Game({ setsMode: "fixed", setCount: 1 });
    g.point("us", 25);
    g.apply(endSet(g.data, g.setId, T));
    g.apply(endMatch(g.data, T));
    expect(g.data.match.status).toBe("complete");
    expect(g.undo()).toBe("end of match");
    expect(g.undo()).toBe("end of set 1");
    expect(g.data.sets[0].status).toBe("in_progress");
    expect(g.st.score.us).toBe(25);
  });

  it("ends the set and match in one step, undone together", () => {
    const g = new Game({ setsMode: "fixed", setCount: 1 });
    g.point("us", 25);
    g.apply(endSet(g.data, g.setId, T, true));
    expect(g.data.match.status).toBe("complete");
    expect(g.undo()).toBe("end of set 1 and the match");
    expect(g.data.match.status).toBe("in_progress");
    expect(g.data.sets[0].status).toBe("in_progress");
  });

  it("can take back the start of a set", () => {
    const g = new Game();
    expect(g.undo()).toBe("start of set 1");
    expect(g.data.sets).toHaveLength(0);
    expect(g.undo()).toBeNull();
  });

  it("numbers actions so the latest is always the one undone", () => {
    const g = new Game();
    const before = nextAction(g.data);
    g.stat("pass", "p5");
    expect(nextAction(g.data)).toBe(before + 1);
  });
});

describe("set end", () => {
  const f = defaultFormat();

  it("ends at 25 with a 2-point lead", () => {
    expect(setWinner(f, 1, { us: 25, them: 23 })).toBe("us");
    expect(setWinner(f, 1, { us: 24, them: 22 })).toBeNull();
    expect(setWinner(f, 1, { us: 25, them: 24 })).toBeNull();
    expect(setWinner(f, 1, { us: 27, them: 29 })).toBe("them");
  });

  it("plays the deciding set to 15", () => {
    expect(setWinner(f, 3, { us: 15, them: 13 })).toBe("us");
    expect(setWinner(f, 2, { us: 15, them: 13 })).toBeNull();
    const five = { ...f, setCount: 5 };
    expect(setWinner(five, 3, { us: 15, them: 13 })).toBeNull();
    expect(setWinner(five, 5, { us: 15, them: 13 })).toBe("us");
  });

  it("ends on the first point to the target without win-by-2", () => {
    const g = { ...f, winBy2: false };
    expect(setWinner(g, 1, { us: 25, them: 24 })).toBe("us");
    expect(setWinner(g, 1, { us: 24, them: 24 })).toBeNull();
  });

  it("stops at the point cap", () => {
    const g = { ...f, pointCap: 27 };
    expect(setWinner(g, 1, { us: 26, them: 25 })).toBeNull();
    expect(setWinner(g, 1, { us: 27, them: 26 })).toBe("us");
    expect(setWinner(g, 1, { us: 26, them: 27 })).toBe("them");
  });

  it("in fixed mode, only shortens the last set when asked", () => {
    const fixed = { ...f, setsMode: "fixed" as const, setCount: 2 };
    expect(setWinner(fixed, 2, { us: 15, them: 10 })).toBeNull();
    expect(setWinner({ ...fixed, fixedLastSetIsDeciding: true }, 2, { us: 15, them: 10 })).toBe("us");
  });

  it("uses custom set lengths", () => {
    const g = { ...f, pointsPerSet: 21, decidingSetPoints: 11 };
    expect(setWinner(g, 1, { us: 21, them: 19 })).toBe("us");
    expect(setWinner(g, 3, { us: 11, them: 9 })).toBe("us");
  });
});

describe("match end", () => {
  const set = (winner: TeamSide | null, status: "complete" | "in_progress" = "complete") => ({ winner, status }) as SetRecord;
  const f = defaultFormat();

  it("best of 3 ends at two sets", () => {
    expect(matchResult(f, [set("us")]).over).toBe(false);
    expect(matchResult(f, [set("us"), set("us")])).toEqual({ over: true, setsWon: { us: 2, them: 0 }, winner: "us" });
    expect(matchResult(f, [set("us"), set("them")]).over).toBe(false);
    expect(matchResult(f, [set("us"), set("them"), set("them")]).winner).toBe("them");
  });

  it("best of 5 ends at three sets", () => {
    const five = { ...f, setCount: 5 };
    expect(matchResult(five, [set("us"), set("us")]).over).toBe(false);
    expect(matchResult(five, [set("us"), set("them"), set("us"), set("us")]).winner).toBe("us");
  });

  it("fixed format plays every set, and can tie", () => {
    const fixed = { ...f, setsMode: "fixed" as const, setCount: 2 };
    expect(matchResult(fixed, [set("us")]).over).toBe(false);
    expect(matchResult(fixed, [set("us"), set("them")])).toEqual({ over: true, setsWon: { us: 1, them: 1 }, winner: "tie" });
    expect(matchResult(fixed, [set("us"), set("us")]).winner).toBe("us");
  });

  it("ignores a set still being played", () => {
    expect(matchResult(f, [set("us"), set(null, "in_progress")]).over).toBe(false);
  });
});

describe("lineup correction", () => {
  it("replaces the lineup, server and setter from that rally on", () => {
    const g = new Game({}, "us", "p1");
    g.point("us");
    g.apply(correctLineup(g.data, g.setId, { lineup: ["p2", "p3", "p4", "p5", "p6", "p1"], serving: "them", setterId: "p2" }, T));
    expect(g.st.lineup[0]).toBe("p2");
    expect(g.st.serving).toBe("them");
    expect(g.st.setterId).toBe("p2");
    g.undo();
    expect(g.st.lineup).toEqual(START);
    expect(g.st.serving).toBe("us");
  });
});
