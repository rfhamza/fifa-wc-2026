import type { ModelInputSource, StructuralEconomicRow } from "@/lib/types";

/**
 * Phase 1.12 - structural/economic snapshot (World Bank World Development
 * Indicators).
 * ---------------------------------------------------------------------------
 * The first source-backed implementation of the Klement/Joachim-inspired
 * structural layer: population as a talent-pool proxy and GDP / GDP-per-capita as
 * wealth / football-development-infrastructure proxies. Three approved indicators
 * only (no urban/rural, gender, schooling, human-capital, unemployment, climate or
 * infrastructure series): NY.GDP.MKTP.CD, NY.GDP.PCAP.CD, SP.POP.TOTL.
 *
 * FROZEN pre-tournament baseline = 2024 (the latest stable pre-2026 year; 2025 is
 * deliberately NOT used even where present in the export). All 46 sovereign WB
 * economies have complete 2024 data for all three indicators, so every
 * source-backed row carries gdpYear = gdpPerCapitaYear = populationYear = 2024.
 * Years are nonetheless stored PER indicator so a row never implies a shared year
 * if a future refresh mixes years.
 *
 * MIXED family (status `candidate`): 46 rows are `source-backed` from the World
 * Bank; England and Scotland are UK constituent FAs with NO separate World Bank
 * economy, so their rows keep the existing hand-authored values (`manual`) and are
 * intentionally NOT parent-mapped to the United Kingdom (that would distort the
 * talent-pool/population proxy and duplicate UK figures). Promote them later from
 * official constituent-nation statistics (e.g. ONS / Scottish Government).
 *
 * Source data was supplied as a World Bank DataBank Excel export
 * (P_Data_Extract_From_World_Development_Indicators.xlsx) and transcribed here; the
 * equivalent dev-only API queries are documented in
 * scripts/fetch-structural-economic.ts. Values are PUBLISHED World Bank figures,
 * used as-is (not recalculated). Names are stored as the World Bank displays them
 * (`countryNameRaw`) and mapped to app ids via STRUCTURAL_NAME_TO_ID. See
 * docs/STRUCTURAL_ECONOMIC_SNAPSHOT_AUDIT.md.
 */
export const STRUCTURAL_ECONOMIC_SOURCE: ModelInputSource = {
  family: "structural",
  label: "Structural prior (GDP + population)",
  sourceName: "World Bank World Development Indicators",
  sourceUrl: "https://data.worldbank.org/",
  sourceFile: "P_Data_Extract_From_World_Development_Indicators.xlsx",
  sourceDate: "2024",
  retrievedAt: "2026-06-19",
  status: "candidate",
  notes:
    "MIXED family: 46 sovereign economies are source-backed from the World Bank WDI 2024 (indicators NY.GDP.MKTP.CD, NY.GDP.PCAP.CD, SP.POP.TOTL; published values, not recalculated). England + Scotland have no separate WB economy, so their rows stay hand-authored (manual) and are NOT parent-mapped to the United Kingdom. Frozen 2024 pre-tournament baseline (2025 not used). Weak economic prior (weight 10, log-scaled) - never a determinative match-level predictor.",
};

/** World Bank economy display name -> app team id (source-backed rows). */
export const STRUCTURAL_NAME_TO_ID: Record<string, string> = {
  Algeria: "algeria",
  Argentina: "argentina",
  Australia: "australia",
  Austria: "austria",
  Belgium: "belgium",
  "Bosnia and Herzegovina": "bosnia-herzegovina",
  Brazil: "brazil",
  Canada: "canada",
  "Cabo Verde": "cape-verde",
  Colombia: "colombia",
  "Congo, Dem. Rep.": "congo-dr",
  Croatia: "croatia",
  Curacao: "curacao",
  Czechia: "czechia",
  Ecuador: "ecuador",
  "Egypt, Arab Rep.": "egypt",
  France: "france",
  Germany: "germany",
  Ghana: "ghana",
  Haiti: "haiti",
  "Iran, Islamic Rep.": "iran",
  Iraq: "iraq",
  "Cote d'Ivoire": "ivory-coast",
  Japan: "japan",
  Jordan: "jordan",
  Mexico: "mexico",
  Morocco: "morocco",
  Netherlands: "netherlands",
  "New Zealand": "new-zealand",
  Norway: "norway",
  Panama: "panama",
  Paraguay: "paraguay",
  Portugal: "portugal",
  Qatar: "qatar",
  "Saudi Arabia": "saudi-arabia",
  Senegal: "senegal",
  "South Africa": "south-africa",
  "Korea, Rep.": "south-korea",
  Spain: "spain",
  Sweden: "sweden",
  Switzerland: "switzerland",
  Tunisia: "tunisia",
  Turkiye: "turkiye",
  Uruguay: "uruguay",
  "United States": "usa",
  Uzbekistan: "uzbekistan",
};

/**
 * The 48 World Cup teams' structural rows. 46 are source-backed from the World
 * Bank WDI 2024; England + Scotland are hand-authored (manual) - WB has no separate
 * constituent-nation economy. gdpCurrentUsd on the manual rows is derived from the
 * hand-authored gdpPerCapita x population (clearly manual, carried for display only).
 */
export const structuralEconomicSnapshot: StructuralEconomicRow[] = [
  { teamId: "algeria", countryNameRaw: "Algeria", worldBankCountryCode: "DZA", gdpCurrentUsd: 269322281665, gdpPerCapitaCurrentUsd: 5752.99, population: 46814308, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "argentina", countryNameRaw: "Argentina", worldBankCountryCode: "ARG", gdpCurrentUsd: 638365455340, gdpPerCapitaCurrentUsd: 13969.78, population: 45696159, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "australia", countryNameRaw: "Australia", worldBankCountryCode: "AUS", gdpCurrentUsd: 1757022451653, gdpPerCapitaCurrentUsd: 64603.99, population: 27196812, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "austria", countryNameRaw: "Austria", worldBankCountryCode: "AUT", gdpCurrentUsd: 534790720467, gdpPerCapitaCurrentUsd: 58268.88, population: 9177982, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "belgium", countryNameRaw: "Belgium", worldBankCountryCode: "BEL", gdpCurrentUsd: 671370081636, gdpPerCapitaCurrentUsd: 56614.57, population: 11858610, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "bosnia-herzegovina", countryNameRaw: "Bosnia and Herzegovina", worldBankCountryCode: "BIH", gdpCurrentUsd: 29613572023, gdpPerCapitaCurrentUsd: 9358.79, population: 3164253, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "brazil", countryNameRaw: "Brazil", worldBankCountryCode: "BRA", gdpCurrentUsd: 2185821648944, gdpPerCapitaCurrentUsd: 10310.55, population: 211998573, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "canada", countryNameRaw: "Canada", worldBankCountryCode: "CAN", gdpCurrentUsd: 2243636826634, gdpPerCapitaCurrentUsd: 54340.35, population: 41288599, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "cape-verde", countryNameRaw: "Cabo Verde", worldBankCountryCode: "CPV", gdpCurrentUsd: 2725414151, gdpPerCapitaCurrentUsd: 5192.48, population: 524877, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "colombia", countryNameRaw: "Colombia", worldBankCountryCode: "COL", gdpCurrentUsd: 418818154879, gdpPerCapitaCurrentUsd: 7919.21, population: 52886363, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "congo-dr", countryNameRaw: "Congo, Dem. Rep.", worldBankCountryCode: "COD", gdpCurrentUsd: 70962185791, gdpPerCapitaCurrentUsd: 649.38, population: 109276265, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "croatia", countryNameRaw: "Croatia", worldBankCountryCode: "HRV", gdpCurrentUsd: 92983810329, gdpPerCapitaCurrentUsd: 24050.44, population: 3866200, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "curacao", countryNameRaw: "Curacao", worldBankCountryCode: "CUW", gdpCurrentUsd: 3561178196, gdpPerCapitaCurrentUsd: 22832.9, population: 155967, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "czechia", countryNameRaw: "Czechia", worldBankCountryCode: "CZE", gdpCurrentUsd: 347034062928, gdpPerCapitaCurrentUsd: 31823.31, population: 10905028, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "ecuador", countryNameRaw: "Ecuador", worldBankCountryCode: "ECU", gdpCurrentUsd: 124676074700, gdpPerCapitaCurrentUsd: 6874.71, population: 18135478, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "egypt", countryNameRaw: "Egypt, Arab Rep.", worldBankCountryCode: "EGY", gdpCurrentUsd: 389059911004, gdpPerCapitaCurrentUsd: 3338.47, population: 116538258, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "france", countryNameRaw: "France", worldBankCountryCode: "FRA", gdpCurrentUsd: 3160442622465, gdpPerCapitaCurrentUsd: 46103.08, population: 68551653, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "germany", countryNameRaw: "Germany", worldBankCountryCode: "DEU", gdpCurrentUsd: 4685592577805, gdpPerCapitaCurrentUsd: 56103.73, population: 83516593, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "ghana", countryNameRaw: "Ghana", worldBankCountryCode: "GHA", gdpCurrentUsd: 82308110386, gdpPerCapitaCurrentUsd: 2390.77, population: 34427414, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "haiti", countryNameRaw: "Haiti", worldBankCountryCode: "HTI", gdpCurrentUsd: 25224154991, gdpPerCapitaCurrentUsd: 2142.62, population: 11772557, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "iran", countryNameRaw: "Iran, Islamic Rep.", worldBankCountryCode: "IRN", gdpCurrentUsd: 475252089215, gdpPerCapitaCurrentUsd: 5190.17, population: 91567738, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "iraq", countryNameRaw: "Iraq", worldBankCountryCode: "IRQ", gdpCurrentUsd: 279641257615, gdpPerCapitaCurrentUsd: 6073.61, population: 46042015, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "ivory-coast", countryNameRaw: "Cote d'Ivoire", worldBankCountryCode: "CIV", gdpCurrentUsd: 87113179149, gdpPerCapitaCurrentUsd: 2727.89, population: 31934230, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "japan", countryNameRaw: "Japan", worldBankCountryCode: "JPN", gdpCurrentUsd: 4027597523551, gdpPerCapitaCurrentUsd: 32487.08, population: 123975371, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "jordan", countryNameRaw: "Jordan", worldBankCountryCode: "JOR", gdpCurrentUsd: 53352289577, gdpPerCapitaCurrentUsd: 4618.1, population: 11552876, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "mexico", countryNameRaw: "Mexico", worldBankCountryCode: "MEX", gdpCurrentUsd: 1856365616166, gdpPerCapitaCurrentUsd: 14185.78, population: 130861007, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "morocco", countryNameRaw: "Morocco", worldBankCountryCode: "MAR", gdpCurrentUsd: 160610994055, gdpPerCapitaCurrentUsd: 4153.19, population: 38081173, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "netherlands", countryNameRaw: "Netherlands", worldBankCountryCode: "NLD", gdpCurrentUsd: 1214927698573, gdpPerCapitaCurrentUsd: 67520.42, population: 17993485, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "new-zealand", countryNameRaw: "New Zealand", worldBankCountryCode: "NZL", gdpCurrentUsd: 260172385098, gdpPerCapitaCurrentUsd: 49205.18, population: 5287500, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "norway", countryNameRaw: "Norway", worldBankCountryCode: "NOR", gdpCurrentUsd: 483592648313, gdpPerCapitaCurrentUsd: 86785.43, population: 5572279, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "panama", countryNameRaw: "Panama", worldBankCountryCode: "PAN", gdpCurrentUsd: 86523959132, gdpPerCapitaCurrentUsd: 19161.22, population: 4515577, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "paraguay", countryNameRaw: "Paraguay", worldBankCountryCode: "PRY", gdpCurrentUsd: 44458118397, gdpPerCapitaCurrentUsd: 6416.1, population: 6929153, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "portugal", countryNameRaw: "Portugal", worldBankCountryCode: "PRT", gdpCurrentUsd: 313271185085, gdpPerCapitaCurrentUsd: 29292.24, population: 10694681, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "qatar", countryNameRaw: "Qatar", worldBankCountryCode: "QAT", gdpCurrentUsd: 219162637363, gdpPerCapitaCurrentUsd: 76688.69, population: 2857822, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "saudi-arabia", countryNameRaw: "Saudi Arabia", worldBankCountryCode: "SAU", gdpCurrentUsd: 1239804533333, gdpPerCapitaCurrentUsd: 35121.66, population: 35300280, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "senegal", countryNameRaw: "Senegal", worldBankCountryCode: "SEN", gdpCurrentUsd: 32808056601, gdpPerCapitaCurrentUsd: 1773.22, population: 18501984, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "south-africa", countryNameRaw: "South Africa", worldBankCountryCode: "ZAF", gdpCurrentUsd: 401144998374, gdpPerCapitaCurrentUsd: 6267.19, population: 64007187, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "south-korea", countryNameRaw: "Korea, Rep.", worldBankCountryCode: "KOR", gdpCurrentUsd: 1875388209407, gdpPerCapitaCurrentUsd: 36238.64, population: 51751065, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "spain", countryNameRaw: "Spain", worldBankCountryCode: "ESP", gdpCurrentUsd: 1725671652742, gdpPerCapitaCurrentUsd: 35326.77, population: 48848840, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "sweden", countryNameRaw: "Sweden", worldBankCountryCode: "SWE", gdpCurrentUsd: 603715224266, gdpPerCapitaCurrentUsd: 57117.49, population: 10569709, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "switzerland", countryNameRaw: "Switzerland", worldBankCountryCode: "CHE", gdpCurrentUsd: 936564198049, gdpPerCapitaCurrentUsd: 103998.19, population: 9005582, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "tunisia", countryNameRaw: "Tunisia", worldBankCountryCode: "TUN", gdpCurrentUsd: 51332285657, gdpPerCapitaCurrentUsd: 4181.14, population: 12277109, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "turkiye", countryNameRaw: "Turkiye", worldBankCountryCode: "TUR", gdpCurrentUsd: 1359123768774, gdpPerCapitaCurrentUsd: 15892.72, population: 85518661, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "uruguay", countryNameRaw: "Uruguay", worldBankCountryCode: "URY", gdpCurrentUsd: 80961511074, gdpPerCapitaCurrentUsd: 23906.51, population: 3386588, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "usa", countryNameRaw: "United States", worldBankCountryCode: "USA", gdpCurrentUsd: 28750956130731, gdpPerCapitaCurrentUsd: 84534.04, population: 340110988, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  { teamId: "uzbekistan", countryNameRaw: "Uzbekistan", worldBankCountryCode: "UZB", gdpCurrentUsd: 114965293467, gdpPerCapitaCurrentUsd: 3161.7, population: 36361859, gdpYear: 2024, gdpPerCapitaYear: 2024, populationYear: 2024, mappingStatus: "source-backed" },
  // --- manual: UK constituent FAs (no separate World Bank economy; not parent-mapped to UK) ---
  { teamId: "england", countryNameRaw: "England", worldBankCountryCode: "", gdpCurrentUsd: 2604650000000, gdpPerCapitaCurrentUsd: 46100, population: 56500000, gdpYear: null, gdpPerCapitaYear: null, populationYear: null, mappingStatus: "manual" },
  { teamId: "scotland", countryNameRaw: "Scotland", worldBankCountryCode: "", gdpCurrentUsd: 209000000000, gdpPerCapitaCurrentUsd: 38000, population: 5500000, gdpYear: null, gdpPerCapitaYear: null, populationYear: null, mappingStatus: "manual" },
];
