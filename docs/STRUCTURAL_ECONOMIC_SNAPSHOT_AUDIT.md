# Structural / Economic Snapshot Audit (Phase 1.12 / 1.12.1)

Source promotion of the **structural/economic** model-input family using the
**World Bank World Development Indicators (WDI)** for the 46 sovereign economies and,
for the two UK constituent FAs (England + Scotland), a user-supplied **model-ready
workbook** built on ONS / Scottish-Government official statistics (Phase 1.12.1).
This is the first direct implementation of the Klement/Joachim-inspired structural
layer:

- **Population** -> talent-pool proxy
- **GDP / GDP per capita** -> wealth & football-development-infrastructure proxy

Climate, travel, recent-form and squad data are explicitly **out of scope** for this
phase.

## Status: `candidate` (MIXED), not `source-backed`

The family is deliberately marked **`candidate`** because it mixes two methods at the
row level (per-row `mappingStatus`):

- **46 of 48 teams are `source-backed`** = direct World Bank WDI rows (2024).
- **England & Scotland are `official-derived`** (Phase 1.12.1) = workbook values from
  ONS / Scottish-Government official statistics + documented FX (annual average
  GBP/USD) and a 2024 bridge estimate. They are UK constituent FAs with **no separate
  World Bank economy**, are **NOT** direct World Bank observations, and are **NOT**
  parent-mapped to the United Kingdom (that would distort the population/talent-pool
  proxy and duplicate UK figures).
- **0 rows are plain `manual`** after Phase 1.12.1.

The whole family is **never** claimed `source-backed`, because the source mix and the
2024 bridge estimates are not identical to the World Bank national-economy method.

## Source & indicators

| | |
| --- | --- |
| Source | World Bank World Development Indicators (`data.worldbank.org`) |
| Licence | CC BY-4.0 |
| Supplied as | DataBank export `P_Data_Extract_From_World_Development_Indicators.xlsx` (binary not committed) |
| Retrieved | 2026-06-19 |
| Data year | **2024** (frozen pre-tournament baseline; 2025 deliberately not used) |

Three approved indicators only (no urban/rural, gender, schooling, human-capital,
unemployment, climate or infrastructure series):

| Indicator | Code | Unit |
| --- | --- | --- |
| GDP | `NY.GDP.MKTP.CD` | current US$ |
| GDP per capita | `NY.GDP.PCAP.CD` | current US$ |
| Population, total | `SP.POP.TOTL` | persons |

## Extraction method

The committed snapshot (`data/model-inputs/snapshots/structural-economic-2024.ts`)
was transcribed from the supplied DataBank Excel export. The **equivalent dev-only
World Bank API queries** are documented and reproducible via
`scripts/fetch-structural-economic.mjs` (Node built-in `fetch`, no runtime
dependency, never imported by the app). The direct API was unreachable from the
build environment (host not in the network egress allowlist), so the user-supplied
DataBank export was used as the approved fallback - **no values were
hand-transcribed**. Per-economy REST form:

```
https://api.worldbank.org/v2/country/{ISO3}/indicator/{INDICATOR}?date=2022:2024&format=json&per_page=20000
```

Values are **published World Bank figures, used as-is** (not recalculated).

## Data-year handling

All 46 source-backed economies have complete **2024** data for all three
indicators, so every source-backed row carries
`gdpYear = gdpPerCapitaYear = populationYear = 2024`. Years are nonetheless stored
**per indicator** (not collapsed into one field) so a row never implies a shared
data year if a future refresh mixes years. The two `official-derived` rows
(England/Scotland) also carry per-indicator years = **2024**. The validator warns
(does not error) on any sourced year that drifts off the 2024 baseline.

## Modelling note (weak contextual prior)

Structural depth is a **deliberately weak** signal: `structuralDepthScore` blends
log-scaled GDP per capita (0.6) and log-scaled population (0.4) into [0,1], scaled
by `MODEL_WEIGHTS.structural = 10` Elo-equivalent points (uncapped but small). It is
a **contextual prior, not a football-strength anchor**. Guardrails (tests):

- `structuralDepthScore` stays within [0,1] for every team.
- The structural contribution is bounded by `MODEL_WEIGHTS.structural` for every pair.
- In aggregate over all team pairs, structural is a **small share** of total driver
  magnitude (it never dominates). For a very close Elo/FIFA matchup the structural
  driver may exceed one individual driver - this is expected and is why the bound is
  asserted in **aggregate**, not per pair.
- Probabilities remain finite and deterministic; `fixtureSource` stays `official`.

**No production model weights were changed in this phase.**

## Validation

`validateStructuralSnapshot()` (in `lib/data/validate-model-inputs.ts`) asserts: 48
rows, one per team; finite + positive GDP / GDP-per-capita / population within the
model-input ranges; per-indicator years are integers in 2000..2025 on every sourced
row; a 3-letter WB code + a mapped display name on every `source-backed` (World Bank)
row; England + Scotland are the ONLY `official-derived` rows (no WB code, not
parent-mapped to the UK); **zero plain `manual` rows remain**; source metadata
present + family status `candidate`; and no other family silently changed status
(Elo/FIFA still source-backed, squad/form/climate still placeholder). Result:
**0 errors, 0 warnings**. Covered by `tests/structural-economic-snapshot.test.ts`.

## Source-backed rows (46) - World Bank WDI 2024

| Team | World Bank economy | Code | GDP (US$) | GDP per capita (US$) | Population | Year |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| algeria | Algeria | DZA | 269,322,281,665 | 5,752.99 | 46,814,308 | 2024 |
| argentina | Argentina | ARG | 638,365,455,340 | 13,969.78 | 45,696,159 | 2024 |
| australia | Australia | AUS | 1,757,022,451,653 | 64,603.99 | 27,196,812 | 2024 |
| austria | Austria | AUT | 534,790,720,467 | 58,268.88 | 9,177,982 | 2024 |
| belgium | Belgium | BEL | 671,370,081,636 | 56,614.57 | 11,858,610 | 2024 |
| bosnia-herzegovina | Bosnia and Herzegovina | BIH | 29,613,572,023 | 9,358.79 | 3,164,253 | 2024 |
| brazil | Brazil | BRA | 2,185,821,648,944 | 10,310.55 | 211,998,573 | 2024 |
| canada | Canada | CAN | 2,243,636,826,634 | 54,340.35 | 41,288,599 | 2024 |
| cape-verde | Cabo Verde | CPV | 2,725,414,151 | 5,192.48 | 524,877 | 2024 |
| colombia | Colombia | COL | 418,818,154,879 | 7,919.21 | 52,886,363 | 2024 |
| congo-dr | Congo, Dem. Rep. | COD | 70,962,185,791 | 649.38 | 109,276,265 | 2024 |
| croatia | Croatia | HRV | 92,983,810,329 | 24,050.44 | 3,866,200 | 2024 |
| curacao | Curacao | CUW | 3,561,178,196 | 22,832.9 | 155,967 | 2024 |
| czechia | Czechia | CZE | 347,034,062,928 | 31,823.31 | 10,905,028 | 2024 |
| ecuador | Ecuador | ECU | 124,676,074,700 | 6,874.71 | 18,135,478 | 2024 |
| egypt | Egypt, Arab Rep. | EGY | 389,059,911,004 | 3,338.47 | 116,538,258 | 2024 |
| france | France | FRA | 3,160,442,622,465 | 46,103.08 | 68,551,653 | 2024 |
| germany | Germany | DEU | 4,685,592,577,805 | 56,103.73 | 83,516,593 | 2024 |
| ghana | Ghana | GHA | 82,308,110,386 | 2,390.77 | 34,427,414 | 2024 |
| haiti | Haiti | HTI | 25,224,154,991 | 2,142.62 | 11,772,557 | 2024 |
| iran | Iran, Islamic Rep. | IRN | 475,252,089,215 | 5,190.17 | 91,567,738 | 2024 |
| iraq | Iraq | IRQ | 279,641,257,615 | 6,073.61 | 46,042,015 | 2024 |
| ivory-coast | Cote d'Ivoire | CIV | 87,113,179,149 | 2,727.89 | 31,934,230 | 2024 |
| japan | Japan | JPN | 4,027,597,523,551 | 32,487.08 | 123,975,371 | 2024 |
| jordan | Jordan | JOR | 53,352,289,577 | 4,618.1 | 11,552,876 | 2024 |
| mexico | Mexico | MEX | 1,856,365,616,166 | 14,185.78 | 130,861,007 | 2024 |
| morocco | Morocco | MAR | 160,610,994,055 | 4,153.19 | 38,081,173 | 2024 |
| netherlands | Netherlands | NLD | 1,214,927,698,573 | 67,520.42 | 17,993,485 | 2024 |
| new-zealand | New Zealand | NZL | 260,172,385,098 | 49,205.18 | 5,287,500 | 2024 |
| norway | Norway | NOR | 483,592,648,313 | 86,785.43 | 5,572,279 | 2024 |
| panama | Panama | PAN | 86,523,959,132 | 19,161.22 | 4,515,577 | 2024 |
| paraguay | Paraguay | PRY | 44,458,118,397 | 6,416.1 | 6,929,153 | 2024 |
| portugal | Portugal | PRT | 313,271,185,085 | 29,292.24 | 10,694,681 | 2024 |
| qatar | Qatar | QAT | 219,162,637,363 | 76,688.69 | 2,857,822 | 2024 |
| saudi-arabia | Saudi Arabia | SAU | 1,239,804,533,333 | 35,121.66 | 35,300,280 | 2024 |
| senegal | Senegal | SEN | 32,808,056,601 | 1,773.22 | 18,501,984 | 2024 |
| south-africa | South Africa | ZAF | 401,144,998,374 | 6,267.19 | 64,007,187 | 2024 |
| south-korea | Korea, Rep. | KOR | 1,875,388,209,407 | 36,238.64 | 51,751,065 | 2024 |
| spain | Spain | ESP | 1,725,671,652,742 | 35,326.77 | 48,848,840 | 2024 |
| sweden | Sweden | SWE | 603,715,224,266 | 57,117.49 | 10,569,709 | 2024 |
| switzerland | Switzerland | CHE | 936,564,198,049 | 103,998.19 | 9,005,582 | 2024 |
| tunisia | Tunisia | TUN | 51,332,285,657 | 4,181.14 | 12,277,109 | 2024 |
| turkiye | Turkiye | TUR | 1,359,123,768,774 | 15,892.72 | 85,518,661 | 2024 |
| uruguay | Uruguay | URY | 80,961,511,074 | 23,906.51 | 3,386,588 | 2024 |
| usa | United States | USA | 28,750,956,130,731 | 84,534.04 | 340,110,988 | 2024 |
| uzbekistan | Uzbekistan | UZB | 114,965,293,467 | 3,161.7 | 36,361,859 | 2024 |

## Official-derived rows (2) - UK constituent FAs (Phase 1.12.1)

England + Scotland have no separate World Bank economy, so their 2024 rows are
`official-derived` from a user-supplied model-ready workbook (sheet `Model Ready
USD`, 2024 row only; binary not committed). They are **not** World Bank rows and are
**not** parent-mapped to the United Kingdom.

| Team | GDP (US$) | GDP per capita (US$) | Population | Year | Mapping |
| --- | ---: | ---: | ---: | ---: | --- |
| england | 3,127,885,000,000 | 53,359 | 58,620,100 | 2024 | official-derived |
| scotland | 267,379,000,000 | 48,203 | 5,546,900 | 2024 | official-derived |

**Unit rule:** the workbook GDP column is **US$m**; stored here as full USD
(`gdpCurrentUsd = GDP US$m x 1,000,000`). So England 3,127,885 US$m ->
3,127,885,000,000 USD; Scotland 267,379 US$m -> 267,379,000,000 USD.
`gdpPerCapitaCurrentUsd` and `population` are taken directly from the workbook.

### Workbook sources & assumptions (sheet `Sources & Assumptions`)

- **GDP / GDP-per-head (2001-2023):** ONS regional GDP dataset (Regional gross
  domestic product, all ITL regions). **Population:** ONS country population series
  (England `enpop`, Scotland `scpop`). **FX:** USD = GBP x annual average GBP/USD
  (USD per GBP1; ONS `auss` series); the 2024 row uses 1.2783.
- **England 2024 GDP = bridge estimate**: England 2023 ONS regional GDP scaled by the
  UK nominal GDP growth factor (per ONS `ybha`); per-capita derived against ONS
  England 2024 population. **Not** a fully official ONS regional observation.
- **Scotland 2024**: Scottish Government QNA 2025 Q4 **onshore nominal GDP** (the
  model-ready value). The wider-economy / extra-regio alternative estimate is
  **explicitly not used**.
- **Caveat:** 2024 GDP is not yet in the ONS regional all-ITL comparable dataset, so
  2024 is a working estimate / bridge year. This - plus the FX conversion and the
  mixed source method - is why the family stays `candidate`, not `source-backed`.

> Source names, notes and URLs are taken from the supplied workbook's `Sources &
> Assumptions` sheet (ONS: ons.gov.uk; Scottish Government: gov.scot). No source URLs
> were invented. The workbook itself is not committed.
