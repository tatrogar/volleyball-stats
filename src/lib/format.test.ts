import { describe, expect, it } from "vitest";
import { defaultFormat } from "./catalog";
import { describeFormat, formatWarnings } from "./format";

describe("formatWarnings", () => {
  it("has nothing to say about the default", () => {
    expect(formatWarnings(defaultFormat())).toEqual([]);
  });
  it("warns about an even best-of", () => {
    expect(formatWarnings({ ...defaultFormat(), setCount: 4 })).toHaveLength(1);
  });
  it("allows any count in fixed mode", () => {
    expect(formatWarnings({ ...defaultFormat(), setsMode: "fixed", setCount: 2 })).toEqual([]);
  });
  it("warns about a cap below the target", () => {
    expect(formatWarnings({ ...defaultFormat(), pointCap: 20 }).join()).toMatch(/below/);
  });
  it("warns about a cap without win-by-2", () => {
    expect(formatWarnings({ ...defaultFormat(), pointCap: 27, winBy2: false }).join()).toMatch(/only matters/);
  });
  it("warns about a deciding set longer than the others", () => {
    expect(formatWarnings({ ...defaultFormat(), decidingSetPoints: 30 })).toHaveLength(1);
  });
});

describe("describeFormat", () => {
  it("reads naturally", () => {
    expect(describeFormat(defaultFormat())).toBe("Best of 3 · to 25, deciding set to 15 · win by 2");
    expect(describeFormat({ ...defaultFormat(), setsMode: "fixed", setCount: 2, pointCap: 27, maxSubsPerSet: 12 })).toBe(
      "2 sets, all played · to 25 · win by 2 · cap 27 · 12 subs per set",
    );
  });
});
