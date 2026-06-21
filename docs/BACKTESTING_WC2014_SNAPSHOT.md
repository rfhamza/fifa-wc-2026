# WC-2014 Historical Snapshot (Phase 1.18B-6)

The third ingested historical source pack — FIFA World Cup 2014 (Brazil) — bringing the bench to
three tournaments (2022, 2018, 2014). **Still not calibration:** no weight tuning, no tournament
replay, no pooling across tournaments, and no production / probability change.

- **Derived snapshot (committed):** `data/historical/snapshots/wc-2014.ts`
  (`WC2014_PACK`, `WC2014_SOURCE`, `WC2014_NAME_TO_ID`, `WC2014_CONFEDERATION_COUNTS`).
- **Generator (dev-only):** `scripts/generate-historical-2014.mjs` —
  `node scripts/generate-historical-2014.mjs <dir-with-raw-files>`. A dedicated copy of the 2018
  generator pattern with 2014 constants/parsing (the 2022/2018 generators are untouched; a shared
  generator remains deferred).
- **Validator:** `lib/backtesting/validate-historical.ts` (`validateHistoricalPack` +
  `WC2014_EXPECTATIONS`, Brazil/CONMEBOL; the host check was already parameterized in 1.18B-4).
- **Tests:** `tests/backtesting-wc2014.test.ts` (+ evaluator/isolation coverage).

## Isolation
The snapshot lives in the isolated backtesting layer; it is **never imported by the production 2026
app**, nothing is wired into `lib/model/*`, and no probabilities change.

## Source pack (4 CSVs + README)
Raw files are **NOT committed**; their SHA-256 is the reproducibility anchor (in `WC2014_SOURCE.files`).

| File | SHA-256 |
| --- | --- |
| `wc2014-identity.csv` | `c49a6116449ac9ffdbf187bd03bf69decb590e0d7d4a8327518bac64a8fea934` |
| `wc2014-results.csv`  | `1d92cddda92ed6b0d9be06a4c72e3f54630760f152a19a438724780a5946f411` |
| `wc2014-elo.csv`      | `c6111018d1b1094b9003947af8ac83407acb96096fa84c8e8897340a41f209cc` |
| `wc2014-fifa.csv`     | `b542eadedb1fd7ee82935e61d3d73db5d53913318ff90ac88bff6122051b5e44` |
| `README_SOURCE_NOTES.md` | `70b7a7ada2021f75df5756d44f569af6055d03bec5f437c8b9b1afac56d8be87` |

### Sources & licensing
- **Identity + results:** OpenFootball World Cup repository (`2014--brazil/cup.txt` +
  `cup_finals.txt`, **CC0-1.0**) + the FIFA 2014 tournament page; Fjelstul World Cup Database
  (**CC-BY-SA-4.0**) as a richer validation backbone.
- **FIFA ranking:** the 2014-06-05 release via the en.fifaranking.net mirror; official values, mirror
  licensing treated as reference-grade.
- **Elo:** World Football Elo Ratings "2014 World Cup start" snapshot (eloratings.net), dated
  2014-06-11 — small derived references, not raw site dumps; **no host adjustment** applied to Brazil.
- **Raw source files are not committed; checksums are the reproducibility anchor.**

## Normalization (compact raw → contract)
- **Identity** is one compact row whose `groups` are **JSON** (`{"A": ["Brazil", ...], ...}`) and
  whose `confederations` are **colon-style** (`AFC:4; CAF:5; CONCACAF:4; CONMEBOL:6; UEFA:13`).
  Normalized to `teamIds[]` (32), `groups{}` (8×4), `confederations{}`, `hostCountries=["Brazil"]`,
  `openingKickoff`, `format="32-team-8-groups"`, `bracket`. The declared counts are cross-checked
  against the per-team tally. (The source omits OFC; `WC2014_EXPECTATIONS` carries `OFC: 0` explicitly.)
- **Results** normalize capitalized stage labels (`Group stage`→`group`, `Round of 16`→`round-of-16`,
  …) and outcomes (`teamA`→`A`, `draw`→`D`, `teamB`→`B`); the extra-time flag column is `extraTime`.
- **Score convention (mirrors 2022/2018):** the snapshot's `goalsA`/`goalsB` store the **90-minute**
  score (`goalsAAt90`/`goalsBAt90`); `resultAt90` is derived from the 90' score; extra time
  (`afterExtraTime`) and **penalties (penalties made, not attempts)** are recorded separately. The raw
  `goalsA`/`goalsB` (after-ET) are **not** used for the snapshot fields. **Results are outcomes only.**
  The **final** is stored as **Germany 1–0 Argentina after extra time** → `goalsA:0, goalsB:0`,
  `resultAt90:"D"`, `afterExtraTime:true` (no shootout).
- **Team mapping** uses the **historical id space**, reusing an existing canonical slug wherever the
  same nation already has one (2026 `data/official/teams.ts`, or the 2022/2018 snapshots). 28 of 32
  reuse existing slugs; only **`chile`, `greece`, `italy`, `honduras`** are new historical slugs.
  Aliases resolve to the canonical slug (e.g. **Côte d'Ivoire → `ivory-coast`**, Bosnia-Herzegovina →
  `bosnia-herzegovina`, IR Iran → `iran`, Korea Republic → `south-korea`, USA/United States → `usa`).

## Leakage controls (hard)
- **Cutoff = the opening kickoff** (Brazil v Croatia), `2014-06-12T17:00:00-03:00`
  (= `2014-06-12T20:00:00Z`).
- Every **Elo `asOfDate` = `2014-06-11`** (strictly before the cutoff).
- Every **FIFA `rankingDate` = `2014-06-05`**, the last pre-tournament release (no post-tournament
  ranking used).
- **No** post-tournament rankings/Elo, **no** result-derived pre-tournament features.

## Deferred (not in this pack)
Macro/structural, recent-form, squads, managers, and venues/tournamentContext historical packs are
intentionally deferred (`macro`/`recentForm` empty; `squads`/`managers` absent). The match-level
evaluator runs 2014 unchanged via the generic `lib/backtesting/*` modules. Calibration, tournament
replay, weight tuning, and 2010 ingestion remain out of scope (later phases).
