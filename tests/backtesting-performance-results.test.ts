import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANDIDATE_WEIGHTS,
  computeInTournamentPerformanceResults,
  type PerfSubsetView,
} from "@/lib/backtesting/performance-results";
import { primaryDiagnosticPacks } from "@/lib/backtesting/historical-cohorts";

/**
 * Stage 1C - REAL historical sweep results for the candidate in-tournament performance
 * driver. This Vitest file is the SOURCE OF TRUTH; the governance report
 * (docs/BACKTESTING_IN_TOURNAMENT_PERFORMANCE_RESULTS.md) is a readable copy of these pins.
 *
 * The metrics are computed once, in-process, from the committed 1998-2022 packs (no network,
 * no 2026 data). The activation verdict is applied on RAW doubles by the frozen Stage 1A rule;
 * values are rounded to 6 dp ONLY for pinning/display. Outcome: NO candidate weight passes the
 * gates on the primary cohort -> selectedWeight 0 (a pre-registered, acceptable negative
 * result). Stretch (1998/2002/2006) is reported for context only and never feeds the decision.
 */
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;
const results = computeInTournamentPerformanceResults();

const dv = (sv: PerfSubsetView, w: number) => sv.deltaVsZero.find((d) => d.weight === w)!;

describe("Stage 1C - cohorts + governance", () => {
  it("uses exactly the four primary tournaments and three supplementary tournaments", () => {
    expect(results.cohorts.primaryYears).toEqual([2010, 2014, 2018, 2022]);
    expect(results.cohorts.supplementaryYears).toEqual([1998, 2002, 2006]);
  });

  it("carries the candidate-driver governance flags exactly (weight stays 0)", () => {
    expect(results.governance).toEqual({
      candidateDriverDiagnostic: true,
      supplementaryOnly: true,
      headlineEligible: false,
      calibrationEligible: false,
      tuningEligible: false,
      productionEligible: false,
    });
  });

  it("exposes the frozen weight grid and the 5 activation-eligible candidate weights", () => {
    expect(results.primary.weights).toEqual([0, 5, 10, 15, 20, 25]);
    expect(CANDIDATE_WEIGHTS).toEqual([5, 10, 15, 20, 25]);
    expect(results.activation.candidateWeights).toEqual([5, 10, 15, 20, 25]);
  });
});

describe("Stage 1C - PRIMARY decision subset (group MD2+MD3), pinned real metrics", () => {
  const P = results.primary.primaryDecision;

  it("pins macro RPS + log-loss per weight (128 matches)", () => {
    for (const b of P.byWeight) expect(b.n).toBe(128);
    expect(P.byWeight.map((b) => round6(b.rps))).toEqual([
      0.206394, 0.206417, 0.206444, 0.206467, 0.206493, 0.206523,
    ]);
    expect(P.byWeight.map((b) => round6(b.logLoss))).toEqual([
      0.981116, 0.981204, 0.981308, 0.981398, 0.981497, 0.981609,
    ]);
  });

  it("pins the RPS / log-loss delta vs weight 0 (the driver DEGRADES the primary subset)", () => {
    expect(round6(dv(P, 0).rps)).toBe(0);
    expect([5, 10, 15, 20, 25].map((w) => round6(dv(P, w).rps))).toEqual([
      0.000023, 0.00005, 0.000073, 0.000099, 0.000129,
    ]);
    expect([5, 10, 15, 20, 25].map((w) => round6(dv(P, w).logLoss))).toEqual([
      0.000089, 0.000192, 0.000282, 0.000382, 0.000493,
    ]);
  });

  it("pins per-tournament RPS (only 2014 improves with weight)", () => {
    const byYear = Object.fromEntries(
      results.primary.perTournament.map((t) => [t.tournamentYear, t.byWeight.map((b) => round6(b.rps))]),
    );
    expect(byYear[2010]).toEqual([0.192804, 0.192883, 0.192968, 0.193038, 0.193127, 0.193216]);
    expect(byYear[2014]).toEqual([0.180841, 0.180749, 0.180659, 0.180566, 0.180471, 0.180386]);
    expect(byYear[2018]).toEqual([0.180298, 0.18032, 0.180356, 0.180388, 0.180418, 0.18045]);
    expect(byYear[2022]).toEqual([0.271634, 0.271715, 0.271793, 0.271876, 0.271955, 0.272041]);
  });

  it("pins fold consistency (G3 evidence): only 1 of 4 tournaments improves at every weight", () => {
    expect(results.primary.foldConsistencyByWeight).toEqual([
      { weight: 0, improvedFolds: 0, totalFolds: 4 },
      { weight: 5, improvedFolds: 1, totalFolds: 4 },
      { weight: 10, improvedFolds: 1, totalFolds: 4 },
      { weight: 15, improvedFolds: 1, totalFolds: 4 },
      { weight: 20, improvedFolds: 1, totalFolds: 4 },
      { weight: 25, improvedFolds: 1, totalFolds: 4 },
    ]);
  });

  it("pins the worst single-fold degrade (G5 evidence): all far below 0.005", () => {
    expect(results.primary.worstFoldDegradeByWeight.map((w) => round6(w.worstDelta))).toEqual([
      0, 0.000081, 0.000164, 0.000243, 0.000324, 0.000413,
    ]);
  });
});

describe("Stage 1C - knockout guardrail subset (G4), pinned real metrics", () => {
  const K = results.primary.knockoutGuardrail;

  it("pins knockout RPS delta vs weight 0 (improves, but guardrail-only: never approves)", () => {
    for (const b of K.byWeight) expect(b.n).toBe(64);
    expect([5, 10, 15, 20, 25].map((w) => round6(dv(K, w).rps))).toEqual([
      -0.000094, -0.000196, -0.00029, -0.000379, -0.00047,
    ]);
  });
});

describe("Stage 1C - ACTIVATION verdict (frozen G1-G5 on the primary cohort)", () => {
  it("fails G1 (no primary RPS improvement) and G3 (fold consistency) at every candidate weight", () => {
    for (const w of CANDIDATE_WEIGHTS) {
      const g = results.activation.gatesByWeight[w]!;
      expect(g).toEqual({ g1: false, g2: true, g3: false, g4: true, g5: true, passed: false });
    }
  });

  it("records the pre-registered NEGATIVE result: no weight passes -> keep weight 0", () => {
    expect(results.activation.passingWeights).toEqual([]);
    expect(results.activation.selectedWeight).toBe(0);
    expect(results.activation.activationDecision).toBe("keep-weight-0");
    expect(results.activation.stage2ShadowMayBeConsidered).toBe(false);
  });
});

describe("Stage 1C - SUPPLEMENTARY cohort (1998/2002/2006) is context-only and non-gating", () => {
  const S = results.supplementary;

  it("is clearly labelled context-only", () => {
    expect(S.contextOnly).toBe(true);
    expect(S.weights).toEqual([0, 5, 10, 15, 20, 25]);
  });

  it("pins the stretch group MD2+MD3 RPS delta vs weight 0 (separate from the decision)", () => {
    for (const b of S.primaryDecision.byWeight) expect(b.n).toBe(96);
    expect(S.primaryDecision.byWeight.map((b) => round6(b.rps))).toEqual([
      0.19137, 0.191282, 0.191192, 0.191104, 0.191015, 0.190927,
    ]);
    expect([5, 10, 15, 20, 25].map((w) => round6(dv(S.primaryDecision, w).rps))).toEqual([
      -0.000088, -0.000179, -0.000266, -0.000356, -0.000443,
    ]);
  });

  it("pins the stretch per-tournament RPS at weight 0 (audit anchor)", () => {
    const byYear = Object.fromEntries(
      S.perTournament.map((t) => [t.tournamentYear, round6(t.byWeight.find((b) => b.weight === 0)!.rps)]),
    );
    expect(byYear).toEqual({ 1998: 0.180243, 2002: 0.217488, 2006: 0.17638 });
  });
});

describe("Stage 1C - stretch NEVER affects the activation decision", () => {
  it("yields an identical verdict with the stretch cohort removed", () => {
    const withoutStretch = computeInTournamentPerformanceResults({ stretchPacks: [] });
    expect(withoutStretch.activation).toEqual(results.activation);
  });

  it("yields an identical verdict when the stretch cohort is swapped for the primary packs", () => {
    const swapped = computeInTournamentPerformanceResults({ stretchPacks: primaryDiagnosticPacks });
    expect(swapped.activation).toEqual(results.activation);
  });

  it("is order-independent of the primary pack order (macro-average + gate counts)", () => {
    const shuffled = [
      primaryDiagnosticPacks[2]!,
      primaryDiagnosticPacks[0]!,
      primaryDiagnosticPacks[3]!,
      primaryDiagnosticPacks[1]!,
    ];
    const r = computeInTournamentPerformanceResults({ primaryPacks: shuffled });
    expect(r.activation.selectedWeight).toBe(0);
    expect(r.activation.gatesByWeight).toEqual(results.activation.gatesByWeight);
    expect(r.primary.perTournament.map((t) => t.tournamentYear).sort((a, b) => a - b)).toEqual([
      2010, 2014, 2018, 2022,
    ]);
  });
});

describe("Stage 1C - neutral naming + governance-flag survival + offline purity", () => {
  it("emits no selection/optimisation language but keeps the governance flags", () => {
    const blob = JSON.stringify(results);
    const FORBIDDEN_CLAIM =
      /bestWeight|recommendedWeight|optimalWeight|tunedWeight|calibratedWeight|productionWeight|bestModel|optimalModel|bestVariant|\brecommended?\b|\boptimal\b|optimi[sz]e|temperature/i;
    expect(FORBIDDEN_CLAIM.test(blob)).toBe(false);
    expect(blob).toContain("calibrationEligible");
    expect(blob).toContain("tuningEligible");
    expect(blob).toContain("productionEligible");
  });

  it("the aggregator source is offline and 2026-free", () => {
    const src = readFileSync(join(process.cwd(), "lib/backtesting/performance-results.ts"), "utf8");
    for (const forbidden of ["/api/live-state", "fetch(", "@vercel/blob", "process.env", "data/model-inputs", "2026", "@/app/"]) {
      expect(src).not.toContain(forbidden);
    }
  });
});

describe("Stage 1C - governance report mirrors the pinned verdict + carries the mandated caveats", () => {
  const report = readFileSync(
    join(process.cwd(), "docs/BACKTESTING_IN_TOURNAMENT_PERFORMANCE_RESULTS.md"),
    "utf8",
  );

  it("states the frozen verdict that matches this test", () => {
    expect(report).toContain("selectedWeight: 0");
    expect(report).toContain("activationDecision: keep-weight-0");
  });

  it("carries the mandated caveats and NO-GO framing", () => {
    expect(report).toContain("four-driver");
    expect(report).toContain("ten-driver");
    expect(report.toLowerCase()).toContain("90-minute");
    expect(report).toContain("NO-GO");
    expect(report).toContain("do not affect the activation decision");
    expect(report.toLowerCase()).toContain("no 2026 data");
    expect(report).toContain("tests/backtesting-performance-results.test.ts");
  });
});
