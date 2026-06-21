# WC-2022 Backtest Baseline Results — DIAGNOSTIC ONLY

> **DIAGNOSTIC ONLY.** WC-2022 only. **Group-stage is the headline** (48 matches); the
> all-64 table is **secondary/diagnostic**. These numbers are **NOT calibration**, **NOT a
> production model claim**, and **must not be used to tune weights** in this PR. There is **no
> tournament replay** and **no champion-picking conclusion** here. Values are **deterministic
> and pinned by Vitest** (`tests/backtesting-match-evaluator.test.ts`), which is the source of
> truth; this table is a readable audit summary.

## Scope
- Target: **90-minute W/D/L** (`resultAt90`). Extra-time and penalty advancement are **never**
  the prediction target — the all-64 table still scores only the 90-minute result.
- Variants are a fixed **diagnostic baseline ladder** (Elo-only → FIFA-only → Elo+FIFA →
  Elo+FIFA+host/regional). Active drivers use production `MODEL_WEIGHTS` constants; inactive
  drivers are forced to zero. No "current production equivalent" variant (most of its features
  are intentionally excluded from this pilot).
- Features are built directly from the WC-2022 snapshot; host/regional are relative to **Qatar /
  AFC**. Excluded features (squad, recent form, climate, structural, tournamentContext, manager)
  are neutral/zero.
- Metrics: **RPS** (ordinal W<D<L), **multiclass log loss** (clamped), **Brier**; **accuracy**
  is argmax hit rate (descriptive only). Lower RPS/logLoss/Brier is better.

## Headline — group stage (48 matches)

| modelVariant | matchCount | includedStages | RPS | logLoss | Brier | accuracy |
| --- | --- | --- | --- | --- | --- | --- |
| elo-only | 48 | group | 0.238651 | 1.110921 | 0.637314 | 0.541667 |
| fifa-only | 48 | group | 0.231994 | 1.047412 | 0.631767 | 0.541667 |
| elo-fifa | 48 | group | 0.238636 | 1.123338 | 0.636163 | 0.562500 |
| elo-fifa-host-regional | 48 | group | 0.240298 | 1.126756 | 0.639973 | 0.520833 |

## Secondary — all 64 matches at 90' (diagnostic)

| modelVariant | matchCount | includedStages | RPS | logLoss | Brier | accuracy |
| --- | --- | --- | --- | --- | --- | --- |
| elo-only | 64 | group + knockout (90') | 0.217873 | 1.057303 | 0.609806 | 0.562500 |
| fifa-only | 64 | group + knockout (90') | 0.227853 | 1.054135 | 0.635823 | 0.562500 |
| elo-fifa | 64 | group + knockout (90') | 0.217252 | 1.064169 | 0.607658 | 0.578125 |
| elo-fifa-host-regional | 64 | group + knockout (90') | 0.218526 | 1.067120 | 0.610567 | 0.546875 |

## Reading these numbers (neutral)
These are a **single-tournament diagnostic comparison**, not a ranking of "best model". The
sample is tiny (48 group matches), so differences between variants are **not** evidence to change
production weights. Knockout matches have different incentives and a higher 90-minute draw rate,
so the all-64 table is secondary. Any weight conclusion requires multi-tournament evaluation
(leave-one-tournament-out) in a later, separately-approved phase — see
`docs/BACKTESTING_METHOD.md`.
