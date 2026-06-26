import { describe, expect, it } from "vitest";
import { teams } from "@/lib/data";
import { hasFlagOverride } from "@/components/flag-glyph";

/**
 * Phase 1.28Q-C - flag override guard. England & Scotland have no ISO country flag
 * and their subdivision flag emoji use TAG chars that `scan:unicode` rejects, so they
 * render via an inline-SVG override keyed on countryCode. This test pins the invariant:
 * EVERY team whose dataset flag is a plain text code (not an emoji) MUST be covered by
 * an override - so a newly-degraded team can't slip through as raw "XYZ" text.
 */

/** A flag value that is ASCII letters (e.g. "ENG") rather than emoji is "degraded". */
const isTextCodeFlag = (flag: string) => /^[A-Za-z]{2,4}$/.test(flag);

describe("FlagGlyph overrides", () => {
  it("recognises England and Scotland, and not regular emoji teams", () => {
    expect(hasFlagOverride("ENG")).toBe(true);
    expect(hasFlagOverride("SCO")).toBe(true);
    expect(hasFlagOverride("eng")).toBe(true); // case-insensitive
    expect(hasFlagOverride("BRA")).toBe(false);
    expect(hasFlagOverride("FRA")).toBe(false);
  });

  it("covers every team whose dataset flag degrades to a text code", () => {
    const degraded = teams.filter((t) => isTextCodeFlag(t.flag));
    // England + Scotland are the known degraded cases; assert the set is non-empty
    // so this guard is meaningful, and that all of them are handled by an override.
    expect(degraded.length).toBeGreaterThanOrEqual(2);
    const codes = degraded.map((t) => t.countryCode).sort();
    expect(codes).toContain("ENG");
    expect(codes).toContain("SCO");
    for (const t of degraded) {
      expect(hasFlagOverride(t.countryCode), `${t.name} (${t.countryCode}) has a text flag but no override`).toBe(true);
    }
  });

  it("every override corresponds to a real team (no dead overrides)", () => {
    for (const code of ["ENG", "SCO"]) {
      expect(teams.some((t) => t.countryCode.toUpperCase() === code)).toBe(true);
    }
  });
});
