# Leave-One-Tournament-Out (LOTO) Diagnostics (WC-2010/2014/2018/2022) — DIAGNOSTIC ONLY

> **DIAGNOSTIC ONLY.** This is a **descriptive validation view**, not calibration. **LOTO fits
> nothing** — no weights, no temperature, no parameters, no tuning. Each fold's held-out metric is
> exactly the already-pinned per-tournament value; the new content is the **reference macro-average** (the
> other three tournaments), the **delta**, and **cross-fold stability**. The reference set is a
> **descriptive comparator, not a training set**. The macro-average treats each tournament as an
> **equal-weight unit**; **no pooled micro-average** is reported. There is **no calibration
> recommendation** and **no production-model claim** here. Values are deterministic and **pinned by
> Vitest** (`tests/backtesting-loto.test.ts`), produced by the pure helper `lib/backtesting/loto.ts`
> (`computeLotoDiagnostics`); the tests are the source of truth and these tables are a readable summary.
> **Calibration remains NO-GO.**

## 1. Purpose & scope
Answer descriptive validation questions over the four primary historical tournaments: how **stable** each
diagnostic variant is when a tournament is held out, whether the all-four **macro-average hides** a
tournament-specific weakness, whether **one tournament dominates**, and whether **host/regional** helps
per held-out tournament. Scope = the existing 4-variant diagnostic ladder (Elo-only, FIFA-only, Elo+FIFA,
Elo+FIFA+host/regional) at the **90-minute W/D/L** target only. No advancement, no replay, no champion
outcomes, no production-model (10-driver) evaluation.

## 2. LOTO definition in this project
- **Four folds**, one per tournament held out; reference set = the other three, as **three
  tournament-level units** (equal-weight macro-average), never pooled as independent matches:
  - hold out **2010**, reference **2014/2018/2022**
  - hold out **2014**, reference **2010/2018/2022**
  - hold out **2018**, reference **2010/2014/2022**
  - hold out **2022**, reference **2010/2014/2018**
- **Group-stage headline:** held-out = **48** matches; reference = 3 × 48 as three units.
- **All-64 secondary:** held-out = **64** matches (90' W/D/L; knockout stage-tagged); reference = 3 × 64 as
  three units.
- **Metrics:** **RPS** primary; **logLoss** + **Brier** secondary; **accuracy** descriptive only
  (higher is better). Lower RPS/logLoss/Brier is better.
- **No fitting.** `delta = heldOut − referenceMacroAverage`. The reference macro-averages the **raw**
  per-tournament metrics then rounds to 6 dp (identical convention to the four-tournament consolidation).

## 3. Group-stage headline — RPS held-out vs reference (primary)
ΔRPS = held-out − reference; **negative = the held-out tournament is "easier"/lower-error than its
reference set** (and vice-versa). logLoss/Brier/accuracy follow the same fold structure and are pinned in
the test + summarised in §5.

| Held-out | variant | RPS held-out | RPS reference | ΔRPS |
| --- | --- | --- | --- | --- |
| 2010 | elo-only | 0.196084 | 0.208258 | -0.012174 |
| 2010 | fifa-only | 0.220927 | 0.229589 | -0.008662 |
| 2010 | elo-fifa | 0.202127 | 0.205812 | -0.003685 |
| 2010 | elo-fifa-host-regional | 0.201610 | 0.205107 | -0.003497 |
| 2014 | elo-only | 0.189773 | 0.210361 | -0.020588 |
| 2014 | fifa-only | 0.226187 | 0.227836 | -0.001649 |
| 2014 | elo-fifa | 0.183794 | 0.211923 | -0.028129 |
| 2014 | elo-fifa-host-regional | 0.182562 | 0.211456 | -0.028894 |
| 2018 | elo-only | 0.196349 | 0.208169 | -0.011820 |
| 2018 | fifa-only | 0.230587 | 0.226369 | 0.004218 |
| 2018 | elo-fifa | 0.195006 | 0.208186 | -0.013180 |
| 2018 | elo-fifa-host-regional | 0.192460 | 0.208157 | -0.015697 |
| 2022 | elo-only | 0.238651 | 0.194069 | 0.044582 |
| 2022 | fifa-only | 0.231994 | 0.225900 | 0.006094 |
| 2022 | elo-fifa | 0.238636 | 0.193643 | 0.044993 |
| 2022 | elo-fifa-host-regional | 0.240298 | 0.192211 | 0.048087 |

**Read:** 2022 is the clear outlier — every variant scores markedly worse on held-out 2022 than on its
reference set (large positive ΔRPS), while 2014 is notably "easier". This is exactly the
tournament-specific variation the single macro-average hides.

## 4. All-64 secondary — RPS held-out vs reference

| Held-out | variant | RPS held-out | RPS reference | ΔRPS |
| --- | --- | --- | --- | --- |
| 2010 | elo-only | 0.188848 | 0.203238 | -0.014390 |
| 2010 | elo-fifa-host-regional | 0.191403 | 0.201257 | -0.009854 |
| 2014 | elo-only | 0.190670 | 0.202630 | -0.011960 |
| 2014 | elo-fifa-host-regional | 0.187450 | 0.202575 | -0.015125 |
| 2018 | elo-only | 0.201170 | 0.199130 | 0.002040 |
| 2018 | elo-fifa-host-regional | 0.197796 | 0.199126 | -0.001330 |
| 2022 | elo-only | 0.217873 | 0.193563 | 0.024310 |
| 2022 | elo-fifa-host-regional | 0.218526 | 0.192217 | 0.026309 |

(FIFA-only / Elo+FIFA rows omitted for brevity; all 4 variants × 4 folds are pinned in the test.) The
all-64 view tells the same story (2022 hardest), but with **smaller** held-out spread than the group-stage
headline — knockout matches add selection effects, so all-64 and group-stage conclusions are **similar in
direction but not identical in magnitude**.

## 5. Cross-fold stability (held-out mean / population stdDev / range)
Mean of the four held-out values equals the existing all-four **macro-average**; **stdDev** and **range**
quantify how much each variant swings across held-out tournaments (lower stdDev = more stable).

**Group-stage:**

| variant | RPS mean | RPS stdDev | RPS range | logLoss stdDev | Brier stdDev |
| --- | --- | --- | --- | --- | --- |
| elo-only | 0.205214 | 0.019483 | 0.189773–0.238651 | 0.078550 | 0.041151 |
| fifa-only | 0.227424 | 0.004319 | 0.220927–0.231994 | 0.021667 | 0.014675 |
| elo-fifa | 0.204891 | 0.020550 | 0.183794–0.238636 | 0.089995 | 0.047531 |
| elo-fifa-host-regional | 0.204233 | 0.021885 | 0.182562–0.240298 | 0.093019 | 0.050120 |

**All-64:**

| variant | RPS mean | RPS stdDev | RPS range | logLoss stdDev | Brier stdDev |
| --- | --- | --- | --- | --- | --- |
| elo-only | 0.199640 | 0.011529 | 0.188848–0.217873 | 0.038570 | 0.014079 |
| fifa-only | 0.224166 | 0.003965 | 0.219121–0.228229 | 0.008941 | 0.005966 |
| elo-fifa | 0.199133 | 0.011685 | 0.186371–0.217252 | 0.043081 | 0.014803 |
| elo-fifa-host-regional | 0.198794 | 0.011976 | 0.187450–0.218526 | 0.045144 | 0.017085 |

**Read (descriptive):** FIFA-only is the most *stable* (lowest spread) but also the *worst* on average —
stability is not skill. The Elo-based variants have the best mean RPS but a wider spread driven by 2022.
**Do not over-interpret** spread from four folds.

## 6. Best-variant counts (held-out, lower is better; accuracy omitted as higher-is-better)
Number of folds (out of 4) in which each variant has the best held-out value; deterministic tie-break by
ladder order.

| metric | mode | elo-only | fifa-only | elo-fifa | elo-fifa-host-regional |
| --- | --- | --- | --- | --- | --- |
| RPS | group | 1 | 1 | 0 | 2 |
| RPS | all-64 | 1 | 0 | 2 | 1 |
| logLoss | group | 1 | 1 | 0 | 2 |
| logLoss | all-64 | 1 | 1 | 1 | 1 |
| Brier | group | 1 | 1 | 0 | 2 |
| Brier | all-64 | 1 | 0 | 2 | 1 |

No variant wins a majority across both modes — the "best" variant is **fold- and mode-dependent**, which
is itself the headline diagnostic finding.

## 7. Host/regional vs Elo+FIFA, by held-out tournament
Δ = (Elo+FIFA+host/regional) − (Elo+FIFA) on the held-out tournament; **negative ΔRPS = host/regional
helps**; `improves` is defined on RPS.

| Held-out | mode | ΔRPS | ΔlogLoss | ΔBrier | improves? |
| --- | --- | --- | --- | --- | --- |
| 2010 | group | -0.000517 | -0.003923 | -0.001533 | yes |
| 2014 | group | -0.001232 | -0.004122 | -0.002304 | yes |
| 2018 | group | -0.002546 | -0.005374 | -0.005296 | yes |
| 2022 | group | 0.001662 | 0.003418 | 0.003810 | no |
| 2010 | all-64 | -0.000546 | -0.003301 | -0.001601 | yes |
| 2014 | all-64 | 0.001079 | 0.002832 | 0.002391 | no |
| 2018 | all-64 | -0.003163 | -0.008147 | -0.007205 | yes |
| 2022 | all-64 | 0.001274 | 0.002951 | 0.002909 | no |

**Read:** host/regional helps in most folds but **hurts on held-out 2022** (and on all-64 2014) — the
effect is small and **not uniformly positive across tournaments**. Descriptive only; this is **not** a
basis to change any weight.

## 8. Data & statistical caveats
- Only **four** tournaments → only **four** folds.
- Matches are **not independent** (teams recur within a tournament).
- Football **eras differ** (2010→2022 style/goal-rate drift).
- **Host strength varies** by tournament.
- Held-out performance is inherently **noisy** at this n; differences are within sampling noise.
- **All-64 includes knockout selection effects** (stronger teams advance).
- Target is **90-minute W/D/L only** — no advancement, replay, or champion outcomes.
- **LOTO is a validation design, not proof of model superiority.** No significance claims.

## 9. Calibration boundary (LOTO does NOT permit any of this)
- No production weight changes; no feature-weight tuning; no temperature scaling; no calibration
  parameters.
- No use of 2026 post-cutoff data; no champion-only objective; no tournament-replay calibration.
- No edits to source-backed historical snapshots; no edits to production model weights/probabilities.
- **Calibration remains NO-GO.** LOTO diagnostics are a **future calibration-governance input, not
  calibration itself**. Before any calibration: an approved **objective**, an approved **validation
  method**, a decision on **group-stage vs all-64** as the objective, a decision on **probability/
  temperature scaling vs feature-weight tuning**, explicit **overfitting controls**, and documented
  **uncertainty** — none of which exist yet.
