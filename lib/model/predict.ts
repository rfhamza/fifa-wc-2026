/**
 * Baseline match prediction engine
 * --------------------------------
 * Transparent, fully explainable model. The pipeline is:
 *
 *   1. Build feature sets for both teams.
 *   2. Compute each driver's contribution to Team A's advantage, in
 *      Elo-equivalent points (positive favours the home/A team).
 *   3. Sum drivers → net Elo advantage.
 *   4. Convert net advantage → expected goals for each side (supremacy split).
 *   5. Feed expected goals into the Poisson engine for scorelines + W/D/L.
 *
 * Every step is pure and documented so the output can be audited and tuned.
 *
 * Phase 1.18C-4: the pure prediction math now lives in `./prediction-core.ts`
 * (a `data/model-inputs`-free module). This file is the production WRAPPER: it
 * builds feature sets, injects the real `getFeatureStatus` provenance resolver,
 * applies display rounding, and assembles the `MatchPrediction`. The public API
 * (`predictFromFeatures`, `predictMatch`, `computeDrivers`, `explainDrivers`,
 * `expectedGoalsFromAdvantage`) is unchanged and behaviour is byte-identical.
 */
import type { MatchPrediction, ModelDriver, Team, TeamFeatureSet } from "@/lib/types";
import { round } from "@/lib/utils";
import { MODEL_WEIGHTS, type ModelWeights } from "./config";
import { buildFeatureSet } from "./features";
import { getFeatureStatus } from "@/data/model-inputs";
import {
  computeDrivers as coreComputeDrivers,
  computePredictionCore,
} from "./prediction-core";

// Re-export the pure pipeline pieces for back-compat. `explainDrivers` and
// `expectedGoalsFromAdvantage` are status-free, so they are re-exported verbatim;
// `computeDrivers` is wrapped below to preserve its 3-argument public signature.
export { explainDrivers, expectedGoalsFromAdvantage } from "./prediction-core";

/**
 * Compute the signed list of driver contributions (A minus B), injecting the
 * production `getFeatureStatus` provenance resolver. `weights` defaults to the
 * production `MODEL_WEIGHTS`; an AUDIT-ONLY caller (Phase 1.11 sensitivity audit)
 * may pass an override. Signature preserved for backwards compatibility.
 */
export function computeDrivers(
  a: TeamFeatureSet,
  b: TeamFeatureSet,
  weights: ModelWeights = MODEL_WEIGHTS,
): ModelDriver[] {
  return coreComputeDrivers(a, b, weights, getFeatureStatus);
}

/**
 * Predict a single match from two feature sets. `weights` defaults to the
 * production `MODEL_WEIGHTS`; an audit-only override may be supplied (Phase 1.11).
 * Delegates the pure math to `computePredictionCore` and applies display rounding.
 */
export function predictFromFeatures(
  a: TeamFeatureSet,
  b: TeamFeatureSet,
  weights: ModelWeights = MODEL_WEIGHTS,
): MatchPrediction {
  const core = computePredictionCore(a, b, {
    weights,
    statusResolver: getFeatureStatus,
  });

  return {
    homeTeamId: a.teamId,
    awayTeamId: b.teamId,
    homeWin: round(core.outcome.homeWin, 4),
    draw: round(core.outcome.draw, 4),
    awayWin: round(core.outcome.awayWin, 4),
    expectedHomeGoals: round(core.expectedGoals.home, 2),
    expectedAwayGoals: round(core.expectedGoals.away, 2),
    topScorelines: core.topScorelines.map((s) => ({
      ...s,
      probability: round(s.probability, 4),
    })),
    explanation: core.explanation,
  };
}

/** Convenience wrapper that predicts directly from two `Team` records. */
export function predictMatch(home: Team, away: Team): MatchPrediction {
  return predictFromFeatures(buildFeatureSet(home), buildFeatureSet(away));
}
