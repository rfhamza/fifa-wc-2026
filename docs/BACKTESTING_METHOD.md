# Backtesting Methodology (Phase 1.18B-0; harness landed in 1.18C-1)

How the historical test bench will evaluate and (later) calibrate the model. Design recorded in
1.18B-0; the **first match-level harness landed in Phase 1.18C-1** (WC-2022 only). Still **no
calibration, no weight tuning, no tournament replay, and no production/probability change.**

## Status (Phase 1.18C-1; 2018 pack added in 1.18B-4)
The match-level evaluator scores historical snapshots at 90-minute W/D/L for a fixed **diagnostic
baseline ladder** (Elo-only, FIFA-only, Elo+FIFA, Elo+FIFA+host/regional). Headline metrics are the
**48 group matches**; an **all-64** mode (90-minute W/D/L, stage-tagged) is available behind a flag.
It is isolated (`lib/backtesting/*` imports only the import-safe `lib/model/config` +
`lib/simulation/poisson` + type-only `lib/types`, never `lib/model/predict`, `lib/model/features`, or
`data/model-inputs`). Results are deterministic and pinned by Vitest
(`tests/backtesting-match-evaluator.test.ts`). Modules:
`lib/backtesting/{metrics,feature-adapter,model-variants,match-evaluator}.ts`.

**Ingested packs:** **WC-2022** (1.18B-2), **WC-2018** (1.18B-4), **WC-2014** (1.18B-6), and **WC-2010**
(1.18B-8) — the **primary historical scope (2010, 2014, 2018, 2022) is now complete**. All validated,
with diagnostic results in `docs/BACKTESTING_WC{2022,2018,2014,2010}_BASELINE_RESULTS.md`
(diagnostic-only; per-tournament, **never pooled** — completing the four does NOT begin calibration).
The validator host check is parameterized via `HistoricalPackExpectations` (`WC2022_EXPECTATIONS` =
Qatar/AFC, `WC2018_EXPECTATIONS` = Russia/UEFA, `WC2014_EXPECTATIONS` = Brazil/CONMEBOL,
`WC2010_EXPECTATIONS` = South Africa/CAF, OFC=1). Each tournament uses a dedicated generator
(`scripts/generate-historical-<year>.mjs`); a shared generator remains deferred. **Next (separate,
not yet approved):** validate the four-tournament diagnostic pattern, then decide whether a small
shared-generator refactor and/or a pooled (LOTO) diagnostic report is warranted **before** any
calibration. Still **no calibration, no replay, no weight tuning, no production/probability change.**

## Four-tournament consolidation (Phase 1.18C-1)
The primary historical source scope is complete and the four-tournament diagnostics are consolidated
in `docs/BACKTESTING_FOUR_TOURNAMENT_DIAGNOSTICS.md` (DIAGNOSTIC ONLY), produced by the pure helper
`lib/backtesting/consolidate.ts` and pinned by `tests/backtesting-consolidation.test.ts`. The headline
aggregate is the **macro-average** (equal weight per tournament); no pooled micro-average is reported.
**Diagnostics stay strictly separate from calibration.** Calibration remains **out of scope / NO-GO**
until: (1) a **production/backtesting parity audit** confirms the harness matches the production
stateless prediction core; (2) a **calibration objective** is defined up front; and (3) a
**leave-one-tournament-out (LOTO)** validation is designed before any tuning. If calibration is later
approved, **probability/temperature scaling is preferred over feature-weight tuning**, must be
reversible/documented, and must live separately from the source-backed snapshots.

## Parity audit & staged path to calibration (Phase 1.18C-2)
The production/backtesting parity audit is recorded in `docs/BACKTESTING_PARITY_AUDIT.md`. Key point:
the harness shares the Poisson W/D/L step and `config` constants and mirrors the active Elo/FIFA/host/
regional driver math, but **production/backtesting numerical parity has NOT yet been test-proven** —
the only *identified* prediction-output difference today is production's 4-decimal rounding, and full
parity stays unproven until a pure-core extraction + parity test exists. Staged path: **(1) parity
audit → (2) pure prediction-core extraction + parity tests → (3) LOTO diagnostics → (4) calibration
only if separately approved.** Calibration remains **NO-GO** today.

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
