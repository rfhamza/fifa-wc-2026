/**
 * Post-tournament retrospective (PR B) - scoreline accuracy.
 * ---------------------------------------------------------
 * Scores the model's most-likely scoreline (`topScorelines[0]`) against the actual score
 * from the validated retrospective ledger.
 *
 * The ledger's knockout scores are REGULATION-CORRECTED: the provider folds a penalty
 * shootout into `score.fullTime`, so PR A recovered the true 90'+extra-time score and
 * carried the shootout separately. Evaluating against the raw provider field would have
 * compared the model's scoreline forecast to a number that includes penalty kicks.
 *
 * Coverage is always reported: only a subset of matches has an archived scoreline
 * forecast, and an aggregate over a subset is meaningless without saying which subset.
 *
 * PURE: no I/O.
 */
import { isKnockoutLedgerRow, type ForecastResultsLedger } from "@/lib/model/forecast-results-ledger";
import type { MatchForecastLike, ForecastProvenance } from "@/lib/retrospective/match-accuracy";

/** Total-goals buckets used for the "roughly how open was this game" check. */
export type GoalsBucket = "0-1" | "2-3" | "4+";

export function goalsBucket(total: number): GoalsBucket {
  if (total <= 1) return "0-1";
  if (total <= 3) return "2-3";
  return "4+";
}

export type ResultDirection = "home" | "draw" | "away";

export function directionOf(homeGoals: number, awayGoals: number): ResultDirection {
  if (homeGoals > awayGoals) return "home";
  if (homeGoals < awayGoals) return "away";
  return "draw";
}

export interface ScorelineRow {
  matchNumber: number;
  stage: string;
  homeTeamId: string;
  awayTeamId: string;
  predictedHomeGoals: number;
  predictedAwayGoals: number;
  predictedProbability: number;
  actualHomeGoals: number;
  actualAwayGoals: number;
  exact: boolean;
  goalDifferenceHit: boolean;
  goalsBucketHit: boolean;
  directionHit: boolean;
  /** |predHome - actualHome| + |predAway - actualAway|. */
  absoluteGoalError: number;
  /** |predTotal - actualTotal|. */
  totalGoalsError: number;
  decidedOnPenalties: boolean;
}

export interface ScorelineEvaluation {
  provenance: ForecastProvenance;
  coverage: {
    withForecast: number;
    withoutForecast: number;
    total: number;
    missingMatchNumbers: number[];
    byStage: { stage: string; withForecast: number; total: number }[];
  };
  exactHits: number;
  exactHitRate: number;
  goalDifferenceHits: number;
  goalDifferenceRate: number;
  goalsBucketHits: number;
  goalsBucketRate: number;
  directionHits: number;
  directionRate: number;
  meanAbsoluteGoalError: number;
  meanTotalGoalsError: number;
  /** Exact hits first, then closest by absolute goal error. */
  bestPredictions: ScorelineRow[];
  /** Largest absolute goal error first. */
  largestMisses: ScorelineRow[];
  rows: ScorelineRow[];
}

/**
 * Evaluate scoreline forecasts over whichever ledger rows the caller scopes to. Pass only
 * the matches whose forecasts share a single provenance - archived and recomputed
 * forecasts must not be pooled into one aggregate.
 */
export function evaluateScorelines(
  ledger: ForecastResultsLedger,
  forecasts: readonly MatchForecastLike[],
  provenance: ForecastProvenance,
  scope: "knockout" | "group" | "all" = "all",
): ScorelineEvaluation {
  const inScope = ledger.results.filter((r) =>
    scope === "all" ? true : scope === "group" ? r.stage === "group" : r.stage !== "group",
  );
  const byNumber = new Map(forecasts.map((f) => [f.matchNumber, f]));
  const rows: ScorelineRow[] = [];
  const missingMatchNumbers: number[] = [];

  for (const row of [...inScope].sort((a, b) => a.matchNumber - b.matchNumber)) {
    const f = byNumber.get(row.matchNumber);
    const top = f?.topScorelines?.[0];
    if (!f || !top) {
      missingMatchNumbers.push(row.matchNumber);
      continue;
    }
    // Orient the predicted scoreline onto the ledger's canonical home/away.
    const flipped = f.homeTeamId !== row.homeTeamId;
    const predictedHomeGoals = flipped ? top.awayGoals : top.homeGoals;
    const predictedAwayGoals = flipped ? top.homeGoals : top.awayGoals;
    const actualHomeGoals = row.homeGoals;
    const actualAwayGoals = row.awayGoals;

    rows.push({
      matchNumber: row.matchNumber,
      stage: row.stage,
      homeTeamId: row.homeTeamId,
      awayTeamId: row.awayTeamId,
      predictedHomeGoals,
      predictedAwayGoals,
      predictedProbability: top.probability,
      actualHomeGoals,
      actualAwayGoals,
      exact: predictedHomeGoals === actualHomeGoals && predictedAwayGoals === actualAwayGoals,
      goalDifferenceHit: predictedHomeGoals - predictedAwayGoals === actualHomeGoals - actualAwayGoals,
      goalsBucketHit:
        goalsBucket(predictedHomeGoals + predictedAwayGoals) === goalsBucket(actualHomeGoals + actualAwayGoals),
      directionHit: directionOf(predictedHomeGoals, predictedAwayGoals) === directionOf(actualHomeGoals, actualAwayGoals),
      absoluteGoalError:
        Math.abs(predictedHomeGoals - actualHomeGoals) + Math.abs(predictedAwayGoals - actualAwayGoals),
      totalGoalsError: Math.abs(predictedHomeGoals + predictedAwayGoals - (actualHomeGoals + actualAwayGoals)),
      decidedOnPenalties: isKnockoutLedgerRow(row) && row.penaltiesHome !== undefined,
    });
  }

  const n = rows.length;
  const count = (pred: (r: ScorelineRow) => boolean) => rows.filter(pred).length;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const stages = [...new Set(inScope.map((r) => r.stage))];
  const covered = new Set(rows.map((r) => r.matchNumber));

  return {
    provenance,
    coverage: {
      withForecast: n,
      withoutForecast: missingMatchNumbers.length,
      total: inScope.length,
      missingMatchNumbers,
      byStage: stages.map((stage) => {
        const all = inScope.filter((r) => r.stage === stage);
        return { stage, withForecast: all.filter((r) => covered.has(r.matchNumber)).length, total: all.length };
      }),
    },
    exactHits: count((r) => r.exact),
    exactHitRate: n ? count((r) => r.exact) / n : 0,
    goalDifferenceHits: count((r) => r.goalDifferenceHit),
    goalDifferenceRate: n ? count((r) => r.goalDifferenceHit) / n : 0,
    goalsBucketHits: count((r) => r.goalsBucketHit),
    goalsBucketRate: n ? count((r) => r.goalsBucketHit) / n : 0,
    directionHits: count((r) => r.directionHit),
    directionRate: n ? count((r) => r.directionHit) / n : 0,
    meanAbsoluteGoalError: mean(rows.map((r) => r.absoluteGoalError)),
    meanTotalGoalsError: mean(rows.map((r) => r.totalGoalsError)),
    bestPredictions: [...rows]
      .sort((a, b) => Number(b.exact) - Number(a.exact) || a.absoluteGoalError - b.absoluteGoalError || a.matchNumber - b.matchNumber)
      .slice(0, 5),
    largestMisses: [...rows]
      .sort((a, b) => b.absoluteGoalError - a.absoluteGoalError || a.matchNumber - b.matchNumber)
      .slice(0, 5),
    rows,
  };
}
