/**
 * In-tournament performance driver — PURE signal math (Stage 1B, backtesting-only).
 * --------------------------------------------------------------------------------
 * Implements the frozen Formula C from the pre-registration doc
 * `docs/BACKTESTING_IN_TOURNAMENT_PERFORMANCE.md` (Stage 1A). A team's own completed
 * matches inside a tournament produce a per-match "surprise" against the BASELINE
 * model's pre-match expectation; surprises are shrunk toward zero and turned into a
 * capped, pairwise Elo-equivalent contribution.
 *
 * This module is a CANDIDATE diagnostic. It is not implemented in the production
 * model, carries no weight there, and computes no real historical metrics. It is
 * pure: no I/O, no clock, no mutation, no historical/production-data imports.
 *
 * Constants are FROZEN by the pre-registration doc: only the weight is swept; the
 * blend (alpha), the shrinkage pseudo-count (k), the margin cap and the contribution
 * cap are fixed.
 */
import { clamp } from "@/lib/utils";

/** Shrinkage pseudo-count (prior mass at 0), in units of matches. Fixed. */
export const PERF_K = 2;
/** Per-side goal-margin cap inside the per-match surprise. Fixed. */
export const PERF_MARGIN_CAP = 2;
/** Pairwise contribution cap, Elo-equivalent points. Fixed. */
export const PERF_CONTRIBUTION_CAP = 25;
/** Points/margin blend inside the per-match surprise. Fixed (not swept). */
export const PERF_ALPHA = 0.5;
/** The pre-registered candidate weight grid, Elo-equivalent points. */
export const PERF_SWEEP_WEIGHTS = [0, 5, 10, 15, 20, 25] as const;

/** The baseline model's pre-match expectation for one team in one match. */
export interface BaselineExpectation {
  /** 3 * pWin + pDraw, in (0, 3). */
  expectedPoints: number;
  /** lambdaTeam - lambdaOpponent (real Poisson lambdas; respects the 0.18 floor). */
  expectedMargin: number;
}

/** A team's own realised 90-minute outcome in one match. */
export interface OwnMatchOutcome {
  /** 3 for a 90' win, 1 for a 90' draw, 0 for a 90' loss. */
  actualPoints: number;
  /** 90' goals for minus goals against, from this team's perspective. */
  actualMargin: number;
}

/** Clamp a goal margin to +/- PERF_MARGIN_CAP (the blowout bound). */
export function clampPerformanceMargin(margin: number): number {
  return clamp(margin, -PERF_MARGIN_CAP, PERF_MARGIN_CAP);
}

/** Baseline expected points from a pre-match W/D/L triple (team in the home slot). */
export function expectedPointsFromTriple(pWin: number, pDraw: number): number {
  return 3 * pWin + pDraw;
}

/**
 * Per-match surprise `s` in [-1, +1] (provable; no clamp applied): the blend of the
 * points residual (normalised by 3) and the capped margin residual (normalised by 4).
 */
export function perMatchSurprise(
  actual: OwnMatchOutcome,
  expectation: BaselineExpectation,
): number {
  const pointsResidual = actual.actualPoints - expectation.expectedPoints; // [-3, +3]
  const marginResidual =
    clampPerformanceMargin(actual.actualMargin) -
    clampPerformanceMargin(expectation.expectedMargin); // [-4, +4]
  return PERF_ALPHA * (pointsResidual / 3) + (1 - PERF_ALPHA) * (marginResidual / 4);
}

/**
 * Small-sample-shrunk tournament signal `S = sum(s_i) / (n + k)`. An empty history
 * (n = 0) yields exactly 0 — the matchday-1 zero-state. `S` is always in (-1, +1).
 */
export function shrunkTournamentSignal(surprises: readonly number[]): number {
  let sum = 0;
  for (const s of surprises) sum += s;
  return sum / (surprises.length + PERF_K);
}

/**
 * The pairwise driver contribution (Elo-equivalent points), capped at
 * +/- PERF_CONTRIBUTION_CAP. `weight` is the swept parameter; at weight 0 this is
 * exactly 0 (the weight-0 parity anchor).
 */
export function inTournamentContribution(
  signalA: number,
  signalB: number,
  weight: number,
): number {
  return clamp(weight * (signalA - signalB), -PERF_CONTRIBUTION_CAP, PERF_CONTRIBUTION_CAP);
}
