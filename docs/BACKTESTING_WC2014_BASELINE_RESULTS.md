# WC-2014 Backtest Baseline Results — DIAGNOSTIC ONLY

> **DIAGNOSTIC ONLY.** WC-2014 only. **Group-stage is the headline** (48 matches); the all-64 table
> is **secondary/diagnostic**. These numbers are **NOT calibration**, **NOT a production model
> claim**, and **must not be used to tune weights**. There is **no tournament replay** and **no
> champion-picking conclusion** here. Values are **deterministic and pinned by Vitest**
> (`tests/backtesting-match-evaluator.test.ts`), which is the source of truth; this table is a
> readable audit summary.

## Scope
- Target: **90-minute W/D/L** (`resultAt90`). Extra-time and penalty advancement are **never** the
  prediction target — the all-64 table still scores only the 90-minute result. (The 2014 final,
  Germany 1–0 Argentina AET, counts as a 90-minute draw.)
- Variants are the same fixed **diagnostic baseline ladder** (Elo-only → FIFA-only → Elo+FIFA →
  Elo+FIFA+host/regional); active drivers use production `MODEL_WEIGHTS` constants, inactive drivers
  forced to zero. No "current production equivalent" variant.
- Features are built directly from the WC-2014 snapshot; host/regional are relative to **Brazil /
  CONMEBOL**. Excluded features (squad, recent form, climate, structural, tournamentContext, manager)
  are neutral/zero.
- Metrics: **RPS** (ordinal W<D<L), **multiclass log loss** (clamped), **Brier**; **accuracy** is
  argmax hit rate (descriptive only). Lower RPS/logLoss/Brier is better.

## Headline — group stage (48 matches)

| modelVariant | matchCount | includedStages | RPS | logLoss | Brier | accuracy |
| --- | --- | --- | --- | --- | --- | --- |
| elo-only | 48 | group | 0.189773 | 0.908006 | 0.536186 | 0.604167 |
| fifa-only | 48 | group | 0.226187 | 1.017085 | 0.610345 | 0.645833 |
| elo-fifa | 48 | group | 0.183794 | 0.888234 | 0.523563 | 0.645833 |
| elo-fifa-host-regional | 48 | group | 0.182562 | 0.884112 | 0.521259 | 0.666667 |

## Secondary — all 64 matches at 90' (diagnostic)

| modelVariant | matchCount | includedStages | RPS | logLoss | Brier | accuracy |
| --- | --- | --- | --- | --- | --- | --- |
| elo-only | 64 | group + knockout (90') | 0.190670 | 0.966312 | 0.579339 | 0.546875 |
| fifa-only | 64 | group + knockout (90') | 0.219121 | 1.051875 | 0.633173 | 0.578125 |
| elo-fifa | 64 | group + knockout (90') | 0.186371 | 0.952269 | 0.570727 | 0.578125 |
| elo-fifa-host-regional | 64 | group + knockout (90') | 0.187450 | 0.955101 | 0.573118 | 0.593750 |

## Reading these numbers (neutral)
This is a **single-tournament diagnostic comparison**, not a ranking of "best model" and not
comparable across tournaments as evidence for weight changes. The sample is tiny (48 group matches).
Any weight conclusion requires multi-tournament evaluation (leave-one-tournament-out) in a later,
separately-approved phase — see `docs/BACKTESTING_METHOD.md`. The WC-2022 and WC-2018 diagnostic
numbers live in their own results docs; the three are recorded separately and must **not** be pooled
or averaged here.
