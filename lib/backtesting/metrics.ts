/**
 * Phase 1.18C-1 - pure match-level backtesting metrics.
 * ----------------------------------------------------
 * Stateless scoring for 90-minute W/D/L probability triples. Part of the ISOLATED
 * backtesting layer: imports nothing from production / 2026 data, changes no
 * probabilities, and is used only by the historical match evaluator + its tests.
 *
 * Class ordering is FIXED and ordinal: [pA (teamA win), pD (draw), pB (teamB win)].
 * Actual outcomes use the snapshot's `resultAt90` encoding ("A" | "D" | "B").
 */

/** 90-minute outcome from team A's perspective (mirrors the snapshot contract). */
export type Outcome = "A" | "D" | "B";

/** Predicted probability triple, ordered [teamA win, draw, teamB win]. */
export interface ProbTriple {
  pA: number;
  pD: number;
  pB: number;
}

/** Tolerance for the "probabilities sum to 1" invariant. */
export const PROB_SUM_TOLERANCE = 1e-9;

/** One-hot the actual outcome into [oA, oD, oB]. */
function oneHot(actual: Outcome): [number, number, number] {
  return [actual === "A" ? 1 : 0, actual === "D" ? 1 : 0, actual === "B" ? 1 : 0];
}

/**
 * Assert a probability triple is well-formed: each component in [0, 1] and the
 * three summing to 1 within PROB_SUM_TOLERANCE. Throws on violation so a sign or
 * normalisation bug surfaces loudly instead of silently corrupting metrics.
 */
export function validateProbabilityTriple(p: ProbTriple): void {
  for (const [name, v] of [["pA", p.pA], ["pD", p.pD], ["pB", p.pB]] as const) {
    if (!Number.isFinite(v)) throw new Error(`probability ${name} is not finite: ${v}`);
    if (v < 0 || v > 1) throw new Error(`probability ${name} out of [0,1]: ${v}`);
  }
  const sum = p.pA + p.pD + p.pB;
  if (Math.abs(sum - 1) > PROB_SUM_TOLERANCE) {
    throw new Error(`probabilities must sum to 1 (got ${sum})`);
  }
}

/**
 * Ranked Probability Score for an ordinal 3-class outcome (A < D < B).
 * RPS = 1/(r-1) * sum_{i=1}^{r-1} (CDF_pred_i - CDF_actual_i)^2, r = 3.
 * Lower is better; a perfect confident prediction scores 0.
 */
export function rankedProbabilityScore(p: ProbTriple, actual: Outcome): number {
  const [oA, oD] = oneHot(actual);
  const c1 = p.pA - oA;
  const c2 = p.pA + p.pD - (oA + oD);
  return 0.5 * (c1 * c1 + c2 * c2);
}

/**
 * Multiclass log loss for one match: -ln(p_actual), with p_actual clamped to
 * [eps, 1] so a zero-probability realised outcome cannot produce -Infinity.
 */
export function logLoss(p: ProbTriple, actual: Outcome, eps = 1e-15): number {
  const pActual = actual === "A" ? p.pA : actual === "D" ? p.pD : p.pB;
  const clamped = Math.min(1, Math.max(eps, pActual));
  return -Math.log(clamped);
}

/** Multiclass Brier score for one match: sum_i (p_i - o_i)^2 (range 0..2). */
export function brierScore(p: ProbTriple, actual: Outcome): number {
  const [oA, oD, oB] = oneHot(actual);
  return (p.pA - oA) ** 2 + (p.pD - oD) ** 2 + (p.pB - oB) ** 2;
}

/** Argmax class with a deterministic tie-break in fixed order A, then D, then B. */
export function predictedClass(p: ProbTriple): Outcome {
  if (p.pA >= p.pD && p.pA >= p.pB) return "A";
  if (p.pD >= p.pB) return "D";
  return "B";
}

/** Whether the argmax class matches the actual outcome (descriptive only). */
export function isCorrect(p: ProbTriple, actual: Outcome): boolean {
  return predictedClass(p) === actual;
}

export interface ScoredMatch {
  p: ProbTriple;
  actual: Outcome;
}

export interface MetricSummary {
  n: number;
  rps: number;
  logLoss: number;
  brier: number;
  accuracy: number;
}

/** Mean RPS / log loss / Brier and argmax accuracy over a set of scored matches. */
export function summarizeMetrics(matches: ScoredMatch[]): MetricSummary {
  const n = matches.length;
  if (n === 0) return { n: 0, rps: 0, logLoss: 0, brier: 0, accuracy: 0 };
  let rps = 0;
  let ll = 0;
  let brier = 0;
  let correct = 0;
  for (const m of matches) {
    validateProbabilityTriple(m.p);
    rps += rankedProbabilityScore(m.p, m.actual);
    ll += logLoss(m.p, m.actual);
    brier += brierScore(m.p, m.actual);
    if (isCorrect(m.p, m.actual)) correct++;
  }
  return { n, rps: rps / n, logLoss: ll / n, brier: brier / n, accuracy: correct / n };
}

export interface CalibrationBucket {
  lower: number;
  upper: number;
  meanPredicted: number;
  empiricalRate: number;
  count: number;
}

/**
 * One-vs-rest reliability buckets. Pools all (predicted probability, realised
 * indicator) pairs across the three classes into `binCount` equal-width bins over
 * [0, 1] (top bin inclusive of 1), reporting mean predicted vs empirical frequency.
 */
export function calibrationBuckets(
  matches: ScoredMatch[],
  binCount = 10,
): CalibrationBucket[] {
  const sums = Array.from({ length: binCount }, () => ({ pred: 0, obs: 0, count: 0 }));
  const binOf = (prob: number) => Math.min(binCount - 1, Math.floor(prob * binCount));
  for (const m of matches) {
    const [oA, oD, oB] = oneHot(m.actual);
    const pairs: [number, number][] = [[m.p.pA, oA], [m.p.pD, oD], [m.p.pB, oB]];
    for (const [prob, obs] of pairs) {
      const b = sums[binOf(prob)]!;
      b.pred += prob;
      b.obs += obs;
      b.count++;
    }
  }
  return sums.map((b, i) => ({
    lower: i / binCount,
    upper: (i + 1) / binCount,
    meanPredicted: b.count ? b.pred / b.count : 0,
    empiricalRate: b.count ? b.obs / b.count : 0,
    count: b.count,
  }));
}
