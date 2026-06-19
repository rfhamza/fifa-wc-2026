# FIFA Ranking Snapshot Audit (Phase 1.8)

> Source-backed promotion of the `fifaRanking` model-input family.

## 1. Source

| Field | Value |
| --- | --- |
| Source | **FIFA/Coca-Cola Men's World Ranking** |
| Source file (not committed) | `FIFA_Coca-Cola Men's World Ranking.pdf` |
| Source type | User-supplied static FIFA PDF snapshot |
| User-stated snapshot date | **11 June 2026** (`sourceDate: 2026-06-11`) |
| Extraction method | PDF text layer (`pdftotext -layout`), reviewer-transcribed and **visually verified** against the rendered pages |
| Methodology reference | `edbm045h0udbwkqew35a.pdf` (SUM formula - explanatory context only) |

**FIFA ranking points are published by FIFA and are NOT recalculated in this app.**
Only the 48 World Cup teams were extracted. Names are stored as FIFA displays them
(`fifaNameRaw`) and mapped to app team ids.

## 2. Validation result

`validateFifaRankingSnapshot()` passes: 48 rows, one per official team; integer
ranks 1..210; finite positive points; **no duplicate team ids or ranks**; every
FIFA name maps to its app id; source metadata present + `source-backed`; no other
model-input family status changed. **No unmatched or ambiguous teams.**

## 3. Transcribed rows (48 World Cup teams, by FIFA rank)

| FIFA rank | Points | FIFA name | App team |
| ---: | ---: | --- | --- |
| 1 | 1877.27 | Argentina | Argentina (`argentina`) |
| 2 | 1874.71 | Spain | Spain (`spain`) |
| 3 | 1870.70 | France | France (`france`) |
| 4 | 1828.02 | England | England (`england`) |
| 5 | 1767.85 | Portugal | Portugal (`portugal`) |
| 6 | 1765.86 | Brazil | Brazil (`brazil`) |
| 7 | 1755.10 | Morocco | Morocco (`morocco`) |
| 8 | 1753.57 | Netherlands | Netherlands (`netherlands`) |
| 9 | 1742.24 | Belgium | Belgium (`belgium`) |
| 10 | 1735.77 | Germany | Germany (`germany`) |
| 11 | 1714.87 | Croatia | Croatia (`croatia`) |
| 13 | 1698.35 | Colombia | Colombia (`colombia`) |
| 14 | 1687.48 | Mexico | Mexico (`mexico`) |
| 15 | 1684.07 | Senegal | Senegal (`senegal`) |
| 16 | 1673.07 | Uruguay | Uruguay (`uruguay`) |
| 17 | 1671.23 | USA | United States (`usa`) |
| 18 | 1661.58 | Japan | Japan (`japan`) |
| 19 | 1650.06 | Switzerland | Switzerland (`switzerland`) |
| 20 | 1619.58 | IR Iran | Iran (`iran`) |
| 22 | 1605.73 | Türkiye | Türkiye (`turkiye`) |
| 23 | 1598.52 | Ecuador | Ecuador (`ecuador`) |
| 24 | 1597.40 | Austria | Austria (`austria`) |
| 25 | 1591.63 | Korea Republic | South Korea (`south-korea`) |
| 27 | 1579.34 | Australia | Australia (`australia`) |
| 28 | 1571.03 | Algeria | Algeria (`algeria`) |
| 29 | 1562.37 | Egypt | Egypt (`egypt`) |
| 30 | 1559.48 | Canada | Canada (`canada`) |
| 31 | 1557.44 | Norway | Norway (`norway`) |
| 33 | 1540.87 | Côte d'Ivoire | Ivory Coast (`ivory-coast`) |
| 34 | 1539.16 | Panama | Panama (`panama`) |
| 38 | 1509.79 | Sweden | Sweden (`sweden`) |
| 40 | 1505.74 | Czechia | Czechia (`czechia`) |
| 41 | 1505.35 | Paraguay | Paraguay (`paraguay`) |
| 42 | 1503.34 | Scotland | Scotland (`scotland`) |
| 45 | 1476.41 | Tunisia | Tunisia (`tunisia`) |
| 46 | 1474.43 | Congo DR | DR Congo (`congo-dr`) |
| 50 | 1458.73 | Uzbekistan | Uzbekistan (`uzbekistan`) |
| 56 | 1450.31 | Qatar | Qatar (`qatar`) |
| 57 | 1446.28 | Iraq | Iraq (`iraq`) |
| 60 | 1428.38 | South Africa | South Africa (`south-africa`) |
| 61 | 1423.88 | Saudi Arabia | Saudi Arabia (`saudi-arabia`) |
| 63 | 1387.74 | Jordan | Jordan (`jordan`) |
| 64 | 1387.22 | Bosnia and Herzegovina | Bosnia & Herzegovina (`bosnia-herzegovina`) |
| 67 | 1371.11 | Cabo Verde | Cape Verde (`cape-verde`) |
| 73 | 1346.88 | Ghana | Ghana (`ghana`) |
| 82 | 1294.77 | Curaçao | Curaçao (`curacao`) |
| 83 | 1293.10 | Haiti | Haiti (`haiti`) |
| 85 | 1275.58 | New Zealand | New Zealand (`new-zealand`) |

## 4. Name mapping (FIFA display -> app team)

| FIFA display name | App team | App id |
| --- | --- | --- |
| Bosnia and Herzegovina | Bosnia & Herzegovina | `bosnia-herzegovina` |
| Cabo Verde | Cape Verde | `cape-verde` |
| Congo DR | DR Congo | `congo-dr` |
| Côte d'Ivoire | Ivory Coast | `ivory-coast` |
| IR Iran | Iran | `iran` |
| Korea Republic | South Korea | `south-korea` |
| USA | United States | `usa` |

## 5. Notes

- The PDF is a rendered ranking table; the text layer was clean for most rows and
  every value was visually spot-checked. One row (Uzbekistan, rank 50) had a
  layout break in the text layer and was confirmed from the rendered page.
- Promotion scope: ONLY `fifaRanking` -> `source-backed` (with `fifaRankingPoints`
  carried for explainability). Elo + structural remain `manual`; squad quality,
  recent form and climate remain `placeholder` (weight-capped). No model weights
  changed; points are not used as a new driver.
