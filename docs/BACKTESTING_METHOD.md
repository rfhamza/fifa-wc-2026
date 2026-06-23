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

### Stretch pack: WC-2006 (Phase 1.19B, stretch-only)
A fifth pack — **WC-2006** (Germany/UEFA) — is ingested **additively as stretch evidence only**
(`scripts/generate-historical-2006.mjs`, `data/historical/snapshots/wc-2006.ts`, `WC2006_EXPECTATIONS`;
Australia recorded as **OFC** per the source-pack qualification/allocation convention; Serbia and
Montenegro as the historical-only `serbia-and-montenegro` slug). It **does not** change the primary
four-tournament diagnostic headline, **does not** recompute LOTO or add stretch consolidation, and
**does not** approve calibration (**calibration remains NO-GO**). The validator engine is unchanged
(only `WC2006_EXPECTATIONS` added); no co-host validation is added (deferred to a future 2002 PR). See
`docs/BACKTESTING_WC2006_SNAPSHOT.md`.

### Stretch pack: WC-2002 (Phase 1.19C, stretch-only)
A sixth pack — **WC-2002** (South Korea + Japan) — is ingested **additively as stretch evidence only**
(`scripts/generate-historical-2002.mjs`, `data/historical/snapshots/wc-2002.ts`, `WC2002_EXPECTATIONS`).
It introduces the first **co-hosted** tournament (both hosts AFC) and the **golden-goal** era. Co-hosts
add an **additive, backward-compatible** validator extension (`expectedHostIds?`/
`expectedHostConfederations?`); the feature-adapter already supports multiple hosts via a host set (no
change). Golden-goal knockouts are stored as 90-minute draws + `afterExtraTime` (no new field, no schema
change). Slug rulings: `republic-of-ireland` (historical-only, not `ireland`), `china` (new), `turkiye`
(reuse). It **does not** change the primary four-tournament diagnostic headline, **does not** re-baseline
consolidation, **does not** recompute LOTO or add stretch consolidation, and **does not** approve
calibration (**calibration remains NO-GO**). See `docs/BACKTESTING_WC2002_SNAPSHOT.md`.

### Stretch pack: WC-1998 (Phase 1.19D, stretch-only)
A seventh pack — **WC-1998** (France) — is ingested **additively as stretch evidence only**
(`scripts/generate-historical-1998.mjs`, `data/historical/snapshots/wc-1998.ts`, `WC1998_EXPECTATIONS`).
It is the first **32-team** World Cup and a golden-goal-era edition, but **single-host** (France/UEFA),
so it reuses the existing single-host expectation pattern with **no validator engine change**. Slug
ruling: **FR Yugoslavia → `fr-yugoslavia`** (historical-only, distinct from modern `serbia` and from
`serbia-and-montenegro`; never remapped onto a modern successor); new clean slugs `bulgaria`/`chile`/
`colombia`/`jamaica`/`romania`; reuse of 2026-official `scotland`/`norway`/`austria`. Golden-goal
knockouts stored as 90-minute draws + `afterExtraTime` (no new field). It **does not** change the
primary four-tournament diagnostic headline, **does not** re-baseline consolidation, **does not**
recompute LOTO or add stretch consolidation, and **does not** approve calibration (**calibration remains
NO-GO**). With 1998/2002/2006 all merged, any cross-stretch consolidation is a separate,
explicitly-approved future phase. See `docs/BACKTESTING_WC1998_SNAPSHOT.md`.

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

## Parity audit & staged path to calibration (Phase 1.18C-2 → 1.18C-6)
The production/backtesting parity audit is recorded in `docs/BACKTESTING_PARITY_AUDIT.md`.
- **Phase 1.18C-4** extracted a pure, `data/model-inputs`-free prediction core
  (`lib/model/prediction-core.ts`); production `predict.ts` delegates to it (golden-proven, byte-identical).
- **Phase 1.18C-6** migrated the **backtesting evaluator** to that same core: it calls
  `computePredictionCore` (variants expressed as zeroed-weight `ModelWeights`; a deterministic historical
  status resolver), so production and backtesting now **share one scoring path** for the diagnostic
  drivers. Parity is **test-proven** by `tests/backtesting-core-parity.test.ts` (old-vs-core, byte-identical
  probabilities + metrics across all four packs / four variants / both modes). **Historical metric pins and
  the four-tournament macro-average are unchanged** — a harness parity migration, not a model improvement.

Remaining staged path: **(3) LOTO diagnostics → (4) calibration only if separately approved.** Calibration
remains **NO-GO** today; no production weights/probabilities changed and no new historical features were added.

## LOTO diagnostics (Phase 1.18C-8) — DIAGNOSTIC ONLY
Leave-One-Tournament-Out diagnostics are recorded in `docs/BACKTESTING_LOTO_DIAGNOSTICS.md`, produced by
the pure helper `lib/backtesting/loto.ts` (`computeLotoDiagnostics`) and pinned by
`tests/backtesting-loto.test.ts`. Four folds (hold out one of 2010/2014/2018/2022; reference = the other
three as equal-weight units) report each held-out tournament's metrics vs the reference macro-average, the
delta, and cross-fold stability (mean / stdDev / range), plus best-variant counts and a host/regional
vs Elo+FIFA comparison per held-out year. **LOTO fits nothing** — it is **descriptive only**: no tuning,
no weights, no temperature, no parameters; held-out values equal the existing per-tournament pins, and the
reference set is a **descriptive comparator, not a training set**. It is a **future calibration-governance
input, not calibration itself**; **calibration remains NO-GO**.

## Calibration governance (Phase 1.18C-10) — DECISION RECORD
The formal decision following the four-tournament and LOTO diagnostics is recorded in
`docs/BACKTESTING_CALIBRATION_GOVERNANCE.md`: **DO NOT CALIBRATE YET — calibration remains NO-GO.** That
document locks the boundary before any calibration experiment, stretch ingestion, or tournament replay —
it captures the objective options, the calibration-family options, the required LOTO validation design,
the six-stage decision ladder (production probabilities may change only in a separately approved stage-6
adoption PR), the risk table, and the universal NO-GO list. It is documentation only (no code, no
parameters, no production change).

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
Harness calls the **shared pure prediction core** `computePredictionCore`
(`lib/model/prediction-core.ts`, Phase 1.18C-6) with `TeamFeatureSet`s built from historical snapshots,
**bypassing** `buildFeatureSet`, `predict.ts` and production `data/model-inputs/*`. The core is
import-safe (config + poisson + `lib/utils` + types only); the isolation guard permits
`lib/model/prediction-core` while still forbidding `lib/model/predict` / `lib/model/features` /
`data/model-inputs`. Production 2026 forecast code and inputs remain untouched; historical data never
imports into production paths (guard test).
