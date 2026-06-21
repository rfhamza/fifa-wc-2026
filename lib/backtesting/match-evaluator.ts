/**
 * Phase 1.18C-1 - match-level backtest evaluator (backtesting layer).
 * Phase 1.18C-6 - now delegates the prediction math to the shared PURE CORE.
 * -----------------------------------------------------------------
 * Scores a `HistoricalSourcePack` at the 90-minute W/D/L level for a diagnostic
 * model variant. Pure + deterministic + ISOLATED.
 *
 * The driver math, net-advantage sum, expected-goals conversion and Poisson W/D/L
 * step are no longer re-implemented here: the evaluator calls `computePredictionCore`
 * (`lib/model/prediction-core.ts`) - the SAME `data/model-inputs`-free core that
 * production delegates to - so there is one shared scoring path. The core is import
 * -safe (config + poisson + lib/utils + types only); the evaluator still does NOT
 * import `lib/model/predict.ts`, `lib/model/features.ts` or `data/model-inputs`, so
 * no 2026 data and no probability change leak in.
 *
 * Diagnostic variants are expressed as `variantWeights(variant)` (production
 * `MODEL_WEIGHTS` with inactive diagnostic drivers zeroed; `fifaRankingCap`
 * preserved). Provenance status is injected via a deterministic HISTORICAL resolver
 * that returns `undefined` for every family: the four active drivers
 * (Elo/FIFA/host/regional) are uncapped in production cap logic, and every other
 * (cappable) driver is zero on the neutral historical features, so caps stay inert.
 *
 * Prediction TARGET is strictly the 90-minute result (`resultAt90`); extra-time and
 * penalty advancement are never used. Headline scope is the 48 group matches;
 * `mode: "all"` additionally scores the 16 knockout matches at 90' (stage-tagged).
 */
import {
  computeDrivers as coreComputeDrivers,
  computePredictionCore,
  type FeatureStatusResolver,
} from "@/lib/model/prediction-core";
import type { TeamFeatureSet } from "@/lib/types";
import type { HistoricalSourcePack, MatchStage } from "./types";
import { buildHistoricalFeatures } from "./feature-adapter";
import {
  variantWeights,
  weightsForActiveDrivers,
  type DriverKey,
  type ModelVariant,
} from "./model-variants";
import {
  calibrationBuckets,
  summarizeMetrics,
  validateProbabilityTriple,
  type CalibrationBucket,
  type MetricSummary,
  type Outcome,
  type ProbTriple,
  type ScoredMatch,
} from "./metrics";

export type StageMode = "group" | "all";

/**
 * Deterministic provenance resolver for historical diagnostics: every feature
 * family is `undefined` (no provenance assumption). The active diagnostic drivers
 * are uncapped in production cap logic, and every cappable driver is zero on the
 * neutral historical features, so this keeps placeholder / climate / tournament
 * -context caps inert. Imports no `data/model-inputs`, no feature builders, no 2026
 * data. The old-vs-core parity test proves this policy reproduces the prior outputs.
 */
export const historicalStatusResolver: FeatureStatusResolver = () => undefined;

/**
 * Net Elo-point advantage of A over B from the variant's ACTIVE drivers only.
 * Delegates to the shared core's `computeDrivers` (single source of truth for the
 * driver math) with the variant weights, then sums the raw contributions. Inactive
 * drivers are zeroed by weight and contribute nothing. Diagnostic helper used by
 * the sign-direction tests; the scoring path uses `predictTriple` / the core.
 */
export function netAdvantage(
  a: TeamFeatureSet,
  b: TeamFeatureSet,
  active: DriverKey[],
): number {
  const drivers = coreComputeDrivers(
    a,
    b,
    weightsForActiveDrivers(active),
    historicalStatusResolver,
  );
  return drivers.reduce((sum, d) => sum + d.contribution, 0);
}

/**
 * Predict a 90-minute W/D/L triple [pA, pD, pB] for A (home slot) vs B via the
 * shared pure prediction core, using the variant's weights and the historical
 * status resolver. The core returns unrounded probabilities, which the metrics
 * consume directly.
 */
export function predictTriple(
  a: TeamFeatureSet,
  b: TeamFeatureSet,
  variant: ModelVariant,
): ProbTriple {
  const core = computePredictionCore(a, b, {
    weights: variantWeights(variant),
    statusResolver: historicalStatusResolver,
  });
  return { pA: core.outcome.homeWin, pD: core.outcome.draw, pB: core.outcome.awayWin };
}

export interface FeatureSummary {
  eloA: number;
  eloB: number;
  fifaA: number;
  fifaB: number;
  isHostA: boolean;
  isHostB: boolean;
  isRegionalA: boolean;
  isRegionalB: boolean;
}

export interface PerMatchRow {
  matchId: string;
  stage: MatchStage;
  group?: string;
  teamA: string;
  teamB: string;
  actual: Outcome;
  pA: number;
  pD: number;
  pB: number;
  modelVariant: string;
  featureSummary: FeatureSummary;
}

export interface BacktestRunResult {
  tournamentYear: number;
  modelVariant: string;
  matchCount: number;
  includedStages: MatchStage[];
  metrics: MetricSummary;
  calibration: CalibrationBucket[];
  perMatch: PerMatchRow[];
}

const isGroup = (stage: MatchStage) => stage === "group";

/** Evaluate a single variant over the pack. Default mode scores group matches only. */
export function evaluateVariant(
  pack: HistoricalSourcePack,
  variant: ModelVariant,
  mode: StageMode = "group",
): BacktestRunResult {
  const features = buildHistoricalFeatures(pack);
  const matches = pack.results.filter((m) => (mode === "group" ? isGroup(m.stage) : true));

  const perMatch: PerMatchRow[] = [];
  const scored: ScoredMatch[] = [];
  const stages = new Set<MatchStage>();

  for (const m of matches) {
    if (m.resultAt90 === undefined) {
      throw new Error(`match ${m.matchId} has no resultAt90 (cannot score 90-minute W/D/L)`);
    }
    const a = features.get(m.teamA);
    const b = features.get(m.teamB);
    if (!a || !b) throw new Error(`match ${m.matchId} references a team without features`);

    const p = predictTriple(a, b, variant);
    validateProbabilityTriple(p);
    const actual: Outcome = m.resultAt90;
    stages.add(m.stage);
    scored.push({ p, actual });
    perMatch.push({
      matchId: m.matchId,
      stage: m.stage,
      ...(m.group !== undefined ? { group: m.group } : {}),
      teamA: m.teamA,
      teamB: m.teamB,
      actual,
      pA: p.pA,
      pD: p.pD,
      pB: p.pB,
      modelVariant: variant.id,
      featureSummary: {
        eloA: a.elo,
        eloB: b.elo,
        fifaA: a.fifaRanking,
        fifaB: b.fifaRanking,
        isHostA: a.isHost,
        isHostB: b.isHost,
        isRegionalA: a.isRegional,
        isRegionalB: b.isRegional,
      },
    });
  }

  return {
    tournamentYear: pack.identity.tournamentYear,
    modelVariant: variant.id,
    matchCount: scored.length,
    includedStages: [...stages],
    metrics: summarizeMetrics(scored),
    calibration: calibrationBuckets(scored),
    perMatch,
  };
}

/** Evaluate the full baseline ladder over the pack for the given mode. */
export function evaluateLadder(
  pack: HistoricalSourcePack,
  ladder: ModelVariant[],
  mode: StageMode = "group",
): BacktestRunResult[] {
  return ladder.map((v) => evaluateVariant(pack, v, mode));
}
