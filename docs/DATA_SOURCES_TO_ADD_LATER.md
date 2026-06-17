# Data Sources To Add Later

This file maps each field to a real source and explains how to replace it without
touching the model or UI.

## Phase 1.1 fetch status (what is verified vs. candidate vs. TODO)
| Data | Status | Notes / source |
| --- | --- | --- |
| Group composition + 48-team identities | **candidate** | Final Draw (5 Dec 2025), cross-verified across NBC Sports, ESPN, Yahoo Sports (fifa.com/Wikipedia returned **403** to our fetch agent, so not `verified`). |
| Host venues (16 stadiums) | **candidate** | Publicly stable; per-match venue assignment NOT official. |
| 72-match fixture schedule | **TODO → generated** | Official schedule not fetchable (403). `fixtureSource: "generated"`, labelled in UI. |
| Round-of-32 skeleton (M73–M88) + Annexe C | **TODO** | FIFA regulations PDF returned 403: `https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf`. Typed template in `data/official/bracket.ts`; placeholder seeding active. |
| Model features (Elo, GDP, population, squad, form, climate, FIFA ranking values) | **mock** | Hand-authored placeholders — must not be read as real. |

To reach `verified`: supply official FIFA data (or authoritative JSON), populate
`data/official/*`, and flip the relevant `sourceStatus` to `"verified"`.

## Where seed data lives
- `data/official/teams.ts` — candidate identities + placeholder features.
- `data/official/venues.ts`, `data/official/bracket.ts` — candidate venues, bracket template.
- `data/mock/teams.ts`, `data/mock/venues.ts` — placeholder fallback dataset.
- `lib/data/source.ts` — resolves dataset by priority/validity; generates fixtures.
- `lib/data/validate.ts` — invariants the resolver keys fallback on.

Because all consumers import from `lib/data/index.ts`, swapping the underlying
source is a localized change.

## Field-by-field replacement plan
| Field | Current (placeholder) | Real source(s) | Notes |
| --- | --- | --- | --- |
| `fifaRanking` | hand-set | FIFA/Coca-Cola World Ranking | Monthly. |
| `elo` | hand-set | eloratings.net | Has a public dataset/API. |
| `squadQuality` | hand-set 0–100 | Transfermarkt market value, FBref ratings | Normalize to 0–100. |
| `recentForm` | hand-set 0–100 | Rolling last-N results model | Compute from results feed. |
| `climateFamiliarity` | hand-set 0–100 | Derive: home climate vs venue climate | Use venue `climate`/`avgTempC`. |
| `gdpPerCapita`, `population` | hand-set | World Bank / IMF | Open APIs, annual. |
| `managerNationality`, `sameNationalityManager` | hand-set | Federation / Wikipedia | Manual or scraped. |
| Fixtures / venues | generated | Official FIFA 2026 schedule | Replace generator + venue map. |
| Knockout bracket | placeholder seeding | Official 2026 bracket chart | See MODEL_METHOD §5. |

## Recommended integration shape
1. Keep the `Team` / `Venue` / `Fixture` **types unchanged** — they are the
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
