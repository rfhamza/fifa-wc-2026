/**
 * Post-tournament retrospective (PR B) - binary calibration metrics.
 * ------------------------------------------------------------------
 * `lib/backtesting/metrics.ts` scores 3-class 90-minute W/D/L triples and is reused
 * verbatim for group matches. It has no notion of a BINARY event, which is what every
 * team-versus-stage question is ("did this team reach the semifinal?"), so this module
 * adds the binary equivalents and mirrors the existing `CalibrationBucket` shape so
 * reliability tables read identically across the report.
 *
 * PURE: arithmetic only. No I/O, no model, no simulation.
 */

/** One binary observation: a forecast probability and whether the event happened. */
export interface BinaryObservation {
  /** Predicted probability in [0,1]. */
  probability: number;
  /** Realised outcome. */
  occurred: boolean;
  /** Optional label, carried through for report tables (e.g. a team id). */
  label?: string;
}

/** Reliability bucket - same field names as `CalibrationBucket` in the backtesting layer. */
export interface BinaryReliabilityBucket {
  lower: number;
  upper: number;
  meanPredicted: number;
  empiricalRate: number;
  count: number;
  /** empiricalRate - meanPredicted. Positive = the model under-forecast this band. */
  gap: number;
}

export interface BinaryMetricSummary {
  n: number;
  brier: number;
  logLoss: number;
  /** Mean predicted probability across observations. */
  meanPredicted: number;
  /** Observed base rate. */
  baseRate: number;
}

function assertProbability(p: number): void {
  if (!Number.isFinite(p) || p < 0 || p > 1) {
    throw new Error(`binary calibration: probability must be within [0,1] (got ${p})`);
  }
}

/** Brier score for a single binary forecast: (p - y)^2, in [0,1]. Lower is better. */
export function binaryBrier(probability: number, occurred: boolean): number {
  assertProbability(probability);
  const y = occurred ? 1 : 0;
  return (probability - y) ** 2;
}

/** Negative log-likelihood of a single binary forecast, clamped away from +/-infinity. */
export function binaryLogLoss(probability: number, occurred: boolean, eps = 1e-15): number {
  assertProbability(probability);
  const p = Math.min(1 - eps, Math.max(eps, probability));
  return occurred ? -Math.log(p) : -Math.log(1 - p);
}

/** Mean Brier / log-loss plus the mean forecast and the realised base rate. */
export function summarizeBinary(observations: readonly BinaryObservation[]): BinaryMetricSummary {
  const n = observations.length;
  if (n === 0) return { n: 0, brier: 0, logLoss: 0, meanPredicted: 0, baseRate: 0 };
  let brier = 0;
  let ll = 0;
  let pred = 0;
  let hits = 0;
  for (const o of observations) {
    brier += binaryBrier(o.probability, o.occurred);
    ll += binaryLogLoss(o.probability, o.occurred);
    pred += o.probability;
    if (o.occurred) hits += 1;
  }
  return { n, brier: brier / n, logLoss: ll / n, meanPredicted: pred / n, baseRate: hits / n };
}

/**
 * Equal-width reliability bands over [0,1] (top band inclusive of 1). Empty bands are
 * retained so the table always shows the full 0-10 ... 90-100 ladder and a reader can see
 * where the model simply never forecast.
 */
export function binaryReliabilityBins(
  observations: readonly BinaryObservation[],
  binCount = 10,
): BinaryReliabilityBucket[] {
  if (!Number.isInteger(binCount) || binCount < 1) {
    throw new Error(`binaryReliabilityBins: binCount must be a positive integer (got ${binCount})`);
  }
  const sums = Array.from({ length: binCount }, () => ({ pred: 0, obs: 0, count: 0 }));
  for (const o of observations) {
    assertProbability(o.probability);
    const idx = Math.min(binCount - 1, Math.floor(o.probability * binCount));
    const b = sums[idx]!;
    b.pred += o.probability;
    b.obs += o.occurred ? 1 : 0;
    b.count += 1;
  }
  return sums.map((b, i) => {
    const meanPredicted = b.count ? b.pred / b.count : 0;
    const empiricalRate = b.count ? b.obs / b.count : 0;
    return {
      lower: i / binCount,
      upper: (i + 1) / binCount,
      meanPredicted,
      empiricalRate,
      count: b.count,
      gap: b.count ? empiricalRate - meanPredicted : 0,
    };
  });
}
