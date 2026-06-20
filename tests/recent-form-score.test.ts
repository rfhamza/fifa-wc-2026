import { describe, expect, it } from "vitest";
import {
  rawFormScoreFromPpm,
  recentFormCandidateScore,
  recentFormCandidateScores,
  recentFormCandidateScoreForTeam,
  NEUTRAL_PPM,
  PPM_SCALE,
  LAST5_WEIGHT,
  LAST10_WEIGHT,
} from "@/lib/recent-form";
import { recentFormById } from "@/data/model-inputs/snapshots/recent-form-2026-06-11";

describe("rawFormScoreFromPpm (Phase 1.16B)", () => {
  it("maps PPM about the fixed neutral 1.5 to a signed -1..+1", () => {
    expect(NEUTRAL_PPM).toBe(1.5);
    expect(PPM_SCALE).toBe(1.5);
    expect(rawFormScoreFromPpm(1.5)).toBe(0); // neutral = draw-equivalent baseline
    expect(rawFormScoreFromPpm(3)).toBe(1); // all wins
    expect(rawFormScoreFromPpm(0)).toBe(-1); // all losses
    expect(rawFormScoreFromPpm(2.25)).toBeCloseTo(0.5, 9);
    expect(rawFormScoreFromPpm(0.75)).toBeCloseTo(-0.5, 9);
  });

  it("clamps out-of-range PPM and handles non-finite", () => {
    expect(rawFormScoreFromPpm(99)).toBe(1);
    expect(rawFormScoreFromPpm(-99)).toBe(-1);
    expect(rawFormScoreFromPpm(Number.NaN)).toBe(0);
  });
});

describe("recentFormCandidateScore (raw, candidate, unwired)", () => {
  const scores = recentFormCandidateScores();

  it("covers all 48 teams, every score bounded in [-1, 1]", () => {
    expect(scores).toHaveLength(48);
    for (const s of scores) {
      for (const v of [s.last5, s.last10, s.composite]) {
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("composite is the named-weight blend of last5/last10", () => {
    const row = recentFormById.get("argentina")!;
    const s = recentFormCandidateScore(row);
    expect(s.composite).toBeCloseTo(s.last5 * LAST5_WEIGHT + s.last10 * LAST10_WEIGHT, 9);
    expect(LAST5_WEIGHT + LAST10_WEIGHT).toBeCloseTo(1, 9);
  });

  it("is deterministic", () => {
    const a = recentFormCandidateScoreForTeam("brazil");
    const b = recentFormCandidateScoreForTeam("brazil");
    expect(a).toEqual(b);
  });

  it("returns undefined for an unknown team", () => {
    expect(recentFormCandidateScoreForTeam("atlantis")).toBeUndefined();
  });
});
