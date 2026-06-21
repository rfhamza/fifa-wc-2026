import { describe, expect, it } from "vitest";
import {
  brierScore,
  calibrationBuckets,
  isCorrect,
  logLoss,
  predictedClass,
  rankedProbabilityScore,
  summarizeMetrics,
  validateProbabilityTriple,
  type ProbTriple,
  type ScoredMatch,
} from "@/lib/backtesting/metrics";

/**
 * Phase 1.18C-1: pure metric functions for 90-minute W/D/L scoring.
 * Class order is fixed and ordinal: [pA (teamA win), pD (draw), pB (teamB win)].
 */
describe("RPS (ordinal, 3-class)", () => {
  it("is 0 for a perfect confident prediction", () => {
    expect(rankedProbabilityScore({ pA: 1, pD: 0, pB: 0 }, "A")).toBe(0);
    expect(rankedProbabilityScore({ pA: 0, pD: 0, pB: 1 }, "B")).toBe(0);
  });

  it("matches a hand-computed value", () => {
    // p=[0.5,0.3,0.2], actual D: c1=0.5, c2=0.8-1=-0.2 -> 0.5*(0.25+0.04)=0.145
    expect(rankedProbabilityScore({ pA: 0.5, pD: 0.3, pB: 0.2 }, "D")).toBeCloseTo(0.145, 12);
  });

  it("respects ordering: predicting the far class is worse than the adjacent class", () => {
    const farWrong = rankedProbabilityScore({ pA: 0, pD: 0, pB: 1 }, "A"); // predict B, actual A
    const nearWrong = rankedProbabilityScore({ pA: 0, pD: 1, pB: 0 }, "A"); // predict D, actual A
    expect(farWrong).toBeCloseTo(1, 12);
    expect(nearWrong).toBeCloseTo(0.5, 12);
    expect(farWrong).toBeGreaterThan(nearWrong);
  });
});

describe("log loss", () => {
  it("matches a hand-computed value", () => {
    expect(logLoss({ pA: 0.5, pD: 0.3, pB: 0.2 }, "A")).toBeCloseTo(-Math.log(0.5), 12);
  });

  it("clamps a zero-probability realised outcome (no -Infinity)", () => {
    const v = logLoss({ pA: 1, pD: 0, pB: 0 }, "B");
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeCloseTo(-Math.log(1e-15), 9);
  });
});

describe("Brier score", () => {
  it("matches a hand-computed value", () => {
    // p=[0.5,0.3,0.2], actual A: (0.5-1)^2+0.3^2+0.2^2 = 0.25+0.09+0.04 = 0.38
    expect(brierScore({ pA: 0.5, pD: 0.3, pB: 0.2 }, "A")).toBeCloseTo(0.38, 12);
  });
});

describe("validateProbabilityTriple", () => {
  it("accepts a well-formed triple", () => {
    expect(() => validateProbabilityTriple({ pA: 0.2, pD: 0.5, pB: 0.3 })).not.toThrow();
  });
  it("rejects triples that do not sum to 1", () => {
    expect(() => validateProbabilityTriple({ pA: 0.2, pD: 0.2, pB: 0.2 })).toThrow(/sum to 1/);
  });
  it("rejects out-of-range probabilities", () => {
    expect(() => validateProbabilityTriple({ pA: -0.1, pD: 0.6, pB: 0.5 })).toThrow(/out of/);
    expect(() => validateProbabilityTriple({ pA: 1.2, pD: 0, pB: -0.2 })).toThrow(/out of/);
  });
});

describe("predictedClass / accuracy (deterministic A,D,B tie-break)", () => {
  it("breaks ties in fixed order A, then D, then B", () => {
    expect(predictedClass({ pA: 0.4, pD: 0.4, pB: 0.2 })).toBe("A");
    expect(predictedClass({ pA: 0.2, pD: 0.4, pB: 0.4 })).toBe("D");
    expect(predictedClass({ pA: 0.2, pD: 0.2, pB: 0.6 })).toBe("B");
  });
  it("isCorrect compares the argmax to the actual", () => {
    expect(isCorrect({ pA: 0.6, pD: 0.3, pB: 0.1 }, "A")).toBe(true);
    expect(isCorrect({ pA: 0.6, pD: 0.3, pB: 0.1 }, "B")).toBe(false);
  });
});

describe("summarizeMetrics", () => {
  it("averages over matches and computes accuracy", () => {
    const matches: ScoredMatch[] = [
      { p: { pA: 1, pD: 0, pB: 0 }, actual: "A" }, // perfect
      { p: { pA: 0, pD: 0, pB: 1 }, actual: "A" }, // worst
    ];
    const s = summarizeMetrics(matches);
    expect(s.n).toBe(2);
    expect(s.accuracy).toBe(0.5);
    expect(s.rps).toBeCloseTo(0.5, 12); // (0 + 1) / 2
  });
  it("returns zeros for an empty set", () => {
    expect(summarizeMetrics([])).toEqual({ n: 0, rps: 0, logLoss: 0, brier: 0, accuracy: 0 });
  });
});

describe("calibrationBuckets", () => {
  it("pools 3 one-vs-rest points per match across 10 bins", () => {
    const matches: ScoredMatch[] = [
      { p: { pA: 0.7, pD: 0.2, pB: 0.1 }, actual: "A" },
      { p: { pA: 0.1, pD: 0.1, pB: 0.8 }, actual: "B" },
    ];
    const buckets = calibrationBuckets(matches, 10);
    expect(buckets).toHaveLength(10);
    const total = buckets.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(6); // 3 per match * 2 matches
  });

  it("places probabilities in the correct bin and reports empirical rate", () => {
    const m: ProbTriple = { pA: 0.75, pD: 0.15, pB: 0.1 };
    const buckets = calibrationBuckets([{ p: m, actual: "A" }], 10);
    const topBin = buckets[7]!; // [0.7, 0.8) holds pA=0.75
    expect(topBin.count).toBe(1);
    expect(topBin.meanPredicted).toBeCloseTo(0.75, 12);
    expect(topBin.empiricalRate).toBe(1); // actual was A
  });
});
