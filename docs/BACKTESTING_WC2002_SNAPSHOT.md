# WC-2002 Historical Snapshot (Phase 1.19C) — DIAGNOSTIC / STRETCH SOURCE PACK

The second **stretch** historical source pack — FIFA World Cup 2002 (South Korea / Japan) — ingested
**additively** on top of the completed primary scope (2010, 2014, 2018, 2022) and the first stretch pack
(2006).

> **STRETCH EVIDENCE ONLY.** WC-2002 is additive stretch evidence. It is **not** calibration, **not**
> tournament replay, and **not** weight tuning. It **does not** change the primary four-tournament
> diagnostic headline, **does not** re-baseline four-tournament consolidation, **does not** recompute
> LOTO, **does not** add stretch consolidation, and **does not** approve calibration — **calibration
> remains NO-GO** (`docs/BACKTESTING_CALIBRATION_GOVERNANCE.md`). Per-tournament diagnostics are **not**
> pooled with the primary scope.

- **Derived snapshot (committed):** `data/historical/snapshots/wc-2002.ts`
  (`WC2002_PACK`, `WC2002_SOURCE`, `WC2002_NAME_TO_ID`, `WC2002_CONFEDERATION_COUNTS`).
- **Generator (dev-only):** `scripts/generate-historical-2002.mjs` —
  `node scripts/generate-historical-2002.mjs <dir-with-raw-files>`. A dedicated copy of the 2006
  generator pattern with 2002 constants + co-host parsing (the 2006/2010/2014/2018/2022 generators are
  untouched; a shared generator remains deferred).
- **Validator:** `lib/backtesting/validate-historical.ts` — adds optional **multi-host** expectations
  (`expectedHostIds?`, `expectedHostConfederations?`) + `WC2002_EXPECTATIONS`. The single-host fields and
  all existing single-host expectations (1998/2006/2010/2014/2018/2022) are unchanged and still valid.
- **Tests:** `tests/backtesting-wc2002.test.ts`.

## Isolation
The snapshot lives in the isolated backtesting layer; it is **never imported by the production 2026
app**, nothing is wired into `lib/model/*`, and no probabilities change. The match-evaluator,
feature-adapter, model-variants, consolidation, and LOTO modules are **unchanged**.

## Source pack (4 CSVs + README)
Raw files are **NOT committed**; their SHA-256 is the reproducibility anchor (in `WC2002_SOURCE.files`).

| File | SHA-256 |
| --- | --- |
| `wc2002-identity.csv` | `ffbee796765f082af7551833ab5b95f5c4f7b6dafb13acab7ec7586f340aca7c` |
| `wc2002-results.csv`  | `40105e2a8ee5a4cf9b46087848117f519da76d8a091fcc566ce9d6c83bc9318a` |
| `wc2002-elo.csv`      | `b9531fb353c7673231ad43aa768369c4396f1d593c8647a2b5d033f219ca70e0` |
| `wc2002-fifa.csv`     | `235cc03f4a5e1246e90933e87d461ab9a5267bb41ee5fca57d43bb5eb1f8a4e0` |
| `README_SOURCE_NOTES.md` | `3f94d053fae18eefbcc8eeb239b7d228b8ae074c483186a753a010e718b4d878` |

### Sources & licensing
- **Identity + results:** OpenFootball World Cup repository (`2002--south-korea-n-japan/cup.txt` +
  `cup_finals.txt`, **CC0-1.0**) — the permissive fixtures/results route.
- **FIFA ranking:** the **exact** 2002-05-15 release via the en.fifaranking.net mirror; official values,
  mirror licensing treated as reference-grade. (FIFA rank uniqueness is not asserted as a rule.)
- **Elo:** World Football Elo Ratings "2002 World Cup start" snapshot (eloratings.net), dated
  2002-05-30 — small derived references, not raw site dumps; **no host adjustment** applied.
- **Raw source files are not committed; checksums are the reproducibility anchor.**

## Identity, cutoff & dates
- **Hosts (CO-HOSTS):** South Korea + Japan, **both AFC**. `hostCountries = ["South Korea","Japan"]`.
- **Opening kickoff (leakage cutoff):** France v Senegal, `2002-05-31T20:30:00+09:00` (KST) =
  `2002-05-31T11:30:00Z`.
- **Elo date:** `2002-05-30` (strictly before the cutoff).
- **FIFA ranking date:** `2002-05-15` — the exact, single, source-backed last pre-tournament release
  (no post-tournament ranking used).
- **Confederation counts (source-pack allocation):** `AFC:4; CAF:5; CONCACAF:3; CONMEBOL:5; UEFA:15`
  (OFC:0). Declared counts are cross-checked against the per-team tally by the validator.

## Normalization (compact raw → contract)
- **Identity** is one compact row whose `groups` are **JSON** and `confederations` are **colon-style**.
  Normalized to `teamIds[]` (32), `groups{}` (8×4), `confederations{}`,
  `hostCountries=["South Korea","Japan"]`, `openingKickoff`, `format="32-team-8-groups"`, `bracket`.
- **Co-hosts** are parsed by splitting the delimited `hostCountries` column (`"South Korea; Japan"`) on
  `;` into a two-element array.
- **Results** normalize capitalized stage labels (`Group stage`→`group`, `Round of 16`→`round-of-16`,
  `Quarter-final`→`quarter-final`, `Semi-final`→`semi-final`, `Third-place match`→`third-place`,
  `Final`→`final`) and outcomes (`teamA`→`A`, `draw`→`D`, `teamB`→`B`); the extra-time flag column is
  `extraTime`.

### 90-minute score convention (mirrors 2022/2018/2014/2010/2006)
The snapshot's `goalsA`/`goalsB` store the **90-minute** score (`goalsAAt90`/`goalsBAt90`);
`resultAt90` is derived from the 90' score; extra time (`afterExtraTime`) and **penalties (penalties
made, not attempts)** are recorded separately; the raw after-ET `goalsA`/`goalsB` are **not** used for
the snapshot fields. **Results are outcomes only.**

### Golden-goal handling (2002 knockouts)
2002 used **golden-goal** extra time in the knockout rounds. A golden-goal match is stored exactly like
any extra-time match: the **90-minute score (a draw)**, `resultAt90:"D"`, `afterExtraTime:true`, and **no
`penalties`** (unless the match actually went to a shootout). The golden goal is an extra-time goal — it
is **never** added to the snapshot `goalsA`/`goalsB` and is never the `resultAt90` target. The raw
after-extra-time score may be used for verification/provenance but does not overwrite the 90' target. No
new field is required.

**Golden-goal exemplars (verified against the source pack):**
- Sweden 1–1 Senegal at 90 → Senegal win 2–1 AET (golden goal, no penalties) — `wc2002-51`.
- South Korea 1–1 Italy at 90 → South Korea win 2–1 AET (golden goal, no penalties) — `wc2002-56`.
- Senegal 0–0 Turkey at 90 → Turkey win 1–0 AET (golden goal, no penalties) — `wc2002-60`.

### Penalty handling
A penalty-shootout knockout is a 90' draw with `afterExtraTime:true` and `penalties:{a,b}` (made, not
tied). **Penalty exemplars (verified):**
- Spain 1–1 Republic of Ireland at 90 → Spain win **3–2** on penalties — `wc2002-52`.
- Spain 0–0 South Korea at 90 → South Korea win **5–3** on penalties (`penalties:{a:3,b:5}`) — `wc2002-59`.

## Co-host rationale
South Korea and Japan jointly hosted 2002; both are AFC. The backtesting **feature-adapter already
supports multiple hosts** (it builds a `Set` of host ids and a set of host confederations), so both
hosts are flagged `isHost` and other AFC teams (China, Saudi Arabia) become `isRegional` — **no
feature-adapter change is required** (a test pins this). The only code change is an additive,
backward-compatible **validator** extension: optional `expectedHostIds?: string[]` /
`expectedHostConfederations?: string[]` with a guarded block that runs only when those fields are
present. `WC2002_EXPECTATIONS` uses `expectedHostIds: ["south-korea","japan"]` and
`expectedHostConfederations: ["AFC"]`; the single-host expectations for all other tournaments are
untouched.

## Final known check
**Germany 0–2 Brazil**, no extra time, no penalties → `goalsA:0, goalsB:2, resultAt90:"B"` (Brazil win),
`afterExtraTime` absent, `penalties` absent (`wc2002-64`).

## Naming / slug decisions
Team mapping uses the **historical id space**, reusing an existing canonical slug wherever the same
nation already has one (2026 `data/official/teams.ts`, or the 2006/2010/2014/2018/2022 snapshots).
30 of 32 nations reuse existing slugs; **2** are new.

- **Republic of Ireland → `republic-of-ireland` (HISTORICAL-ONLY, NEW).** Uses the full FIFA identity and
  is **unambiguous versus Northern Ireland / the IFA**. The shorter `ireland` slug is deliberately **not**
  used. Matches the project's verbose historical-slug style (`serbia-and-montenegro`,
  `trinidad-and-tobago`). (Pinned in tests.)
- **China PR / China → `china` (NEW, clean canonical-style slug).** The PRC men's national-team
  continuity is clear; both display variants (`"China PR"`, `"China"`) map to `china`. (Pinned in tests.)
- **Turkey → `turkiye` (REUSE).** The project already has the canonical `turkiye` slug (same football
  association); the 2002 display name `"Turkey"` maps to it. No separate `turkey` slug is created.
  (Pinned in tests.)
- **South Korea / Korea Republic → `south-korea`; United States / USA → `usa`** (reuse; both display
  variants mapped). Côte/other big nations reuse existing slugs (france, brazil, germany, argentina,
  italy, spain, england, portugal, mexico, denmark, sweden, belgium, poland, russia, croatia, slovenia,
  ecuador, uruguay, paraguay, costa-rica, south-africa, cameroon, nigeria, tunisia, saudi-arabia,
  senegal, japan).

**Note:** FR Yugoslavia / Serbia and Montenegro did **not** qualify for 2002, so no defunct-Yugoslav
entity appears in this pack.

## Leakage controls (hard)
- **Cutoff = the opening kickoff**, `2002-05-31T20:30:00+09:00` (= `2002-05-31T11:30:00Z`).
- Every **Elo `asOfDate` = `2002-05-30`** (strictly before the cutoff).
- Every **FIFA `rankingDate` = `2002-05-15`** — the exact pre-tournament release (no post-tournament
  ranking used).
- **No** post-tournament rankings/Elo, **no** result-derived pre-tournament features.

## Deferred (not in this pack)
Macro/structural, recent-form, squads, managers, and venues/tournamentContext historical packs are
intentionally deferred (`macro`/`recentForm` empty; `squads`/`managers` absent).

## Stretch-only scope note
This pack **does not** change the primary four-tournament diagnostics, **does not** re-baseline
four-tournament consolidation, **does not** recompute LOTO, **does not** add stretch consolidation,
**does not** approve calibration (**calibration remains NO-GO**), and adds **no** tournament replay,
weight tuning, production/probability change, evaluator change, prediction-core change, or
feature-adapter change. Ingestion of 1998 and any stretch consolidation remain out of scope for this PR.
