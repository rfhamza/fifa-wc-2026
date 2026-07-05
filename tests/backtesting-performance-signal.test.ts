import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PERF_ALPHA,
  PERF_CONTRIBUTION_CAP,
  PERF_K,
  PERF_MARGIN_CAP,
  PERF_SWEEP_WEIGHTS,
  clampPerformanceMargin,
  expectedPointsFromTriple,
  inTournamentContribution,
  perMatchSurprise,
  shrunkTournamentSignal,
  type OwnMatchOutcome,
} from "@/lib/backtesting/in-tournament-performance";

describe("in-tournament-performance: frozen constants", () => {
  it("matches the pre-registered constants exactly", () => {
    expect(PERF_K).toBe(2);
    expect(PERF_MARGIN_CAP).toBe(2);
    expect(PERF_CONTRIBUTION_CAP).toBe(25);
    expect(PERF_ALPHA).toBe(0.5);
    expect([...PERF_SWEEP_WEIGHTS]).toEqual([0, 5, 10, 15, 20, 25]);
  });
});

describe("expectedPointsFromTriple", () => {
  it("computes 3*pWin + pDraw", () => {
    expect(expectedPointsFromTriple(0.5, 0.3)).toBeCloseTo(1.8, 12);
    expect(expectedPointsFromTriple(1, 0)).toBeCloseTo(3, 12);
    expect(expectedPointsFromTriple(0, 1)).toBeCloseTo(1, 12);
  });
});

describe("clampPerformanceMargin", () => {
  it("caps at +/- PERF_MARGIN_CAP", () => {
    expect(clampPerformanceMargin(5)).toBe(2);
    expect(clampPerformanceMargin(-5)).toBe(-2);
    expect(clampPerformanceMargin(1)).toBe(1);
    expect(clampPerformanceMargin(-1.5)).toBe(-1.5);
  });
});

describe("perMatchSurprise", () => {
  it("blends points and margin residuals with alpha = 0.5", () => {
    const s = perMatchSurprise(
      { actualPoints: 3, actualMargin: 2 },
      { expectedPoints: 1.1, expectedMargin: 0.3 },
    );
    // 0.5*((3-1.1)/3) + 0.5*((2-0.3)/4) = 0.5*0.633333 + 0.5*0.425
    expect(s).toBeCloseTo(0.5 * (1.9 / 3) + 0.5 * (1.7 / 4), 12);
  });

  it("stays within [-1, +1] at the extremes (no clamp needed)", () => {
    const maxUp = perMatchSurprise(
      { actualPoints: 3, actualMargin: 10 },
      { expectedPoints: 0, expectedMargin: -10 },
    );
    const maxDown = perMatchSurprise(
      { actualPoints: 0, actualMargin: -10 },
      { expectedPoints: 3, expectedMargin: 10 },
    );
    expect(maxUp).toBeCloseTo(1, 12);
    expect(maxDown).toBeCloseTo(-1, 12);
  });

  it("scores a shootout / golden-goal input at 90' (draw = 1 point, margin 0) — exact", () => {
    // Historical packs store the 90' split: a match decided on penalties (or a 1998
    // golden goal) is a 90' draw with equal 90' goals. Points 1, margin 0.
    const drawExpectation = { expectedPoints: 1.5, expectedMargin: 0.4 };
    const pensAsDraw: OwnMatchOutcome = { actualPoints: 1, actualMargin: 0 };
    const s = perMatchSurprise(pensAsDraw, drawExpectation);
    expect(s).toBeCloseTo(0.5 * ((1 - 1.5) / 3) + 0.5 * ((0 - 0.4) / 4), 12);
  });
});

describe("shrunkTournamentSignal", () => {
  it("is exactly 0 for an empty history (matchday-1 zero state)", () => {
    expect(shrunkTournamentSignal([])).toBe(0);
  });

  it("shrinks by (n + k) with k = 2", () => {
    expect(shrunkTournamentSignal([0.5])).toBeCloseTo(0.5 / 3, 12); // n=1
    expect(shrunkTournamentSignal([0.5, 0.5])).toBeCloseTo(1 / 4, 12); // n=2
    expect(shrunkTournamentSignal([0.5, 0.5, 0.5])).toBeCloseTo(1.5 / 5, 12); // n=3
    expect(shrunkTournamentSignal([0.5, 0.5, 0.5, 0.5, 0.5, 0.5])).toBeCloseTo(3 / 8, 12); // n=6
  });

  it("no single match moves the signal by more than 1/3", () => {
    // Adding one surprise s in [-1,1] to a history of length n changes S by <= 1/3,
    // with the maximum at n = 0 -> 1.
    const worst = shrunkTournamentSignal([1]) - shrunkTournamentSignal([]);
    expect(worst).toBeCloseTo(1 / 3, 12);
    for (let n = 0; n <= 6; n++) {
      const base = Array.from({ length: n }, () => 0.3);
      const before = shrunkTournamentSignal(base);
      const after = shrunkTournamentSignal([...base, 1]);
      expect(Math.abs(after - before)).toBeLessThanOrEqual(1 / 3 + 1e-12);
    }
  });
});

describe("inTournamentContribution", () => {
  it("is exactly 0 at weight 0 (the parity anchor)", () => {
    expect(inTournamentContribution(0.4, -0.4, 0)).toBe(0);
    expect(inTournamentContribution(0.9, -0.9, 0)).toBe(0);
  });

  it("caps the pairwise contribution at +/- 25", () => {
    expect(inTournamentContribution(1, -1, 25)).toBe(25); // 25*2 -> clamped
    expect(inTournamentContribution(-1, 1, 25)).toBe(-25);
    expect(inTournamentContribution(0.1, -0.1, 10)).toBeCloseTo(2, 12); // 10*0.2
  });

  it("moves any future contribution by at most weight/3 per single new match", () => {
    // One match updates one team's S by <= 1/3, so the pairwise contribution moves by
    // <= weight/3. At weight 25 that is <= 8.334 Elo-equivalent points.
    const w = 25;
    const before = inTournamentContribution(0, 0, w);
    const afterOneMatch = inTournamentContribution(1 / 3, 0, w); // teamA gains max single-match S
    expect(Math.abs(afterOneMatch - before)).toBeLessThanOrEqual((w / 3) + 1e-9);
  });
});

describe("in-tournament-performance: no invented xG / no forbidden inputs", () => {
  it("the source uses no expected-goals (xG) data", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/backtesting/in-tournament-performance.ts"),
      "utf8",
    );
    expect(/\bxg\b/i.test(src)).toBe(false);
  });
});
