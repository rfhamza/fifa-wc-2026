/**
 * Candidate in-tournament-performance LOTO — fold SHAPE only (Stage 1B).
 * ---------------------------------------------------------------------
 * Leave-one-tournament-out view over the candidate weight sweep. Nothing is fitted:
 * a fold's held-out value is just that tournament's own metric; the "new information"
 * is the per-weight delta vs the reference macro-average of the other tournaments, and
 * the per-weight fold-consistency count that feeds the pre-registered G3 gate.
 *
 * Reuses `summarizePerformanceSweep` for the subset partitioning; adds no metric math.
 * Stage 1B commits NO real historical numbers — exercised with SYNTHETIC rows only.
 */
import {
  summarizePerformanceSweep,
  type PerformanceGovernanceFlags,
} from "./performance-sweep";
import type { WalkForwardResult } from "./walk-forward";

// Re-export the flag object under a LOTO name so callers/tests can pin it directly.
export { PERFORMANCE_SWEEP_GOVERNANCE_FLAGS as PERFORMANCE_LOTO_GOVERNANCE_FLAGS } from "./performance-sweep";

export interface PerfLotoFoldWeight {
  weight: number;
  heldOutRps: number;
  referenceMacroRps: number;
  /** heldOutRps - referenceMacroRps (descriptive cross-fold gap; nothing fitted). */
  delta: number;
}

export interface PerfLotoFold {
  heldOutYear: number;
  referenceYears: number[];
  byWeight: PerfLotoFoldWeight[];
}

export interface PerfLotoConsistency {
  weight: number;
  /** Tournaments whose subset RPS improves vs weight 0 (feeds G3). */
  improvedFolds: number;
  totalFolds: number;
}

export interface PerformanceLotoResult {
  governance: PerformanceGovernanceFlags;
  subset: string;
  folds: PerfLotoFold[];
  foldConsistencyByWeight: PerfLotoConsistency[];
}

/**
 * Compute the LOTO fold shape for one subset (default the primary decision subset).
 * Pure. `packs` is the per-tournament walk-forward output (synthetic in Stage 1B).
 */
export function computePerformanceLoto(
  packs: WalkForwardResult[],
  subset = "groupMd2Md3",
): PerformanceLotoResult {
  const sweep = summarizePerformanceSweep(packs);
  const subsetSweep = sweep.subsets[subset];
  if (!subsetSweep) throw new Error(`performance-loto: unknown subset "${subset}"`);
  const weights = sweep.weights;
  const perTournament = subsetSweep.perTournament;

  const rpsAt = (tournamentYear: number, weight: number): number => {
    const t = perTournament.find((p) => p.tournamentYear === tournamentYear)!;
    return t.byWeight.find((b) => b.weight === weight)!.rps;
  };

  const years = perTournament.map((t) => t.tournamentYear);

  const folds: PerfLotoFold[] = years.map((heldOutYear) => {
    const referenceYears = years.filter((y) => y !== heldOutYear);
    return {
      heldOutYear,
      referenceYears,
      byWeight: weights.map((weight) => {
        const heldOutRps = rpsAt(heldOutYear, weight);
        const referenceMacroRps =
          referenceYears.reduce((s, y) => s + rpsAt(y, weight), 0) / (referenceYears.length || 1);
        return { weight, heldOutRps, referenceMacroRps, delta: heldOutRps - referenceMacroRps };
      }),
    };
  });

  const foldConsistencyByWeight: PerfLotoConsistency[] = weights.map((weight) => {
    let improved = 0;
    for (const year of years) {
      if (rpsAt(year, weight) < rpsAt(year, 0)) improved += 1;
    }
    return { weight, improvedFolds: improved, totalFolds: years.length };
  });

  return {
    governance: sweep.governance,
    subset,
    folds,
    foldConsistencyByWeight,
  };
}
