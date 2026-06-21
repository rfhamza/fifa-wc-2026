# WC-2018 Backtest Baseline Results — DIAGNOSTIC ONLY

> **DIAGNOSTIC ONLY.** WC-2018 only. **Group-stage is the headline** (48 matches); the all-64 table
> is **secondary/diagnostic**. These numbers are **NOT calibration**, **NOT a production model
> claim**, and **must not be used to tune weights**. There is **no tournament replay** and **no
> champion-picking conclusion** here. Values are **deterministic and pinned by Vitest**
> (`tests/backtesting-match-evaluator.test.ts`), which is the source of truth; this table is a
> readable audit summary.

## Scope
- Target: **90-minute W/D/L** (`resultAt90`). Extra-time and penalty advancement are **never** the
  prediction target — the all-64 table still scores only the 90-minute result.
- Variants are the same fixed **diagnostic baseline ladder** as 2022 (Elo-only → FIFA-only →
  Elo+FIFA → Elo+FIFA+host/regional); active drivers use production `MODEL_WEIGHTS` constants,
  inactive drivers forced to zero. No "current production equivalent" variant.
- Features are built directly from the WC-2018 snapshot; host/regional are relative to **Russia /
  UEFA**. Excluded features (squad, recent form, climate, structural, tournamentContext, manager)
  are neutral/zero.
- Metrics: **RPS** (ordinal W<D<L), **multiclass log loss** (clamped), **Brier**; **accuracy** is
  argmax hit rate (descriptive only). Lower RPS/logLoss/Brier is better.

## Headline — group stage (48 matches)

| modelVariant | matchCount | includedStages | RPS | logLoss | Brier | accuracy |
| --- | --- | --- | --- | --- | --- | --- |
| elo-only | 48 | group | 0.196349 | 0.932544 | 0.546919 | 0.583333 |
| fifa-only | 48 | group | 0.230587 | 1.029163 | 0.619041 | 0.541667 |
| elo-fifa | 48 | group | 0.195006 | 0.931218 | 0.542734 | 0.625000 |
| elo-fifa-host-regional | 48 | group | 0.192460 | 0.925844 | 0.537438 | 0.625000 |

## Secondary — all 64 matches at 90' (diagnostic)

| modelVariant | matchCount | includedStages | RPS | logLoss | Brier | accuracy |
| --- | --- | --- | --- | --- | --- | --- |
| elo-only | 64 | group + knockout (90') | 0.201170 | 0.967517 | 0.573507 | 0.546875 |
| fifa-only | 64 | group + knockout (90') | 0.228229 | 1.044223 | 0.629291 | 0.500000 |
| elo-fifa | 64 | group + knockout (90') | 0.200959 | 0.968904 | 0.572945 | 0.578125 |
| elo-fifa-host-regional | 64 | group + knockout (90') | 0.197796 | 0.960757 | 0.565740 | 0.593750 |

## Reading these numbers (neutral)
This is a **single-tournament diagnostic comparison**, not a ranking of "best model" and not
comparable across tournaments as evidence for weight changes. The sample is tiny (48 group matches).
Any weight conclusion requires multi-tournament evaluation (leave-one-tournament-out) in a later,
separately-approved phase — see `docs/BACKTESTING_METHOD.md`. WC-2022 diagnostic numbers live in
`docs/BACKTESTING_WC2022_BASELINE_RESULTS.md`; the two are recorded separately and must not be
pooled or averaged here.
