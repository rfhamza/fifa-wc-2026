/**
 * Phase 1.18C-1 - match-level backtest evaluator (backtesting layer).
 * -----------------------------------------------------------------
 * Scores a `HistoricalSourcePack` at the 90-minute W/D/L level for a diagnostic
 * model variant. Pure + deterministic + ISOLATED: reuses only import-safe production
 * pieces - `MODEL_WEIGHTS` / `SCORELINE_CONFIG` (config.ts, no imports) and the
 * Poisson W/D/L conversion (poisson.ts, types-only import). It does NOT import
 * `lib/model/predict.ts` or `lib/model/features.ts` (which would transitively pull in
 * `data/model-inputs` / 2026 data), so no 2026 data and no probability change leak in.
 *
 * Pipeline (mirrors production's stateless seam using the same constants):
 *   active driver differences -> netAdvantage (Elo points)
 *     -> expectedGoals (SCORELINE_CONFIG) -> Poisson scoreline matrix -> W/D/L.
 *
 * Prediction TARGET is strictly the 90-minute result (`resultAt90`); extra-time and
 * penalty advancement are never used. Headline scope is the 48 group matches;
 * `mode: "all"` additionally scores the 16 knockout matches at 90' (stage-tagged).
 */
import { MODEL_WEIGHTS, SCORELINE_CONFIG } from "@/lib/model/config";
import { outcomeProbabilities, scorelineMatrix } from "@/lib/simulation/poisson";
import type { TeamFeatureSet } from "@/lib/types";
import type { HistoricalSourcePack, MatchStage } from "./types";
import { buildHistoricalFeatures } from "./feature-adapter";
import type { DriverKey, ModelVariant } from "./model-variants";
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

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * Net Elo-point advantage of A over B from the variant's ACTIVE drivers only.
 * Mirrors the production driver math (predict.ts) for these four drivers, using the
 * shared MODEL_WEIGHTS constants. Inactive drivers contribute nothing.
 */
export function netAdvantage(
  a: TeamFeatureSet,
  b: TeamFeatureSet,
  active: DriverKey[],
): number {
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

/**
 * Convert a net Elo-point advantage into expected goals for each side. Replicated
 * from `expectedGoalsFromAdvantage` (lib/model/predict.ts) using the SAME
 * SCORELINE_CONFIG constants so values stay faithful to production.
 */
export function expectedGoals(netAdv: number): { home: number; away: number } {
  const { baseTotalGoals, supremacyPerGoal, minExpectedGoals } = SCORELINE_CONFIG;
  const supremacy = netAdv / supremacyPerGoal;
  const half = baseTotalGoals / 2;
  return {
    home: Math.max(minExpectedGoals, half + supremacy / 2),
    away: Math.max(minExpectedGoals, half - supremacy / 2),
  };
}

/** Predict a 90-minute W/D/L triple [pA, pD, pB] for A (home slot) vs B. */
export function predictTriple(
  a: TeamFeatureSet,
  b: TeamFeatureSet,
  variant: ModelVariant,
): ProbTriple {
  const xg = expectedGoals(netAdvantage(a, b, variant.activeDrivers));
  const matrix = scorelineMatrix(xg.home, xg.away, SCORELINE_CONFIG.maxGoalsPerSide);
  const o = outcomeProbabilities(matrix);
  return { pA: o.homeWin, pD: o.draw, pB: o.awayWin };
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
