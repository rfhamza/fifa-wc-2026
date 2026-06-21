# WC-2006 Historical Snapshot (Phase 1.19B) — DIAGNOSTIC / STRETCH SOURCE PACK

The first **stretch** historical source pack — FIFA World Cup 2006 (Germany) — ingested **additively**
on top of the completed primary scope (2010, 2014, 2018, 2022).

> **STRETCH EVIDENCE ONLY.** WC-2006 is additive stretch evidence. It is **not** calibration, **not**
> tournament replay, and **not** weight tuning. It **does not** change the primary four-tournament
> diagnostic headline, **does not** recompute LOTO, **does not** add stretch consolidation, and **does
> not** approve calibration — **calibration remains NO-GO** (`docs/BACKTESTING_CALIBRATION_GOVERNANCE.md`).
> Per-tournament diagnostics are **not** pooled with the primary scope.

- **Derived snapshot (committed):** `data/historical/snapshots/wc-2006.ts`
  (`WC2006_PACK`, `WC2006_SOURCE`, `WC2006_NAME_TO_ID`, `WC2006_CONFEDERATION_COUNTS`).
- **Generator (dev-only):** `scripts/generate-historical-2006.mjs` —
  `node scripts/generate-historical-2006.mjs <dir-with-raw-files>`. A dedicated copy of the 2010
  generator pattern with 2006 constants (the 2010/2014/2018/2022 generators are untouched; a shared
  generator remains deferred).
- **Validator:** `lib/backtesting/validate-historical.ts` (`validateHistoricalPack` +
  `WC2006_EXPECTATIONS`, Germany/UEFA). **The validator engine is unchanged in this PR** — only
  `WC2006_EXPECTATIONS` was added. No co-host validation support is added here (that belongs to a
  future 2002 PR).
- **Tests:** `tests/backtesting-wc2006.test.ts`.

## Isolation
The snapshot lives in the isolated backtesting layer; it is **never imported by the production 2026
app**, nothing is wired into `lib/model/*`, and no probabilities change.

## Source pack (4 CSVs + README)
Raw files are **NOT committed**; their SHA-256 is the reproducibility anchor (in `WC2006_SOURCE.files`).

| File | SHA-256 |
| --- | --- |
| `wc2006-identity.csv` | `dd39530f719a2ed856916c5a8d263be0af037824acf775f8cb6bfe6f60ff36c1` |
| `wc2006-results.csv`  | `e3cec3f67e67b931acbdb847869bd8bfec52820010feb458244c3eceb9036b86` |
| `wc2006-elo.csv`      | `d1a66fd72f7f0ec4e7856ae32985fe4904b5ebfc01962842faae750e97f33223` |
| `wc2006-fifa.csv`     | `3f55adc620056e0c8240e6b7ad8544ce3c89ceca5ecc65db1f3c02c72e6a46f4` |
| `README_SOURCE_NOTES.md` | `832713b561b57dba32e28992a6a2d019045b6b0d47e8610f5e188a715121e549` |

### Sources & licensing
- **Identity + results:** OpenFootball World Cup repository (`2006--germany/cup.txt` +
  `cup_finals.txt`, **CC0-1.0**) — the permissive fixtures/results route.
- **FIFA ranking:** the **exact** 2006-05-17 release via the en.fifaranking.net mirror; official
  values, mirror licensing treated as reference-grade. **Ranks may contain ties** (uniqueness is not
  asserted).
- **Elo:** World Football Elo Ratings "2006 World Cup start" snapshot (eloratings.net), dated
  2006-06-08 — small derived references, not raw site dumps; **no host adjustment** applied to Germany.
- **Raw source files are not committed; checksums are the reproducibility anchor.**

## Identity, cutoff & dates
- **Host:** Germany (**UEFA**). 32 teams; 8 groups of 4; Round of 16 → Final.
- **Opening cutoff (leakage):** the opening kickoff (Germany v Costa Rica),
  `2006-06-09T18:00:00+02:00` (= `2006-06-09T16:00:00Z`).
- **Elo date:** `2006-06-08` (strictly before the cutoff).
- **FIFA ranking date:** `2006-05-17` — the exact, single, source-backed last pre-tournament release
  (no post-tournament ranking used).
- **Confederation counts (source-pack allocation):** `AFC:4; CAF:5; CONCACAF:4; CONMEBOL:4; OFC:1;
  UEFA:14`. Declared counts are cross-checked against the per-team tally by the validator.

## Normalization (compact raw → contract)
- **Identity** is one compact row whose `groups` are **JSON** and `confederations` are **colon-style**.
  Normalized to `teamIds[]` (32), `groups{}` (8×4), `confederations{}`, `hostCountries=["Germany"]`,
  `openingKickoff`, `format="32-team-8-groups"`, `bracket`.
- **Results** normalize capitalized stage labels (`Group stage`→`group`, `Round of 16`→`round-of-16`,
  `Quarter-finals`→`quarter-final`, `Semi-finals`→`semi-final`, `Third-place play-off`→`third-place`,
  `Final`→`final`) and outcomes (`teamA`→`A`, `draw`→`D`, `teamB`→`B`); the extra-time flag column is
  `extraTime`.

### 90-minute score convention (mirrors 2022/2018/2014/2010)
The snapshot's `goalsA`/`goalsB` store the **90-minute** score (`goalsAAt90`/`goalsBAt90`);
`resultAt90` is derived from the 90' score; extra time (`afterExtraTime`) and **penalties (penalties
made, not attempts)** are recorded separately; the raw after-ET `goalsA`/`goalsB` are **not** used for
the snapshot fields. **Results are outcomes only.**

### ET / penalty cases (knockout-only)
- Argentina–Mexico (R16): 1–1 at 90, 2–1 AET (no shootout).
- Switzerland–Ukraine (R16): 0–0, Ukraine won **3–0** on penalties.
- Germany–Argentina (QF): 1–1, Germany won **4–2** on penalties.
- England–Portugal (QF): 0–0, Portugal won **3–1** on penalties.
- Germany–Italy (SF): 0–0 at 90, 0–2 AET (no shootout).
- **Final — known check:** **Italy 1–1 France** at 90, after extra time, **Italy win 5–3 on
  penalties** → `goalsA:1, goalsB:1, resultAt90:"D", afterExtraTime:true, penalties:{a:5,b:3}`.

Penalties imply a 90-minute draw and are never tied; ET/penalty rows are confined to knockout matches.

## Naming / slug decisions
Team mapping uses the **historical id space**, reusing an existing canonical slug wherever the same
nation already has one (2026 `data/official/teams.ts`, or the 2022/2018/2014/2010 snapshots).

- **Serbia and Montenegro → `serbia-and-montenegro` (HISTORICAL-ONLY).** The 2006 entity is the
  FR-Yugoslavia successor state that **dissolved into Serbia and Montenegro after the tournament**.
  It is given a dedicated historical-only slug, **distinct from the modern `serbia`** slug used by the
  2010/2018/2022 packs — the two are never conflated. (Pinned in tests.)
- **Czech Republic → `czechia` (REUSE).** The project already has a clean canonical slug, `czechia`,
  representing the same football-association continuity (it is used across the 2026 model inputs, e.g.
  `data/model-inputs/snapshots/elo-rating-2026-06-11.ts` and the recent-form snapshot, which map the
  display name "Czech Republic" → `czechia`). Per the corrected slug rule we **reuse `czechia`** and
  map the source/display name "Czech Republic" to it via `WC2006_NAME_TO_ID`; **no separate
  `czech-republic` slug is created.** (Pinned in tests.)
- **Côte d'Ivoire → `ivory-coast`** (canonical slug, as in the 2010 pack).
- **New clean historical slugs** (no canonical slug previously existed): `costa-rica`,
  `trinidad-and-tobago`, `togo`, `angola`, `ukraine` (plus reused-but-not-yet-in-a-snapshot
  `czechia`). Other nations (`poland`, `sweden`, `croatia`, `ecuador`, `paraguay`, `switzerland`, …)
  reuse slugs already present elsewhere in the project.

### Australia confederation decision (auditable)
The provided identity pack allocates `OFC:1`, and Australia is the only candidate, so **Australia is
recorded as `OFC`** for this pack.

- **Basis:** the **source-pack confederation convention, which reflects the World Cup
  qualification/allocation route** — Australia qualified for 2006 via the **OFC** path (the OFC winner
  vs CONMEBOL play-off against Uruguay).
- **Not tournament-date federation membership.** Australia's transfer to the **AFC took effect on
  2006-01-01**, i.e. *before* the June 2006 tournament, so a strict tournament-date-membership reading
  would say AFC. We deliberately **do not** use that basis here: the pack, the qualification route, and
  the historical allocation all treat Australia as OFC, and adopting the source convention keeps the
  declared confederation counts internally consistent and cross-checkable.
- The decision is **explicit and pinned in tests** (`australia → OFC`, sole OFC entrant); it is not
  left implicit.

## Leakage controls (hard)
- **Cutoff = the opening kickoff**, `2006-06-09T18:00:00+02:00` (= `2006-06-09T16:00:00Z`).
- Every **Elo `asOfDate` = `2006-06-08`** (strictly before the cutoff).
- Every **FIFA `rankingDate` = `2006-05-17`** — the exact pre-tournament release (no post-tournament
  ranking used).
- **No** post-tournament rankings/Elo, **no** result-derived pre-tournament features.

## Deferred (not in this pack)
Macro/structural, recent-form, squads, managers, and venues/tournamentContext historical packs are
intentionally deferred (`macro`/`recentForm` empty; `squads`/`managers` absent).

## Stretch-only scope note
This pack **does not** change the primary four-tournament diagnostics, **does not** recompute LOTO,
**does not** add stretch consolidation, **does not** approve calibration (**calibration remains
NO-GO**), and adds **no** tournament replay, weight tuning, production/probability change, evaluator
change, or validator-engine change. Ingestion of 2002 and 1998, and any stretch consolidation, remain
out of scope for this PR.
