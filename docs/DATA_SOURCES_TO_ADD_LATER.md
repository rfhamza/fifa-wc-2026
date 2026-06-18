# Data Sources To Add Later

This file maps each field to a real source and explains how to replace it without
touching the model or UI.

## Phase 1.1 fetch status (what is verified vs. candidate vs. TODO)
| Data | Status | Notes / source |
| --- | --- | --- |
| Group composition + 48-team identities | **candidate** | Final Draw (5 Dec 2025), cross-verified across NBC Sports, ESPN, Yahoo Sports (fifa.com/Wikipedia returned **403** to our fetch agent, so not `verified`). |
| Host venues (16 stadiums) | **candidate** | Publicly stable; per-match venue assignment NOT official. |
| Draw positions (slots A1-L4) | **verified (hosts only) -> TODO** | Only the 3 co-hosts are source-backed (Mexico A1, Canada B1, USA D1, Art. 12.3); all other `drawPosition`/`drawSlot` stay undefined until the Final Draw positions are supplied. |
| 72-match fixture schedule | **TODO -> position-generated** | Official chronological schedule not fetchable (403). Pairings position-generated per FIFA Art. 12.4 (`fixtureSource: "position-generated"`); empty template at `data/official/fixtures.ts`. No kickoff dates shown. |
| Round-of-32 skeleton (M73-M88) + Annexe C | **TODO** | FIFA regulations PDF returned 403: `https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf`. Typed template in `data/official/bracket.ts`; placeholder seeding active. |
| Model features (Elo, GDP, population, squad, form, climate, FIFA ranking values) | **mock** | Hand-authored placeholders - must not be read as real. |
| Candidate schedule + draw order (Phase 1.5) | **candidate (staged, isolated)** | Cross-checked from 2 third-party sources (Telegraph wallchart + fan-made Excel workbook) into `data/candidate/`: 72 fixtures w/ kickoffs (UTC), venues, match numbers + intra-group draw order. NOT official; the resolver never imports it (`fixtureSource` stays `position-generated`). See `docs/CANDIDATE_SCHEDULE_RECONCILIATION.md`. |
| Official schedule + draw positions (Phase 1.6 Step B) | **ACTIVE (official), subject to change** | Activated from the staged OFFICIAL FIFA schedule (`FWC26_Match_Schedule_v17_10042026_EN.pdf`, v17 / 10 Apr 2026, ET, **subject to change**): `data/official/fixtures.ts` populated (72 rows) + all 48 verified draw positions on `data/official/teams.ts`. Resolver serves `fixtureSource: "official"` (no fallback); host slots A1/B1/D1 preserved. Telegraph/Excel candidate layer is a cross-check only. PDF binary NOT committed. See `docs/OFFICIAL_SCHEDULE_TRANSCRIPTION_AUDIT.md`. |

To reach `verified`: supply official FIFA data (or authoritative JSON), populate
`data/official/*`, and flip the relevant `sourceStatus` to `"verified"`. The
Phase 1.5 candidate schedule does **not** shortcut this: agreement between two
third-party sources raises confidence but is not sufficient to promote to
official - an official FIFA source or user-approved authoritative JSON is
required.

## Where seed data lives
- `data/official/teams.ts` - candidate identities + placeholder features.
- `data/official/venues.ts`, `data/official/bracket.ts` - candidate venues, bracket template.
- `data/mock/teams.ts`, `data/mock/venues.ts` - placeholder fallback dataset.
- `lib/data/source.ts` - resolves dataset by priority/validity; generates fixtures.
- `lib/data/validate.ts` - invariants the resolver keys fallback on.
- `data/candidate/*` - staged candidate schedule/draw order (Phase 1.5),
  ISOLATED: never imported by `lib/data/source.ts`. Validated by
  `lib/data/validate-candidate.ts`; raw snapshots in `data/candidate/raw/`.

Because all consumers import from `lib/data/index.ts`, swapping the underlying
source is a localized change.

## Field-by-field replacement plan
| Field | Current (placeholder) | Real source(s) | Notes |
| --- | --- | --- | --- |
| `fifaRanking` | hand-set | FIFA/Coca-Cola World Ranking | Monthly. |
| `elo` | hand-set | eloratings.net | Has a public dataset/API. |
| `squadQuality` | hand-set 0-100 | Transfermarkt market value, FBref ratings | Normalize to 0-100. |
| `recentForm` | hand-set 0-100 | Rolling last-N results model | Compute from results feed. |
| `climateFamiliarity` | hand-set 0-100 | Derive: home climate vs venue climate | Use venue `climate`/`avgTempC`. |
| `gdpPerCapita`, `population` | hand-set | World Bank / IMF | Open APIs, annual. |
| `managerNationality`, `sameNationalityManager` | hand-set | Federation / Wikipedia | Manual or scraped. |
| Fixtures / venues | position-generated (Art. 12.4) | Official FIFA 2026 schedule | Populate `data/official/fixtures.ts` (position-keyed, M1-M72) + draw positions. |
| Knockout bracket | placeholder seeding | Official 2026 bracket chart | See MODEL_METHOD Sec 5. |

## Recommended integration shape
1. Keep the `Team` / `Venue` / `Fixture` **types unchanged** - they are the
   contract.
2. Add `lib/data/sources/` adapters (one per provider) that fetch + normalize
   into those types.
3. Add a small build/refresh script that writes normalized JSON into `data/`
   (or a DB), so the app still reads from one place.
4. Add a `lastUpdated` timestamp per source for transparency in the UI.

## Suggested caching strategy (when live)
- Ratings/economic data: refresh daily/weekly (slow-moving).
- Results/form: refresh after each matchday.
- During a live tournament: see `NEXT_PHASES.md` for live-match updates.

## Licensing reminder
Verify terms before using any third-party feed (some ranking/market-value
providers restrict redistribution). Prefer open data (World Bank, eloratings)
where possible and attribute sources in the UI.
