import { describe, expect, it } from "vitest";
import { MODEL_WEIGHTS, SCORELINE_CONFIG } from "@/lib/model/config";
import { outcomeProbabilities, scorelineMatrix } from "@/lib/simulation/poisson";
import type { TeamFeatureSet } from "@/lib/types";
import { WC2010_PACK } from "@/data/historical/snapshots/wc-2010";
import { WC2014_PACK } from "@/data/historical/snapshots/wc-2014";
import { WC2018_PACK } from "@/data/historical/snapshots/wc-2018";
import { WC2022_PACK } from "@/data/historical/snapshots/wc-2022";
import { buildHistoricalFeatures } from "@/lib/backtesting/feature-adapter";
import { BASELINE_LADDER, type DriverKey, type ModelVariant } from "@/lib/backtesting/model-variants";
import { evaluateVariant, predictTriple } from "@/lib/backtesting/match-evaluator";
import { consolidateDiagnostics } from "@/lib/backtesting/consolidate";
import { summarizeMetrics, type Outcome, type ProbTriple } from "@/lib/backtesting/metrics";

/**
 * Phase 1.18C-6 - OLD-vs-CORE parity GATE.
 * ----------------------------------------
 * The backtesting evaluator now delegates its prediction math to the shared pure
 * core (`computePredictionCore`). This test reconstructs the PRE-migration evaluator
 * math inline (the "old evaluator": raw active-driver net advantage -> duplicated
 * expected-goals formula -> Poisson) and proves the core-backed evaluator produces
 * BYTE-IDENTICAL probabilities and metrics across all four packs, all four diagnostic
 * variants, and both stage modes (group = 48, all = 64). It is the GO gate: if any
 * comparison fails, the migration moved a historical diagnostic and pins must NOT be
 * silently updated. The canonical metric pins live in
 * tests/backtesting-match-evaluator.test.ts (per tournament) and
 * tests/backtesting-consolidation.test.ts (macro-average); proving new == old here
 * guarantees those pins are unchanged, since they were generated from the old path.
 */

const PACKS = [WC2010_PACK, WC2014_PACK, WC2018_PACK, WC2022_PACK];
const MODES = ["group", "all"] as const;
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// --- Pre-migration ("old") evaluator math, reconstructed verbatim. ---------------
function oldNetAdvantage(a: TeamFeatureSet, b: TeamFeatureSet, active: readonly DriverKey[]): number {
  const on = new Set(active);
  let net = 0;
  if (on.has("elo")) net += (a.elo - b.elo) * MODEL_WEIGHTS.elo;
  if (on.has("fifa")) {
    net += clamp(
      (b.fifaRanking - a.fifaRanking) * MODEL_WEIGHTS.fifaRankingPerPlace,
      -MODEL_WEIGHTS.fifaRankingCap,
      MODEL_WEIGHTS.fifaRankingCap,
    );
  }
  if (on.has("host")) net += ((a.isHost ? 1 : 0) - (b.isHost ? 1 : 0)) * MODEL_WEIGHTS.host;
  if (on.has("regional")) {
    net += ((a.isRegional ? 1 : 0) - (b.isRegional ? 1 : 0)) * MODEL_WEIGHTS.regional;
  }
  return net;
}

function oldExpectedGoals(netAdv: number): { home: number; away: number } {
  const { baseTotalGoals, supremacyPerGoal, minExpectedGoals } = SCORELINE_CONFIG;
  const supremacy = netAdv / supremacyPerGoal;
  const half = baseTotalGoals / 2;
  return {
    home: Math.max(minExpectedGoals, half + supremacy / 2),
    away: Math.max(minExpectedGoals, half - supremacy / 2),
  };
}

function oldTriple(a: TeamFeatureSet, b: TeamFeatureSet, variant: ModelVariant): ProbTriple {
  const xg = oldExpectedGoals(oldNetAdvantage(a, b, variant.activeDrivers));
  const matrix = scorelineMatrix(xg.home, xg.away, SCORELINE_CONFIG.maxGoalsPerSide);
  const o = outcomeProbabilities(matrix);
  return { pA: o.homeWin, pD: o.draw, pB: o.awayWin };
}

const filterByMode = (pack: typeof PACKS[number], mode: "group" | "all") =>
  pack.results.filter((m) => (mode === "group" ? m.stage === "group" : true));

describe("backtesting core migration: per-match probabilities are identical (old == core)", () => {
  for (const pack of PACKS) {
    const year = pack.identity.tournamentYear;
    const features = buildHistoricalFeatures(pack);
    for (const mode of MODES) {
      const matches = filterByMode(pack, mode);
      for (const variant of BASELINE_LADDER) {
        it(`${year} / ${variant.id} / ${mode}: every triple matches within 1e-12`, () => {
          expect(matches.length).toBe(mode === "group" ? 48 : 64);
          for (const m of matches) {
            const a = features.get(m.teamA)!;
            const b = features.get(m.teamB)!;
            const o = oldTriple(a, b, variant);
            const n = predictTriple(a, b, variant);
            expect(Math.abs(n.pA - o.pA)).toBeLessThan(1e-12);
            expect(Math.abs(n.pD - o.pD)).toBeLessThan(1e-12);
            expect(Math.abs(n.pB - o.pB)).toBeLessThan(1e-12);
          }
        });
      }
    }
  }
});

describe("backtesting core migration: summarized metrics are unchanged (old == core)", () => {
  for (const pack of PACKS) {
    const year = pack.identity.tournamentYear;
    const features = buildHistoricalFeatures(pack);
    for (const mode of MODES) {
      const matches = filterByMode(pack, mode);
      for (const variant of BASELINE_LADDER) {
        it(`${year} / ${variant.id} / ${mode}: metrics identical and 6-dp pins stable`, () => {
          const oldScored = matches.map((m) => ({
            p: oldTriple(features.get(m.teamA)!, features.get(m.teamB)!, variant),
            actual: m.resultAt90 as Outcome,
          }));
          const oldMetrics = summarizeMetrics(oldScored);
          const newMetrics = evaluateVariant(pack, variant, mode).metrics;

          // Full-precision equality (no movement even before rounding).
          expect(newMetrics.rps).toBeCloseTo(oldMetrics.rps, 12);
          expect(newMetrics.logLoss).toBeCloseTo(oldMetrics.logLoss, 12);
          expect(newMetrics.brier).toBeCloseTo(oldMetrics.brier, 12);
          expect(newMetrics.accuracy).toBeCloseTo(oldMetrics.accuracy, 12);

          // 6-dp pin parity (the published-diagnostic precision) is byte-identical.
          expect(round6(newMetrics.rps)).toBe(round6(oldMetrics.rps));
          expect(round6(newMetrics.logLoss)).toBe(round6(oldMetrics.logLoss));
          expect(round6(newMetrics.brier)).toBe(round6(oldMetrics.brier));
          expect(round6(newMetrics.accuracy)).toBe(round6(oldMetrics.accuracy));
        });
      }
    }
  }
});

describe("backtesting core migration: four-tournament consolidation inputs unchanged", () => {
  for (const mode of MODES) {
    it(`${mode}: consolidated per-tournament metrics equal the old-path metrics (=> macro-average pins stable)`, () => {
      const consolidated = consolidateDiagnostics(PACKS, mode);
      for (const pack of PACKS) {
        const features = buildHistoricalFeatures(pack);
        const matches = filterByMode(pack, mode);
        const t = consolidated.tournaments.find((x) => x.tournamentYear === pack.identity.tournamentYear)!;
        for (const variant of BASELINE_LADDER) {
          const oldScored = matches.map((m) => ({
            p: oldTriple(features.get(m.teamA)!, features.get(m.teamB)!, variant),
            actual: m.resultAt90 as Outcome,
          }));
          const old = summarizeMetrics(oldScored);
          const got = t.byVariant[variant.id]!;
          expect(got.rps).toBe(round6(old.rps));
          expect(got.logLoss).toBe(round6(old.logLoss));
          expect(got.brier).toBe(round6(old.brier));
          expect(got.accuracy).toBe(round6(old.accuracy));
        }
      }
    });
  }
});
