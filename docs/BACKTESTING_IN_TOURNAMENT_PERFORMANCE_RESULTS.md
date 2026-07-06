# In-tournament performance driver - Stage 1C results & governance verdict

> **DIAGNOSTIC ONLY.** This is the one-time historical evaluation of a **candidate**, shadow-only,
> evidence-gated driver. These numbers are **NOT calibration**, **NOT a production model claim**, and
> **must not be used to tune weights**. The candidate driver's weight stays **0**. **Calibration
> remains NO-GO** (`docs/BACKTESTING_CALIBRATION_GOVERNANCE.md`). The Vitest file
> `tests/backtesting-performance-results.test.ts` computes these metrics from the committed packs and
> is the **source of truth**; the tables below are a readable copy of those pinned numbers.

## 1. Purpose & scope

Stage 1C runs the pre-registered in-tournament performance sweep **once** over the committed
historical packs (Stage 1B harness), pins the real metrics, and applies the **frozen** Stage 1A
activation rule (G1-G5) exactly (`docs/BACKTESTING_IN_TOURNAMENT_PERFORMANCE.md`, Sections 4/6/8). It
produces a pass/fail governance verdict. It changes **no** production code, weights, snapshots,
forecasts, live-state, or public copy, and it authorises nothing in production.

- **Primary decision cohort (gating):** 2010, 2014, 2018, 2022 (equal weight per tournament / macro
  average).
- **Supplementary cohort (context only, non-gating):** 1998, 2002, 2006.
- **Swept weights:** `[0, 5, 10, 15, 20, 25]`; weight 0 is the baseline reference. Activation-eligible
  candidate weights: `{5, 10, 15, 20, 25}`.

## 2. Formula recap, constants, leakage (frozen in Stage 1A)

Per-match surprise (scored at the 90-minute result): `s = 0.5*(P_res/3) + 0.5*(M_res/4)` with
`P_res = actualPoints - expectedPoints`, `M_res = clamp(actualMargin,-2,2) - clamp(expectedMargin,-2,2)`.
Shrinkage: `S = sum(s_i)/(n+2)` (empty history -> 0). Contribution:
`clamp(weight*(S_A - S_B), -25, +25)`. Frozen constants: `PERF_ALPHA = 0.5`, `PERF_K = 2`,
`PERF_MARGIN_CAP = 2`, `PERF_CONTRIBUTION_CAP = 25`, `PERF_SWEEP_WEIGHTS = [0,5,10,15,20,25]`. Only the
weight is swept.

**Leakage (walk-forward, day-strict, UTC):** a team's history for predicting match *m* contains only
its own earlier-day completed matches in the same tournament; expectations always come from the
baseline model with this driver forced to 0, so the per-match surprises are computed **once per pack**
and reused across the sweep. No future results, no final standings, no hindsight labels.

**No 2026 data enters the backtest**; the decision rule was frozen before any result existed. No 2026
tuning, no manual override, no threshold/subset/formula change after seeing these numbers.

## 3. Mandated caveats

- **Baseline mismatch (four-driver vs ten-driver).** This backtest validates the driver against the
  historical **four-driver** core (`elo`, `fifaRanking`, `host`, `regional`). Production 2026 forecasts
  apply against the full **ten-driver** baseline (with this driver at 0). Stage 1C is therefore evidence
  about the **four-driver core**, **not** a guarantee about the ten-driver production forecast.
- **90-minute framing.** Historical packs carry the exact 90-minute split, so this evidence is computed
  on exact 90-minute inputs (penalties / extra time / golden goal are scored as the 90-minute result).
  The bounded 2026-knockout approximation (final score used as a 90-minute proxy) is **entirely absent**
  from this backtest and is irrelevant to the Stage 1C evidence.

## 4. Decision cohort results (PRIMARY: 2010/2014/2018/2022)

### 4.1 Primary decision subset - group matchday 2+3 (128 matches)

| weight | RPS | logLoss | dRPS vs 0 | dlogLoss vs 0 |
| --- | --- | --- | --- | --- |
| 0 | 0.206394 | 0.981116 | 0.000000 | 0.000000 |
| 5 | 0.206417 | 0.981204 | +0.000023 | +0.000089 |
| 10 | 0.206444 | 0.981308 | +0.000050 | +0.000192 |
| 15 | 0.206467 | 0.981398 | +0.000073 | +0.000282 |
| 20 | 0.206493 | 0.981497 | +0.000099 | +0.000382 |
| 25 | 0.206523 | 0.981609 | +0.000129 | +0.000493 |

The driver **degrades** the primary decision subset: RPS rises (worse) monotonically with weight.

### 4.2 Per-tournament RPS, group matchday 2+3 (fold consistency, G3)

| year | w0 | w5 | w10 | w15 | w20 | w25 | improves vs w0? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2010 | 0.192804 | 0.192883 | 0.192968 | 0.193038 | 0.193127 | 0.193216 | no |
| 2014 | 0.180841 | 0.180749 | 0.180659 | 0.180566 | 0.180471 | 0.180386 | yes |
| 2018 | 0.180298 | 0.180320 | 0.180356 | 0.180388 | 0.180418 | 0.180450 | no |
| 2022 | 0.271634 | 0.271715 | 0.271793 | 0.271876 | 0.271955 | 0.272041 | no |

Improving folds per candidate weight: **1 of 4** at every weight (only 2014). Worst single-fold RPS
degrade vs w0 (G5): 0.000081 / 0.000164 / 0.000243 / 0.000324 / 0.000413 for weights 5/10/15/20/25 -
all far below the 0.005 limit.

### 4.3 Knockout guardrail subset - knockout only (64 matches, G4)

| weight | RPS | dRPS vs 0 |
| --- | --- | --- |
| 0 | 0.182479 | 0.000000 |
| 5 | 0.182384 | -0.000094 |
| 10 | 0.182282 | -0.000196 |
| 15 | 0.182188 | -0.000290 |
| 20 | 0.182099 | -0.000379 |
| 25 | 0.182009 | -0.000470 |

Knockout RPS **improves** slightly, so G4 (non-degradation) passes - but knockout is a guardrail only
and **can never approve** activation.

### 4.4 Activation gates (frozen G1-G5) and verdict

| weight | G1 dRPS <= -0.002 | G2 dlogLoss <= +0.001 | G3 >= 3/4 folds | G4 knockout dRPS <= +0.002 | G5 worst fold <= +0.005 | passed |
| --- | --- | --- | --- | --- | --- | --- |
| 5 | FAIL (+0.000023) | pass | FAIL (1/4) | pass | pass | **NO** |
| 10 | FAIL (+0.000050) | pass | FAIL (1/4) | pass | pass | **NO** |
| 15 | FAIL (+0.000073) | pass | FAIL (1/4) | pass | pass | **NO** |
| 20 | FAIL (+0.000099) | pass | FAIL (1/4) | pass | pass | **NO** |
| 25 | FAIL (+0.000129) | pass | FAIL (1/4) | pass | pass | **NO** |

- **passingWeights: []**
- **selectedWeight: 0**
- **activationDecision: keep-weight-0**

**Verdict - pre-registered NEGATIVE result.** No candidate weight passes all five gates. The driver does
not improve the primary decision subset (it fails G1) and is not consistent across tournaments (it fails
G3). Per Stage 1A, this is an acceptable, expected, pre-registered outcome: **keep weight 0**, recorded
as a completed negative result, with **no re-runs under new thresholds, subsets, or formula**. **No Stage
2 production shadow should be built.**

## 5. Supplementary cohort (1998/2002/2006) - context only

**These results are reported for context only and do not affect the activation decision.** They are not
part of the primary macro-average and can neither approve nor veto.

Group matchday 2+3 (96 matches):

| weight | RPS | dRPS vs 0 |
| --- | --- | --- |
| 0 | 0.191370 | 0.000000 |
| 5 | 0.191282 | -0.000088 |
| 10 | 0.191192 | -0.000179 |
| 15 | 0.191104 | -0.000266 |
| 20 | 0.191015 | -0.000356 |
| 25 | 0.190927 | -0.000443 |

Per-tournament RPS at weight 0: 1998 = 0.180243, 2002 = 0.217488, 2006 = 0.176380. On these older-era
tournaments the group MD2+MD3 signal trends mildly positive, which is interesting context but, given
structural/era differences and the pre-registration, is explicitly **outside** the activation rule.

## 6. Effect & next step

This document changes **no** production probability or weight, adds **no** public copy, and touches
**no** forecast/snapshot/live-state/provider/Blob/workflow. Because the gates fail, **no Stage 2 shadow
is authorised**; the candidate driver remains at weight 0. Any future reconsideration is a separate,
explicitly-approved stage. **Calibration remains NO-GO.**

## 7. Verification (gates this PR passed)

`npm run scan:unicode`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` - all green,
plus the pinning test `tests/backtesting-performance-results.test.ts`.
