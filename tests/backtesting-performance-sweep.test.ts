import { describe, expect, it } from "vitest";
import {
  PERFORMANCE_SWEEP_GOVERNANCE_FLAGS,
  summarizePerformanceSweep,
  type PerformanceSweepResult,
} from "@/lib/backtesting/performance-sweep";
import { PERF_SWEEP_WEIGHTS } from "@/lib/backtesting/in-tournament-performance";
import { summarizeMetrics } from "@/lib/backtesting/metrics";
import type { ProbTriple, Outcome } from "@/lib/backtesting/metrics";
import type { WalkForwardMatchRow, WalkForwardResult } from "@/lib/backtesting/walk-forward";

const WEIGHTS = [...PERF_SWEEP_WEIGHTS];

function tri(pA: number, pD: number): ProbTriple {
  return { pA, pD, pB: 1 - pA - pD };
}

/** Weight-dependent triple so deltas-vs-zero are non-trivial but weight-0 is the anchor. */
function tripleFor(weight: number, actual: Outcome): ProbTriple {
  // Nudge probability toward the actual outcome as weight rises (better-calibrated).
  const shift = weight * 0.002;
  if (actual === "A") return tri(0.4 + shift, 0.3);
  if (actual === "D") return tri(0.35, 0.3 + shift);
  return tri(0.4 - shift, 0.3);
}

function mkRow(
  matchId: string,
  stage: WalkForwardMatchRow["stage"],
  matchday: number | null,
  actual: Outcome,
): WalkForwardMatchRow {
  const n = stage === "group" ? (matchday ?? 1) - 1 : 3;
  return {
    tournamentYear: 2099,
    matchId,
    date: "2099-01-01",
    stage,
    matchday,
    teamA: "a",
    teamB: "b",
    actual,
    baseline: tripleFor(0, actual),
    byWeight: WEIGHTS.map((w) => ({ weight: w, triple: tripleFor(w, actual) })),
    signalA: 0,
    signalB: 0,
    nA: n,
    nB: n,
  };
}

function pack(year: number, rows: WalkForwardMatchRow[]): WalkForwardResult {
  return { tournamentYear: year, rows: rows.map((r) => ({ ...r, tournamentYear: year })) };
}

const ROWS: WalkForwardMatchRow[] = [
  mkRow("md1", "group", 1, "A"),
  mkRow("md2", "group", 2, "A"),
  mkRow("md3", "group", 3, "D"),
  mkRow("ko", "round-of-16", null, "B"),
];

describe("performance-sweep: governance + shape", () => {
  const result: PerformanceSweepResult = summarizePerformanceSweep([pack(2099, ROWS)]);

  it("carries the exact candidate-driver governance flags", () => {
    expect(result.governance).toEqual({
      candidateDriverDiagnostic: true,
      supplementaryOnly: true,
      headlineEligible: false,
      calibrationEligible: false,
      tuningEligible: false,
      productionEligible: false,
    });
    expect(PERFORMANCE_SWEEP_GOVERNANCE_FLAGS).toEqual(result.governance);
  });

  it("exposes the frozen weight grid unchanged", () => {
    expect(result.weights).toEqual([0, 5, 10, 15, 20, 25]);
    expect([...PERF_SWEEP_WEIGHTS]).toEqual([0, 5, 10, 15, 20, 25]);
  });

  it("partitions the pre-registered subsets correctly", () => {
    const n = (subset: string) => result.subsets[subset]!.byWeight.find((b) => b.weight === 0)!.n;
    expect(n("groupMd2Md3")).toBe(2); // md2 + md3 only
    expect(n("allPostMd1")).toBe(3); // md2 + md3 + knockout (nA >= 1)
    expect(n("knockoutOnly")).toBe(1);
    expect(n("groupAll48")).toBe(3);
    expect(n("all64")).toBe(4);
  });

  it("emits per-weight metrics + deltaVsZero, with weight-0 delta exactly zero", () => {
    const primary = result.subsets.groupMd2Md3!;
    expect(primary.byWeight.map((b) => b.weight)).toEqual(WEIGHTS);
    expect(primary.deltaVsZero.map((d) => d.weight)).toEqual(WEIGHTS);
    const zeroDelta = primary.deltaVsZero.find((d) => d.weight === 0)!;
    expect(zeroDelta.rps).toBe(0);
    expect(zeroDelta.logLoss).toBe(0);
    expect(zeroDelta.brier).toBe(0);
    // A non-zero weight moves RPS (the synthetic triples improve with weight).
    const w25 = primary.deltaVsZero.find((d) => d.weight === 25)!;
    expect(w25.rps).toBeLessThan(0);
    expect(primary.calibrationByWeight.find((c) => c.weight === 0)!.calibration).toHaveLength(10);
  });

  it("macro-averages equal weight per tournament", () => {
    const twoPacks = [pack(2010, ROWS), pack(2014, ROWS)];
    const r = summarizePerformanceSweep(twoPacks);
    const primary = r.subsets.groupMd2Md3!;
    // Both packs identical -> macro rps equals a single pack's rps.
    const single = summarizeMetrics(
      ROWS.filter((x) => x.stage === "group" && (x.matchday ?? 0) >= 2).map((x) => ({
        p: x.byWeight.find((w) => w.weight === 10)!.triple,
        actual: x.actual,
      })),
    );
    expect(primary.byWeight.find((b) => b.weight === 10)!.rps).toBeCloseTo(single.rps, 12);
    expect(primary.byWeight.find((b) => b.weight === 10)!.n).toBe(4); // 2 matches x 2 packs
  });

  it("contains no selection/optimisation language (but keeps the governance flags)", () => {
    const blob = JSON.stringify(result);
    const FORBIDDEN_CLAIM =
      /bestWeight|recommendedWeight|optimalWeight|tunedWeight|calibratedWeight|productionWeight|bestModel|optimalModel|bestVariant|\brecommended?\b|\boptimal\b|optimi[sz]e|temperature/i;
    expect(FORBIDDEN_CLAIM.test(blob)).toBe(false);
    // The required governance flags ARE present (the scan must not ban them).
    expect(blob).toContain("calibrationEligible");
    expect(blob).toContain("tuningEligible");
    expect(blob).toContain("productionEligible");
  });
});
