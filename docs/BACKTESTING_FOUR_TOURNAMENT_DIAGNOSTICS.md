# Four-Tournament Backtest Diagnostics (WC-2010/2014/2018/2022) — DIAGNOSTIC ONLY

> **DIAGNOSTIC ONLY.** Consolidates the already-pinned per-tournament match-level diagnostics across
> the **primary historical scope: 2010, 2014, 2018, 2022**. These numbers are **NOT calibration**,
> **NOT a production model claim**, and **must not be used to tune weights**. **Group-stage is the
> headline** (48 matches/tournament); all-64 is **secondary/diagnostic** (90-minute W/D/L only —
> extra-time/penalty advancement is never a target). The **macro-average weights each tournament
> equally** and is descriptive, not inferential. Values are deterministic and **pinned by Vitest**
> (`tests/backtesting-consolidation.test.ts` + `tests/backtesting-match-evaluator.test.ts`), which are
> the source of truth; these tables are a readable audit summary. **Calibration remains NO-GO** until a
> production/backtesting parity audit, a defined objective, and a leave-one-tournament-out (LOTO)
> validation design exist (see "Next steps").

## Scope & method
- Target: **90-minute W/D/L** (`resultAt90`); evaluated by the shared `lib/backtesting/match-evaluator.ts`
  for the fixed diagnostic ladder in `lib/backtesting/model-variants.ts`.
- Variants: **Elo-only · FIFA-only · Elo+FIFA · Elo+FIFA+host/regional**. Active drivers use production
  `MODEL_WEIGHTS` constants; inactive drivers forced to zero. No "production-equivalent" variant.
- Excluded features (neutral/zero): squad, recent form, climate, structural, tournamentContext, manager.
- Metrics: **RPS** (ordinal W<D<L), **multiclass log loss** (clamped), **Brier**; **accuracy** (argmax)
  is descriptive only. Lower RPS/logLoss/Brier is better.
- Aggregation: **macro-average = simple mean of the four per-tournament values** (equal weight per
  tournament). A pooled micro-average over all matches is deliberately **not** reported here.

## Group-stage headline — per tournament (48 matches each)

| Tournament | variant | RPS | logLoss | Brier | accuracy |
| --- | --- | --- | --- | --- | --- |
| 2010 | elo-only | 0.196084 | 0.997914 | 0.601816 | 0.520833 |
| 2010 | fifa-only | 0.220927 | 1.074604 | 0.649351 | 0.479167 |
| 2010 | elo-fifa | 0.202127 | 1.018394 | 0.616182 | 0.500000 |
| 2010 | elo-fifa-host-regional | 0.201610 | 1.014471 | 0.614649 | 0.500000 |
| 2014 | elo-only | 0.189773 | 0.908006 | 0.536186 | 0.604167 |
| 2014 | fifa-only | 0.226187 | 1.017085 | 0.610345 | 0.645833 |
| 2014 | elo-fifa | 0.183794 | 0.888234 | 0.523563 | 0.645833 |
| 2014 | elo-fifa-host-regional | 0.182562 | 0.884112 | 0.521259 | 0.666667 |
| 2018 | elo-only | 0.196349 | 0.932544 | 0.546919 | 0.583333 |
| 2018 | fifa-only | 0.230587 | 1.029163 | 0.619041 | 0.541667 |
| 2018 | elo-fifa | 0.195006 | 0.931218 | 0.542734 | 0.625000 |
| 2018 | elo-fifa-host-regional | 0.192460 | 0.925844 | 0.537438 | 0.625000 |
| 2022 | elo-only | 0.238651 | 1.110921 | 0.637314 | 0.541667 |
| 2022 | fifa-only | 0.231994 | 1.047412 | 0.631767 | 0.541667 |
| 2022 | elo-fifa | 0.238636 | 1.123338 | 0.636163 | 0.562500 |
| 2022 | elo-fifa-host-regional | 0.240298 | 1.126756 | 0.639973 | 0.520833 |

### Group-stage macro-average (4 tournaments, equal weight) — headline aggregate

| variant | RPS | logLoss | Brier | accuracy |
| --- | --- | --- | --- | --- |
| elo-only | 0.205214 | 0.987346 | 0.580559 | 0.562500 |
| fifa-only | 0.227424 | 1.042066 | 0.627626 | 0.552083 |
| elo-fifa | 0.204891 | 0.990296 | 0.579660 | 0.583333 |
| elo-fifa-host-regional | 0.204232 | 0.987796 | 0.578330 | 0.578125 |

## All-64 secondary — per tournament (64 matches each, 90-minute W/D/L)

| Tournament | variant | RPS | logLoss | Brier | accuracy |
| --- | --- | --- | --- | --- | --- |
| 2010 | elo-only | 0.188848 | 0.971146 | 0.580925 | 0.546875 |
| 2010 | fifa-only | 0.221460 | 1.068904 | 0.645454 | 0.531250 |
| 2010 | elo-fifa | 0.191949 | 0.981823 | 0.588761 | 0.531250 |
| 2010 | elo-fifa-host-regional | 0.191403 | 0.978522 | 0.587160 | 0.531250 |
| 2014 | elo-only | 0.190670 | 0.966312 | 0.579339 | 0.546875 |
| 2014 | fifa-only | 0.219121 | 1.051875 | 0.633173 | 0.578125 |
| 2014 | elo-fifa | 0.186371 | 0.952269 | 0.570727 | 0.578125 |
| 2014 | elo-fifa-host-regional | 0.187450 | 0.955101 | 0.573118 | 0.593750 |
| 2018 | elo-only | 0.201170 | 0.967517 | 0.573507 | 0.546875 |
| 2018 | fifa-only | 0.228229 | 1.044223 | 0.629291 | 0.500000 |
| 2018 | elo-fifa | 0.200959 | 0.968904 | 0.572945 | 0.578125 |
| 2018 | elo-fifa-host-regional | 0.197796 | 0.960757 | 0.565740 | 0.593750 |
| 2022 | elo-only | 0.217873 | 1.057303 | 0.609806 | 0.562500 |
| 2022 | fifa-only | 0.227853 | 1.054135 | 0.635823 | 0.562500 |
| 2022 | elo-fifa | 0.217252 | 1.064169 | 0.607658 | 0.578125 |
| 2022 | elo-fifa-host-regional | 0.218526 | 1.067120 | 0.610567 | 0.546875 |

### All-64 macro-average (4 tournaments, equal weight) — secondary aggregate

| variant | RPS | logLoss | Brier | accuracy |
| --- | --- | --- | --- | --- |
| elo-only | 0.199640 | 0.990569 | 0.585894 | 0.550781 |
| fifa-only | 0.224166 | 1.054784 | 0.635935 | 0.542969 |
| elo-fifa | 0.199133 | 0.991791 | 0.585023 | 0.566406 |
| elo-fifa-host-regional | 0.198794 | 0.990375 | 0.584146 | 0.566406 |

## Comparability notes
The four tournaments run through identical shared code, so by construction they share: the **same
outcome target** (90' W/D/L), **same metric definitions**, **same diagnostic variants**, **same score
semantics** (snapshot `goalsA/goalsB` = 90-minute score; ET/penalties recorded separately, never a
target), **same source-cutoff rule** (Elo/FIFA dated strictly before each opening kickoff), and **same
host/regional logic** (relative to each tournament's host confederation). Additional notes:
- **The FIFA driver uses rank (place), not points.** The stored FIFA `points` differ by era/formula
  (2010/2014 additive vs 2018/2022 Elo-based) but are **not** consumed by these variants; rank is
  era-comparable. A future points-based variant would need an era-scale review.
- **Elo provenance varies** across packs (eloratings family via different mirrors; Qatar 2022 stored
  un-adjusted) and is treated as a diagnostic input, consumed as differences; no host adjustment is
  baked into any host's Elo.
- **Tournament match non-independence** (teams recur within a tournament) and **era drift** (style/goal
  -rate changes 2010→2022) remain limitations. They are immaterial to per-tournament descriptive
  diagnostics but **material to any pooled calibration** — which is why the four are reported
  per-tournament and only equal-weight macro-averaged, never pooled here.

## Reading these numbers (neutral)
This is a descriptive cross-tournament comparison, not a ranking of a "best model" and not a basis for
changing any production weight. Differences between variants are within the noise of small, correlated
samples (48 group matches/tournament). Do not over-interpret.

## Next steps (all separate, none in this report)
1. **Production/backtesting parity audit** before any calibration (verify the harness reproduces the
   production stateless prediction core; ideally extract a `data/model-inputs`-free core). *(Done:
   `docs/BACKTESTING_PARITY_AUDIT.md`; core extracted 1.18C-4, harness migrated 1.18C-6.)*
2. **Leave-one-tournament-out (LOTO) diagnostics** designed before any tuning. *(Done, descriptive only:
   `docs/BACKTESTING_LOTO_DIAGNOSTICS.md`, Phase 1.18C-8 — fits nothing; calibration still NO-GO.)*
3. If calibration is later approved, prefer **probability/temperature scaling** over feature-weight
   tuning; keep it reversible, documented, and separate from the source-backed snapshots.
4. **Calibration governance** (Phase 1.18C-10) records the formal decision in
   `docs/BACKTESTING_CALIBRATION_GOVERNANCE.md`: **DO NOT CALIBRATE YET; calibration remains NO-GO** (the
   diagnostic ladder is a 4-of-10-driver subset, not the production model).
