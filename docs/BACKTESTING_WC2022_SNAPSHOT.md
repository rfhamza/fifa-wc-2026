# WC-2022 Historical Snapshot (Phase 1.18B-2)

The first ingested historical source pack — a **backtesting pilot** for FIFA World Cup 2022 (Qatar).
Its purpose is to prove the source-pack **contract, team mapping, leakage controls, provenance,
checksums, and validation flow** on one clean, recent tournament. **It does not** add a match-level
harness, tournament replay, calibration, weight tuning, or any production / probability change.

- **Derived snapshot (committed):** `data/historical/snapshots/wc-2022.ts`
  (`WC2022_PACK`, `WC2022_SOURCE`, `WC2022_NAME_TO_ID`, `WC2022_CONFEDERATION_COUNTS`).
- **Generator (dev-only):** `scripts/generate-historical-2022.mjs` —
  `node scripts/generate-historical-2022.mjs <dir-with-raw-files>`.
- **Validator:** `lib/backtesting/validate-historical.ts` (`validateHistoricalPack`).
- **Tests:** `tests/backtesting-wc2022.test.ts` (+ isolation guard in
  `tests/backtesting-isolation.test.ts`).

## Isolation
The snapshot lives in the isolated backtesting layer. It is **never imported by the production 2026
app**, nothing is wired into `lib/model/*`, and no probabilities change. The isolation guard test
asserts no production module imports `data/historical/` or the snapshot.

## Source pack (4 CSVs + README)
Raw files are **NOT committed**; their SHA-256 is the reproducibility anchor (recorded in
`WC2022_SOURCE.files`).

| File | SHA-256 |
| --- | --- |
| `wc2022-identity.csv` | `1c5ea230b3877366e4cd0ee83ae7e79e68f15561c2318651b2eac36f4e969fd1` |
| `wc2022-results.csv`  | `2c3de1d9326fe5529e7fa912f99d750e5fefb6bf2cea76ca8c3c6f57ed3f9d44` |
| `wc2022-elo.csv`      | `6599fe082c5f3a4d941ded16f87bb2a853f43625139a86ee94c28663d4e9df91` |
| `wc2022-fifa.csv`     | `36faaf7e4c77cda3890abfb9615c64d2d6cc94ff98c2e0b237d409b8cd00895e` |
| `README_SOURCE_NOTES.md` | `076375c1bd66f74713a4ffec06c5615df1edf1598e949177ea5a9f204460f1c6` |

### Sources & licensing
- **Identity + results:** OpenFootball World Cup repository (**CC0-1.0**) + the FIFA Qatar 2022
  tournament page. **Fjelstul World Cup Database** is recommended for richer historical coverage but
  carries **CC-BY-SA-4.0** (attribution + share-alike) obligations.
- **FIFA ranking:** the 2022-10-06 release, supplied via a **public CSV mirror** plus official FIFA
  ranking context. The values are official conceptually, but the raw mirror's licensing is treated
  as **unclear / reference-grade**; only the derived values are committed, with citation.
- **Elo:** ProFootballLogic's 2022 WC odds page (Elo sourced from **eloratings.net**) — used as small
  **derived references**, not committed as raw site dumps.
- **Raw source files are not committed; checksums are the reproducibility anchor.**

## Normalization (compact raw → normalized contract)
- **Identity** is one compact row (groups and confederation counts encoded as strings). It is
  normalized into a `HistoricalTournamentIdentity`: `teamIds[]` (32), `groups{}` (8×4),
  `confederations{}`, `hostCountries` (`["Qatar"]`), `openingKickoff`, `format`
  (`32-team-8-groups`), and `bracket` (R16 pairings + round order). The validator does **not**
  require a one-row-per-team raw file. Per-team confederation is the known 2022 FIFA membership;
  the declared aggregate counts (`AFC=6; CAF=5; CONCACAF=4; CONMEBOL=4; UEFA=13; OFC=0`) are
  cross-checked against the tally.
- **Results** normalize stage labels (`group stage`→`group`, `round of 16`→`round-of-16`,
  `third-place match`→`third-place`, …) and outcomes (`teamA_win`→`A`, `draw`→`D`,
  `teamB_win`→`B`). `goalsA`/`goalsB` are the **90-minute** goals; extra time / penalties are
  recorded separately (`afterExtraTime`, `penalties{a,b}`). **Results are outcomes only** and never
  feed a pre-tournament feature.
- **Team mapping** uses the **historical id space**, reusing 2026 repo slugs where the nation also
  plays in 2026 and adding new slugs for nations absent from 2026 (`wales`, `poland`, `denmark`,
  `costa-rica`, `serbia`, `cameroon`). All 32 identity / result / Elo / FIFA teams must resolve.

## Leakage controls (hard)
- **Cutoff = the opening kickoff**, `2022-11-20T19:00:00+03:00` (= `2022-11-20T16:00:00Z`).
- Every **Elo `asOfDate`** is strictly before the cutoff (most `2022-11-19`; **Qatar `2022-11-09`**).
- Every **FIFA `rankingDate`** is the last pre-tournament release **`2022-10-06`** (strictly before
  the cutoff); the post-tournament **2022-12-22** ranking is deliberately **not** used.
- **Qatar Elo correction:** stored as the unadjusted eloratings value **`1680`**, *not*
  ProFootballLogic's host-adjusted **`1780`** (recorded in `WC2022_SOURCE.files.elo.notes`).
- **No** post-tournament rankings/Elo, **no** result-derived pre-tournament features; if a field
  can't be reconstructed without leakage it is omitted.

## Deferred (not in this pilot)
Macro/structural, recent-form, squads, managers, and venues/tournamentContext historical packs are
intentionally deferred (`macro`/`recentForm` are empty; `squads`/`managers` absent). The match-level
backtesting harness, tournament replay, and any calibration remain out of scope (later phases).
