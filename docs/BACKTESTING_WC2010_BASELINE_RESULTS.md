# WC-2010 Backtest Baseline Results — DIAGNOSTIC ONLY

> **DIAGNOSTIC ONLY.** WC-2010 only. **Group-stage is the headline** (48 matches); the all-64 table
> is **secondary/diagnostic**. These numbers are **NOT calibration**, **NOT a production model
> claim**, and **must not be used to tune weights**. There is **no tournament replay** and **no
> champion-picking conclusion** here. Values are **deterministic and pinned by Vitest**
> (`tests/backtesting-match-evaluator.test.ts`), which is the source of truth; this table is a
> readable audit summary.

## Scope
- Target: **90-minute W/D/L** (`resultAt90`). Extra-time and penalty advancement are **never** the
  prediction target — the all-64 table still scores only the 90-minute result. (The 2010 final,
  Netherlands 0–1 Spain AET, counts as a 90-minute draw.)
- Variants are the same fixed **diagnostic baseline ladder** (Elo-only → FIFA-only → Elo+FIFA →
  Elo+FIFA+host/regional); active drivers use production `MODEL_WEIGHTS` constants, inactive drivers
  forced to zero. No "current production equivalent" variant.
- Features are built directly from the WC-2010 snapshot; host/regional are relative to **South Africa /
  CAF**; New Zealand (OFC) receives neither. Excluded features (squad, recent form, climate,
  structural, tournamentContext, manager) are neutral/zero.
- Metrics: **RPS** (ordinal W<D<L), **multiclass log loss** (clamped), **Brier**; **accuracy** is
  argmax hit rate (descriptive only). Lower RPS/logLoss/Brier is better.

## Headline — group stage (48 matches)

| modelVariant | matchCount | includedStages | RPS | logLoss | Brier | accuracy |
| --- | --- | --- | --- | --- | --- | --- |
| elo-only | 48 | group | 0.196084 | 0.997914 | 0.601816 | 0.520833 |
| fifa-only | 48 | group | 0.220927 | 1.074604 | 0.649351 | 0.479167 |
| elo-fifa | 48 | group | 0.202127 | 1.018394 | 0.616182 | 0.500000 |
| elo-fifa-host-regional | 48 | group | 0.201610 | 1.014471 | 0.614649 | 0.500000 |

## Secondary — all 64 matches at 90' (diagnostic)

| modelVariant | matchCount | includedStages | RPS | logLoss | Brier | accuracy |
| --- | --- | --- | --- | --- | --- | --- |
| elo-only | 64 | group + knockout (90') | 0.188848 | 0.971146 | 0.580925 | 0.546875 |
| fifa-only | 64 | group + knockout (90') | 0.221460 | 1.068904 | 0.645454 | 0.531250 |
| elo-fifa | 64 | group + knockout (90') | 0.191949 | 0.981823 | 0.588761 | 0.531250 |
| elo-fifa-host-regional | 64 | group + knockout (90') | 0.191403 | 0.978522 | 0.587160 | 0.531250 |

## Reading these numbers (neutral)
This is a **single-tournament diagnostic comparison**, not a ranking of "best model" and not
comparable across tournaments as evidence for weight changes. The sample is tiny (48 group matches).
Even now that the primary scope (2010, 2014, 2018, 2022) is complete, the four tournaments are **not**
pooled here: any weight conclusion requires a deliberate multi-tournament evaluation
(leave-one-tournament-out) in a later, separately-approved phase — see `docs/BACKTESTING_METHOD.md`.
The WC-2022, WC-2018, and WC-2014 diagnostic numbers live in their own results docs and must **not**
be pooled or averaged with these.
