# Backtesting Historical Cohorts & Stretch Context (Phase 1.20B) — EXPLANATORY / GOVERNANCE

> **EXPLANATORY DOCUMENT — NO METRICS, NO RECOMMENDATIONS.** This document defines the three historical
> cohorts and explains how the **stretch** packs (WC 1998/2002/2006) may and may not be used. It
> contains **no stretch metric numbers, no all-seven average, no model ranking, no calibration
> recommendation, and no production recommendation.** It computes nothing. **Calibration remains NO-GO.**
>
> **The supplementary stretch-context diagnostic itself (Phase 1.20D) lives in
> `docs/BACKTESTING_STRETCH_DIAGNOSTICS.md`** (`computeStretchContextDiagnostics` over 1998/2002/2006).
> This document remains the cohort-definition + era-caveat explainer.

## The three cohorts
Defined once in `lib/backtesting/historical-cohorts.ts` and pinned by
`tests/backtesting-historical-cohorts.test.ts`:

| Cohort | Constant / array | Members | Role |
| --- | --- | --- | --- |
| **Primary diagnostic** | `PRIMARY_DIAGNOSTIC_YEARS` / `primaryDiagnosticPacks` | 2010, 2014, 2018, 2022 | **Headline benchmark**; the **only** consolidation + LOTO basis |
| **Stretch context** | `STRETCH_CONTEXT_YEARS` / `stretchContextPacks` | 1998, 2002, 2006 | **Supplementary only** — qualitative robustness / era sensitivity |
| **All available** | `ALL_AVAILABLE_HISTORICAL_YEARS` / `allHistoricalPacks` | 1998–2022 (seven) | **Supplementary only** — never the headline |

Primary and stretch are disjoint; primary ∪ stretch = all-available (no overlap, no omission).

## Why primary remains 2010/2014/2018/2022
The primary set is the modern, source-consistent, feature-comparable core used for the four-tournament
consolidation and the four-fold LOTO. The headline backtesting view and all calibration governance are
built on this set and **do not change** when stretch packs are added. (See
`docs/BACKTESTING_FOUR_TOURNAMENT_DIAGNOSTICS.md`, `docs/BACKTESTING_LOTO_DIAGNOSTICS.md`,
`docs/BACKTESTING_CALIBRATION_GOVERNANCE.md`.)

## Why 1998/2002/2006 are stretch context only
These older tournaments carry caveats that make them valuable for *directional* robustness checks but
unsuitable as a headline or a calibration basis:

- **Golden-goal era.** 1998 and 2002 used golden-goal extra time; knockout matches are stored with the
  90-minute score (a draw) + `afterExtraTime`, mirroring the modern convention — but the era differs.
- **Older FIFA / Elo source precision.** Pre-2006 ranking/rating sources are less precise and less
  uniformly documented than the modern packs.
- **Different tactical era.** Scoring environment, tactics, and competitive balance differ from the
  2010+ era.
- **Fewer modern model-feature equivalents.** The diagnostic ladder is already a 4-of-10-driver subset
  historically; older packs are no richer, so cross-era comparisons are coarse.

## What you MAY infer from stretch context
- Whether the model behaves **catastrophically** (or not) on older 32-team tournaments.
- Whether errors are **materially different** in older eras.
- Whether golden-goal / penalty-era tournaments expose **score-semantics** issues.
- Whether older FIFA/Elo/source caveats **visibly** affect diagnostics.
- Whether performance stays **directionally plausible** outside the primary set.

## What you MUST NOT infer from stretch context
- Production weights, or any "should we calibrate / temperature-scale / tune?" conclusion.
- The official **headline** backtesting score (that is the primary four-tournament macro-average only).
- A **"best model"** verdict, or any recommendation to change the 2026 probabilities.
- An **all-seven average** as a benchmark — it does not exist as a headline and must not be created as
  one.

## Scope of Phase 1.20B
Phase 1.20B adds **only**: the cohort constants/arrays, the guard tests, and this documentation (plus a
cautious NO-GO-unchanged note in the calibration-governance record). It **does not** compute stretch
metrics, **does not** build stretch/all-seven consolidation, **does not** recompute or extend LOTO, and
**does not** touch production, prediction-core, the evaluator, the historical snapshots/generators, or
the pinned four-tournament/LOTO tests. Any future stretch-metric view would be a separate,
explicitly-approved phase, clearly labelled SUPPLEMENTARY, and still outside the headline.
