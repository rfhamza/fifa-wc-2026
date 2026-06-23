# Backtesting Data Contract (Phase 1.18B-0)

Required **source packs** per historical tournament. The machine-readable contract is
`lib/backtesting/types.ts` (`HistoricalSourcePack`). Raw source files are **never committed** -
a later phase transcribes them into derived snapshots under `data/historical/snapshots/` with
provenance + SHA-256. Column templates: `data/historical/templates/`.

Scope: primary tournaments **2010, 2014, 2018, 2022**; stretch **1998, 2002, 2006**; **2026 is
excluded** (forecast target). Every "as-of"/date field must be **strictly before** the
tournament `openingKickoff` (see Leakage).

## 1. Tournament identity (`HistoricalTournamentIdentity`)
`tournamentYear, hostCountries[], openingKickoff (ISO), format, teamIds[], confederations{teamId->conf},
groups{groupId->teamId[]}, bracket? (knockout structure if available), provenance`.

## 2. Match results (`HistoricalMatchResult`)
`matchId, date, stage (group|round-of-32|round-of-16|quarter-final|semi-final|third-place|final),
group?, teamA, teamB, goalsA, goalsB, resultAt90? (A|D|B), afterExtraTime?, penalties?{a,b}, winner?,
venue?, sourceRef`. Group-stage W/D/L at 90' is the core scored outcome; ET/penalties are for
knockouts only.

**`goalsA`/`goalsB` are the 90-minute score** and `resultAt90` is the **only** match-level diagnostic
target — unchanged. **`winner` (Phase 1.21D)** is OPTIONAL, source-backed from the raw source-pack
`winner` column, and present on **knockout matches only** (group-stage rows omit it): it records the
**actual** team that won/advanced after extra time / penalties (the final carries the champion; the
third-place match carries its winner). It is **reconstruction metadata only** — never used for
match-level probability scoring (RPS/log loss/Brier/accuracy), never used to derive `resultAt90`, and
never used for consolidation, LOTO, stretch diagnostics, calibration, tuning, or production
probabilities. The validator checks `winner ∈ {teamA, teamB}`, group-stage absence, and consistency
with any decisive 90' result / shootout.

## 3. Pre-tournament Elo (`PreTournamentEloRow`)
`teamId, rating, asOfDate (< openingKickoff), sourceRef`.

## 4. Pre-tournament FIFA ranking (`PreTournamentFifaRow`)
`teamId, rank, points?, rankingDate (< openingKickoff), sourceRef`.

## 5. Historical macro (`HistoricalMacroRow`)
`teamId, year, population, gdpCurrentUsd, gdpPerCapitaUsd, lagRule (e.g. "tournament-year"|"year-1"),
sourceRef`. Use tournament-year or earlier; never a later vintage.

## 6. Recent-form pack (`RecentFormSourceRow`)
`teamId, asOfDate, matches[]{date, opponent, goalsFor, goalsAgainst, competition, neutral}, sourceRef`.
Only matches **strictly before** `openingKickoff`.

## 7. Optional packs
- **Managers** (`ManagerRow`): `teamId, managerName, managerNationality, sourceRef` -
  **candidate hypothesis only**, not a core feature.
- **Squad rosters** (`SquadRosterSourceRow`): `teamId, squadType, asOfDate, players[]{playerName,
  position, dateOfBirth?, club?, clubCountry?, caps?, goals?}, sourceRef` - **only if** final squads
  were known before kickoff. **No proprietary fields** (`BACKTEST_FORBIDDEN_FIELDS`: marketValue,
  transferValue, playerRating, fifaRating, sofifaRating, eaRating, optaRating, overall, potential,
  wage, contractValue).

## Leakage rules (hard)
- Only data known **before each tournament's opening kickoff**.
- Pre-tournament Elo/FIFA via dated as-of snapshots; macro lagged to tournament year or earlier.
- Squad lists only if final-before-start; managers as-of pre-start.
- **No** tournament results used as pre-tournament features; **no** post-tournament FIFA/Elo;
  **no** post-tournament rosters/transfers.
- If a feature cannot be reconstructed without leakage, **omit it**.
- Raw source files stay **outside** the repo; committed snapshots carry provenance + checksums.

## Provenance (`BacktestProvenance`)
`sourceName, sourceUrl?, sourceFile?, sha256?, licence?, retrievedAt?, asOfDate?, notes?` on every
pack/snapshot.
