# Candidate Schedule & Draw-Order Reconciliation (Phase 1.5)

> ⚠️ **CANDIDATE / STAGING ONLY — NOT OFFICIAL FIFA DATA.**
>
> This document records a candidate 2026 group-stage schedule and intra-group
> draw order cross-checked from **two third-party sources**. It is staged in an
> isolated layer (`data/candidate/`) for reconciliation. It is **not** the
> official FIFA schedule, it is **not** `verified`, and the production app does
> **not** use it (the resolver never imports the candidate layer, so
> `fixtureSource` stays `position-generated`).

> **Update (Phase 1.6).** The OFFICIAL FIFA schedule PDF (v17, 10 Apr 2026) has
> since been transcribed and now **supersedes this candidate layer as the
> schedule source** — Telegraph/Excel are demoted to a cross-check. The official
> transcription agrees with this candidate layer on all 72 fixtures and confirms
> the M20/M36 resolutions. See `docs/OFFICIAL_SCHEDULE_TRANSCRIPTION_AUDIT.md`.

## 1. Sources & provenance

| Source | Type | Role | Carries | Timezone |
| --- | --- | --- | --- | --- |
| FIFA World Cup 2026 Interactive Schedule & Automated Standings (V2.62 Free) | Third-party **xlsx** (fan-made) | Candidate **value** | match #, group, kickoff, home/away, venue | New York (ET) |
| The Telegraph — World Cup 2026 wallchart | Third-party **pdf** (newspaper) | Visual **cross-check** | group, draw order, pairings, kickoff | UK (BST) |

Neither source is official FIFA data. The **source binaries are not committed**
(third-party copyright / unclear redistribution). What is committed:

- `data/candidate/raw/excel-matches.json` — derived snapshot + provenance header.
- `data/candidate/raw/telegraph-fixtures.json` — transcribed snapshot + header.
- `scripts/extract-candidate-schedule.py` — dev-only extractor (Python stdlib;
  no runtime deps). Point `--xlsx` at a local copy of the workbook to reproduce.

Each raw snapshot states plainly: third-party candidate source, **not** official
FIFA schedule data, extracted for reconciliation/staging only, and **not** used
in production.

## 2. Extraction method

- **Excel** — parsed the OOXML directly (zip + XML, stdlib). The `Matches` sheet
  gives 72 group rows (match #, group, datetime serial, home, away, venue); the
  `Setup` sheet gives group membership. Kickoff serials are New York time and
  were converted to **UTC** (EDT = UTC−4 in June 2026). The candidate **draw
  order** was *solved* per group by brute-forcing the unique team→position map
  (1..4) whose directed pairings reproduce the Article 12.4 chart exactly.
- **Telegraph** — manually transcribed from the 2-page wallchart: group listings
  (draw order), the six pairings per group, and kickoffs in UK time (BST = UTC+1),
  converted to UTC. The wallchart has no match numbers or per-match venues.

## 3. Normalization

Team-name and venue-string variants are resolved explicitly in
`data/candidate/name-map.ts` (an unmapped value is surfaced by validation, never
silently guessed). Notable variants:

- Teams: `Korea Republic`→south-korea, `Cote D'Voire`→ivory-coast,
  `Cabo Verde`→cape-verde, `Türkiye`→turkiye, `Curacao`→curacao,
  `DR Congo`→congo-dr, `Bosnia and Herzegovina`→bosnia-herzegovina, `USA`→usa.
- Venues: matched on the stadium name before the comma; the source appends a city
  and a flag emoji that are ignored.

## 4. Candidate draw order (solved from Excel, confirmed by Telegraph)

Both sources **agree** on group membership and draw order. The three regulation
co-host slots are preserved (Mexico **A1**, Canada **B1**, USA **D1**).

| Group | Draw order (1 → 4) |
| --- | --- |
| A | 1=Mexico / 2=South Africa / 3=South Korea / 4=Czechia |
| B | 1=Canada / 2=Bosnia & Herzegovina / 3=Qatar / 4=Switzerland |
| C | 1=Brazil / 2=Morocco / 3=Haiti / 4=Scotland |
| D | 1=USA / 2=Paraguay / 3=Australia / 4=Türkiye |
| E | 1=Germany / 2=Curaçao / 3=Ivory Coast / 4=Ecuador |
| F | 1=Netherlands / 2=Japan / 3=Sweden / 4=Tunisia |
| G | 1=Belgium / 2=Egypt / 3=Iran / 4=New Zealand |
| H | 1=Spain / 2=Cape Verde / 3=Saudi Arabia / 4=Uruguay |
| I | 1=France / 2=Senegal / 3=Iraq / 4=Norway |
| J | 1=Argentina / 2=Algeria / 3=Austria / 4=Jordan |
| K | 1=Portugal / 2=DR Congo / 3=Uzbekistan / 4=Colombia |
| L | 1=England / 2=Croatia / 3=Ghana / 4=Panama |

## 5. Cross-source agreement

Reconciliation (`reconcileSources` in `lib/data/validate-candidate.ts`) compares
the two sources by `(group, unordered team pair)`, checking home/away orientation
and kickoff (in UTC).

| Status | Count | Meaning |
| --- | --- | --- |
| `matches` | **70** / 72 | identical pairing, orientation, and kickoff |
| `resolved` | **2** / 72 | conflict inspected and settled (see below) |
| `conflict` | **0** / 72 | no unresolved high-impact conflicts remain |
| `missing-in-one-source` | 0 | every pairing appears in both sources |

Home/away orientation agrees on **all 72** fixtures. All 72 pairings follow the
Article 12.4 chart, and the Excel `crossCheckArticle124` check reproduces the
candidate fixtures from the solved draw order.

### Manually resolved candidate conflicts

Both were **date** disagreements (the Telegraph printed a date one day later than
the Excel; the time-of-day was identical). They were **inspected by hand and the
Telegraph value was confirmed correct**, so the candidate value for these two
fixtures now uses the **Telegraph** kickoff (recorded in
`data/candidate/manual-resolutions.ts`, tagged `agreement: "resolved"`). The
original Excel value is retained so this record still shows that Excel conflicted
and the Telegraph was selected after manual review.

| Match | Fixture | Excel (original) | Telegraph (selected) | Resolution |
| --- | --- | --- | --- | --- |
| M20 | Austria v Jordan (Group J) | 2026-06-16T04:00Z | **2026-06-17T04:00Z** | Telegraph confirmed by manual review |
| M36 | Tunisia v Japan (Group F) | 2026-06-20T04:00Z | **2026-06-21T04:00Z** | Telegraph confirmed by manual review |

There are **no unresolved high-impact conflicts** remaining (`manualReview` is
empty; `reconcileSources` reports these two under `manuallyResolved`).

> **Still candidate.** Selecting the Telegraph value here is a manual
> reconciliation decision that raises confidence; it does **not** make the data
> official. These values remain candidate until an official FIFA schedule, or
> user-approved authoritative JSON, is supplied (see §8).

### Venue-string variants (warnings, not errors)

The Excel venue strings differ cosmetically from our canonical venue cities and
are flagged as warnings (not blocking): MetLife `NY/NJ` / `New York/New Jersey`
vs canonical `New York / New Jersey`, and `San Francisco` vs `San Francisco Bay
Area`. The stadium itself resolves correctly in every case.

## 6. Timezone handling

- Excel kickoffs: New York time (ET). June 2026 is EDT (UTC−4) → add 4h for UTC.
- Telegraph kickoffs: UK time (BST = UTC+1) → subtract 1h for UTC.
- All candidate fixtures store `kickoffUtc` (ISO) plus `kickoffSourceTz`.

## 7. Isolation & safety

- The production resolver (`lib/data/source.ts`) and `lib/data/index.ts` do **not**
  import `data/candidate/`. A regression test asserts
  `resolveDataset().fixtureSource === "position-generated"`, that non-host
  `Team.drawPosition` stays undefined, and that only the three co-hosts carry a
  `verified` draw slot.
- No preview UI ships in this phase. `CANDIDATE_SCHEDULE_PREVIEW = false`; if a
  preview is later enabled (separate, approved change) it must never set
  `fixtureSource: "official"` nor mark any slot verified.
- No runtime dependencies were added.

## 8. Go / No-Go to promote candidate → official/verified

Promotion is **blocked** until an authoritative source is supplied:

- An **official FIFA schedule** (official PDF/JSON), **or**
- **user-supplied authoritative JSON** the user explicitly approves as
  authoritative.

Agreement between the two third-party sources **raises confidence** but is **not
sufficient** — two candidate sources agreeing does not make the data official.

When an authoritative source is supplied (a separate, approved change):

1. Populate `data/official/fixtures.ts` (position-keyed M1–M72) and the 48
   `Team.drawPosition`/`drawSlot`/`drawSlotStatus`.
2. Let `validateOfficialFixtures` + `validateDrawPositions` pass.
3. The existing resolver then flips `fixtureSource` to `"official"`.

Until then, nothing in production changes.
