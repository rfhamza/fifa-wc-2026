/**
 * Phase 1.18C-1 - four-tournament diagnostic consolidation (backtesting layer).
 * ---------------------------------------------------------------------------
 * Pure, deterministic aggregation of the existing per-tournament match-level
 * diagnostics into one comparable view across the primary historical scope
 * (WC-2010/2014/2018/2022). DIAGNOSTIC ONLY: this runs the existing diagnostic
 * ladder through the existing evaluator and summarises the results - it adds no new
 * metric, no model variant, no calibration, no tuning, and changes nothing in the
 * evaluator/metrics/variants/snapshots.
 *
 * ISOLATED: imports only existing backtesting + historical-snapshot modules; never
 * imports `data/model-inputs`, `lib/model/*`, `data/official`, or any production app
 * path. (The snapshot imports are the committed historical packs, not 2026 data.)
 *
 * Headline aggregate is the MACRO-AVERAGE: the simple mean of the four per-tournament
 * metric values (each tournament weighted equally). A pooled micro-average is
 * deliberately NOT computed here.
 */
import type { HistoricalSourcePack } from "./types";
import { BASELINE_LADDER, type ModelVariant } from "./model-variants";
import { evaluateLadder, type StageMode } from "./match-evaluator";

/** Round to 6 decimals (matches the per-tournament pinned-metric precision). */
const round6 = (x: number): number => Math.round(x * 1e6) / 1e6;

export interface DiagnosticMetrics {
  matchCount: number;
  rps: number;
  logLoss: number;
  brier: number;
  accuracy: number;
}

export interface TournamentDiagnostics {
  tournamentYear: number;
  /** variant id -> metrics for this tournament (rounded to 6 dp). */
  byVariant: Record<string, DiagnosticMetrics>;
}

/** Macro-average metrics for a variant (equal weight per tournament, 6 dp). */
export interface MacroAverageMetrics {
  tournamentCount: number;
  rps: number;
  logLoss: number;
  brier: number;
  accuracy: number;
}

export interface ConsolidatedDiagnostics {
  mode: StageMode;
  /** ordered ascending by tournamentYear. */
  tournaments: TournamentDiagnostics[];
  /** variant id -> macro-average across the included tournaments. */
  macroAverageByVariant: Record<string, MacroAverageMetrics>;
}

/**
 * Consolidate the diagnostic ladder across several historical packs for one stage
 * mode ("group" headline / "all" secondary). Pure + deterministic: equal-weight
 * macro-average across tournaments; no pooled micro-average.
 */
export function consolidateDiagnostics(
  packs: HistoricalSourcePack[],
  mode: StageMode,
  ladder: ModelVariant[] = BASELINE_LADDER,
): ConsolidatedDiagnostics {
  // Stable ordering by tournament year.
  const ordered = [...packs].sort(
    (a, b) => a.identity.tournamentYear - b.identity.tournamentYear,
  );

  const tournaments: TournamentDiagnostics[] = ordered.map((pack) => {
    const byVariant: Record<string, DiagnosticMetrics> = {};
    for (const run of evaluateLadder(pack, ladder, mode)) {
      byVariant[run.modelVariant] = {
        matchCount: run.matchCount,
        rps: round6(run.metrics.rps),
        logLoss: round6(run.metrics.logLoss),
        brier: round6(run.metrics.brier),
        accuracy: round6(run.metrics.accuracy),
      };
    }
    return { tournamentYear: pack.identity.tournamentYear, byVariant };
  });

  // Macro-average: mean of the raw per-tournament metric values, equal weight.
  const macroAverageByVariant: Record<string, MacroAverageMetrics> = {};
  for (const variant of ladder) {
    const runs = ordered.map((pack) => {
      const ladderRuns = evaluateLadder(pack, [variant], mode);
      return ladderRuns[0]!.metrics;
    });
    const n = runs.length;
    const mean = (sel: (m: { rps: number; logLoss: number; brier: number; accuracy: number }) => number) =>
      round6(runs.reduce((s, m) => s + sel(m), 0) / n);
    macroAverageByVariant[variant.id] = {
      tournamentCount: n,
      rps: mean((m) => m.rps),
      logLoss: mean((m) => m.logLoss),
      brier: mean((m) => m.brier),
      accuracy: mean((m) => m.accuracy),
    };
  }

  return { mode, tournaments, macroAverageByVariant };
}
