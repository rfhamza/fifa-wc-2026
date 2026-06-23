# Backtesting Tournament Reconstruction & Replay (Phase 1.21B) — DIAGNOSTIC / DATA-VALIDATION

> **DATA / STRUCTURE VALIDATION ONLY — NOT REPLAY, NOT PROBABILITIES.** This document covers the
> deterministic historical tournament **reconstruction** (`lib/backtesting/tournament-reconstruction.ts`)
> and the boundary to a future Monte Carlo **replay** (not implemented). Reconstruction computes **no**
> model probabilities, **no** Monte Carlo, **no** champion probabilities, **no** calibration, and **no**
> LOTO. It does not affect the primary four-tournament headline, the stretch diagnostics, LOTO, or any
> production probability. **Calibration remains NO-GO.**

## Three distinct things (do not conflate)
1. **Match-level diagnostics** (`match-evaluator.ts`, `consolidate.ts`, `loto.ts`, stretch diagnostics):
   *given the matches that actually occurred*, how good were the model's 90-minute W/D/L probabilities?
   This is the headline (primary 2010/2014/2018/2022) + supplementary stretch context.
2. **Deterministic tournament reconstruction** *(implemented here, Phase 1.21B)*: *from the actual
   results*, recompute group standings and reconstruct the knockout progression; validate that the packs
   support tournament-level structure and that the actual champion/finalists/qualifiers are recoverable.
   **No probabilities.**
3. **Monte Carlo tournament replay** *(NOT implemented; future, separately approved)*: *from
   pre-tournament model probabilities*, simulate each tournament many times and report champion / finalist
   / semifinalist / R16 distributions vs the actual outcome, descriptively.

## What reconstruction does (Phase 1.21B)
`reconstructHistoricalTournament(pack)` is pure and deterministic. It:
- recomputes each group's standings from the actual group-stage results (points → goal difference →
  goals for; plus W/D/L, GF, GA), with `computedRank` and a `qualified` flag;
- verifies 8 groups × 4 teams, 6 matches/group, 3 matches/team, and the knockout stage counts
  (R16 8 / QF 4 / SF 2 / 3rd 1 / final 1);
- derives each knockout winner from the actual data — **regulation** (decisive at 90'), **penalties**
  (shootout winner), or **extra-time** (ET win without a shootout, resolved by which team advances to the
  next round);
- reconciles each group's computed top-two against the **actual Round-of-16 participants** (which are in
  the data);
- reports the champion where the pack encodes it, plus `assumptions`, `warnings`, and a
  `reconstructionStatus` of `clean` / `clean-with-assumptions` / `mismatch`.

It does **not** import or reuse the 2026 simulator, the official 2026 bracket, Annexe-C logic, or any
model/probability code, and it does **not** assume the 2026 Article-13 tiebreaker order applied
historically.

## Reconstruction results (all seven packs, deterministic)
> **Updated in Phase 1.21D:** with the source-backed `winner` field (see
> `docs/BACKTESTING_DATA_CONTRACT.md`), the 2010 and 2014 ET finals are now derived cleanly.
- **Champion derived (status `clean`):** 1998 France, 2002 Brazil, 2006 Italy, **2010 Spain**,
  **2014 Germany**, 2022 Argentina. (2010/2014 finals were extra-time wins without a shootout; the
  champion now comes from the pack's `winner` field, `method: "extra-time"` — **not** fabricated and
  **not** from the 90' score, which remains a 0–0 draw / `resultAt90:"D"`.)
- **Champion derived (status `clean-with-assumptions`):** 2018 France (Group H decided by a historical
  tiebreaker beyond points/GD/GF — fair play — with qualifiers confirmed from the Round of 16).

No tournament produced a `mismatch` or any warning. Before Phase 1.21D, 2010/2014 were
`clean-with-assumptions` with `actualChampion: null` / `method: "undetermined"` because the 90-minute-only
snapshots did not encode the ET winner; the `winner` field closed that gap **without** changing the
90-minute diagnostic convention.

## Source-backed `winner` field (Phase 1.21D)
Knockout matches now carry an optional, source-backed `winner` (team id) from the raw `winner` column.
Reconstruction **prefers** it and **falls back** to the results-only derivation (regulation → penalties →
extra-time-via-next-round) when absent; if both are available and disagree, that is a `warning` →
`mismatch` (never silently trusted). The field is **reconstruction-only**: `goalsA/goalsB` stay the
90-minute score, `resultAt90` stays the sole match-level diagnostic target, and the evaluator never reads
`winner`.

## Historical tiebreaker caveat
Exact historical group tie-resolution rules are **not encoded** in the packs and are **not assumed** to
equal 2026 Article 13. Standings use only basic keys (points → GD → GF). Where the 2nd/3rd boundary is
not decided by those keys, or where the computed top-two differs from who actually advanced,
reconstruction sets `tiebreakerAmbiguous` and **defers to the actual Round-of-16 qualifiers** (recorded
in the data), adding an assumption. Ambiguity is **flagged, not failed**, as long as the actual
qualifiers reconcile.

## Knockout / extra-time / penalty caveat
Winners are reconstructed from actual results only. There is **no extra-time or penalty-shootout
probability model**. Golden-goal-era matches (1998/2002) are stored as 90-minute draws + `afterExtraTime`
and are treated as **extra-time wins, not 90-minute wins**, resolved by next-round membership. For a
**leaf** match decided in extra time without a shootout (the 2010/2014 finals), the winner is simply not
in the pack and is reported as undetermined.

## What reconstruction does NOT change
Primary four-tournament headline, stretch diagnostics, LOTO, calibration governance, production
probabilities, the simulator, the evaluator, prediction-core, metric math, model variants, the feature
adapter, and all historical snapshots/generators are **untouched**. Reconstruction is additive,
isolated, and descriptive.

## Future: Monte Carlo replay (not implemented; separate approval required)
A future Monte Carlo replay would reuse the seeded RNG (`lib/simulation/rng.ts`), the historical feature
adapter (`feature-adapter.ts`, elo + fifa + host/regional), and `prediction-core`, with a **new 32-team
orchestrator** (the 2026 simulator is 48-team/12-group/Annexe-C specific and is not reused), an
**approximate** ET/penalty advancement model, and per-year bracket handling. It would be
**supplementary** and governance-flagged (`supplementaryOnly`, `headlineEligible:false`,
`calibrationEligible:false`, `tuningEligible:false`, `lotoEligible:false`, `productionEligible:false`),
**primary-only first**, with **no all-seven headline**. It is **out of scope** here and remains NO-GO
until separately approved. Calibration remains NO-GO regardless.
