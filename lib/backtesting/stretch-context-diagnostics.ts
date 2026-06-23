/**
 * Phase 1.20D - SUPPLEMENTARY stretch-context diagnostics (backtesting layer).
 * ---------------------------------------------------------------------------
 * A dedicated, clearly-labelled wrapper that runs the EXISTING diagnostic ladder over
 * ONLY the stretch context cohort (WC 1998/2002/2006) and tags the result as
 * SUPPLEMENTARY. Part of the ISOLATED backtesting layer; never imported by the
 * production 2026 app.
 *
 * GOVERNANCE (hard rules - see docs/BACKTESTING_STRETCH_DIAGNOSTICS.md):
 *  - This is SUPPLEMENTARY ONLY. It is NOT the headline benchmark, NOT calibration
 *    evidence, and NOT a LOTO basis. The primary four-tournament macro-average
 *    (2010/2014/2018/2022) remains the sole headline and is untouched here.
 *  - It hardcodes `stretchContextPacks`; it does NOT accept arbitrary cohort packs,
 *    does NOT compute all-seven diagnostics, and does NOT compute LOTO.
 *  - It introduces NO new metric math: it delegates entirely to the pure
 *    `consolidateDiagnostics` helper (same evaluator, same metrics, same rounding).
 *  - It emits NO "best model", recommended weights, calibration/temperature-scaling
 *    recommendation, all-seven average, blended primary+stretch headline, or
 *    better/worse verdict versus primary. Calibration remains NO-GO.
 */
import {
  consolidateDiagnostics,
  type ConsolidatedDiagnostics,
  type TournamentDiagnostics,
  type MacroAverageMetrics,
} from "./consolidate";
import { type StageMode } from "./match-evaluator";
import { BASELINE_LADDER, type ModelVariant } from "./model-variants";
import { stretchContextPacks, STRETCH_CONTEXT_YEARS } from "./historical-cohorts";

/** Human-readable label that makes the supplementary, non-headline nature explicit. */
export const STRETCH_CONTEXT_DIAGNOSTIC_LABEL =
  "Stretch context (supplementary - not headline, not calibration, not LOTO)";

/** Governance flags pinned on every stretch-context diagnostic result. */
export const STRETCH_CONTEXT_GOVERNANCE_FLAGS = {
  /** Stretch diagnostics are supplementary context only. */
  supplementaryOnly: true,
  /** Must never be treated as the headline benchmark. */
  headlineEligible: false,
  /** Must never be used as calibration evidence. */
  calibrationEligible: false,
  /** Must never be used as (or extended into) a LOTO basis. */
  lotoEligible: false,
} as const;

export type StretchContextGovernanceFlags = typeof STRETCH_CONTEXT_GOVERNANCE_FLAGS;

/**
 * SUPPLEMENTARY stretch-context diagnostics for WC 1998/2002/2006. Wraps the pure
 * `consolidateDiagnostics` output with a cohort label, a match-count summary, and
 * governance flags. Deliberately exposes NO single collapsed "stretch score" and NO
 * best-variant pick - only the per-tournament rows and the supplementary macro-average
 * (all ladder variants), exactly as produced by the existing evaluator.
 */
export interface StretchContextDiagnostics {
  /** Label signalling the supplementary, non-headline nature of this view. */
  cohortLabel: string;
  /** Exactly [1998, 2002, 2006]. */
  years: number[];
  /** Exactly 3. */
  tournamentCount: number;
  /** Stage mode the diagnostics were computed for ("group" headline-style / "all"). */
  mode: StageMode;
  /** Total matches across the three stretch tournaments for `mode` (group 144 / all 192). */
  matchCount: number;
  /** Per-tournament metrics for 1998/2002/2006 only (ascending by year). */
  perTournament: TournamentDiagnostics[];
  /**
   * Supplementary macro-average per ladder variant (equal weight per tournament),
   * delegated verbatim from `consolidateDiagnostics`. Named "supplementary" to prevent
   * any confusion with the primary four-tournament headline macro-average.
   */
  supplementaryMacroAverageByVariant: Record<string, MacroAverageMetrics>;
  /** Pinned governance flags (see STRETCH_CONTEXT_GOVERNANCE_FLAGS). */
  governance: StretchContextGovernanceFlags;
}

/**
 * Compute the SUPPLEMENTARY stretch-context diagnostics over WC 1998/2002/2006.
 * Delegates to `consolidateDiagnostics(stretchContextPacks, mode, ladder)` - no new
 * metric logic, no all-seven, no LOTO. The pack set is hardcoded to the stretch cohort.
 */
export function computeStretchContextDiagnostics(
  mode: StageMode = "group",
  ladder: ModelVariant[] = BASELINE_LADDER,
): StretchContextDiagnostics {
  const consolidated: ConsolidatedDiagnostics = consolidateDiagnostics(
    [...stretchContextPacks],
    mode,
    ladder,
  );

  // Match count per tournament is identical across variants for a given mode; sum the
  // first variant's matchCount over the three tournaments. (group 48*3=144 / all 64*3=192.)
  const matchCount = consolidated.tournaments.reduce((sum, t) => {
    const first = Object.values(t.byVariant)[0];
    return sum + (first ? first.matchCount : 0);
  }, 0);

  return {
    cohortLabel: STRETCH_CONTEXT_DIAGNOSTIC_LABEL,
    years: [...STRETCH_CONTEXT_YEARS],
    tournamentCount: consolidated.tournaments.length,
    mode: consolidated.mode,
    matchCount,
    perTournament: consolidated.tournaments,
    supplementaryMacroAverageByVariant: consolidated.macroAverageByVariant,
    governance: STRETCH_CONTEXT_GOVERNANCE_FLAGS,
  };
}
