# Backtesting Methodology (Phase 1.18B-0)

How the historical test bench will evaluate and (later) calibrate the model. Design recorded now;
**no harness, no calibration, no production change in this phase.**

## Scope
Primary: **2010, 2014, 2018, 2022**; stretch: **1998, 2002, 2006**. **2026 excluded** (target;
also 48-team format - historical 32-team backtests validate the **match-level engine + driver
weights**, not the 2026 bracket). Champion-level metrics are inherently low-N (<=7) -> sanity only.

## Evaluation levels & metrics
- **Match-level (PRIMARY).** Group-stage matches scored at **90-minute W/D/L**. Metrics:
  **Ranked Probability Score (RPS)** (respects W/D/L ordering) + **multiclass log loss** +
  **reliability / calibration buckets**. Brier secondary.
- **Tournament-stage (SECONDARY)** via Monte Carlo replay: group top-2 advancement calibration;
  reach-R16/QF/SF/final/winner probability calibration; top-N hit rate; Spearman rank correlation
  of predicted-vs-actual stage reached.
- **Champion-pick (TERTIARY / sanity)**: champion within pre-tournament top-3 / top-5 / top-8.
  **Never** the optimisation target.

## Validation
- **Split by tournament, never by random match.** Use **leave-one-tournament-out (LOTO)**.
- Optimise match-level **RPS / log loss**; validate stage calibration. Do **not** optimise champion
  picking.
- Tune **small weight sets at a time**; keep documented caps unless evidence overrides; prefer the
  simpler model on ties.

## Baseline ladder (to beat)
Elo-only; FIFA-only; Elo+FIFA; current production-equivalent model; current model **minus each
candidate** (ablation: -climate, -structural, -tournamentContext, -manager); and recent-form
variants (**raw vs opponent-Elo residual vs + friendly-match discount**) once historical Elo as-of
is available.

## Intended outputs (later phases)
- candidate weight ranges with LOTO spread;
- whether to raise/lower/keep the tournamentContext +/-15 cap;
- whether recentForm should be wired (and raw vs residual);
- whether squadQuality should stay placeholder;
- whether structural/climate help or just add noise.
- **Any production weight/probability change is a separate, explicitly approved phase** after the
  ablation study; backtesting only *recommends*.

## Isolation
Harness calls the **stateless** `predictFromFeatures(a, b, weights)` / `computeDrivers`
(`lib/model/predict.ts`) with `TeamFeatureSet`s built from historical snapshots, **bypassing**
`buildFeatureSet` and production `data/model-inputs/*`. Production 2026 forecast code and inputs
remain untouched; historical data never imports into production paths (guard test).
