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
 */
import type {
  MatchPrediction,
  ModelDriver,
  ModelExplanation,
  Team,
  TeamFeatureSet,
} from "@/lib/types";
import { clamp, round } from "@/lib/utils";
import {
  MODEL_WEIGHTS,
  SCORELINE_CONFIG,
  PLACEHOLDER_CONTRIBUTION_CAP,
  TOTAL_PLACEHOLDER_CONTRIBUTION_CAP,
  CLIMATE_CONTRIBUTION_CAP,
  type ModelWeights,
} from "./config";
import { buildFeatureSet } from "./features";
import { getFeatureStatus } from "@/data/model-inputs";
import type { ModelFeatureFamily, ModelInputStatus } from "@/lib/types";

/** Coerce non-finite contributions to 0 so a missing input never yields NaN. */
const finite = (x: number): number => (Number.isFinite(x) ? x : 0);

/**
 * Per-driver contribution cap (Elo-equivalent pts), or `undefined` if uncapped.
 * Generalised in Phase 1.13 so the cap is no longer keyed off `placeholder` alone:
 *  - every `placeholder` family is clamped to +/- PLACEHOLDER_CONTRIBUTION_CAP;
 *  - the climate family is a documented `candidate` heuristic and is clamped to
 *    +/- CLIMATE_CONTRIBUTION_CAP even though it is no longer placeholder.
 * Other source-backed/verified/candidate families remain uncapped.
 */
function contributionCapFor(
  family: ModelFeatureFamily | undefined,
  status: ModelInputStatus | undefined,
): number | undefined {
  if (status === "placeholder") return PLACEHOLDER_CONTRIBUTION_CAP;
  if (family === "climateFamiliarity") return CLIMATE_CONTRIBUTION_CAP;
  return undefined;
}

/**
 * Tag every driver with its family status and apply the per-driver contribution
 * caps (placeholder families + the capped climate `candidate`), then scale all
 * `placeholder` drivers down together if their combined magnitude exceeds
 * TOTAL_PLACEHOLDER_CONTRIBUTION_CAP. Deterministic. The aggregate cap stays
 * placeholder-only (climate is bounded individually, not pooled here).
 */
function applyInputStatusAndCaps(drivers: ModelDriver[]): ModelDriver[] {
  const tagged = drivers.map((d) => {
    const status = d.family ? getFeatureStatus(d.family) : undefined;
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
import {
  outcomeProbabilities,
  scorelineMatrix,
  topScorelines,
} from "@/lib/simulation/poisson";

/**
 * Compute the signed list of driver contributions (A minus B).
 *
 * `weights` defaults to the production `MODEL_WEIGHTS`; an AUDIT-ONLY caller
 * (Phase 1.11 sensitivity audit) may pass an override object to probe how the
 * forecast responds to different weightings. The placeholder caps are NOT
 * overridable here, so they continue to bind under every variant.
 */
export function computeDrivers(
  a: TeamFeatureSet,
  b: TeamFeatureSet,
  weights: ModelWeights = MODEL_WEIGHTS,
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
  ];

  // Phase 1.7: tag provenance status + apply placeholder-weight caps.
  return applyInputStatusAndCaps(drivers);
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

/**
 * Predict a single match from two feature sets. `weights` defaults to the
 * production `MODEL_WEIGHTS`; an audit-only override may be supplied (Phase 1.11).
 */
export function predictFromFeatures(
  a: TeamFeatureSet,
  b: TeamFeatureSet,
  weights: ModelWeights = MODEL_WEIGHTS,
): MatchPrediction {
  const drivers = computeDrivers(a, b, weights);
  const explanation = explainDrivers(drivers);
  const xg = expectedGoalsFromAdvantage(explanation.netAdvantage);

  const matrix = scorelineMatrix(
    xg.home,
    xg.away,
    SCORELINE_CONFIG.maxGoalsPerSide,
  );
  const outcome = outcomeProbabilities(matrix);

  return {
    homeTeamId: a.teamId,
    awayTeamId: b.teamId,
    homeWin: round(outcome.homeWin, 4),
    draw: round(outcome.draw, 4),
    awayWin: round(outcome.awayWin, 4),
    expectedHomeGoals: round(xg.home, 2),
    expectedAwayGoals: round(xg.away, 2),
    topScorelines: topScorelines(matrix, 5).map((s) => ({
      ...s,
      probability: round(s.probability, 4),
    })),
    explanation,
  };
}

/** Convenience wrapper that predicts directly from two `Team` records. */
export function predictMatch(home: Team, away: Team): MatchPrediction {
  return predictFromFeatures(buildFeatureSet(home), buildFeatureSet(away));
}
