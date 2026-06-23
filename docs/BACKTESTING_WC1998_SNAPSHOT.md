# WC-1998 Historical Snapshot (Phase 1.19D) — DIAGNOSTIC / STRETCH SOURCE PACK

The third **stretch** historical source pack — FIFA World Cup 1998 (France) — ingested **additively** on
top of the completed primary scope (2010, 2014, 2018, 2022) and the earlier stretch packs (2006, 2002).
With 1998 merged, all three near-term stretch tournaments (1998/2002/2006) exist.

> **STRETCH EVIDENCE ONLY.** WC-1998 is additive stretch evidence. It is **not** calibration, **not**
> tournament replay, and **not** weight tuning. It **does not** change the primary four-tournament
> diagnostic headline, **does not** re-baseline four-tournament consolidation, **does not** recompute
> LOTO, **does not** add stretch consolidation, and **does not** approve calibration — **calibration
> remains NO-GO** (`docs/BACKTESTING_CALIBRATION_GOVERNANCE.md`). Per-tournament diagnostics are **not**
> pooled with the primary scope.

- **Derived snapshot (committed):** `data/historical/snapshots/wc-1998.ts`
  (`WC1998_PACK`, `WC1998_SOURCE`, `WC1998_NAME_TO_ID`, `WC1998_CONFEDERATION_COUNTS`).
- **Generator (dev-only):** `scripts/generate-historical-1998.mjs` —
  `node scripts/generate-historical-1998.mjs <dir-with-raw-files>`. A dedicated copy of the 2002
  generator pattern (closest base: golden-goal-era ET semantics) with 1998 constants and single-host
  handling (the other generators are untouched; a shared generator remains deferred).
- **Validator:** `lib/backtesting/validate-historical.ts` — adds **`WC1998_EXPECTATIONS` only**
  (single-host France/UEFA, using the existing single-host expectation pattern). **No validator engine
  change** (the co-host extension added for 2002 is unused here and stays backward-compatible).
- **Tests:** `tests/backtesting-wc1998.test.ts`.

## Isolation
The snapshot lives in the isolated backtesting layer; it is **never imported by the production 2026
app**, nothing is wired into `lib/model/*`, and no probabilities change. The match-evaluator,
feature-adapter, model-variants, consolidation, and LOTO modules are **unchanged**.

## Source pack (4 CSVs + README)
Raw files are **NOT committed**; their SHA-256 is the reproducibility anchor (in `WC1998_SOURCE.files`).

| File | SHA-256 |
| --- | --- |
| `wc1998-identity.csv` | `36f6bdfb85be90929478ae8d2e971865673a0e8df8f13eaae3697852054c32e8` |
| `wc1998-results.csv`  | `050dbcfef720a680a78148ae9283202de5a0b4f9562111eb4f92a659aff2d17f` |
| `wc1998-elo.csv`      | `1d0dda7bb5d1530517e5c03095843358c2f76961d740272b4e88db6d7f73235e` |
| `wc1998-fifa.csv`     | `d397577c0cc2c75752a39f56ef22c3c117ce40c3032a257a2e62240dd0d94d54` |
| `README_SOURCE_NOTES.md` | `03e45912d0712cbd163d1a5a3ca25c6951da6d5669ec9513a1e0f01f901dff12` |

### Sources & licensing
- **Identity + results:** OpenFootball World Cup repository (`1998--france/cup.txt` + `cup_finals.txt`,
  **CC0-1.0**) — the permissive fixtures/results route.
- **FIFA ranking:** the **exact** 1998-05-20 release via the en.fifaranking.net mirror; official values,
  mirror licensing treated as reference-grade. (FIFA rank uniqueness is not asserted as a rule.)
- **Elo:** World Football Elo Ratings "1998 World Cup start" snapshot (eloratings.net), dated
  1998-06-09 — small derived references, not raw site dumps; **no host adjustment** applied. A few
  lower-table 1998 Elo values are flagged `review-before-production` in the source notes; this pack is a
  frozen backtesting input only.
- **Raw source files are not committed; checksums are the reproducibility anchor.**

## Identity, cutoff & dates
- **Host:** France / **UEFA** (single host). First **32-team** World Cup (counts identical to later
  editions: 8 groups of 4, 64 matches = 48 + 16).
- **Opening kickoff (leakage cutoff):** Brazil v Scotland, `1998-06-10T17:30:00+02:00` (CEST) =
  `1998-06-10T15:30:00Z`.
- **Elo date:** `1998-06-09` (strictly before the cutoff).
- **FIFA ranking date:** `1998-05-20` — the exact, single, source-backed last pre-tournament release
  (no post-tournament ranking used).
- **Confederation counts (source-pack allocation):** `AFC:4; CAF:5; CONCACAF:3; CONMEBOL:5; UEFA:15`
  (OFC:0). Declared counts are cross-checked against the per-team tally by the validator.

## Normalization (compact raw → contract)
- **Identity** is one compact row whose `groups` are **JSON** and `confederations` are **colon-style**.
  Normalized to `teamIds[]` (32), `groups{}` (8×4), `confederations{}`, `hostCountries=["France"]`,
  `openingKickoff`, `format="32-team-8-groups"`, `bracket`.
- **Results** normalize capitalized stage labels (`Group stage`→`group`, `Round of 16`→`round-of-16`,
  `Quarter-finals`→`quarter-final`, `Semi-finals`→`semi-final`, `Third-place match`→`third-place`,
  `Final`→`final`) and outcomes. **Note the 1998 raw outcome tokens carry a `_win` suffix**
  (`teamA_win`→`A`, `draw`→`D`, `teamB_win`→`B`), distinct from the 2002/2006 `teamA`/`teamB`. The
  extra-time flag column is `extraTime`.

### 90-minute score convention (mirrors 2022/2018/2014/2010/2006/2002)
The snapshot's `goalsA`/`goalsB` store the **90-minute** score (`goalsAAt90`/`goalsBAt90`);
`resultAt90` is derived from the 90' score; extra time (`afterExtraTime`) and **penalties (penalties
made, not attempts)** are recorded separately; the raw after-ET `goalsA`/`goalsB` are **not** used for
the snapshot fields. **Results are outcomes only.** (The source's final-score goal total is **171**;
the snapshot 90' total is 170, differing by the single golden goal scored in extra time — see below.)

### Golden-goal handling (1998 knockouts)
1998 used **golden-goal** extra time. A golden-goal match is stored exactly like any extra-time match:
the **90-minute score (a draw)**, `resultAt90:"D"`, `afterExtraTime:true`, and **no `penalties`**
(unless a shootout followed). The golden goal is an extra-time goal — it is **never** added to the
snapshot `goalsA`/`goalsB` and is never the `resultAt90` target. The raw after-ET score may be used for
verification/provenance but does not overwrite the 90' target. No new field is required.

**Golden-goal exemplar (verified):** France 0–0 Paraguay at 90 → France win 1–0 AET (Laurent Blanc
golden goal), no penalties — `1998-052`.

### Penalty handling
A penalty-shootout knockout is a 90' draw with `afterExtraTime:true` and `penalties:{a,b}` (made, not
tied). **Penalty exemplars (verified):**
- Argentina 2–2 England at 90 → Argentina win **4–3** on penalties — `1998-055`.
- Italy 0–0 France at 90 → France win **4–3** on penalties (`penalties:{a:3,b:4}`) — `1998-057`.
- Brazil 1–1 Netherlands at 90 → Brazil win **4–2** on penalties — `1998-061`.

## France host rationale
France hosted 1998 as the sole host (UEFA). 1998 reuses the **single-host** validator expectations
(`expectedHostId:"france"`, `expectedHostName:"France"`, `expectedHostConfederation:"UEFA"`) — the same
pattern as 2006/2010/2014/2018/2022. The optional multi-host fields added for the 2002 co-hosts are not
set here and remain backward-compatible.

## First 32-team World Cup
1998 was the first World Cup with **32 teams / 8 groups of 4**. The match/stage counts are therefore
identical to all later editions, so the existing contract and validator apply unchanged.

## Final known check
**Brazil 0–3 France** (source orientation: teamA = Brazil, teamB = France), no extra time, no penalties
→ `goalsA:0, goalsB:3, resultAt90:"B"` (France win), `afterExtraTime`/`penalties` absent (`1998-064`).

## Naming / slug decisions
Team mapping uses the **historical id space**, reusing an existing canonical slug wherever the same
nation already has one (2026 `data/official/teams.ts`, or the 2002/2006/2010/2014/2018/2022 snapshots).

- **FR Yugoslavia → `fr-yugoslavia` (HISTORICAL-ONLY, NEW).** The 1998 entrant is the **Federal
  Republic of Yugoslavia** (Serbia + Montenegro, 1992–2003). It is given a dedicated historical-only
  slug, **distinct from `serbia-and-montenegro`** (the 2006 entity) **and from modern `serbia`**
  (2010+); it is **never** remapped onto a modern successor. Both source display names `"Yugoslavia"`
  and `"FR Yugoslavia"` map to `fr-yugoslavia`. (Pinned in tests.)
- **South Korea / Korea Republic → `south-korea`; United States / USA → `usa`** (reuse; both display
  variants mapped).
- **Reuse the 2026-official canonical slugs `scotland`, `norway`, `austria`** (these exist in
  `data/official/teams.ts`; reuse rather than mint new — continuity is clear), alongside the historical
  reuse set (france, brazil, italy, germany, spain, england, argentina, netherlands, belgium, denmark,
  paraguay, croatia, mexico, morocco, nigeria, cameroon, tunisia, saudi-arabia, iran, japan,
  south-africa).
- **New clean slugs (no canonical slug previously existed):** `bulgaria`, `chile`, `colombia`,
  `jamaica`, `romania`.

## Leakage controls (hard)
- **Cutoff = the opening kickoff**, `1998-06-10T17:30:00+02:00` (= `1998-06-10T15:30:00Z`).
- Every **Elo `asOfDate` = `1998-06-09`** (strictly before the cutoff).
- Every **FIFA `rankingDate` = `1998-05-20`** — the exact pre-tournament release (no post-tournament
  ranking used).
- **No** post-tournament rankings/Elo, **no** result-derived pre-tournament features.

## Deferred (not in this pack)
Macro/structural, recent-form, squads, managers, and venues/tournamentContext historical packs are
intentionally deferred (`macro`/`recentForm` empty; `squads`/`managers` absent).

## Stretch-only scope note
This pack **does not** change the primary four-tournament diagnostics, **does not** re-baseline
four-tournament consolidation, **does not** recompute LOTO, **does not** add stretch consolidation,
**does not** approve calibration (**calibration remains NO-GO**), and adds **no** tournament replay,
weight tuning, production/probability change, evaluator change, prediction-core change, validator-engine
change, or feature-adapter change. Any stretch consolidation across 1998/2002/2006 remains a separate,
explicitly-approved future phase.
