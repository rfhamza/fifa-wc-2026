# Elo Rating Snapshot Audit (Phase 1.10)

> Source-backed promotion of the `eloRating` model-input family.

## 1. Source

| Field | Value |
| --- | --- |
| Source | **World Football Elo Ratings** (eloratings.net) |
| Source URL | `https://www.eloratings.net/` |
| Source file (not committed) | `Elo ratings table_11June.pdf` |
| Source type | User-supplied static snapshot ("World football Elo ratings as on June 11th, 2026") |
| User-stated snapshot date | **11 June 2026** (`sourceDate: 2026-06-11`) |
| Extraction method | PDF text layer (`pdftotext -layout`), reviewer-transcribed and **visually verified** against the rendered pages |
| Methodology | World Football Elo Ratings method / Elo update method |

**These are published Elo values used as-is — they are NOT recalculated in this
app.** The Elo update method (for context only, not run here) is
`new_rating = old_rating + K * G * (W - W_e)`. Only the 48 World Cup teams were
extracted. Names are stored as the source displays them (`eloNameRaw`) and mapped
to app team ids.

### Elo ranks may tie

Unlike the FIFA ranking (globally unique ranks), World Football Elo ranks **tie**
when teams share the same rating (e.g. Algeria/Iran at #30, Czech Republic/Sweden
at #42). The validator therefore **allows duplicate Elo ranks** and only requires
that tied teams share an identical rating.

## 2. CSV cross-check — NOT APPLICABLE this phase

The supplied Kaggle dataset (`elo_ratings_wc2026.csv`) is **not** the canonical
source and was **not** used for the 11 Jun values. Its only live snapshot is
**2026-05-27** (zero rows at 2026-06-11), so it cannot cross-check a 2026-06-11
table. It is retained as **historical / backtesting context for a later phase**
only. Attribution if/when used: Kaggle dataset under **CC BY-SA 4.0**, upstream
**World Football Elo Ratings / eloratings.net**. Docs must not imply Kaggle values
were used as the active 11 Jun snapshot — they were not.

## 3. Validation result

`validateEloSnapshot()` passes: 48 rows, one per official team; integer ranks in
1..250; finite ratings in 1000..2500; **no duplicate team ids** (duplicate ranks
allowed as ties); every Elo name maps to its app id; source metadata present +
`source-backed`; no other model-input family status changed. **No unmatched or
ambiguous teams.**

## 4. Transcribed rows (48 World Cup teams, by Elo rank)

| Elo rank | Rating | Elo name | App team |
| ---: | ---: | --- | --- |
| 1 | 2157 | Spain | Spain (`spain`) |
| 2 | 2115 | Argentina | Argentina (`argentina`) |
| 3 | 2063 | France | France (`france`) |
| 4 | 2024 | England | England (`england`) |
| 5 | 1991 | Brazil | Brazil (`brazil`) |
| 6 | 1989 | Portugal | Portugal (`portugal`) |
| 7 | 1982 | Colombia | Colombia (`colombia`) |
| 8 | 1948 | Netherlands | Netherlands (`netherlands`) |
| 9 | 1938 | Ecuador | Ecuador (`ecuador`) |
| 10 | 1932 | Germany | Germany (`germany`) |
| 11 | 1914 | Norway | Norway (`norway`) |
| 12 | 1912 | Croatia | Croatia (`croatia`) |
| 13 | 1911 | Turkey | Türkiye (`turkiye`) |
| 14 | 1906 | Japan | Japan (`japan`) |
| 15 | 1894 | Belgium | Belgium (`belgium`) |
| 16 | 1892 | Uruguay | Uruguay (`uruguay`) |
| 17 | 1891 | Switzerland | Switzerland (`switzerland`) |
| 18 | 1881 | Mexico | Mexico (`mexico`) |
| 21 | 1860 | Senegal | Senegal (`senegal`) |
| 22 | 1834 | Paraguay | Paraguay (`paraguay`) |
| 23 | 1830 | Austria | Austria (`austria`) |
| 24 | 1827 | Morocco | Morocco (`morocco`) |
| 25 | 1788 | Canada | Canada (`canada`) |
| 26 | 1786 | South Korea | South Korea (`south-korea`) |
| 27 | 1782 | Scotland | Scotland (`scotland`) |
| 29 | 1777 | Australia | Australia (`australia`) |
| 30 | 1772 | Algeria | Algeria (`algeria`) |
| 30 | 1772 | Iran | Iran (`iran`) |
| 37 | 1730 | Panama | Panama (`panama`) |
| 38 | 1726 | United States | United States (`usa`) |
| 41 | 1714 | Uzbekistan | Uzbekistan (`uzbekistan`) |
| 42 | 1712 | Czech Republic | Czechia (`czechia`) |
| 42 | 1712 | Sweden | Sweden (`sweden`) |
| 48 | 1696 | Egypt | Egypt (`egypt`) |
| 49 | 1695 | Ivory Coast | Ivory Coast (`ivory-coast`) |
| 52 | 1680 | Jordan | Jordan (`jordan`) |
| 55 | 1652 | Dem. Rep. of Congo | DR Congo (`congo-dr`) |
| 58 | 1628 | Tunisia | Tunisia (`tunisia`) |
| 63 | 1607 | Iraq | Iraq (`iraq`) |
| 65 | 1595 | Bosnia and Herzegovina | Bosnia & Herzegovina (`bosnia-herzegovina`) |
| 68 | 1578 | Cape Verde | Cape Verde (`cape-verde`) |
| 69 | 1576 | Saudi Arabia | Saudi Arabia (`saudi-arabia`) |
| 72 | 1562 | New Zealand | New Zealand (`new-zealand`) |
| 73 | 1548 | Haiti | Haiti (`haiti`) |
| 80 | 1511 | South Africa | South Africa (`south-africa`) |
| 81 | 1510 | Ghana | Ghana (`ghana`) |
| 91 | 1434 | Curaçao | Curaçao (`curacao`) |
| 96 | 1421 | Qatar | Qatar (`qatar`) |

## 5. Name mapping (Elo display -> app team)

| Elo display name | App team | App id |
| --- | --- | --- |
| Bosnia and Herzegovina | Bosnia & Herzegovina | `bosnia-herzegovina` |
| Cape Verde | Cape Verde | `cape-verde` |
| Czech Republic | Czechia | `czechia` |
| Curaçao | Curaçao | `curacao` |
| Dem. Rep. of Congo | DR Congo | `congo-dr` |
| Ivory Coast | Ivory Coast | `ivory-coast` |
| South Korea | South Korea | `south-korea` |
| Turkey | Türkiye | `turkiye` |
| United States | United States | `usa` |

## 6. Notes

- Promotion scope: ONLY `eloRating` -> `source-backed` (with optional `eloRank`
  carried for explainability). FIFA ranking stays `source-backed` (Phase 1.8);
  structural remains `manual`; squad quality, recent form and climate remain
  `placeholder` (weight-capped). **No model weights changed**; Elo rank is not used
  as a new driver.
- The forecast behaviour audit (`docs/FORECAST_BEHAVIOR_AUDIT.md`) was regenerated:
  with Elo now source-backed, the forecast is anchored by **source-backed** inputs
  (Elo + FIFA), and **manual** shrinks to the weak structural prior only. This is a
  status-mix / provenance improvement; the relative influence of Elo vs FIFA is
  unchanged (a calibration consideration for a later phase, not a defect).
