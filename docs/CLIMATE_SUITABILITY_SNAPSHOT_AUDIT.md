# Climate Suitability Snapshot Audit (Phase 1.13)

## Summary

The `climateFamiliarity` family was promoted from `placeholder` to a **mixed
`candidate`** family backed by a new snapshot of **home-country 1991-2020 monthly
climate normals**, plus a derived **12-month year-round football-playability**
suitability score. No model weights changed; the climate driver remains a weak,
explicitly **capped** signal (±25 Elo-equivalent pts).

This is the Klement/Joachim **home-country climate pillar** ("does a country's
climate support year-round outdoor football?"). It is deliberately **not** a
tournament-acclimatisation score: there is no June-July window, no venue climate,
and no travel/rest/altitude/humidity here. Those belong to a later
tournament-context phase.

## Provenance (MIXED -> family status `candidate`)

| Rows | Source | `dataStatus` |
|---|---|---|
| 46 economies (incl. Curaçao / CUW) | **World Bank Climate Knowledge Portal**, CRU TS4.09 monthly climatology 1991-2020 (mean temperature `tas` °C; precipitation `pr` mm/month) | `source-backed` |
| England, Scotland | **Met Office / HadUK-Grid** constituent areal series (calendar-month means over 1991-2020) | `official-derived` |
| (none) | documented missing geography | `unresolved` |

**Split: 46 `source-backed` + 2 `official-derived` + 0 `unresolved` = 48.**

- **Raw monthly arrays** are the trustworthy inputs (source-backed / official-derived).
  The **derived suitability score** is a documented `candidate` heuristic, **not**
  source-backed - which is why the family status is `candidate`.
- **England/Scotland are never CCKP `GBR`** and are **never parent-mapped to the
  United Kingdom** (the validator forbids a country code on these rows). They use the
  Met Office constituent-nation series directly.
- **Curaçao (CUW)** is present in the CCKP export, so it is `source-backed` (not
  unresolved). `unresolved` is reserved (validator-enforced) for an explicitly
  documented missing geography - currently only Curaçao would qualify if it were ever
  absent - and would return a neutral 0.5 score.

## Source files (NOT committed)

- CCKP: `cru-x0.5_climatology_tas_climatology_monthly_1991-2020_mean_historical_cru_ts4.09_mean.xlsx`
  and the matching `..._pr_...` file. Sheet `all`, columns `code, name, 1991-01..1991-12`.
  The 12 columns are the **Jan..Dec climate-normal values for the 1991-2020 period**
  (not single-year 1991 data).
- Met Office / HadUK-Grid: `England mean temp.txt`, `England rainfall.txt`,
  `Scotland mean temp.txt`, `Scotland rainfall.txt` (areal series; we filter years
  **1991-2020 inclusive**, ignore the seasonal/annual columns, and average each
  calendar month across the 30 years).

Raw `.xlsx` / `.txt` exports are **not** committed. URL:
<https://climateknowledgeportal.worldbank.org/> (CCKP egress is blocked in this
environment, so the data was supplied as a user export - never fetched or fabricated).

## Generation (not hand-transcribed)

The snapshot `data/model-inputs/snapshots/climate-suitability-1991-2020.ts` is
**generated deterministically** by `scripts/generate-climate-snapshot.py` (stable
ordering + fixed numeric formatting; re-running yields an identical file). It is
marked "DO NOT EDIT BY HAND". Spot-checks: England Jan/Jul means (4.40 / 16.48 °C
over 30 years) and Qatar's arid summer were verified against the raw sources.

**Arid-month precipitation:** CRU TS exports trace/near-zero precipitation for
hyper-arid months as blank (e.g. **Qatar Jun-Sep**). Blanks are stored as **0.0 mm**
- a documented interpretation, not a fabricated value, and score-neutral because
0 mm yields zero rain penalty. Temperature data is complete for all 46 economies.

## Derived score (candidate heuristic; calibration deferred)

`lib/model/climate-suitability.ts`, pure + deterministic. Per calendar month:

- **Temperature comfort** (0..1): `1.0` inside the ideal band
  **`IDEAL_TEMP_MIN_C = 10` .. `IDEAL_TEMP_MAX_C = 24`**; linear falloff to `0` at the
  **`COLD_FLOOR_C = 0`** and **`HEAT_CEILING_C = 32`** edges; flat `0` beyond.
- **Rain penalty** (multiplicative, 0..0.15): `0` at/below
  **`EXCESSIVE_PRECIP_MM = 250`**, ramping linearly to **`MAX_PRECIP_PENALTY = 0.15`**
  at/above **`FULL_PRECIP_PENALTY_MM = 500`**; never exceeds 0.15 (temperature
  dominates).
- `monthScore = tempScore * (1 - penalty)`, bounded 0..1.

Suitability = **mean of all 12 monthly scores**, bounded 0..1. Mapped onto the
model's 0..100 `climateFamiliarity` scale. `unresolved` rows return
`NEUTRAL_CLIMATE_SCORE = 0.5`.

These thresholds are **candidate heuristics**; statistical calibration is a separate
future step.

## Model integration + cap

- `data/model-inputs/team-inputs.ts` feeds `climateSuitabilityTo100(row)` into
  `climateFamiliarity` (`MODEL_INPUTS_VERSION` bumped to `...-climate-cckp-v6`).
- `data/model-inputs/sources.ts`: family status `placeholder` -> **`candidate`**.
- `lib/model/predict.ts`: the per-driver cap was **generalised** so it is no longer
  keyed off `placeholder` alone. The climate `candidate` driver is explicitly clamped
  to **±`CLIMATE_CONTRIBUTION_CAP` = 25**; the aggregate placeholder cap stays
  **placeholder-only** (climate is bounded individually, not pooled). The production
  `MODEL_WEIGHTS.climate = 0.8` is **unchanged**.

## Validation + tests

`validateClimateSnapshot()` asserts: 48 rows / one per team / no duplicates; every row
length-12 finite monthly temp (-60..60 °C) + precip (0..2000 mm); `baselinePeriod`
`"1991-2020"`; derived score in [0,1]; 3-letter CCKP code mapping on `source-backed`
rows; England/Scotland the only `official-derived` (empty code, not GBR); `unresolved`
only for documented geographies; conditional counts (`official-derived === 2`,
`source-backed === 48 - 2 - unresolved`); family/source `candidate`; and that no other
family silently changed status (Elo/FIFA still `source-backed`, structural still
`candidate`, squad/form still `placeholder`).

Tests: `tests/climate-suitability-snapshot.test.ts` (coverage, provenance, Curaçao
source-backed, validator) and `tests/climate-suitability-score.test.ts` (temperature
boundaries at 0/10/24/32 °C, precip penalty at 250 / just-above / ≥500 / cap never
exceeded, 0..1 bounds, `unresolved` -> 0.5). `tests/forecast-behavior.test.ts` asserts
the climate driver is `candidate` and capped ≤±25 and non-dominant in aggregate.

## Honesty / scope

- The raw normals are source-backed/official-derived; the **score is a candidate
  heuristic** and is capped - never presented as source-backed.
- England/Scotland are never GBR-coupled; Curaçao is source-backed; no value is
  fabricated (CRU blanks -> documented 0.0 mm only).
- Out of scope (deferred): tournament-window/venue climate, travel/rest/altitude/
  humidity/acclimatisation, current weather, live results, ranking/form/squad changes,
  and any model-weight change.
