# Data Sources To Add Later

Everything numeric in phase one is a **realistic but mock placeholder**. This
file maps each field to a real source and explains how to replace it without
touching the model or UI.

## Where seed data lives
- `data/teams.ts` — 48 teams and all their feature fields.
- `data/venues.ts` — stadiums + climate descriptors.
- `lib/data/index.ts` — derives groups and **generates** fixtures. Replace the
  generator with the official schedule here.

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
