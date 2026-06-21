/**
 * Pure prediction core (Phase 1.18C-4)
 * ------------------------------------
 * The `data/model-inputs`-free heart of the match-prediction engine. Every
 * function here is pure, stateless and side-effect-free: it imports only the
 * model `config` constants, the Poisson engine, and types. It NEVER imports
 * `data/model-inputs`, feature builders, historical snapshots, backtesting code,
 * or any UI/app path — so it can be imported in isolation and shared by both the
 * production wrapper (`lib/model/predict.ts`) and, later, the backtesting harness.
 *
 * The only coupling to 2026 model-inputs in the original `predict.ts` was the
 * per-driver provenance lookup `getFeatureStatus`. That dependency is now
 * INJECTED: callers pass a `statusResolver`. Production injects the real
 * `getFeatureStatus`; an isolated caller can inject any deterministic policy.
 *
 * Behaviour is byte-identical to the pre-extraction `predict.ts`:
 *  - the 1-decimal net-advantage rounding inside `explainDrivers` is preserved
 *    (it is model behaviour, not display rounding);
 *  - the core returns UNROUNDED W/D/L probabilities — all 4-dp / 2-dp display
 *    rounding stays in the production wrapper.
 */
import type {
  ModelDriver,
  ModelExplanation,
  ModelFeatureFamily,
  ModelInputStatus,
  ScorelineProbability,
  TeamFeatureSet,
} from "@/lib/types";
import { clamp, round } from "@/lib/utils";
import {
  MODEL_WEIGHTS,
  SCORELINE_CONFIG,
  PLACEHOLDER_CONTRIBUTION_CAP,
  TOTAL_PLACEHOLDER_CONTRIBUTION_CAP,
  CLIMATE_CONTRIBUTION_CAP,
  TOURNAMENT_CONTEXT_CONTRIBUTION_CAP,
  type ModelWeights,
} from "./config";
import {
  outcomeProbabilities,
  scorelineMatrix,
  topScorelines,
  type OutcomeProbabilities,
} from "@/lib/simulation/poisson";

/**
 * Injected resolver mapping a feature family to its provenance status. Mirrors
 * the signature of production's `getFeatureStatus` but is supplied by the caller
 * so the core never imports `data/model-inputs`.
 */
export type FeatureStatusResolver = (
  family: ModelFeatureFamily,
) => ModelInputStatus | undefined;

/** Coerce non-finite contributions to 0 so a missing input never yields NaN. */
const finite = (x: number): number => (Number.isFinite(x) ? x : 0);

/**
 * Per-driver contribution cap (Elo-equivalent pts), or `undefined` if uncapped.
 * Generalised in Phase 1.13 so the cap is no longer keyed off `placeholder` alone:
 *  - every `placeholder` family is clamped to +/- PLACEHOLDER_CONTRIBUTION_CAP;
 *  - the climate family is a documented `candidate` heuristic and is clamped to
 *    +/- CLIMATE_CONTRIBUTION_CAP even though it is no longer placeholder.
 *  - the tournament-context family (Phase 1.15B) is a documented `candidate`
 *    heuristic and is clamped to +/- TOURNAMENT_CONTEXT_CONTRIBUTION_CAP.
 * These candidate caps bind individually and are NOT pooled with placeholders.
 * Other source-backed/verified families remain uncapped.
 */
export function contributionCapFor(
  family: ModelFeatureFamily | undefined,
  status: ModelInputStatus | undefined,
): number | undefined {
  if (status === "placeholder") return PLACEHOLDER_CONTRIBUTION_CAP;
  if (family === "climateFamiliarity") return CLIMATE_CONTRIBUTION_CAP;
  if (family === "tournamentContext") return TOURNAMENT_CONTEXT_CONTRIBUTION_CAP;
  return undefined;
}

/**
 * Tag every driver with its family status and apply the per-driver contribution
 * caps (placeholder families + the capped climate `candidate`), then scale all
 * `placeholder` drivers down together if their combined magnitude exceeds
 * TOTAL_PLACEHOLDER_CONTRIBUTION_CAP. Deterministic. The aggregate cap stays
 * placeholder-only (climate is bounded individually, not pooled here). The
 * provenance status is resolved through the INJECTED `statusResolver`.
 */
export function applyInputStatusAndCaps(
  drivers: ModelDriver[],
  statusResolver: FeatureStatusResolver,
): ModelDriver[] {
  const tagged = drivers.map((d) => {
    const status = d.family ? statusResolver(d.family) : undefined;
    let contribution = finite(d.contribution);
    let capped = false;
    const cap = contributionCapFor(d.family, status);
    if (cap !== undefined && Math.abs(contribution) > cap) {
      contribution = clamp(contribution, -cap, cap);
      capped = true;
    }
    return { ...d, status, contribution, capped };
  });

  const placeholderTotal = tagged
    .filter((d) => d.status === "placeholder")
    .reduce((s, d) => s + d.contribution, 0);

  if (Math.abs(placeholderTotal) > TOTAL_PLACEHOLDER_CONTRIBUTION_CAP) {
    const factor = TOTAL_PLACEHOLDER_CONTRIBUTION_CAP / Math.abs(placeholderTotal);
    for (const d of tagged) {
      if (d.status === "placeholder") {
        d.contribution = d.contribution * factor;
        d.capped = true;
      }
    }
  }
  return tagged;
}

/**
 * Compute the signed list of driver contributions (A minus B).
 *
 * `weights` defaults to the production `MODEL_WEIGHTS`; an AUDIT-ONLY caller
 * (Phase 1.11 sensitivity audit) may pass an override object to probe how the
 * forecast responds to different weightings. The placeholder caps are NOT
 * overridable here, so they continue to bind under every variant. The provenance
 * status is resolved through the INJECTED `statusResolver`.
 */
export function computeDrivers(
  a: TeamFeatureSet,
  b: TeamFeatureSet,
  weights: ModelWeights,
  statusResolver: FeatureStatusResolver,
): ModelDriver[] {
  const w = weights;

  const rankContribution = clamp(
    (b.fifaRanking - a.fifaRanking) * w.fifaRankingPerPlace,
    -w.fifaRankingCap,
    w.fifaRankingCap,
  );

  const drivers: ModelDriver[] = [
    {
      label: "Elo rating",
      family: "eloRating",
      contribution: (a.elo - b.elo) * w.elo,
      detail: `Elo ${a.elo} vs ${b.elo}.`,
    },
    {
      label: "FIFA ranking",
      family: "fifaRanking",
      contribution: rankContribution,
      detail: `Ranked #${a.fifaRanking} vs #${b.fifaRanking} (capped).`,
    },
    {
      label: "Squad quality",
      family: "squadQuality",
      contribution: (a.squadQuality - b.squadQuality) * w.squadQuality,
      detail: `Squad quality ${a.squadQuality} vs ${b.squadQuality}.`,
    },
    {
      label: "Recent form",
      family: "recentForm",
      contribution: (a.recentForm - b.recentForm) * w.recentForm,
      detail: `Form ${a.recentForm} vs ${b.recentForm}.`,
    },
    {
      label: "Manager cohesion",
      family: "managerCohesion",
      contribution:
        ((a.sameNationalityManager ? 1 : 0) -
          (b.sameNationalityManager ? 1 : 0)) *
        w.manager,
      detail: "Same-nationality manager used as a squad-cohesion proxy.",
    },
    {
      label: "Host advantage",
      family: "hostAdvantage",
      contribution: ((a.isHost ? 1 : 0) - (b.isHost ? 1 : 0)) * w.host,
      detail: "Co-host crowd, travel and familiarity edge.",
    },
    {
      label: "Regional advantage",
      family: "regionalAdvantage",
      contribution:
        ((a.isRegional ? 1 : 0) - (b.isRegional ? 1 : 0)) * w.regional,
      detail: "Same-region travel and climate familiarity.",
    },
    {
      label: "Climate familiarity",
      family: "climateFamiliarity",
      contribution:
        (a.climateFamiliarity - b.climateFamiliarity) * w.climate,
      detail: `Acclimatization ${a.climateFamiliarity} vs ${b.climateFamiliarity}.`,
    },
    {
      label: "Structural depth",
      family: "structural",
      contribution: (a.structuralDepth - b.structuralDepth) * w.structural,
      detail:
        "Experimental weak economic prior (log-scaled GDP per capita + population).",
    },
    {
      label: "Tournament context",
      family: "tournamentContext",
      contribution:
        (a.tournamentContext - b.tournamentContext) * w.tournamentContext,
      detail:
        `Relative group-stage logistics (travel/rest/altitude/time-zone/venue-continuity) ` +
        `${a.tournamentContext.toFixed(2)} vs ${b.tournamentContext.toFixed(2)} (candidate, capped; ` +
        `heat/venue-climate deferred; excludes host/regional).`,
    },
  ];

  // Phase 1.7: tag provenance status + apply placeholder-weight caps.
  return applyInputStatusAndCaps(drivers, statusResolver);
}

/** Group drivers into ordered positive/negative lists with a net total. */
export function explainDrivers(drivers: ModelDriver[]): ModelExplanation {
  const netAdvantage = drivers.reduce((s, d) => s + d.contribution, 0);
  const positiveDrivers = drivers
    .filter((d) => d.contribution > 0.01)
    .sort((x, y) => y.contribution - x.contribution);
  const negativeDrivers = drivers
    .filter((d) => d.contribution < -0.01)
    .sort((x, y) => x.contribution - y.contribution);
  return {
    positiveDrivers,
    negativeDrivers,
    netAdvantage: round(netAdvantage, 1),
  };
}

/** Convert a net Elo advantage into expected goals for both sides. */
export function expectedGoalsFromAdvantage(netAdvantage: number): {
  home: number;
  away: number;
} {
  const { baseTotalGoals, supremacyPerGoal, minExpectedGoals } =
    SCORELINE_CONFIG;
  // Supremacy = the goal-difference the rating edge implies.
  const supremacy = netAdvantage / supremacyPerGoal;
  const half = baseTotalGoals / 2;
  return {
    home: Math.max(minExpectedGoals, half + supremacy / 2),
    away: Math.max(minExpectedGoals, half - supremacy / 2),
  };
}

/** Options for the combined pure prediction pipeline. */
export interface PredictionCoreOptions {
  /** Tunable weights; defaults to production `MODEL_WEIGHTS` when omitted. */
  weights?: ModelWeights;
  /** Provenance resolver (injected; the core never imports `getFeatureStatus`). */
  statusResolver: FeatureStatusResolver;
}

/**
 * Full pure prediction result. W/D/L probabilities and expected goals are
 * UNROUNDED — display rounding is the production wrapper's responsibility. The
 * 1-decimal net-advantage rounding inside `explanation` is model behaviour and
 * is preserved here.
 */
export interface PredictionCoreResult {
  drivers: ModelDriver[];
  explanation: ModelExplanation;
  expectedGoals: { home: number; away: number };
  scorelineMatrix: ScorelineProbability[];
  topScorelines: ScorelineProbability[];
  outcome: OutcomeProbabilities;
}

/**
 * Run the full pure prediction pipeline from two already-built feature sets:
 * drivers → net advantage → expected goals → Poisson scoreline matrix → W/D/L.
 * Returns unrounded probabilities; the production wrapper applies display
 * rounding and the `MatchPrediction` assembly.
 */
export function computePredictionCore(
  a: TeamFeatureSet,
  b: TeamFeatureSet,
  options: PredictionCoreOptions,
): PredictionCoreResult {
  const weights = options.weights ?? MODEL_WEIGHTS;
  const drivers = computeDrivers(a, b, weights, options.statusResolver);
  const explanation = explainDrivers(drivers);
  const expectedGoals = expectedGoalsFromAdvantage(explanation.netAdvantage);

  const matrix = scorelineMatrix(
    expectedGoals.home,
    expectedGoals.away,
    SCORELINE_CONFIG.maxGoalsPerSide,
  );
  const outcome = outcomeProbabilities(matrix);

  return {
    drivers,
    explanation,
    expectedGoals,
    scorelineMatrix: matrix,
    topScorelines: topScorelines(matrix, 5),
    outcome,
  };
}
