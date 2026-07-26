/**
 * Post-tournament retrospective (PR B) - match-level accuracy.
 * -----------------------------------------------------------
 * Two evaluations that must NEVER be pooled, kept in separate result objects so they
 * cannot be averaged together by accident:
 *
 *   1. GROUP, 90-minute W/D/L - scored with `lib/backtesting/metrics.ts` verbatim
 *      (RPS / log-loss / Brier / argmax accuracy).
 *   2. KNOCKOUT, ADVANCEMENT - which team progressed. Regulation W/D/L is NOT recoverable
 *      for knockout ties: the ledger stores 90'+extra-time goals combined, so a tie level
 *      after extra time and settled on penalties cannot be separated from a regulation
 *      draw. Advancement is the only honest knockout target.
 *
 * Provenance is also kept separate: `archived-pre-match-forecast` entries were genuinely
 * captured before kick-off, while `retrospective-model-forecast` entries are recomputed
 * after the fact. Headline knockout numbers use archived entries only.
 *
 * PURE: no I/O. Callers pass in the ledger, the archive and any recomputed forecasts.
 */
import {
  isCorrect,
  predictedClass,
  summarizeMetrics,
  type MetricSummary,
  type Outcome,
  type ProbTriple,
  type ScoredMatch,
} from "@/lib/backtesting/metrics";
import { binaryBrier, binaryLogLoss, type BinaryObservation } from "@/lib/retrospective/calibration";
import { isKnockoutLedgerRow, type ForecastResultsLedger } from "@/lib/model/forecast-results-ledger";

/** How a forecast for a given match was obtained. */
export type ForecastProvenance = "archived-pre-match-forecast" | "retrospective-model-forecast" | "unavailable";

/** Minimal shape of a match forecast, whether archived or recomputed. */
export interface MatchForecastLike {
  matchNumber: number;
  stage: string;
  homeTeamId: string;
  awayTeamId: string;
  homeWin: number;
  draw: number;
  awayWin: number;
  expectedHomeGoals?: number;
  expectedAwayGoals?: number;
  topScorelines?: { homeGoals: number; awayGoals: number; probability: number }[];
  homeAdvance?: number;
  awayAdvance?: number;
  forecastProvenance?: string;
  capturedBeforeCompletion?: boolean;
}

/** 90-minute outcome from the home team's perspective, in metrics.ts terms. */
export function outcomeOf(homeGoals: number, awayGoals: number): Outcome {
  if (homeGoals > awayGoals) return "A";
  if (homeGoals < awayGoals) return "B";
  return "D";
}

/**
 * Published forecasts are rounded to 4 decimal places, so a triple can sum to 1.0001 -
 * outside the backtesting validator's 1e-9 tolerance. Renormalise to an exact unit sum
 * before scoring. The guard keeps this from masking a genuinely malformed forecast: a
 * deviation larger than rounding can explain is an error, not something to paper over.
 */
const ROUNDING_SLACK = 5e-3;

export function normalizeTriple(p: ProbTriple): ProbTriple {
  const sum = p.pA + p.pD + p.pB;
  if (!Number.isFinite(sum) || Math.abs(sum - 1) > ROUNDING_SLACK) {
    throw new Error(`match forecast probabilities are malformed (sum ${sum}); refusing to renormalise`);
  }
  return { pA: p.pA / sum, pD: p.pD / sum, pB: p.pB / sum };
}

export interface GroupMatchEvaluation {
  provenance: ForecastProvenance;
  /** 90-minute W/D/L metrics from the shared backtesting helper. */
  metrics: MetricSummary;
  coverage: { evaluated: number; total: number; missing: number[] };
  /** Mean max-probability when the argmax call was right / wrong. */
  averageConfidenceCorrect: number;
  averageConfidenceMiss: number;
  rows: {
    matchNumber: number;
    homeTeamId: string;
    awayTeamId: string;
    predicted: Outcome;
    actual: Outcome;
    correct: boolean;
    confidence: number;
    score: string;
  }[];
}

/**
 * Evaluate group-stage 90-minute W/D/L. `provenance` is carried on the result so a report
 * table can never present recomputed forecasts as genuine archives.
 */
export function evaluateGroupMatches(
  ledger: ForecastResultsLedger,
  forecasts: readonly MatchForecastLike[],
  provenance: ForecastProvenance,
): GroupMatchEvaluation {
  const groupRows = ledger.results.filter((r) => r.stage === "group");
  const byNumber = new Map(forecasts.map((f) => [f.matchNumber, f]));
  const scored: ScoredMatch[] = [];
  const rows: GroupMatchEvaluation["rows"] = [];
  const missing: number[] = [];

  for (const row of [...groupRows].sort((a, b) => a.matchNumber - b.matchNumber)) {
    const f = byNumber.get(row.matchNumber);
    if (!f) {
      missing.push(row.matchNumber);
      continue;
    }
    // Re-orient the forecast onto the ledger's canonical home/away if needed.
    const flipped = f.homeTeamId !== row.homeTeamId;
    const p: ProbTriple = normalizeTriple(
      flipped
        ? { pA: f.awayWin, pD: f.draw, pB: f.homeWin }
        : { pA: f.homeWin, pD: f.draw, pB: f.awayWin },
    );
    const actual = outcomeOf(row.homeGoals, row.awayGoals);
    scored.push({ p, actual });
    const predicted = predictedClass(p);
    const correct = isCorrect(p, actual);
    rows.push({
      matchNumber: row.matchNumber,
      homeTeamId: row.homeTeamId,
      awayTeamId: row.awayTeamId,
      predicted,
      actual,
      correct,
      confidence: Math.max(p.pA, p.pD, p.pB),
      score: `${row.homeGoals}-${row.awayGoals}`,
    });
  }

  const hit = rows.filter((r) => r.correct);
  const miss = rows.filter((r) => !r.correct);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  return {
    provenance,
    metrics: summarizeMetrics(scored),
    coverage: { evaluated: rows.length, total: groupRows.length, missing },
    averageConfidenceCorrect: mean(hit.map((r) => r.confidence)),
    averageConfidenceMiss: mean(miss.map((r) => r.confidence)),
    rows,
  };
}

export interface AdvancementRow {
  matchNumber: number;
  stage: string;
  homeTeamId: string;
  awayTeamId: string;
  favourite: string;
  favouriteProbability: number;
  actualWinner: string;
  favouriteWon: boolean;
  score: string;
  decidedOnPenalties: boolean;
}

export interface AdvancementEvaluation {
  provenance: ForecastProvenance;
  coverage: { evaluated: number; total: number; missing: number[] };
  correct: number;
  accuracy: number;
  /** Binary Brier / log-loss taken from the favourite's perspective. */
  brier: number;
  logLoss: number;
  averageFavouriteProbability: number;
  averageConfidenceCorrect: number;
  averageConfidenceMiss: number;
  upsetCount: number;
  /** Favourite losses, most confident first - the model's costliest calls. */
  upsets: AdvancementRow[];
  /** Accuracy split by knockout round. */
  byStage: { stage: string; evaluated: number; correct: number; accuracy: number }[];
  rows: AdvancementRow[];
  observations: BinaryObservation[];
}

/**
 * Evaluate knockout ADVANCEMENT (never 90-minute W/D/L - see the module note). Only
 * forecasts carrying advancement probabilities are scored; anything else is reported as
 * missing coverage rather than silently skipped.
 */
export function evaluateKnockoutAdvancement(
  ledger: ForecastResultsLedger,
  forecasts: readonly MatchForecastLike[],
  provenance: ForecastProvenance,
): AdvancementEvaluation {
  const knockoutRows = ledger.results.filter(isKnockoutLedgerRow).sort((a, b) => a.matchNumber - b.matchNumber);
  const byNumber = new Map(forecasts.map((f) => [f.matchNumber, f]));
  const rows: AdvancementRow[] = [];
  const observations: BinaryObservation[] = [];
  const missing: number[] = [];

  for (const row of knockoutRows) {
    const f = byNumber.get(row.matchNumber);
    if (!f || typeof f.homeAdvance !== "number" || typeof f.awayAdvance !== "number") {
      missing.push(row.matchNumber);
      continue;
    }
    // Map the forecast's own orientation onto team ids before comparing.
    const homeAdvanceForLedgerHome = f.homeTeamId === row.homeTeamId ? f.homeAdvance : f.awayAdvance;
    const awayAdvanceForLedgerAway = f.homeTeamId === row.homeTeamId ? f.awayAdvance : f.homeAdvance;
    const favourite = homeAdvanceForLedgerHome >= awayAdvanceForLedgerAway ? row.homeTeamId : row.awayTeamId;
    const favouriteProbability = Math.max(homeAdvanceForLedgerHome, awayAdvanceForLedgerAway);
    const favouriteWon = favourite === row.winnerTeamId;
    rows.push({
      matchNumber: row.matchNumber,
      stage: row.stage,
      homeTeamId: row.homeTeamId,
      awayTeamId: row.awayTeamId,
      favourite,
      favouriteProbability,
      actualWinner: row.winnerTeamId,
      favouriteWon,
      score: `${row.homeGoals}-${row.awayGoals}`,
      decidedOnPenalties: row.penaltiesHome !== undefined,
    });
    observations.push({ probability: favouriteProbability, occurred: favouriteWon, label: `M${row.matchNumber}` });
  }

  const n = rows.length;
  const correct = rows.filter((r) => r.favouriteWon).length;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const stages = [...new Set(rows.map((r) => r.stage))];

  return {
    provenance,
    coverage: { evaluated: n, total: knockoutRows.length, missing },
    correct,
    accuracy: n ? correct / n : 0,
    brier: n ? mean(observations.map((o) => binaryBrier(o.probability, o.occurred))) : 0,
    logLoss: n ? mean(observations.map((o) => binaryLogLoss(o.probability, o.occurred))) : 0,
    averageFavouriteProbability: mean(rows.map((r) => r.favouriteProbability)),
    averageConfidenceCorrect: mean(rows.filter((r) => r.favouriteWon).map((r) => r.favouriteProbability)),
    averageConfidenceMiss: mean(rows.filter((r) => !r.favouriteWon).map((r) => r.favouriteProbability)),
    upsetCount: n - correct,
    upsets: rows.filter((r) => !r.favouriteWon).sort((a, b) => b.favouriteProbability - a.favouriteProbability),
    byStage: stages.map((stage) => {
      const inStage = rows.filter((r) => r.stage === stage);
      const c = inStage.filter((r) => r.favouriteWon).length;
      return { stage, evaluated: inStage.length, correct: c, accuracy: inStage.length ? c / inStage.length : 0 };
    }),
    rows,
    observations,
  };
}
