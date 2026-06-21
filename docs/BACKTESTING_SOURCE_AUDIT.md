# Backtesting Source Audit (Phase 1.18B-0)

Candidate sources for the historical test bench. **No fetching in this phase** - audit only. All
usage is **derived-only** (raw never committed), checksummed, and as-of dated. Off-limits this
phase: football-data.org, proprietary squad ratings / market values, scraping, any 2026
live/in-tournament data.

| Source | Use | Licence | Coverage | As-of support | Reproducible | Raw out / derived committable | Leakage risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Fjelstul World Cup Database** | fixtures, results, group tables, brackets, squads, managers, venues | open / citeable | all World Cups | tournament-scoped | high | yes / yes | low (historical fact) |
| **World Football Elo** (eloratings) | pre-tournament Elo as-of | free non-commercial + attribution | all teams | **yes (dated)** | high (transcribe + checksum) | yes / yes | low if dated pre-opening |
| **FIFA ranking archive** | pre-tournament FIFA rank/points | reference; user CSV | since 1993 | yes (monthly) | medium-high | yes / yes | low if dated pre-opening |
| **World Bank WDI** | historical GDP / population / GDP-per-capita | **CC BY 4.0** | by year | yes (lag to year) | high | yes / yes | low (lagged macro) |
| **international-results** | pre-tournament recent form | **CC0** | all internationals | trivial (filter by date) | high | yes / yes | low if date < opening |
| **CCKP / CRU climate normals** | home-country climate (reused) | as Phase 1.13 | all | n/a (time-invariant normals) | high | yes / yes | none |
| **Wikipedia / Wikidata** | squads / managers / brackets backup | CC BY-SA / CC0 | broad | revision-pinned | medium | facts / yes | low w/ pinning |
| Official FIFA materials | cross-check only | restricted | - | - | - | reference only, NOT committed | - |

## Per-source notes
- **Fjelstul**: best single source for tournament structure + results + historical squads/managers;
  documented schema makes derived snapshots reproducible.
- **eloratings / FIFA archive**: provide the *pre-tournament* strength snapshots; must be dated
  strictly before each opening kickoff (the leakage anchor).
- **WDI**: clean CC BY; lag macro to tournament year or earlier.
- **international-results (CC0)**: same dataset already used for 2026 recent form; per-tournament
  recent form is just a date filter - and historical as-of Elo makes the **opponent-Elo residual**
  computable (which 2026-alone could not).
- **Climate normals**: time-invariant 1991-2020 normals are reusable across tournaments.

## Excluded / off-limits
football-data.org (Phase 2.0 only), Transfermarkt/EA/SoFIFA/Opta ratings or values, scraping, and
any post-tournament or 2026 in-tournament data.
