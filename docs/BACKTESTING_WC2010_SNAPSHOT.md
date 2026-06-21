# WC-2010 Historical Snapshot (Phase 1.18B-8)

The fourth ingested historical source pack — FIFA World Cup 2010 (South Africa) — **completing the
primary historical scope (2010, 2014, 2018, 2022)**. Completing 2010 does **not** trigger calibration:
per-tournament diagnostics remain un-pooled; any shared-generator refactor or pooled diagnostic report
is a later, separate decision. No weight tuning, no tournament replay, no production / probability change.

- **Derived snapshot (committed):** `data/historical/snapshots/wc-2010.ts`
  (`WC2010_PACK`, `WC2010_SOURCE`, `WC2010_NAME_TO_ID`, `WC2010_CONFEDERATION_COUNTS`).
- **Generator (dev-only):** `scripts/generate-historical-2010.mjs` —
  `node scripts/generate-historical-2010.mjs <dir-with-raw-files>`. A dedicated copy of the 2014
  generator pattern with 2010 constants (the 2022/2018/2014 generators are untouched; a shared
  generator remains deferred).
- **Validator:** `lib/backtesting/validate-historical.ts` (`validateHistoricalPack` +
  `WC2010_EXPECTATIONS`, South Africa/CAF; the host check was already parameterized in 1.18B-4).
- **Tests:** `tests/backtesting-wc2010.test.ts` (+ evaluator/isolation coverage).

## Isolation
The snapshot lives in the isolated backtesting layer; it is **never imported by the production 2026
app**, nothing is wired into `lib/model/*`, and no probabilities change.

## Source pack (4 CSVs + README)
Raw files are **NOT committed**; their SHA-256 is the reproducibility anchor (in `WC2010_SOURCE.files`).

| File | SHA-256 |
| --- | --- |
| `wc2010-identity.csv` | `8d3ad67b4036a70d119f6a9ccfc8369bf110bf839f93a7b2ccae9f58e8fe1d83` |
| `wc2010-results.csv`  | `5a81a98909e6a2779056702966efe805aa5bb3e671cadc7841e01ef77b1d018a` |
| `wc2010-elo.csv`      | `90f6f9524f41a407c6bb8005addecde81ab223872f14f33d4dec8e40f67a640f` |
| `wc2010-fifa.csv`     | `9d7d4cddbb14efc741f47347674d3d8221c391175fd2da4b97d9dff8c8593c1d` |
| `README_SOURCE_NOTES.md` | `d70777bcbe9ff7da9715d643f68bfc0fb88a82300e0183351b427db611aa342a` |

### Sources & licensing
- **Identity + results:** OpenFootball World Cup repository (`2010--south-africa/cup.txt` +
  `cup_finals.txt`, **CC0-1.0**) + the FIFA 2010 tournament page; Fjelstul World Cup Database
  (**CC-BY-SA-4.0**) as a richer validation backbone.
- **FIFA ranking:** the **exact** 2010-05-26 release via the en.fifaranking.net mirror; official values,
  mirror licensing treated as reference-grade.
- **Elo:** World Football Elo Ratings "2010 World Cup start" snapshot (eloratings.net), dated
  2010-06-10 — small derived references, not raw site dumps; **no host adjustment** applied to South Africa.
- **Raw source files are not committed; checksums are the reproducibility anchor.**

## Normalization (compact raw → contract)
- **Identity** is one compact row whose `groups` are **JSON** and `confederations` are **colon-style**
  (`AFC:4; CAF:6; CONCACAF:3; CONMEBOL:5; UEFA:13; OFC:1`). Normalized to `teamIds[]` (32), `groups{}`
  (8×4), `confederations{}`, `hostCountries=["South Africa"]`, `openingKickoff`,
  `format="32-team-8-groups"`, `bracket`. Declared counts cross-checked against the per-team tally.
- **Results** normalize capitalized stage labels (`Group stage`→`group`, …) and outcomes
  (`teamA`→`A`, `draw`→`D`, `teamB`→`B`); the extra-time flag column is `extraTime`.
- **Score convention (mirrors 2022/2018/2014):** the snapshot's `goalsA`/`goalsB` store the
  **90-minute** score (`goalsAAt90`/`goalsBAt90`); `resultAt90` is derived from the 90' score; extra
  time (`afterExtraTime`) and **penalties (penalties made, not attempts)** are recorded separately;
  the raw after-ET `goalsA`/`goalsB` are **not** used for the snapshot fields. **Results are outcomes
  only.** The **final** is stored as **Netherlands 0–1 Spain after extra time** → `goalsA:0, goalsB:0`,
  `resultAt90:"D"`, `afterExtraTime:true` (no shootout). Other ET/penalty cases preserved: USA–Ghana
  (1-1 at 90, 1-2 AET), Paraguay–Japan (0-0, pens 5-3), Uruguay–Ghana (1-1, pens 4-2).
- **Team mapping** uses the **historical id space**, reusing an existing canonical slug wherever the
  same nation already has one (2026 `data/official/teams.ts`, or the 2022/2018/2014 snapshots). 29 of
  32 reuse existing slugs; only **`slovenia`, `slovakia`, `north-korea`** are new historical slugs.
  **North Korea (Korea DPR / DPR Korea) → `north-korea`, DISTINCT from `south-korea` (Korea Republic) —
  never conflated.** **New Zealand → `OFC` (the sole OFC entrant).** Côte d'Ivoire → `ivory-coast`.

## Leakage controls (hard)
- **Cutoff = the opening kickoff** (South Africa v Mexico), `2010-06-11T16:00:00+02:00`
  (= `2010-06-11T14:00:00Z`).
- Every **Elo `asOfDate` = `2010-06-10`** (strictly before the cutoff).
- Every **FIFA `rankingDate` = `2010-05-26`** — the exact, single, source-backed last pre-tournament
  release (no post-tournament ranking used).
- **No** post-tournament rankings/Elo, **no** result-derived pre-tournament features.

## Deferred (not in this pack)
Macro/structural, recent-form, squads, managers, and venues/tournamentContext historical packs are
intentionally deferred (`macro`/`recentForm` empty; `squads`/`managers` absent). The match-level
evaluator runs 2010 unchanged via the generic `lib/backtesting/*` modules. Calibration, tournament
replay, weight tuning, and stretch-scope 1998/2002/2006 ingestion remain out of scope (later phases).
