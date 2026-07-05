/**
 * Walk-forward candidate-driver evaluator (Stage 1B, backtesting-only).
 * --------------------------------------------------------------------
 * Day-bucket, leakage-safe replay of a historical pack that produces, for every
 * match, the baseline W/D/L triple AND the candidate triple at each swept weight.
 *
 * Leakage discipline (frozen by the pre-registration doc, Sections 6/8):
 *  - Matches are ordered by (date, matchId). A match `j` enters team T's history
 *    for predicting `m` only if it is T's own completed match with a STRICTLY
 *    earlier date. Same-day matches never leak into each other: within a day
 *    bucket every match is predicted from the history as of the prior day's close,
 *    and only AFTER the whole bucket is predicted are its results applied.
 *  - Expectations come from the BASELINE model (this driver at weight 0), so the
 *    per-match surprise `s` and the per-team history are weight-INDEPENDENT and are
 *    computed once, then reused across the weight sweep (recursive-contamination
 *    rule). Baseline features are frozen pre-tournament; only the signal updates.
 *
 * WEIGHT-0 PARITY: at weight 0 the candidate contribution is exactly 0, so
 * `net = round(baseSum + 0, 1) = round(baseSum, 1)` — identical to the net advantage
 * `computePredictionCore` derives internally. The weight-0 triple is therefore
 * bit-identical to the existing evaluator's per-match triple. This is the Stage-1B
 * acceptance proof (see tests/backtesting-walk-forward.test.ts).
 *
 * This module computes NO aggregated metrics and pins NO real historical numbers.
 */
import { round } from "@/lib/utils";
import { SCORELINE_CONFIG, type ModelWeights } from "@/lib/model/config";
import {
  computePredictionCore,
  expectedGoalsFromAdvantage,
  type FeatureStatusResolver,
} from "@/lib/model/prediction-core";
import { outcomeProbabilities, scorelineMatrix } from "@/lib/simulation/poisson";
import type { TeamFeatureSet } from "@/lib/types";
import { buildHistoricalFeatures } from "./feature-adapter";
import { ELO_FIFA_HOST_REGIONAL, variantWeights } from "./model-variants";
import type { Outcome, ProbTriple } from "./metrics";
import type { HistoricalMatchResult, HistoricalSourcePack, MatchStage } from "./types";
import {
  PERF_SWEEP_WEIGHTS,
  expectedPointsFromTriple,
  inTournamentContribution,
  perMatchSurprise,
  shrunkTournamentSignal,
  type BaselineExpectation,
  type OwnMatchOutcome,
} from "./in-tournament-performance";

/** Historical mode: every family uncapped/neutral, matching the evaluator. */
const historicalStatusResolver: FeatureStatusResolver = () => undefined;

export interface WeightedTriple {
  weight: number;
  triple: ProbTriple;
}

export interface WalkForwardMatchRow {
  tournamentYear: number;
  matchId: string;
  date: string;
  stage: MatchStage;
  /** Group matchday 1/2/3 (derived day-strict); null for knockout matches. */
  matchday: number | null;
  teamA: string;
  teamB: string;
  actual: Outcome;
  /** Baseline (weight-0) W/D/L triple; equals the weight-0 entry of `byWeight`. */
  baseline: ProbTriple;
  byWeight: WeightedTriple[];
  /** Shrunk in-tournament signal for each team, from history BEFORE this match. */
  signalA: number;
  signalB: number;
  /** History lengths (own completed prior matches) at prediction time. */
  nA: number;
  nB: number;
}

export interface WalkForwardResult {
  tournamentYear: number;
  rows: WalkForwardMatchRow[];
}

function byDateThenMatchId(a: HistoricalMatchResult, b: HistoricalMatchResult): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0;
}

/** Points (T-perspective) from a 90' outcome: win 3, draw 1, loss 0. */
function pointsFor(outcome: Outcome, isTeamA: boolean): number {
  if (outcome === "D") return 1;
  const teamAWon = outcome === "A";
  return teamAWon === isTeamA ? 3 : 0;
}

interface PendingMatch {
  row: WalkForwardMatchRow;
  expA: BaselineExpectation;
  expB: BaselineExpectation;
  match: HistoricalMatchResult;
}

/**
 * Replay one historical pack walk-forward. Pure: no I/O, no clock, no mutation of
 * the pack. `weights` defaults to the frozen pre-registered grid.
 */
export function runWalkForward(
  pack: HistoricalSourcePack,
  weights: readonly number[] = PERF_SWEEP_WEIGHTS,
): WalkForwardResult {
  const tournamentYear = pack.identity.tournamentYear;
  const features = buildHistoricalFeatures(pack);
  const baselineWeights: ModelWeights = variantWeights(ELO_FIFA_HOST_REGIONAL);
  const maxGoals = SCORELINE_CONFIG.maxGoalsPerSide;

  const feat = (teamId: string): TeamFeatureSet => {
    const f = features.get(teamId);
    if (!f) throw new Error(`walk-forward: no historical features for team "${teamId}"`);
    return f;
  };

  // Per-team history of prior-match surprises (weight-independent).
  const history = new Map<string, number[]>();
  const historyOf = (teamId: string): number[] => history.get(teamId) ?? [];

  const sorted = [...pack.results].sort(byDateThenMatchId);
  const rows: WalkForwardMatchRow[] = [];

  let i = 0;
  while (i < sorted.length) {
    // Collect the whole day bucket (consecutive equal dates in sorted order).
    const day = sorted[i]!.date;
    const bucket: HistoricalMatchResult[] = [];
    while (i < sorted.length && sorted[i]!.date === day) bucket.push(sorted[i++]!);

    // ---- Predict pass: history is frozen at the prior day's close. ----
    const pending: PendingMatch[] = [];
    for (const m of bucket) {
      const a = feat(m.teamA);
      const b = feat(m.teamB);
      const core = computePredictionCore(a, b, {
        weights: baselineWeights,
        statusResolver: historicalStatusResolver,
      });
      const baseSum = core.drivers.reduce((sum, d) => sum + d.contribution, 0);

      const expA: BaselineExpectation = {
        expectedPoints: expectedPointsFromTriple(core.outcome.homeWin, core.outcome.draw),
        expectedMargin: core.expectedGoals.home - core.expectedGoals.away,
      };
      const expB: BaselineExpectation = {
        expectedPoints: expectedPointsFromTriple(core.outcome.awayWin, core.outcome.draw),
        expectedMargin: core.expectedGoals.away - core.expectedGoals.home,
      };

      const priorA = historyOf(m.teamA);
      const priorB = historyOf(m.teamB);
      const signalA = shrunkTournamentSignal(priorA);
      const signalB = shrunkTournamentSignal(priorB);

      const byWeight: WeightedTriple[] = weights.map((w) => {
        const contribution = inTournamentContribution(signalA, signalB, w);
        const net = round(baseSum + contribution, 1);
        const lambdas = expectedGoalsFromAdvantage(net);
        const outcome = outcomeProbabilities(scorelineMatrix(lambdas.home, lambdas.away, maxGoals));
        return { weight: w, triple: { pA: outcome.homeWin, pD: outcome.draw, pB: outcome.awayWin } };
      });
      const zero = byWeight.find((wt) => wt.weight === 0);

      if (!m.resultAt90) {
        throw new Error(`walk-forward: match ${m.matchId} has no resultAt90 (90' scoring target)`);
      }
      const actual: Outcome = m.resultAt90;

      // Group matchday derived day-strict: prior own group matches + 1. Knockout -> null.
      const matchday = m.stage === "group" ? priorA.length + 1 : null;

      const row: WalkForwardMatchRow = {
        tournamentYear,
        matchId: m.matchId,
        date: m.date,
        stage: m.stage,
        matchday,
        teamA: m.teamA,
        teamB: m.teamB,
        actual,
        baseline: zero ? zero.triple : byWeight[0]!.triple,
        byWeight,
        signalA,
        signalB,
        nA: priorA.length,
        nB: priorB.length,
      };
      pending.push({ row, expA, expB, match: m });
    }

    // ---- Apply pass: only now do this bucket's results enter the histories. ----
    for (const { expA, expB, match: m } of pending) {
      const actual = m.resultAt90!;
      const marginA = m.goalsA - m.goalsB;
      const sA = perMatchSurprise(
        { actualPoints: pointsFor(actual, true), actualMargin: marginA } satisfies OwnMatchOutcome,
        expA,
      );
      const sB = perMatchSurprise(
        { actualPoints: pointsFor(actual, false), actualMargin: -marginA } satisfies OwnMatchOutcome,
        expB,
      );
      const histA = history.get(m.teamA) ?? [];
      histA.push(sA);
      history.set(m.teamA, histA);
      const histB = history.get(m.teamB) ?? [];
      histB.push(sB);
      history.set(m.teamB, histB);
    }

    for (const p of pending) rows.push(p.row);
  }

  return { tournamentYear, rows };
}
