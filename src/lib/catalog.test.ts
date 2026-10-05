import { describe, expect, it } from "vitest";
import { customButtonId, defaultErrorSubtypes, findLayout, PRESET_LAYOUTS, resolveButton, STAT_BUTTONS, defaultSettings } from "./catalog";

describe("catalog", () => {
  it("has unique button ids, each with help text", () => {
    const ids = STAT_BUTTONS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of STAT_BUTTONS) expect(b.help.length).toBeGreaterThan(10);
  });

  it("only references real buttons in presets", () => {
    for (const l of PRESET_LAYOUTS) for (const id of l.buttons) expect(resolveButton(id, [])).not.toBeNull();
  });

  it("gives terminal stats a point effect", () => {
    const effect = (id: string) => resolveButton(id, [])!.effect;
    expect(effect("attack_kill")).toBe("point_us");
    expect(effect("serve_ace")).toBe("point_us");
    expect(effect("block_solo")).toBe("point_us");
    expect(effect("opp_error")).toBe("point_us");
    expect(effect("serve_error")).toBe("point_them");
    expect(effect("our_error")).toBe("point_them");
    expect(effect("pass")).toBe("neutral");
  });

  it("resolves custom stats", () => {
    const stat = { id: "x", name: "Free ball", effect: "neutral" as const, help: "" };
    const b = resolveButton(customButtonId(stat), [stat]);
    expect(b?.label).toBe("Free ball");
    expect(b?.action).toBe("custom");
    expect(resolveButton(customButtonId(stat), [])).toBeNull();
  });

  it("falls back to Standard for a missing layout", () => {
    expect(findLayout(defaultSettings(), "gone").id).toBe("preset:standard");
  });

  it("has stable default error-type ids", () => {
    const a = defaultErrorSubtypes();
    expect(a).toHaveLength(17);
    expect(new Set(a.map((s) => s.id)).size).toBe(17);
    expect(a[0].id).toBe("st:serve-net");
    expect(defaultErrorSubtypes()).toEqual(a);
  });
});
