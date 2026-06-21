# WC-2018 Historical Snapshot (Phase 1.18B-4)

The second ingested historical source pack — FIFA World Cup 2018 (Russia) — extending the bench
beyond the WC-2022 pilot so the match-level harness can be evaluated across more than one
tournament. **No calibration, no tournament replay, no weight tuning, and no production /
probability change.**

- **Derived snapshot (committed):** `data/historical/snapshots/wc-2018.ts`
  (`WC2018_PACK`, `WC2018_SOURCE`, `WC2018_NAME_TO_ID`, `WC2018_CONFEDERATION_COUNTS`).
- **Generator (dev-only):** `scripts/generate-historical-2018.mjs` —
  `node scripts/generate-historical-2018.mjs <dir-with-raw-files>`. A dedicated copy of the 2022
  generator pattern with 2018 constants (the 2022 generator is intentionally untouched; a shared
  generator is deferred until 2014).
- **Validator:** `lib/backtesting/validate-historical.ts` (`validateHistoricalPack` +
  `WC2018_EXPECTATIONS`; the host check is now parameterized).
- **Tests:** `tests/backtesting-wc2018.test.ts` (+ evaluator/isolation coverage).

## Isolation
The snapshot lives in the isolated backtesting layer; it is **never imported by the production 2026
app**, nothing is wired into `lib/model/*`, and no probabilities change.

## Source pack (4 CSVs + README)
Raw files are **NOT committed**; their SHA-256 is the reproducibility anchor (in `WC2018_SOURCE.files`).

| File | SHA-256 |
| --- | --- |
| `wc2018-identity.csv` | `0fcbe98d61db3621832308b38c62fa8f120ddcdac799569633c532830015b21d` |
| `wc2018-results.csv`  | `d906b886bae109f125dc550325f86d79565046360382b442a60bddde11b35ef7` |
| `wc2018-elo.csv`      | `29f72ab76178be1091a66e15c187d41e6cb198cc013b8bd644fcc0e63a7a3f63` |
| `wc2018-fifa.csv`     | `2ad328f42832b9c6ed0b2e54f72067f2fc4032a5b2dea2f70f4c06fe1866fc6b` |
| `README_SOURCE_NOTES.md` | `490dab599b81e837ea240902a13084b90a54e69d56c33c60abee8ebba37e0b1e` |

### Sources & licensing
- **Identity + results:** OpenFootball World Cup repository / `worldcup.json` (**CC0-1.0**) + the FIFA
  2018 tournament page; Fjelstul World Cup Database (**CC-BY-SA-4.0**) as the richer validation
  backbone.
- **FIFA ranking:** the 2018-06-07 release via the Dato-Futbol historical FIFA-ranking CSV,
  cross-checked against the kjytay 2018 dataset; official values, mirror licensing treated as
  reference-grade.
- **Elo:** International-football.net Elo table as on 2018-06-13 (calculated on eloratings.net) —
  small derived references, not raw site dumps.
- **Raw source files are not committed; checksums are the reproducibility anchor.**

## Normalization (compact raw → contract)
- **Identity** is one compact row → `teamIds[]` (32), `groups{}` (8×4), `confederations{}`,
  `hostCountries=["Russia"]`, `openingKickoff`, `format="32-team-8-groups"`, `bracket`. Per-team
  confederation is the known 2018 FIFA membership; the declared counts
  (`AFC=5; CAF=5; CONCACAF=3; CONMEBOL=5; UEFA=14; OFC=0`) are cross-checked against the tally.
- **Results** normalize stage labels (`group stage`→`group`, `round of 16`→`round-of-16`, …) and
  outcomes (`teamA_win`→`A`, `draw`→`D`, `teamB_win`→`B`). `goalsA`/`goalsB` are the **90-minute**
  goals; extra time (`afterExtraTime`) and **penalties (penalties made, not attempts)** are recorded
  separately. **Results are outcomes only.** The final is stored correctly as **France 4–2 Croatia**
  (an auxiliary third-party stats CSV that inverts this to Croatia 4–2 France was rejected).
- **Team mapping** uses the **historical id space**, reusing an existing canonical slug wherever the
  same nation already has one (2026 `data/official/teams.ts` or the 2022 snapshot). 28 of 32 reuse
  existing slugs (incl. `egypt`, `sweden`, `panama`, `colombia`, which are in the 2026 field); only
  `russia`, `peru`, `iceland`, `nigeria` are new historical slugs.

## Leakage controls (hard)
- **Cutoff = the opening kickoff**, `2018-06-14T18:00:00+03:00` (= `2018-06-14T15:00:00Z`).
- Every **Elo `asOfDate` = `2018-06-13`** (strictly before the cutoff).
- Every **FIFA `rankingDate` = `2018-06-07`**, the last pre-tournament release (the post-tournament
  July 2018 ranking is deliberately **not** used).
- **No** post-tournament rankings/Elo, **no** result-derived pre-tournament features.

## Deferred (not in this pack)
Macro/structural, recent-form, squads, managers, and venues/tournamentContext historical packs are
intentionally deferred (`macro`/`recentForm` empty; `squads`/`managers` absent). The match-level
evaluator runs 2018 unchanged via the generic `lib/backtesting/*` modules. Calibration, tournament
replay, weight tuning, and 2014/2010 ingestion remain out of scope (later phases).
