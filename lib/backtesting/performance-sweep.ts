/**
 * Candidate in-tournament-performance sweep — SHAPE + subset partitioning (Stage 1B).
 * ----------------------------------------------------------------------------------
 * Turns walk-forward rows (from `walk-forward.ts`) into per-subset, per-weight metric
 * summaries by REUSING the existing `metrics.ts` helpers unchanged. It partitions the
 * pre-registered reporting subsets and macro-averages (equal weight per tournament)
 * across packs. Only the primary subset + guardrails gate activation (see
 * `activation-rule.ts`); every subset is reported.
 *
 * This is a CANDIDATE diagnostic: governance flags below are all `false` except
 * `candidateDriverDiagnostic`/`supplementaryOnly`. Field names are neutral
 * (`byWeight`, `deltaVsZero`) and never imply a selection/optimisation.
 *
 * Stage 1B commits NO real historical sweep numbers: this module is exercised with
 * SYNTHETIC walk-forward rows only. The real run is Stage 1C.
 */
import {
  calibrationBuckets,
  summarizeMetrics,
  type CalibrationBucket,
  type MetricSummary,
  type ScoredMatch,
} from "./metrics";
import type { WalkForwardMatchRow, WalkForwardResult } from "./walk-forward";

/** Governance flags carried on every candidate-driver diagnostic output. */
export const PERFORMANCE_SWEEP_GOVERNANCE_FLAGS = {
  candidateDriverDiagnostic: true,
  supplementaryOnly: true,
  headlineEligible: false,
  calibrationEligible: false,
  tuningEligible: false,
  productionEligible: false,
} as const;
export type PerformanceGovernanceFlags = typeof PERFORMANCE_SWEEP_GOVERNANCE_FLAGS;

/** Fixed (gating + reported) subset keys. Per-stage subsets are added dynamically. */
export const PERFORMANCE_SUBSET_KEYS = [
  "groupMd2Md3", // PRIMARY decision subset
  "allPostMd1", // reported (broadest active view)
  "knockoutOnly", // reported + guardrail only
  "groupAll48", // continuity
  "all64", // continuity
] as const;
export type PerformanceSubsetKey = (typeof PERFORMANCE_SUBSET_KEYS)[number];

type SubsetPredicate = (row: WalkForwardMatchRow) => boolean;

const FIXED_SUBSETS: Record<PerformanceSubsetKey, SubsetPredicate> = {
  groupMd2Md3: (r) => r.stage === "group" && (r.matchday ?? 0) >= 2,
  allPostMd1: (r) => r.nA >= 1 || r.nB >= 1,
  knockoutOnly: (r) => r.stage !== "group",
  groupAll48: (r) => r.stage === "group",
  all64: () => true,
};

/** Diagnostic per-stage key: group matchdays split out, knockout by stage. */
export function perStageKey(row: WalkForwardMatchRow): string {
  return row.stage === "group" ? `group-md${row.matchday ?? 0}` : row.stage;
}

export interface WeightMetrics extends MetricSummary {
  weight: number;
}

export interface WeightDelta {
  weight: number;
  rps: number;
  logLoss: number;
  brier: number;
  accuracy: number;
}

export interface WeightCalibration {
  weight: number;
  calibration: CalibrationBucket[];
}

export interface PerTournamentSubset {
  tournamentYear: number;
  byWeight: WeightMetrics[];
}

export interface SubsetSweep {
  subset: string;
  /** Macro-averaged (equal weight per tournament) metric per weight. */
  byWeight: WeightMetrics[];
  /** macro metric(weight) - macro metric(0), per weight. */
  deltaVsZero: WeightDelta[];
  /** Pooled one-vs-rest calibration per weight (all packs pooled). */
  calibrationByWeight: WeightCalibration[];
  /** Per-tournament metrics per weight (for fold-consistency diagnostics). */
  perTournament: PerTournamentSubset[];
}

export interface PerformanceSweepResult {
  governance: PerformanceGovernanceFlags;
  weights: number[];
  subsets: Record<string, SubsetSweep>;
}

function tripleAt(row: WalkForwardMatchRow, weight: number): ScoredMatch {
  const entry = row.byWeight.find((w) => w.weight === weight);
  if (!entry) throw new Error(`performance-sweep: row ${row.matchId} has no weight ${weight}`);
  return { p: entry.triple, actual: row.actual };
}

function scored(rows: WalkForwardMatchRow[], weight: number): ScoredMatch[] {
  return rows.map((r) => tripleAt(r, weight));
}

function macroAverage(perTournament: MetricSummary[]): MetricSummary {
  const folds = perTournament.filter((m) => m.n > 0);
  if (folds.length === 0) return { n: 0, rps: 0, logLoss: 0, brier: 0, accuracy: 0 };
  const mean = (pick: (m: MetricSummary) => number) =>
    folds.reduce((s, m) => s + pick(m), 0) / folds.length;
  return {
    n: perTournament.reduce((s, m) => s + m.n, 0),
    rps: mean((m) => m.rps),
    logLoss: mean((m) => m.logLoss),
    brier: mean((m) => m.brier),
    accuracy: mean((m) => m.accuracy),
  };
}

function buildSubsetSweep(
  subset: string,
  packs: WalkForwardResult[],
  predicate: SubsetPredicate,
  weights: number[],
): SubsetSweep {
  const perTournament: PerTournamentSubset[] = packs.map((pack) => ({
    tournamentYear: pack.tournamentYear,
    byWeight: weights.map((w) => ({
      weight: w,
      ...summarizeMetrics(scored(pack.rows.filter(predicate), w)),
    })),
  }));

  const byWeight: WeightMetrics[] = weights.map((w) => ({
    weight: w,
    ...macroAverage(perTournament.map((t) => t.byWeight.find((b) => b.weight === w)!)),
  }));

  const zero = byWeight.find((b) => b.weight === 0)!;
  const deltaVsZero: WeightDelta[] = byWeight.map((b) => ({
    weight: b.weight,
    rps: b.rps - zero.rps,
    logLoss: b.logLoss - zero.logLoss,
    brier: b.brier - zero.brier,
    accuracy: b.accuracy - zero.accuracy,
  }));

  const calibrationByWeight: WeightCalibration[] = weights.map((w) => ({
    weight: w,
    calibration: calibrationBuckets(packs.flatMap((pack) => scored(pack.rows.filter(predicate), w))),
  }));

  return { subset, byWeight, deltaVsZero, calibrationByWeight, perTournament };
}

/**
 * Build the full candidate sweep from per-pack walk-forward results. Pure. Reuses
 * `metrics.ts` unchanged. Macro-average is equal weight per tournament.
 */
export function summarizePerformanceSweep(packs: WalkForwardResult[]): PerformanceSweepResult {
  const weightSet = new Set<number>();
  for (const pack of packs) {
    for (const row of pack.rows) for (const w of row.byWeight) weightSet.add(w.weight);
  }
  const weights = [...weightSet].sort((a, b) => a - b);

  const subsets: Record<string, SubsetSweep> = {};
  for (const key of PERFORMANCE_SUBSET_KEYS) {
    subsets[key] = buildSubsetSweep(key, packs, FIXED_SUBSETS[key], weights);
  }

  // Per-stage diagnostic subsets (dynamic keys), reported only.
  const stageKeys = new Set<string>();
  for (const pack of packs) for (const row of pack.rows) stageKeys.add(perStageKey(row));
  for (const stageKey of [...stageKeys].sort()) {
    subsets[`stage:${stageKey}`] = buildSubsetSweep(
      `stage:${stageKey}`,
      packs,
      (r) => perStageKey(r) === stageKey,
      weights,
    );
  }

  return { governance: PERFORMANCE_SWEEP_GOVERNANCE_FLAGS, weights, subsets };
}
