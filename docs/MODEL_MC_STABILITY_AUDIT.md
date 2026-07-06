# Monte Carlo stability / 10,000-iteration audit

> **DIAGNOSTIC ONLY.** This report measures Monte Carlo sampling noise in the published
> stage probabilities. It changes **no production output**: the production default stays
> **2000 iterations** (`SIMULATION_CONFIG.defaultIterations`), no committed
> forecast snapshot is regenerated, and no config/model/weight/live-state/Blob/workflow is
> touched. The numbers are produced by `tests/simulation-mc-stability.test.ts` (run with
> `WRITE_MC_STABILITY_AUDIT=1`), which is the source of truth; this doc is a readable copy.

## Method

- **Inputs: committed checkpoints only.** Baseline (no locked results) plus each committed
  results ledger under `data/forecast/results/` (M24/M48/M54/M72/M73), reproduced through the
  same `ledgerToLockedResults`/`ledgerToKnockoutLockedResults` machinery the snapshot generator
  uses. No current/live-state, provider, Blob, or runtime projection is read.
- **Deterministic:** seeded mulberry32; a run is fully reproducible for a given (seed, iterations).
- **Two separate measurements**, deliberately not conflated:
  - **Section A** = same fixed production seed (20260611), 2,000 vs 10,000 iterations. This answers
    **"what would change if the same committed run were regenerated at 10,000 iterations"**.
  - **Section B** = one iteration count across 8 seeds. This is the
    **estimated run-to-run Monte Carlo noise** (the empirical standard error of a single run) -
    it is NOT a 2,000-vs-10,000 diff.

## Section A - same-seed 2,000 vs 10,000 (regeneration delta)

For each checkpoint: absolute change per team in each stage probability when the same seeded run
is taken from 2000 to 10000 iterations. `Δpp` = percentage points.

#### baseline

Overall (all stages pooled): max 2.8800 pp, median 0.2300 pp, mean 0.4376 pp. Top-8 winner-rank stability: max |rank move| = 1; tail-8: 2.

| stage | max Δpp | median Δpp | mean Δpp | >0.1pp | >0.25pp | >0.5pp | >1.0pp |
|---|--:|--:|--:|--:|--:|--:|--:|
| winner | 1.0900 | 0.0400 | 0.1296 | 16 | 8 | 2 | 1 |
| final | 1.6900 | 0.1100 | 0.2013 | 24 | 13 | 4 | 2 |
| semiFinal | 1.7500 | 0.1400 | 0.3633 | 28 | 17 | 13 | 6 |
| quarterFinal | 2.8800 | 0.2200 | 0.3992 | 38 | 20 | 10 | 4 |
| roundOf16 | 2.7100 | 0.2900 | 0.4892 | 35 | 25 | 20 | 7 |
| roundOf32 | 2.6300 | 0.4200 | 0.5983 | 42 | 31 | 23 | 9 |

#### M24

Overall (all stages pooled): max 2.7000 pp, median 0.2000 pp, mean 0.3514 pp. Top-8 winner-rank stability: max |rank move| = 1; tail-8: 1.

| stage | max Δpp | median Δpp | mean Δpp | >0.1pp | >0.25pp | >0.5pp | >1.0pp |
|---|--:|--:|--:|--:|--:|--:|--:|
| winner | 1.8800 | 0.0450 | 0.1483 | 15 | 8 | 2 | 1 |
| final | 1.3800 | 0.0900 | 0.1967 | 22 | 13 | 6 | 2 |
| semiFinal | 1.2000 | 0.1300 | 0.2737 | 26 | 19 | 9 | 1 |
| quarterFinal | 1.4200 | 0.1200 | 0.2558 | 27 | 16 | 9 | 1 |
| roundOf16 | 1.8800 | 0.3450 | 0.4754 | 41 | 30 | 19 | 7 |
| roundOf32 | 2.7000 | 0.3700 | 0.5025 | 40 | 29 | 16 | 6 |

#### M48

Overall (all stages pooled): max 2.3400 pp, median 0.0900 pp, mean 0.2998 pp. Top-8 winner-rank stability: max |rank move| = 0; tail-8: 0.

| stage | max Δpp | median Δpp | mean Δpp | >0.1pp | >0.25pp | >0.5pp | >1.0pp |
|---|--:|--:|--:|--:|--:|--:|--:|
| winner | 1.1600 | 0.0400 | 0.0904 | 14 | 2 | 1 | 1 |
| final | 1.2700 | 0.0450 | 0.1613 | 19 | 10 | 5 | 1 |
| semiFinal | 1.5200 | 0.0850 | 0.3192 | 23 | 18 | 11 | 6 |
| quarterFinal | 1.7100 | 0.3000 | 0.4383 | 32 | 25 | 21 | 8 |
| roundOf16 | 1.9200 | 0.1950 | 0.4375 | 32 | 23 | 17 | 7 |
| roundOf32 | 2.3400 | 0.0450 | 0.3142 | 21 | 15 | 11 | 3 |

#### M54

Overall (all stages pooled): max 2.2700 pp, median 0.0700 pp, mean 0.2956 pp. Top-8 winner-rank stability: max |rank move| = 0; tail-8: 1.

| stage | max Δpp | median Δpp | mean Δpp | >0.1pp | >0.25pp | >0.5pp | >1.0pp |
|---|--:|--:|--:|--:|--:|--:|--:|
| winner | 1.0100 | 0.0150 | 0.1175 | 12 | 8 | 5 | 1 |
| final | 0.9100 | 0.0700 | 0.1442 | 20 | 9 | 4 | 0 |
| semiFinal | 1.8700 | 0.1200 | 0.2808 | 26 | 17 | 11 | 3 |
| quarterFinal | 2.2300 | 0.0900 | 0.3779 | 23 | 17 | 11 | 8 |
| roundOf16 | 2.2700 | 0.3400 | 0.5608 | 33 | 25 | 17 | 12 |
| roundOf32 | 1.5700 | 0.0000 | 0.2904 | 19 | 13 | 10 | 7 |

#### M72

Overall (all stages pooled): max 2.6400 pp, median 0.0000 pp, mean 0.1668 pp. Top-8 winner-rank stability: max |rank move| = 0; tail-8: 1.

| stage | max Δpp | median Δpp | mean Δpp | >0.1pp | >0.25pp | >0.5pp | >1.0pp |
|---|--:|--:|--:|--:|--:|--:|--:|
| winner | 1.2400 | 0.0100 | 0.1108 | 13 | 7 | 3 | 1 |
| final | 1.1000 | 0.0200 | 0.1746 | 17 | 13 | 7 | 1 |
| semiFinal | 1.9200 | 0.0650 | 0.2842 | 21 | 13 | 7 | 6 |
| quarterFinal | 2.6400 | 0.1000 | 0.3358 | 24 | 19 | 11 | 4 |
| roundOf16 | 2.4200 | 0.2000 | 0.4288 | 32 | 22 | 13 | 6 |
| roundOf32 | 0.0000 | 0.0000 | 0.0000 | 0 | 0 | 0 | 0 |

#### M73

Overall (all stages pooled): max 2.8700 pp, median 0.0000 pp, mean 0.1842 pp. Top-8 winner-rank stability: max |rank move| = 0; tail-8: 0.

| stage | max Δpp | median Δpp | mean Δpp | >0.1pp | >0.25pp | >0.5pp | >1.0pp |
|---|--:|--:|--:|--:|--:|--:|--:|
| winner | 1.1500 | 0.0000 | 0.1246 | 15 | 7 | 4 | 1 |
| final | 1.1500 | 0.0300 | 0.1633 | 16 | 12 | 6 | 1 |
| semiFinal | 1.9300 | 0.1400 | 0.3254 | 27 | 20 | 11 | 4 |
| quarterFinal | 1.7200 | 0.1600 | 0.3304 | 27 | 20 | 13 | 4 |
| roundOf16 | 2.8700 | 0.3650 | 0.5296 | 28 | 26 | 16 | 6 |
| roundOf32 | 0.0000 | 0.0000 | 0.0000 | 0 | 0 | 0 | 0 |

### Baseline title (`winner`) - largest movers, 2,000 -> 10,000

| team | 2,000 (%) | 10,000 (%) | Δpp |
|---|--:|--:|--:|
| England | 8.300 | 7.210 | -1.090 |
| Argentina | 21.100 | 22.020 | +0.920 |
| Portugal | 5.150 | 5.610 | +0.460 |
| Germany | 2.300 | 1.870 | -0.430 |
| Colombia | 2.950 | 3.370 | +0.420 |

## Section B - estimated run-to-run Monte Carlo noise (multi-seed standard error)

Per-team standard deviation of each stage probability across 8 independent seeds,
averaged over the 48 teams. This quantifies the "on the order of a percentage point" note on the
methodology page (which is otherwise unmeasured in code).

### Baseline - mean / p95 standard error (pp), 2,000 vs 10,000

| stage | mean SE @2,000 | p95 SE @2,000 | mean SE @10,000 | p95 SE @10,000 | shrink |
|---|--:|--:|--:|--:|--:|
| winner | 0.1654 | 0.6118 | 0.0614 | 0.2095 | 2.70x |
| final | 0.2692 | 0.8198 | 0.1148 | 0.3892 | 2.34x |
| semiFinal | 0.4094 | 0.9823 | 0.1837 | 0.5068 | 2.23x |
| quarterFinal | 0.6247 | 1.5186 | 0.2751 | 0.6572 | 2.27x |
| roundOf16 | 0.7955 | 1.3851 | 0.3577 | 0.6485 | 2.22x |
| roundOf32 | 0.7170 | 1.3389 | 0.3048 | 0.5288 | 2.35x |

Expected analytic shrink is sqrt(10000/2000) = 2.24x. Analytic
binomial SE at 2,000 for reference: p=0.15 -> 0.798 pp,
p=0.5 -> 1.118 pp.

### M73 (deep into the knockouts) - mean / p95 standard error @2,000 (pp)

Locking completed results removes random draws, so late-tournament noise is lower than the baseline.

| stage | mean SE @2,000 | p95 SE @2,000 |
|---|--:|--:|
| winner | 0.1299 | 0.5878 |
| final | 0.2075 | 0.7903 |
| semiFinal | 0.3415 | 0.9885 |
| quarterFinal | 0.4965 | 1.2817 |
| roundOf16 | 0.5848 | 1.3745 |
| roundOf32 | 0.0000 | 0.0000 |

## Runtime & size

- Section A (6 checkpoints x (2000+10000) iterations): **12.6 s**.
- Section B (8 seeds x (2000+10000) baseline + 8 x 2000 M73): **18.5 s**.
- These run offline only (this env-gated generator). The Next.js build never simulates, and page
  renders read committed JSON - so iteration count does not affect CI/build time.
- **Snapshot file size is independent of iteration count** (each snapshot is a fixed 48 teams x 8
  probability keys, rounded to 4 dp), so adopting 10,000 would not grow `data/forecast/**` or the bundle.

## Cost of adoption (informational; NOT adopted here)

Adopting 10,000 for the **committed snapshots** would require regenerating all six snapshots and
re-pinning the six byte-for-byte tests (`forecast-snapshot-baseline`, `forecast-milestone-backfill`,
`forecast-live-aware-artifact`, `forecast-live-aware-provider-artifact`, `forecast-knockout-locked-results`)
plus the seed/iteration assertions. Adopting it for the **live Blob refresh** adds recurring cost to the
5-minute scheduled Action. Both are separate implementation PRs.

## Recommendation

Read Section A against the thresholds: if most public probabilities move < 0.25 pp and the top/tail
rankings are stable, **defer** (the current 2,000 is launch-fine and matches the published "~1 pp"
copy). If Section A shows > 0.5 pp movement on title/final for contending teams or any top-8 rank flip,
**consider adopting 10,000 for the committed final snapshots only** (offline one-time cost; file size
unchanged), and keep the live Blob at 2,000 unless the scheduled-Action budget allows. Global adoption
(raising `SIMULATION_CONFIG.defaultIterations`) remains a separate, larger PR. **Calibration and model
logic are unchanged either way.**

Observed on the baseline: title (`winner`) moves > 0.5 pp for 2 team(s) (max 1.09 pp), and the top-8 winner ranking shows a max rank move of 1. By the thresholds above this falls in the "consider adopting 10,000 for the committed final snapshots" band; the actual adoption decision is deferred to a separate implementation PR and is NOT taken here.
