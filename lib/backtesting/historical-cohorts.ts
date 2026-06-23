/**
 * Phase 1.20B - historical diagnostic COHORTS (backtesting layer).
 * ----------------------------------------------------------------
 * Single, explicit source of truth for the three historical cohorts, so that
 * "primary" vs "stretch" vs "all-available" can never be silently mixed. Part of the
 * ISOLATED backtesting layer (`lib/backtesting/`): NEVER imported by the production
 * 2026 app, and importing this module computes NOTHING - it only names cohorts.
 *
 * GOVERNANCE (hard rules - see docs/BACKTESTING_METHOD.md,
 * docs/BACKTESTING_CALIBRATION_GOVERNANCE.md, docs/BACKTESTING_STRETCH_CONTEXT.md):
 *  - `primaryDiagnosticPacks` (2010/2014/2018/2022) are the ONLY headline benchmark and
 *    the ONLY current LOTO basis. The pinned four-tournament consolidation + LOTO tests
 *    continue to assemble exactly these four; this module does not change them.
 *  - `stretchContextPacks` (1998/2002/2006) are SUPPLEMENTARY ONLY - qualitative
 *    robustness / era-sensitivity context. Older-era caveats apply (golden-goal era,
 *    older FIFA/Elo source precision, different tactical era, fewer modern model
 *    features). They are NOT the headline and NOT calibration evidence.
 *  - `allHistoricalPacks` (all seven) is SUPPLEMENTARY ONLY and must NEVER replace the
 *    primary headline. There is intentionally no "all-seven headline average".
 *  - NOTHING here is calibration evidence; calibration remains NO-GO. No production
 *    probability/weight change may be inferred from these exports. This module performs
 *    no metric computation, no consolidation, and no LOTO.
 *
 * This module is intentionally NOT re-exported through any barrel/index (none exists);
 * keeping it import-explicit avoids accidental consumption as a headline input.
 */
import type { HistoricalSourcePack } from "./types";
import { WC1998_PACK } from "@/data/historical/snapshots/wc-1998";
import { WC2002_PACK } from "@/data/historical/snapshots/wc-2002";
import { WC2006_PACK } from "@/data/historical/snapshots/wc-2006";
import { WC2010_PACK } from "@/data/historical/snapshots/wc-2010";
import { WC2014_PACK } from "@/data/historical/snapshots/wc-2014";
import { WC2018_PACK } from "@/data/historical/snapshots/wc-2018";
import { WC2022_PACK } from "@/data/historical/snapshots/wc-2022";

/**
 * PRIMARY diagnostic set - the ONLY headline benchmark and the ONLY current LOTO basis.
 * Do not extend this set with stretch tournaments.
 */
export const PRIMARY_DIAGNOSTIC_YEARS = [2010, 2014, 2018, 2022] as const;

/**
 * STRETCH context set - SUPPLEMENTARY ONLY (qualitative robustness / era sensitivity).
 * Never the headline; never calibration evidence. Older-era caveats apply.
 */
export const STRETCH_CONTEXT_YEARS = [1998, 2002, 2006] as const;

/**
 * ALL available historical packs - SUPPLEMENTARY ONLY. Must never replace the primary
 * headline; there is intentionally no all-seven headline average.
 */
export const ALL_AVAILABLE_HISTORICAL_YEARS = [1998, 2002, 2006, 2010, 2014, 2018, 2022] as const;

/**
 * PRIMARY diagnostic packs (2010/2014/2018/2022) - the only headline / LOTO basis.
 * Ordered to match PRIMARY_DIAGNOSTIC_YEARS.
 */
export const primaryDiagnosticPacks: readonly HistoricalSourcePack[] = [
  WC2010_PACK,
  WC2014_PACK,
  WC2018_PACK,
  WC2022_PACK,
];

/**
 * STRETCH context packs (1998/2002/2006) - SUPPLEMENTARY ONLY (era-sensitivity context).
 * Not the headline; not calibration evidence. Ordered to match STRETCH_CONTEXT_YEARS.
 */
export const stretchContextPacks: readonly HistoricalSourcePack[] = [
  WC1998_PACK,
  WC2002_PACK,
  WC2006_PACK,
];

/**
 * ALL available historical packs (seven) - SUPPLEMENTARY ONLY. Must never replace the
 * primary headline. Ordered to match ALL_AVAILABLE_HISTORICAL_YEARS.
 */
export const allHistoricalPacks: readonly HistoricalSourcePack[] = [
  WC1998_PACK,
  WC2002_PACK,
  WC2006_PACK,
  WC2010_PACK,
  WC2014_PACK,
  WC2018_PACK,
  WC2022_PACK,
];
