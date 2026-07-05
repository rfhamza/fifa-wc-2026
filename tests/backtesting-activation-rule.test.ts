import { describe, expect, it } from "vitest";
import {
  G1_MIN_RPS_IMPROVEMENT,
  G2_MAX_LOGLOSS_DEGRADE,
  G3_MIN_IMPROVING_FOLDS,
  G4_MAX_KNOCKOUT_DEGRADE,
  G5_MAX_SINGLE_FOLD_DEGRADE,
  SELECTION_TOLERANCE,
  evaluateActivationRule,
  type ActivationWeightInput,
} from "@/lib/backtesting/activation-rule";

// A weight that clears all five frozen gates. Individual tests break one field at a time.
function passing(weight: number, overrides: Partial<ActivationWeightInput> = {}): ActivationWeightInput {
  return {
    weight,
    primaryRpsDeltaVsZero: -0.003, // G1: <= -0.002
    primaryLogLossDeltaVsZero: 0.0005, // G2: <= +0.001
    knockoutRpsDeltaVsZero: 0.001, // G4: <= +0.002
    perTournamentPrimaryRpsDeltaVsZero: [-0.004, -0.003, -0.002, 0.001], // G3: 3 improve; G5: worst 0.001
    ...overrides,
  };
}

describe("activation-rule: frozen thresholds", () => {
  it("pins the pre-registered gate constants", () => {
    expect(G1_MIN_RPS_IMPROVEMENT).toBe(0.002);
    expect(G2_MAX_LOGLOSS_DEGRADE).toBe(0.001);
    expect(G3_MIN_IMPROVING_FOLDS).toBe(3);
    expect(G4_MAX_KNOCKOUT_DEGRADE).toBe(0.002);
    expect(G5_MAX_SINGLE_FOLD_DEGRADE).toBe(0.005);
    expect(SELECTION_TOLERANCE).toBe(0.0005);
  });
});

describe("activation-rule: selection", () => {
  it("keeps weight 0 when no candidate passes", () => {
    const d = evaluateActivationRule({
      weights: [
        passing(5, { primaryRpsDeltaVsZero: 0 }), // G1 fails
        passing(10, { knockoutRpsDeltaVsZero: 0.01 }), // G4 fails
      ],
    });
    expect(d.selectedWeight).toBe(0);
    expect(d.passingWeights).toEqual([]);
    expect(d.gatesByWeight[5]!.passed).toBe(false);
    expect(d.gatesByWeight[10]!.passed).toBe(false);
  });

  it("selects the sole passing weight", () => {
    const d = evaluateActivationRule({
      weights: [passing(5, { primaryRpsDeltaVsZero: 0 }), passing(15)],
    });
    expect(d.selectedWeight).toBe(15);
    expect(d.passingWeights).toEqual([15]);
  });

  it("prefers the smallest passing weight within tolerance of the strongest G1", () => {
    // w=10 has the strongest G1 (-0.0031) but w=5 is within 0.0005 of it -> pick w=5.
    const d = evaluateActivationRule({
      weights: [
        passing(5, { primaryRpsDeltaVsZero: -0.003 }),
        passing(10, { primaryRpsDeltaVsZero: -0.0031 }),
      ],
    });
    expect(d.passingWeights).toEqual([5, 10]);
    expect(d.selectedWeight).toBe(5);
  });

  it("takes the stronger larger weight when the smaller one is outside tolerance", () => {
    // w=5 (-0.003) is 0.007 away from w=10 (-0.010) -> only w=10 is eligible.
    const d = evaluateActivationRule({
      weights: [
        passing(5, { primaryRpsDeltaVsZero: -0.003 }),
        passing(10, { primaryRpsDeltaVsZero: -0.01 }),
      ],
    });
    expect(d.passingWeights).toEqual([5, 10]);
    expect(d.selectedWeight).toBe(10);
  });

  it("breaks exact G1 ties toward the smaller weight", () => {
    const d = evaluateActivationRule({
      weights: [passing(20), passing(10), passing(15)],
    });
    expect(d.passingWeights).toEqual([10, 15, 20]);
    expect(d.selectedWeight).toBe(10);
  });
});

describe("activation-rule: each gate blocks on its own", () => {
  const cases: Array<[string, Partial<ActivationWeightInput>, keyof ReturnType<typeof gatesOf>]> = [
    ["G1 (insufficient RPS improvement)", { primaryRpsDeltaVsZero: -0.001 }, "g1"],
    ["G2 (log-loss degrades too far)", { primaryLogLossDeltaVsZero: 0.002 }, "g2"],
    ["G3 (too few improving folds)", { perTournamentPrimaryRpsDeltaVsZero: [-0.004, -0.003, 0.001, 0.001] }, "g3"],
    ["G4 (knockout degrades too far)", { knockoutRpsDeltaVsZero: 0.003 }, "g4"],
    ["G5 (a single fold degrades too far)", { perTournamentPrimaryRpsDeltaVsZero: [-0.004, -0.003, -0.002, 0.006] }, "g5"],
  ];

  function gatesOf(weight: number, overrides: Partial<ActivationWeightInput>) {
    return evaluateActivationRule({ weights: [passing(weight, overrides)] }).gatesByWeight[weight]!;
  }

  for (const [label, override, gate] of cases) {
    it(`blocks on ${label}`, () => {
      const d = evaluateActivationRule({ weights: [passing(10, override)] });
      const g = d.gatesByWeight[10]!;
      expect(g[gate]).toBe(false);
      expect(g.passed).toBe(false);
      expect(d.selectedWeight).toBe(0);
      expect(d.passingWeights).toEqual([]);
    });
  }

  it("passes all five gates for the unmodified template", () => {
    const g = evaluateActivationRule({ weights: [passing(10)] }).gatesByWeight[10]!;
    expect(g).toEqual({ g1: true, g2: true, g3: true, g4: true, g5: true, passed: true });
  });
});

describe("activation-rule: neutral output naming", () => {
  it("uses no selection/optimisation language and only neutral keys", () => {
    const d = evaluateActivationRule({ weights: [passing(10), passing(15)] });
    const blob = JSON.stringify(d);
    const FORBIDDEN_CLAIM =
      /bestWeight|recommendedWeight|optimalWeight|tunedWeight|calibratedWeight|productionWeight|bestModel|optimalModel|bestVariant|\brecommended?\b|\boptimal\b|optimi[sz]e|temperature/i;
    expect(FORBIDDEN_CLAIM.test(blob)).toBe(false);
    expect(Object.keys(d).sort()).toEqual(["gatesByWeight", "passingWeights", "selectedWeight"]);
  });
});
