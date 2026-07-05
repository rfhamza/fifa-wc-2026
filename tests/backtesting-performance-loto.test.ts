import { describe, expect, it } from "vitest";
import {
  PERFORMANCE_LOTO_GOVERNANCE_FLAGS,
  computePerformanceLoto,
  type PerformanceLotoResult,
} from "@/lib/backtesting/performance-loto";
import { PERF_SWEEP_WEIGHTS } from "@/lib/backtesting/in-tournament-performance";
import type { ProbTriple, Outcome } from "@/lib/backtesting/metrics";
import type { WalkForwardMatchRow, WalkForwardResult } from "@/lib/backtesting/walk-forward";

const WEIGHTS = [...PERF_SWEEP_WEIGHTS];

function tri(pA: number, pD: number): ProbTriple {
  return { pA, pD, pB: 1 - pA - pD };
}

/**
 * Synthetic per-weight triple: at weight 0 it is identical regardless of `improves`
 * (the parity anchor), and as weight rises it moves TOWARD the actual outcome when
 * `improves` is true (lower RPS) and AWAY when false (higher RPS). This lets us drive
 * a deterministic, per-tournament fold-consistency count without any real numbers.
 */
function tripleFor(weight: number, actual: Outcome, improves: boolean): ProbTriple {
  const shift = (improves ? 1 : -1) * weight * 0.002;
  if (actual === "A") return tri(0.4 + shift, 0.3);
  if (actual === "D") return tri(0.35, 0.3 + shift);
  return tri(0.4 - shift, 0.3); // pB = 0.3 + shift -> toward B when improves
}

function mkRow(matchId: string, actual: Outcome, improves: boolean): WalkForwardMatchRow {
  return {
    tournamentYear: 0,
    matchId,
    date: "2099-01-01",
    stage: "group",
    matchday: 2, // group MD2 -> lands in the primary groupMd2Md3 subset
    teamA: "a",
    teamB: "b",
    actual,
    baseline: tripleFor(0, actual, improves),
    byWeight: WEIGHTS.map((w) => ({ weight: w, triple: tripleFor(w, actual, improves) })),
    signalA: 0,
    signalB: 0,
    nA: 1,
    nB: 1,
  };
}

function pack(year: number, improves: boolean): WalkForwardResult {
  const rows = [
    mkRow("m1", "A", improves),
    mkRow("m2", "D", improves),
    mkRow("m3", "B", improves),
  ].map((r) => ({ ...r, tournamentYear: year }));
  return { tournamentYear: year, rows };
}

// Three tournaments improve with weight, one degrades -> a non-trivial G3 count.
const PACKS: WalkForwardResult[] = [
  pack(2010, true),
  pack(2014, true),
  pack(2018, true),
  pack(2022, false),
];

describe("performance-loto: fold shape + consistency (synthetic, nothing fitted)", () => {
  const result: PerformanceLotoResult = computePerformanceLoto(PACKS);

  it("carries the candidate-driver governance flags (all-false except the two markers)", () => {
    expect(result.governance).toEqual({
      candidateDriverDiagnostic: true,
      supplementaryOnly: true,
      headlineEligible: false,
      calibrationEligible: false,
      tuningEligible: false,
      productionEligible: false,
    });
    expect(PERFORMANCE_LOTO_GOVERNANCE_FLAGS).toEqual(result.governance);
  });

  it("defaults to the primary decision subset", () => {
    expect(result.subset).toBe("groupMd2Md3");
  });

  it("produces one leave-one-tournament-out fold per pack, each with the full weight grid", () => {
    expect(result.folds.map((f) => f.heldOutYear).sort((a, b) => a - b)).toEqual([
      2010, 2014, 2018, 2022,
    ]);
    for (const fold of result.folds) {
      expect(fold.referenceYears).toHaveLength(3);
      expect(fold.referenceYears).not.toContain(fold.heldOutYear);
      expect(fold.byWeight.map((b) => b.weight)).toEqual(WEIGHTS);
    }
  });

  it("held-out equals its own metric; delta is the descriptive gap vs the other folds", () => {
    for (const fold of result.folds) {
      for (const bw of fold.byWeight) {
        expect(bw.delta).toBeCloseTo(bw.heldOutRps - bw.referenceMacroRps, 12);
      }
    }
    // At weight 0 every pack is identical (shift = 0), so held-out == reference macro
    // for all folds -> delta exactly 0. Nothing is fitted.
    for (const fold of result.folds) {
      const zero = fold.byWeight.find((b) => b.weight === 0)!;
      expect(zero.delta).toBeCloseTo(0, 12);
    }
  });

  it("counts fold consistency vs weight 0 (the G3 input): 3 of 4 improve at the top weight", () => {
    const atZero = result.foldConsistencyByWeight.find((c) => c.weight === 0)!;
    expect(atZero.improvedFolds).toBe(0); // weight 0 never beats itself
    expect(atZero.totalFolds).toBe(4);

    const atTop = result.foldConsistencyByWeight.find((c) => c.weight === 25)!;
    expect(atTop.improvedFolds).toBe(3); // 2010/2014/2018 improve, 2022 degrades
    expect(atTop.totalFolds).toBe(4);
  });

  it("throws on an unknown subset", () => {
    expect(() => computePerformanceLoto(PACKS, "no-such-subset")).toThrow(/unknown subset/);
  });

  it("emits no selection/optimisation language (but keeps the governance flags)", () => {
    const blob = JSON.stringify(result);
    const FORBIDDEN_CLAIM =
      /bestWeight|recommendedWeight|optimalWeight|tunedWeight|calibratedWeight|productionWeight|bestModel|optimalModel|bestVariant|\brecommended?\b|\boptimal\b|optimi[sz]e|temperature/i;
    expect(FORBIDDEN_CLAIM.test(blob)).toBe(false);
    expect(blob).toContain("calibrationEligible");
    expect(blob).toContain("tuningEligible");
    expect(blob).toContain("productionEligible");
  });
});
