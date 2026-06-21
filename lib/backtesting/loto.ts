/**
 * Phase 1.18C-8 - Leave-One-Tournament-Out (LOTO) diagnostics (backtesting layer).
 * -------------------------------------------------------------------------------
 * Pure, deterministic, DESCRIPTIVE validation view over the existing per-tournament
 * diagnostics. For each tournament it "holds out" that tournament and compares its
 * metrics against an equal-weight MACRO-AVERAGE of the other three ("reference set").
 *
 * It FITS NOTHING: no calibration, no tuning, no weights, no temperature, no
 * parameters. Because nothing is fit, each fold's held-out metric is exactly the
 * already-pinned per-tournament value; the NEW information is the reference
 * macro-average, the delta (held-out minus reference), and cross-fold stability. The
 * reference set is a descriptive comparator, NOT a training set.
 *
 * Pack-agnostic: callers pass the historical packs (the four primary packs in
 * tests/docs). Reuses `consolidateDiagnostics` (which wraps the core-backed
 * `evaluateLadder`) so there is no duplicated metric math. ISOLATED: imports only
 * existing backtesting modules + types; never `data/model-inputs` / `lib/model/predict`
 * / `lib/model/features` / any 2026 or app path.
 */
import type { HistoricalSourcePack } from "./types";
import {
  BASELINE_LADDER,
  ELO_FIFA,
  ELO_FIFA_HOST_REGIONAL,
  type ModelVariant,
} from "./model-variants";
import {
  consolidateDiagnostics,
  type DiagnosticMetrics,
  type MacroAverageMetrics,
} from "./consolidate";
import type { StageMode } from "./match-evaluator";

/** Round to 6 decimals (matches the per-tournament + consolidation pinned precision). */
const round6 = (x: number): number => Math.round(x * 1e6) / 1e6;

/** Probabilistic metrics where LOWER is better (used for best-variant counting). */
export const LOWER_IS_BETTER_METRICS = ["rps", "logLoss", "brier"] as const;
export type LowerIsBetterMetric = (typeof LOWER_IS_BETTER_METRICS)[number];

/** Held-out minus reference-macro-average, per metric (6 dp). */
export interface LotoDelta {
  rps: number;
  logLoss: number;
  brier: number;
  accuracy: number;
}

/** One variant within one fold: held-out vs reference macro-average + their delta. */
export interface LotoVariantFold {
  heldOut: DiagnosticMetrics;
  referenceMacroAverage: MacroAverageMetrics;
  delta: LotoDelta;
}

/** One fold: a held-out tournament evaluated against the other three. */
export interface LotoFold {
  heldOutYear: number;
  /** ascending; always the other tournaments, excluding heldOutYear. */
  referenceYears: number[];
  mode: StageMode;
  /** variant id -> held-out / reference / delta. */
  byVariant: Record<string, LotoVariantFold>;
}

/** Min/max of a metric across the folds. */
export interface MetricRange {
  min: number;
  max: number;
}

/** Cross-fold stability of a variant's HELD-OUT metrics (descriptive). */
export interface LotoStability {
  /** mean of the held-out values across folds (equals the all-tournaments macro-average). */
  mean: LotoDelta;
  /** population standard deviation across folds. */
  stdDev: LotoDelta;
  /** min/max across folds, per metric. */
  range: { rps: MetricRange; logLoss: MetricRange; brier: MetricRange; accuracy: MetricRange };
}

/** Elo+FIFA+host/regional vs Elo+FIFA on a single held-out tournament (descriptive). */
export interface LotoHostRegionalComparison {
  heldOutYear: number;
  /** (host/regional variant) minus (Elo+FIFA variant) on the held-out tournament, 6 dp. */
  rpsDelta: number;
  logLossDelta: number;
  brierDelta: number;
  /** true when host/regional has the LOWER (better) held-out RPS. */
  improves: boolean;
}

export interface LotoDiagnostics {
  mode: StageMode;
  /** ordered ascending by heldOutYear. */
  folds: LotoFold[];
  /** variant id -> cross-fold held-out stability. */
  summaryByVariant: Record<string, LotoStability>;
  /**
   * For each lower-is-better metric, variant id -> number of folds in which that
   * variant has the best (lowest) held-out value. Deterministic tie-break by ladder
   * order. Accuracy is intentionally omitted (higher-is-better, descriptive only).
   */
  bestVariantCountByMetric: {
    rps: Record<string, number>;
    logLoss: Record<string, number>;
    brier: Record<string, number>;
  };
  /** host/regional vs Elo+FIFA per held-out tournament (empty if either variant absent). */
  hostRegionalVsEloFifaByYear: LotoHostRegionalComparison[];
}

const METRIC_KEYS = ["rps", "logLoss", "brier", "accuracy"] as const;

/** Population standard deviation, rounded to 6 dp. */
function populationStdDev(xs: number[]): number {
  const n = xs.length;
  if (n === 0) return 0;
  const mean = xs.reduce((s, x) => s + x, 0) / n;
  const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
  return round6(Math.sqrt(variance));
}

/**
 * Compute the descriptive LOTO diagnostics over the given packs for one stage mode.
 * Pure + deterministic. Equal-weight macro-average for reference sets; no pooled
 * micro-average; no fitting/tuning/calibration.
 */
export function computeLotoDiagnostics(
  packs: HistoricalSourcePack[],
  mode: StageMode,
  ladder: ModelVariant[] = BASELINE_LADDER,
): LotoDiagnostics {
  const ordered = [...packs].sort(
    (a, b) => a.identity.tournamentYear - b.identity.tournamentYear,
  );

  const folds: LotoFold[] = ordered.map((heldOutPack) => {
    const heldOutYear = heldOutPack.identity.tournamentYear;
    const referencePacks = ordered.filter(
      (p) => p.identity.tournamentYear !== heldOutYear,
    );
    const referenceYears = referencePacks.map((p) => p.identity.tournamentYear);

    const heldOutByVariant =
      consolidateDiagnostics([heldOutPack], mode, ladder).tournaments[0]!.byVariant;
    const referenceMacro =
      consolidateDiagnostics(referencePacks, mode, ladder).macroAverageByVariant;

    const byVariant: Record<string, LotoVariantFold> = {};
    for (const variant of ladder) {
      const heldOut = heldOutByVariant[variant.id]!;
      const referenceMacroAverage = referenceMacro[variant.id]!;
      byVariant[variant.id] = {
        heldOut,
        referenceMacroAverage,
        delta: {
          rps: round6(heldOut.rps - referenceMacroAverage.rps),
          logLoss: round6(heldOut.logLoss - referenceMacroAverage.logLoss),
          brier: round6(heldOut.brier - referenceMacroAverage.brier),
          accuracy: round6(heldOut.accuracy - referenceMacroAverage.accuracy),
        },
      };
    }
    return { heldOutYear, referenceYears, mode, byVariant };
  });

  // Cross-fold stability of each variant's held-out metrics.
  const summaryByVariant: Record<string, LotoStability> = {};
  for (const variant of ladder) {
    const series: Record<(typeof METRIC_KEYS)[number], number[]> = {
      rps: [],
      logLoss: [],
      brier: [],
      accuracy: [],
    };
    for (const fold of folds) {
      const ho = fold.byVariant[variant.id]!.heldOut;
      series.rps.push(ho.rps);
      series.logLoss.push(ho.logLoss);
      series.brier.push(ho.brier);
      series.accuracy.push(ho.accuracy);
    }
    const mean = (xs: number[]) => round6(xs.reduce((s, x) => s + x, 0) / xs.length);
    const range = (xs: number[]): MetricRange => ({
      min: round6(Math.min(...xs)),
      max: round6(Math.max(...xs)),
    });
    summaryByVariant[variant.id] = {
      mean: {
        rps: mean(series.rps),
        logLoss: mean(series.logLoss),
        brier: mean(series.brier),
        accuracy: mean(series.accuracy),
      },
      stdDev: {
        rps: populationStdDev(series.rps),
        logLoss: populationStdDev(series.logLoss),
        brier: populationStdDev(series.brier),
        accuracy: populationStdDev(series.accuracy),
      },
      range: {
        rps: range(series.rps),
        logLoss: range(series.logLoss),
        brier: range(series.brier),
        accuracy: range(series.accuracy),
      },
    };
  }

  // Best-variant counts per lower-is-better metric (deterministic tie-break by ladder order).
  const bestVariantCountByMetric = {
    rps: {} as Record<string, number>,
    logLoss: {} as Record<string, number>,
    brier: {} as Record<string, number>,
  };
  for (const metric of LOWER_IS_BETTER_METRICS) {
    for (const variant of ladder) bestVariantCountByMetric[metric][variant.id] = 0;
    for (const fold of folds) {
      let bestId = ladder[0]!.id;
      let bestVal = fold.byVariant[bestId]!.heldOut[metric];
      for (const variant of ladder) {
        const val = fold.byVariant[variant.id]!.heldOut[metric];
        if (val < bestVal) {
          bestVal = val;
          bestId = variant.id;
        }
      }
      bestVariantCountByMetric[metric][bestId]! += 1;
    }
  }

  // host/regional vs Elo+FIFA per held-out tournament (only if both variants are in the ladder).
  const hasEloFifa = ladder.some((v) => v.id === ELO_FIFA.id);
  const hasHostRegional = ladder.some((v) => v.id === ELO_FIFA_HOST_REGIONAL.id);
  const hostRegionalVsEloFifaByYear: LotoHostRegionalComparison[] =
    hasEloFifa && hasHostRegional
      ? folds.map((fold) => {
          const base = fold.byVariant[ELO_FIFA.id]!.heldOut;
          const hr = fold.byVariant[ELO_FIFA_HOST_REGIONAL.id]!.heldOut;
          const rpsDelta = round6(hr.rps - base.rps);
          return {
            heldOutYear: fold.heldOutYear,
            rpsDelta,
            logLossDelta: round6(hr.logLoss - base.logLoss),
            brierDelta: round6(hr.brier - base.brier),
            improves: rpsDelta < 0,
          };
        })
      : [];

  return { mode, folds, summaryByVariant, bestVariantCountByMetric, hostRegionalVsEloFifaByYear };
}
