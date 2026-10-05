import { describe, expect, it } from "vitest";
import type { Player } from "../types";
import { duplicateNumbers, sortRoster } from "./store";

const p = (number: string, name = "x", active = true) => ({ id: number + name, number, name, active }) as Player;

describe("roster helpers", () => {
  it("sorts by jersey number numerically, blanks last", () => {
    expect(sortRoster([p("12"), p(""), p("3"), p("00")]).map((x) => x.number)).toEqual(["00", "3", "12", ""]);
  });
  it("flags duplicate numbers among active players only", () => {
    expect([...duplicateNumbers([p("7", "a"), p("7", "b"), p("8")])]).toEqual(["7"]);
    expect(duplicateNumbers([p("7", "a"), p("7", "b", false)]).size).toBe(0);
  });
});
