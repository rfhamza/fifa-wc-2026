# Recent-Form Source Audit (Phase 1.16B)

Provenance, leakage control, and methodology for the **standalone, UNWIRED** recent-form
layer: the source-backed last-10 results snapshot
(`data/model-inputs/snapshots/recent-form-2026-06-11.ts`), the pure aggregation/score
utilities (`lib/recent-form/`), and the validator (`lib/data/validate-recent-form.ts`).

> **Unwired + probability-neutral.** This layer is **not** read by `lib/model/*`. The active
> `recentForm` placeholder family, `MODEL_WEIGHTS.recentForm` (2.0), `predict.ts`,
> `features.ts`, `team-inputs.ts`, `sources.ts`, and the `ModelFeatureFamily` union are all
> unchanged. No probabilities change. Wiring is a later, separately-approved phase (1.16C).

## Source

- **Upstream:** the CC0 / public-domain **"International football results 1872-present"**
  dataset (`martj42/international_results`), full national-team coverage (friendlies +
  qualifiers + finals), with date, opponent, score, neutral flag, and competition.
- **Supplied input:** a **user-supplied, pre-derived "last-10 per team" CSV**
  (`wc2026_last10_pre_tournament_matches.csv`) built from that dataset - **not** the raw
  upstream `results.csv`. 48 teams x 10 matches = 480 rows, latest-first per team.
- **Reproducibility anchor:** the upstream URL points at GitHub `master` (mutable), so the
  **supplied CSV SHA-256 is the anchor**:
  `0a73d73fdbc455d9a32107a4d1b10fb2bc77d312544f117bb933d9f6ef3b87bc`.
- **Committed artifact:** only the **derived TypeScript snapshot**. The raw CSV and the XLSX
  (human-review only) are **not committed**. Each match row carries the upstream source URL
  and source CSV line for traceability.

## Leakage control

- **Cutoff = strictly before the opening kickoff `2026-06-11T19:00:00Z`** (the established
  Elo/FIFA baseline day). The validator rejects any match dated on/after `2026-06-11`.
- Supplied window: **2025-06-05 .. 2026-06-10** (all strictly pre-cutoff).
- **No** in-tournament results, live results, current standings, post-tournament ratings, or
  any future knowledge. The only dated inputs are completed pre-cutoff match results.

## Team-name mapping

`RECENT_FORM_NAME_TO_ID` maps each CSV `Team` display value to the repo team id (must resolve
48/48 or the generator fails). The one alias: **`Team = Czechia` but the dataset rows use
`Team dataset name = Czech Republic`** - perspective/score checks use the **dataset name**.
Opponents are stored by `opponentName`, with `opponentId` resolved **only** when the opponent
is itself a World Cup team (non-WC opponents need not resolve).

## Schema (per team)

Derived aggregates **plus** the 10 match-level rows (so aggregates are recomputable and the
no-leakage cutoff is provable):
`teamId, sourceTeamName, sourceDatasetName, cutoffDate, matchesConsidered5/10,
last5/last10 PointsPerMatch, last5/last10 GoalDiffPerMatch, last5/last10 GoalsFor/AgainstPerMatch,
recentMatches[10] { rank, date, opponentName, opponentId?, venue, goalsFor, goalsAgainst,
result, competition, competitionCategory, neutral, homeTeam, awayTeam, homeScore, awayScore,
sourceUrl, sourceCsvLine }, dataStatus, sourceRef`. Raw results basis is `source-backed`.

## Score (raw candidate, unwired)

`recentFormCandidateScore` (`lib/recent-form/score.ts`) maps points-per-match to a signed
**-1..+1** via a **fixed** neutral reference:
- `NEUTRAL_PPM = 1.5` (midpoint of the 0..3 PPM range, a draw-equivalent baseline - **not** an
  implicit field average); `PPM_SCALE = 1.5` so `0 PPM -> -1`, `3 PPM -> +1`.
- composite = `0.4 * last5 + 0.6 * last10` (named weights; last-10 favoured for stability).

This is **RAW form, not a residual**: it deliberately **overlaps Elo and FIFA** (both already
encode results), so it is **audit-only**. The **opponent-adjusted Elo residual is DEFERRED**:
the repo's Elo snapshot is a single as-of snapshot of only the 48 WC teams, with no opponent
Elo at match time, so a faithful residual cannot be computed yet. Names like
`recentFormResidualScore` / `opponentAdjustedFormScore` are reserved for that later phase.

### Realised distribution (audit only)
min `-0.68`, max `+0.88`, mean `+0.19`, median `+0.19`, stdev `0.36` (well-centred about the
neutral baseline). Top 5: Germany `+0.88`, Argentina `+0.80`, Japan `+0.72`, Austria `+0.69`,
Turkiye `+0.69`. Bottom 5: Jordan `-0.21`, Saudi Arabia `-0.27`, Ghana `-0.51`, Qatar `-0.61`,
New Zealand `-0.68`.

## Validation (`validateRecentForm`)

48 teams, one row each, exactly 10 latest-first matches (ranks 1..10), every date strictly
before cutoff, goals/scores non-negative integers, `result` consistent with goals, **perspective
consistent with raw home/away score via the dataset name**, neutral->`Neutral` venue, opponentIds
(when present) are official teams, derived aggregates recompute from the match rows, and honest
provenance (status `source-backed`, cutoff, checksum). A no-wiring test proves the active model
is untouched and probabilities do not change.

## Deferred / later phases

- **1.16C:** optional active integration - replace the `recentForm` placeholder with the
  candidate score, `placeholder -> candidate`, capped driver (`+/-10` or lower), sensitivity
  audit, intentional probability movement only through `recentForm`.
- **1.18:** the true opponent-Elo residual + calibration/backtesting.
- **2.0:** live tournament state (football-data.org or similar), exported to static snapshots -
  never a baseline runtime dependency.
