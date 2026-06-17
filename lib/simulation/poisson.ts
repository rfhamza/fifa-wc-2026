/**
 * Poisson scoreline engine
 * ------------------------
 * Treats each team's goals as independent Poisson variables parameterised by
 * their expected goals (lambda). From the joint distribution we derive exact
 * scoreline probabilities and the win/draw/loss split. This module is pure and
 * has no knowledge of teams — it only sees lambdas — so it can be swapped for a
 * bivariate/Dixon-Coles model later without touching callers.
 */
import type { ScorelineProbability } from "@/lib/types";

/** Poisson probability mass: P(X = k) for rate lambda. */
export function poissonPmf(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * lambda ** k) / factorial(k);
}

const FACTORIALS = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];
function factorial(n: number): number {
  const cached = FACTORIALS[n];
  if (cached !== undefined) return cached;
  let result = FACTORIALS[FACTORIALS.length - 1]!;
  for (let i = FACTORIALS.length; i <= n; i++) result *= i;
  return result;
}

export interface OutcomeProbabilities {
  homeWin: number;
  draw: number;
  awayWin: number;
}

/**
 * Full scoreline matrix as a flat, probability-sorted list.
 * Goal counts beyond `maxGoals` are folded into the final bucket so the
 * distribution sums to ~1.
 */
export function scorelineMatrix(
  lambdaHome: number,
  lambdaAway: number,
  maxGoals = 8,
): ScorelineProbability[] {
  const homePmf = tailAdjustedPmf(lambdaHome, maxGoals);
  const awayPmf = tailAdjustedPmf(lambdaAway, maxGoals);
  const out: ScorelineProbability[] = [];
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      out.push({
        homeGoals: h,
        awayGoals: a,
        probability: homePmf[h]! * awayPmf[a]!,
      });
    }
  }
  return out.sort((x, y) => y.probability - x.probability);
}

/** PMF over 0..maxGoals with the upper tail mass added to the last bucket. */
function tailAdjustedPmf(lambda: number, maxGoals: number): number[] {
  const pmf: number[] = [];
  let cumulative = 0;
  for (let k = 0; k < maxGoals; k++) {
    const p = poissonPmf(lambda, k);
    pmf.push(p);
    cumulative += p;
  }
  pmf.push(Math.max(0, 1 - cumulative)); // remaining mass at maxGoals
  return pmf;
}

/** Aggregate a scoreline matrix into win/draw/loss probabilities. */
export function outcomeProbabilities(
  matrix: ScorelineProbability[],
): OutcomeProbabilities {
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  for (const cell of matrix) {
    if (cell.homeGoals > cell.awayGoals) homeWin += cell.probability;
    else if (cell.homeGoals === cell.awayGoals) draw += cell.probability;
    else awayWin += cell.probability;
  }
  return { homeWin, draw, awayWin };
}

/** Top-N most likely scorelines (matrix is already sorted descending). */
export function topScorelines(
  matrix: ScorelineProbability[],
  n = 5,
): ScorelineProbability[] {
  return matrix.slice(0, n);
}
