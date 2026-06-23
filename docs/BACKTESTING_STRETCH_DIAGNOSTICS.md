# Backtesting Stretch-Context Diagnostics (Phase 1.20D) — SUPPLEMENTARY / DIAGNOSTIC

> **SUPPLEMENTARY DIAGNOSTIC — NOT THE HEADLINE, NOT CALIBRATION EVIDENCE.** This document describes the
> supplementary stretch-context diagnostic over **WC 1998 / 2002 / 2006**. It is **not** the headline
> benchmark, **not** a calibration input, and **not** a LOTO basis. The primary four-tournament
> macro-average (2010/2014/2018/2022) remains the **sole** headline and is unchanged. **Calibration
> remains NO-GO.**

## What this is
`lib/backtesting/stretch-context-diagnostics.ts` exports `computeStretchContextDiagnostics(mode, ladder)`,
a thin wrapper that runs the **existing** diagnostic ladder through the **existing** evaluator over
**only** the stretch cohort (`stretchContextPacks` = 1998/2002/2006) by delegating to the pure
`consolidateDiagnostics`. It introduces **no new metric math** and **no new model variant**. Output
(`StretchContextDiagnostics`):

- `cohortLabel` — `"Stretch context (supplementary - not headline, not calibration, not LOTO)"`.
- `years` — `[1998, 2002, 2006]`; `tournamentCount` — `3`; `mode` — `"group"` (default) or `"all"`.
- `matchCount` — total stretch matches for the mode: **144** (group: 48×3) / **192** (all: 64×3).
- `perTournament` — per-year `byVariant` metrics for 1998/2002/2006 only.
- `supplementaryMacroAverageByVariant` — equal-weight macro-average per ladder variant, delegated
  verbatim from `consolidateDiagnostics` and **named supplementary** to avoid any confusion with the
  primary headline.
- `governance` — `{ supplementaryOnly: true, headlineEligible: false, calibrationEligible: false,
  lotoEligible: false }`.

Pinned by `tests/backtesting-stretch-context-diagnostics.test.ts`.

## What this is NOT
- **Not the headline.** The headline is the primary four-tournament macro-average only
  (`docs/BACKTESTING_FOUR_TOURNAMENT_DIAGNOSTICS.md`).
- **Not an all-seven view.** There is intentionally **no** all-seven average and **no** blended
  primary+stretch number. `allHistoricalPacks` remains defined but unconsumed by any computation.
- **Not LOTO.** No Leave-One-Tournament-Out is computed over stretch or all-seven; `computeLotoDiagnostics`
  and its pins are unchanged and remain primary-only (2010/2014/2018/2022).
- **Not calibration evidence** and **not a "best model" verdict.** No weights, no temperature scaling,
  no tuning, no model selection, and no better/worse comparison against the primary set.

## Allowed metrics
RPS, log loss, Brier, **accuracy (descriptive only)**, tournament count, match count, and per-tournament
rows. (Same pure metric math as the primary consolidation — only the cohort differs.)

## Governance flags
| Flag | Value | Meaning |
| --- | --- | --- |
| `supplementaryOnly` | `true` | Context only; never the headline |
| `headlineEligible` | `false` | Must never replace the primary four-tournament macro-average |
| `calibrationEligible` | `false` | Must never be used as calibration evidence |
| `lotoEligible` | `false` | Must never be used as (or extended into) a LOTO basis |

## Why supplementary only — era caveats
The stretch tournaments differ from the modern primary set in ways that make them useful for
*directional* robustness but unsuitable as a headline or calibration basis:

- **Golden-goal era** (1998, 2002): knockout ET is stored with the 90-minute score + `afterExtraTime`,
  mirroring the modern convention, but the era differs.
- **Older FIFA / Elo source precision**: pre-2006 ranking/rating sources are less precise and less
  uniformly documented.
- **Different tactical era**: scoring environment, tactics, and competitive balance differ from 2010+.
- **Historical feature-availability differences**: the diagnostic ladder is already a 4-of-10-driver
  subset; older packs are no richer, so cross-era comparisons are coarse.

## Why no all-seven, why LOTO stays primary-only, why calibration stays NO-GO
An all-seven average is the output most likely to be mistaken for a new headline and would mix cohorts
of different governance status; it is deliberately not computed. LOTO stays primary-only because n=4 is
already small, the stretch eras/rules/sources/feature-fit differ, and a 7-fold LOTO would invite false
confidence. None of this changes the calibration decision: per
`docs/BACKTESTING_CALIBRATION_GOVERNANCE.md`, **calibration remains NO-GO**; more tournaments existing is
explicitly **not** a route to calibration approval.

## Supplementary stretch-context values
The pinned values live in `tests/backtesting-stretch-context-diagnostics.test.ts` (group and all modes,
per variant, 6-dp, same rounding as the primary diagnostics). They are **supplementary stretch-context
values** — **not** the headline, **not** calibration evidence — and are deliberately **not** compared
against the primary four-tournament values as a model verdict. No weights/tuning/calibration are
recommended from them. (See the test for the exact numbers; this doc intentionally avoids presenting
them as a ranking.)
