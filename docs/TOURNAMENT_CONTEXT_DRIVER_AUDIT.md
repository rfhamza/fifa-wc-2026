# Tournament-Context Driver Audit (Phase 1.15B)

Wiring the pure tournament-context score (`lib/tournament-context/`) into the
prediction model as a **capped `candidate` driver**. This is the only intended
source of probability change in Phase 1.15B.

## Driver shape

- **Family:** `tournamentContext`; **status:** `candidate`.
- **Input:** the signed `-1..+1` composite from `tournamentContextScoreForTeam(...).composite`,
  carried per team on `TeamModelInputs` / `TeamFeatureSet` (neutral `0` fallback).
- **Formula:** `contribution = (a.tournamentContext - b.tournamentContext) * MODEL_WEIGHTS.tournamentContext`,
  with `MODEL_WEIGHTS.tournamentContext = 15`.
- **Cap:** hard `+/-15` Elo (`TOURNAMENT_CONTEXT_CONTRIBUTION_CAP`), applied **after** the
  raw contribution is computed, in `contributionCapFor` / `applyInputStatusAndCaps`
  (`lib/model/predict.ts`). Capped **individually**, never pooled with the placeholder
  aggregate (same treatment as the climate candidate driver).
- **Explanation:** the driver's `detail` shows both teams' scores and notes it is a
  capped candidate that excludes host/regional and defers heat/venue-climate.

## Why pairwise differences

The raw composite is **relative and favourability-skewed** (Phase 1.15A: realised
range ~`+0.01..+0.90`, nearly all positive). Using the **difference** `(a - b)` means
the common positive offset cancels, so only the *relative* gap between the two teams
moves a prediction. A team versus itself contributes exactly `0` (tested).

## Cap / weight rationale (why +/-15)

- `supremacyPerGoal = 250`, so `+/-15` Elo is approx `+/-0.06` goals of supremacy - modest.
- Realised pairwise gaps span ~`[0, 0.9]`; at weight `15` the largest gap yields ~`13`
  Elo, **under** the cap (the cap is a tail safety net that binds only if a gap exceeds
  `1.0`).
- `15 < regional (18) < climate cap (25)`: the new, partially-overlapping, uncalibrated
  prior is the weakest capped candidate, and cannot rival Elo/FIFA/host. Raise only
  after historical backtesting.

## Anti-double-counting (host / regional unchanged)

Host (`+60`) and regional (`+18`) are **binary** drivers and are **untouched**.
tournament-context measures only the **draw-specific logistics** of a team's actual
three group-stage matches (travel/rest/altitude/time-zone/venue-continuity); it does
**not** include crowd/home-soil/confederation advantage. Mexico is the useful check:
despite host status it ranks **near the bottom** of the context field (its altitude
dose drags it down), so it receives **no** favourable-context boost - confirming the
driver is not a second host bonus.

## Deferred: heat / venue-climate

No source-backed venue climate-normal dataset exists, so venue heat / venue-climate is
**omitted**; every score still lists `["heat","venueClimate"]` in `deferred`. No live
results, current weather, recent form, squad/player data, or football-data.org is used.

## Expected impact (driver off -> on, 4000 iters, seed 20260611)

Title-probability shifts are **modest and sensible** (max `|delta|` ~`0.93pp`; winner
probabilities still sum to ~`1.00`; pairwise symmetry preserved; deterministic):

- **Largest increases:** England `6.45% -> 7.33%` (+0.88pp), Portugal `5.50% -> 6.08%`
  (+0.58), France `13.43% -> 13.90%` (+0.47), Belgium (+0.46), Mexico (+0.33).
- **Largest decreases:** Colombia `3.03% -> 2.10%` (-0.93pp, the lowest-ranked context:
  altitude + congested rest), Argentina `23.23% -> 22.55%` (-0.68, favourite ceding a
  little to context-boosted mid-tier sides), Croatia (-0.45), Netherlands (-0.40).

No team jumps unrealistically from this driver alone; the hosts (USA/Canada/Mexico) do
**not** receive an outsized duplicate boost (Mexico's small +0.33pp is bracket
redistribution, not a context reward - it is a below-field-average context team).

Regenerate with `WRITE_SENSITIVITY_AUDIT=1 npx vitest run tests/model-sensitivity.test.ts`
(`docs/MODEL_SENSITIVITY_AUDIT.md`).

## Invariants preserved

`fixtureSource` stays `official`; W/D/L sums ~1; predict symmetry holds; deterministic
simulation unchanged for a fixed seed; existing `MODEL_WEIGHTS` values unchanged (only
the `tournamentContext` key added); Elo/FIFA/structural/climate snapshots, host/regional
logic, fixtures/bracket/schedule/draw slots all unchanged.

## Future work

Calibration/backtesting (later phase) may tune the weight/cap or demote the driver;
a source-backed venue climate-normal dataset would later add the deferred heat component.
