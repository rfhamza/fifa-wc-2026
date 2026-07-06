/**
 * Monte Carlo stability diagnostic (DIAGNOSTIC ONLY - changes no production output).
 * ---------------------------------------------------------------------------------
 * Pure helpers that drive the production tournament simulator
 * (`runTournamentSimulation`) at different iteration counts / seeds and quantify the
 * Monte Carlo sampling noise in the published stage probabilities. It computes and
 * RETURNS plain numbers; it never writes files, reads env/fs/network, mutates any
 * config, or regenerates any committed forecast artifact.
 *
 * Two distinct measurements (kept separate on purpose):
 *  - `compareIterationCounts` = SAME seed, low vs high iterations: "what would change
 *    if this exact committed run were regenerated at more iterations".
 *  - `estimateStageStandardError` = one iteration count across MANY seeds: "estimated
 *    run-to-run Monte Carlo noise" (the empirical standard error of a single run).
 *
 * Field names stay neutral and descriptive. This module proposes no adoption and
 * changes no production probability.
 */
import { runTournamentSimulation } from "./tournament";
import { computeProbabilityDeltas } from "@/lib/model/snapshot-delta";
import type { LockedResult } from "./locked-results";
import type { KnockoutLockedResult } from "./locked-knockout-results";
import type { SimulationSnapshot } from "@/lib/types";

/** 6-dp rounding (matches the diagnostic-layer pinned precision). */
export const round6 = (x: number): number => Math.round(x * 1e6) / 1e6;

/** All eight published per-team stage probabilities (title + every reach-stage). */
export const STABILITY_STAGE_KEYS = [
  "winner",
  "final",
  "semiFinal",
  "quarterFinal",
  "roundOf16",
  "roundOf32",
  "qualifyTop2",
  "qualifyThird",
] as const;
export type StabilityStageKey = (typeof STABILITY_STAGE_KEYS)[number];

/** A committed checkpoint's exact simulator inputs (locked results, provided by the caller). */
export interface CheckpointInput {
  /** Human label, e.g. "baseline", "M24". */
  label: string;
  lockedResults: LockedResult[];
  lockedKnockoutResults: KnockoutLockedResult[];
}

function runSnapshot(
  checkpoint: CheckpointInput,
  seed: number,
  iterations: number,
): SimulationSnapshot {
  return runTournamentSimulation({
    seed,
    iterations,
    lockedResults: checkpoint.lockedResults,
    lockedKnockoutResults: checkpoint.lockedKnockoutResults,
  });
}

// ---------------------------------------------------------------------------
// Scalar summary of a set of absolute deltas (all values in PERCENTAGE POINTS).
// ---------------------------------------------------------------------------
export interface AbsDeltaSummary {
  count: number;
  maxPP: number;
  medianPP: number;
  meanPP: number;
  /** Number of teams whose absolute movement exceeds each threshold (pp). */
  buckets: { gt01: number; gt025: number; gt05: number; gt10: number };
}

export function summarizeAbsDeltas(absDeltasPP: readonly number[]): AbsDeltaSummary {
  const n = absDeltasPP.length;
  if (n === 0) {
    return { count: 0, maxPP: 0, medianPP: 0, meanPP: 0, buckets: { gt01: 0, gt025: 0, gt05: 0, gt10: 0 } };
  }
  const sorted = [...absDeltasPP].sort((a, b) => a - b);
  const median =
    n % 2 === 1 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
  const mean = sorted.reduce((s, x) => s + x, 0) / n;
  const count = (t: number) => absDeltasPP.filter((x) => x > t).length;
  return {
    count: n,
    maxPP: round6(sorted[n - 1]!),
    medianPP: round6(median),
    meanPP: round6(mean),
    buckets: { gt01: count(0.1), gt025: count(0.25), gt05: count(0.5), gt10: count(1.0) },
  };
}

// ---------------------------------------------------------------------------
// Measurement A: same seed, low vs high iterations.
// ---------------------------------------------------------------------------
export interface StageMover {
  teamId: string;
  lowPct: number; // probability at the LOW iteration count (pp)
  highPct: number; // probability at the HIGH iteration count (pp)
  deltaPP: number; // signed high - low (pp)
}
export interface StageComparison {
  stage: StabilityStageKey;
  summary: AbsDeltaSummary;
  worstMovers: StageMover[];
}
export interface RankChange {
  teamId: string;
  lowRank: number;
  highRank: number;
  rankDelta: number; // highRank - lowRank; negative = moved up at the higher count
}
export interface RankStability {
  metric: "winner";
  topN: number;
  topRankChanges: RankChange[];
  tailRankChanges: RankChange[];
  maxAbsTopRankDelta: number;
  maxAbsTailRankDelta: number;
}
export interface IterationComparison {
  label: string;
  seed: number;
  iterationsLow: number;
  iterationsHigh: number;
  teamCount: number;
  perStage: StageComparison[];
  overall: AbsDeltaSummary;
  rankStability: RankStability;
}

function winnerRankMap(snapshot: SimulationSnapshot): Map<string, number> {
  const ranked = [...snapshot.stageProbabilities].sort((a, b) => b.winner - a.winner);
  return new Map(ranked.map((p, i) => [p.teamId, i + 1]));
}

/**
 * Compare the same committed run at two iteration counts (same seed). Reuses
 * `computeProbabilityDeltas` for the per-team, per-stage deltas.
 */
export function compareIterationCounts(input: {
  checkpoint: CheckpointInput;
  seed: number;
  iterationsLow: number;
  iterationsHigh: number;
  worstMoverCount?: number;
  rankTopN?: number;
}): IterationComparison {
  const { checkpoint, seed, iterationsLow, iterationsHigh } = input;
  const worstMoverCount = input.worstMoverCount ?? 5;
  const rankTopN = input.rankTopN ?? 8;

  const low = runSnapshot(checkpoint, seed, iterationsLow);
  const high = runSnapshot(checkpoint, seed, iterationsHigh);

  const overallAbs: number[] = [];
  const perStage: StageComparison[] = STABILITY_STAGE_KEYS.map((stage) => {
    // previous = low, current = high -> delta = high - low.
    const deltas = computeProbabilityDeltas(low, high, stage);
    const absPP = deltas.map((d) => Math.abs(d.delta) * 100);
    overallAbs.push(...absPP);
    const worstMovers: StageMover[] = [...deltas]
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, worstMoverCount)
      .map((d) => ({
        teamId: d.teamId,
        lowPct: round6(d.previous * 100),
        highPct: round6(d.current * 100),
        deltaPP: round6(d.delta * 100),
      }));
    return { stage, summary: summarizeAbsDeltas(absPP), worstMovers };
  });

  const lowRank = winnerRankMap(low);
  const highRank = winnerRankMap(high);
  const rankByHigh = [...highRank.entries()].sort((a, b) => a[1] - b[1]);
  const toChange = ([teamId, hr]: [string, number]): RankChange => {
    const lr = lowRank.get(teamId)!;
    return { teamId, lowRank: lr, highRank: hr, rankDelta: hr - lr };
  };
  const topRankChanges = rankByHigh.slice(0, rankTopN).map(toChange);
  const tailRankChanges = rankByHigh.slice(-rankTopN).map(toChange);
  const maxAbs = (rows: RankChange[]) =>
    rows.reduce((m, r) => Math.max(m, Math.abs(r.rankDelta)), 0);

  return {
    label: checkpoint.label,
    seed,
    iterationsLow,
    iterationsHigh,
    teamCount: high.stageProbabilities.length,
    perStage,
    overall: summarizeAbsDeltas(overallAbs),
    rankStability: {
      metric: "winner",
      topN: rankTopN,
      topRankChanges,
      tailRankChanges,
      maxAbsTopRankDelta: maxAbs(topRankChanges),
      maxAbsTailRankDelta: maxAbs(tailRankChanges),
    },
  };
}

// ---------------------------------------------------------------------------
// Measurement B: run-to-run standard error across many seeds (fixed iterations).
// ---------------------------------------------------------------------------
export interface StageStandardError {
  stage: StabilityStageKey;
  iterations: number;
  seeds: number;
  /** Aggregates over teams of the per-team run-to-run standard deviation (pp). */
  meanSEpp: number;
  medianSEpp: number;
  p95SEpp: number;
  maxSEpp: number;
}

/** Sample standard deviation (n-1) of a value across seeds, in probability units. */
function sampleStdDev(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const mean = values.reduce((s, x) => s + x, 0) / n;
  const variance = values.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}

/**
 * Estimate the per-stage empirical run-to-run standard error: run the same
 * checkpoint at `iterations` under each seed, then for every team take the sample
 * stddev of its stage probability across seeds and aggregate over teams.
 */
export function estimateStageStandardError(input: {
  checkpoint: CheckpointInput;
  seeds: readonly number[];
  iterations: number;
}): StageStandardError[] {
  const { checkpoint, seeds, iterations } = input;
  const snapshots = seeds.map((seed) => runSnapshot(checkpoint, seed, iterations));
  const teamIds = snapshots[0]!.stageProbabilities.map((p) => p.teamId);
  const byTeam = snapshots.map(
    (s) => new Map(s.stageProbabilities.map((p) => [p.teamId, p] as const)),
  );

  return STABILITY_STAGE_KEYS.map((stage) => {
    const sePerTeamPP = teamIds.map((teamId) => {
      const series = byTeam.map((m) => m.get(teamId)![stage]);
      return sampleStdDev(series) * 100;
    });
    const sorted = [...sePerTeamPP].sort((a, b) => a - b);
    const n = sorted.length;
    const mean = sorted.reduce((s, x) => s + x, 0) / n;
    const median =
      n % 2 === 1 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
    const p95 = sorted[Math.max(0, Math.ceil(0.95 * n) - 1)]!;
    return {
      stage,
      iterations,
      seeds: seeds.length,
      meanSEpp: round6(mean),
      medianSEpp: round6(median),
      p95SEpp: round6(p95),
      maxSEpp: round6(sorted[n - 1]!),
    };
  });
}

/** Analytic binomial standard error `sqrt(p(1-p)/N)` in percentage points (reference). */
export function analyticBinomialSEpp(probability: number, iterations: number): number {
  return round6(Math.sqrt((probability * (1 - probability)) / iterations) * 100);
}
