# Squad/Player Source Audit (Phase 1.17B)

Provenance and scope for the **standalone, UNWIRED** final-squad roster snapshot
(`data/model-inputs/snapshots/squad-2026-06-11.ts`), its types (`lib/types/squad.ts`),
generator (`scripts/generate-squad-snapshot.mjs`), and validator (`lib/data/validate-squad.ts`).

> **Roster metadata only. Unwired. Probability-neutral.** No squad-quality score is built;
> nothing here is read by `lib/model/*`; the active `squadQuality` placeholder (weight 4.0,
> status `placeholder`) is unchanged; no probabilities change. See
> `docs/SQUAD_PLAYER_LEAKAGE_CONTROL.md` for the leakage caveat.

## Source & licensing
- **Source:** the FIFA World Cup 2026 **final squad list PDF** (`SquadLists-English.pdf`),
  transcribed into a **user-supplied, pre-derived CSV** (player rows) plus a team-aggregate CSV
  used as a cross-check. Roster *facts* only (names, positions, DOB, club, caps, goals, height).
- **Committed artifact:** only the **derived TypeScript snapshot**. Raw CSV/XLSX are **not
  committed**. Reproducibility anchors (SHA-256), recorded in `SQUAD_SOURCE`:
  - player CSV: `b155454428964a5bd9de63611e0897fb5a1d760b38926403c9889c0c848ecf2f`
  - team aggregate CSV: `47ba078e3751f3198b4c1493991798aace639471127ebf74687299da25458c4a`
  - XLSX (human-review only): `9db68c6dfea77dced9377c37a5df84cfdc565cae9e2774571badb02707ecde5d`
- **No proprietary data:** no market value, transfer value, or commercial player ratings
  (EA FC / SoFIFA / Opta). The validator forbids `marketValue`, `transferValue`, `playerRating`,
  `fifaRating`, `sofifaRating`, `eaRating`, `optaRating`, `overall`, `potential`, `wage`,
  `contractValue`. No scraping.

## Coverage
48 teams x 26 players = **1248 player rows**. Team join: CSV `fifaCode` -> repo team id via
`SQUAD_FIFACODE_TO_ID` (validated against each official team's `countryCode`). Positions are
`GK` / `DF` / `MF` / `FW`.

## Schema (per team `SquadRow`)
Identity + leakage metadata: `teamId, fifaCode, sourceTeamName, squadDate, squadFreezeDate,
squadType, squadSourceVersion, dataStatus, sourceRef, sourcePdfPage`. `players[]`:
`playerNumber, playerName, firstNames, lastNames, nameOnShirt, position, dateOfBirth,
ageAtTournamentStart, club, clubCountry, heightCm, caps, goals, clubInTop5AssociationCountry,
sourceTeamPageRef, playerNotes?`. `aggregates` (recomputed from players): `playerCount,
averageAge, medianAge, averageHeightCm, totalCaps, capsPerPlayer, totalInternationalGoals,
goalsPerPlayer, goalkeepers/defenders/midfielders/forwardsCount,
playersAtClubsInTop5AssociationCountries, top5AssociationCountryShare, clubCountryDistribution,
distinctClubCountryCount, clubStrengthScore (null), squadDepthScore (null)`.

## Naming honesty (association-country proxy, NOT top-5 league)
The source column `isTop5EuropeanLeagueAssociation` is a **club ASSOCIATION-COUNTRY** flag (club
registered in ENG/ESP/FRA/GER/ITA). It is **not** a true top-five league-tier check - it does not
exclude lower divisions (e.g. a third-tier English club still counts). It is exposed honestly as
`clubInTop5AssociationCountry` / `playersAtClubsInTop5AssociationCountries` /
`top5AssociationCountryShare` and **must not be used as a squad-quality score**.

## Deferred (null by design)
`clubStrengthScore` and `squadDepthScore` are **not computed** (no clean, non-proprietary
club-strength source selected; methodology unwired pending backtesting). The validator asserts
they remain `null`.

## Validation (`validateSquad`)
48 teams x 26 players; valid positions/DOB/age/height/caps/goals; required fields + `sourceRef`;
`fifaCode` consistent with the official `countryCode`; aggregates recompute from the player rows;
club-country distribution matches; **forbidden proprietary fields absent**; deferred scores null;
and the **leakage-risk status, `final` type, `squadDate 2026-06-20`, `squadFreezeDate 2026-06-10`
are preserved** (plus `SQUAD_SOURCE.leakageRisk === true`).
