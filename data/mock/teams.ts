import type { Team } from "@/lib/types";

/**
 * 48-team seed field for FIFA World Cup 2026, drawn into 12 groups (A–L).
 *
 * ALL numeric fields are realistic but MOCKABLE placeholders:
 *   - fifaRanking / elo        → swap for a live ratings feed
 *   - gdpPerCapita / population → swap for World Bank / IMF data
 *   - squadQuality             → swap for market-value / player-rating model
 *   - recentForm               → swap for rolling results model
 *   - climateFamiliarity       → swap for venue-vs-home-climate model
 *
 * See docs/DATA_SOURCES_TO_ADD_LATER.md for replacement guidance.
 */
export const teams: Team[] = [
  // ---------------- Group A ----------------
  { id: "mexico", name: "Mexico", countryCode: "MEX", confederation: "CONCACAF", group: "A", flag: "🇲🇽", fifaRanking: 15, elo: 1875, gdpPerCapita: 11500, population: 128900000, managerNationality: "Mexico", sameNationalityManager: true, squadQuality: 74, recentForm: 66, climateFamiliarity: 90 },
  { id: "croatia", name: "Croatia", countryCode: "CRO", confederation: "UEFA", group: "A", flag: "🇭🇷", fifaRanking: 10, elo: 1955, gdpPerCapita: 18500, population: 3850000, managerNationality: "Croatia", sameNationalityManager: true, squadQuality: 80, recentForm: 70, climateFamiliarity: 60 },
  { id: "ecuador", name: "Ecuador", countryCode: "ECU", confederation: "CONMEBOL", group: "A", flag: "🇪🇨", fifaRanking: 31, elo: 1810, gdpPerCapita: 6400, population: 18000000, managerNationality: "Argentina", sameNationalityManager: false, squadQuality: 70, recentForm: 64, climateFamiliarity: 78 },
  { id: "ghana", name: "Ghana", countryCode: "GHA", confederation: "CAF", group: "A", flag: "🇬🇭", fifaRanking: 68, elo: 1690, gdpPerCapita: 2400, population: 33500000, managerNationality: "Portugal", sameNationalityManager: false, squadQuality: 64, recentForm: 52, climateFamiliarity: 88 },

  // ---------------- Group B ----------------
  { id: "canada", name: "Canada", countryCode: "CAN", confederation: "CONCACAF", group: "B", flag: "🇨🇦", fifaRanking: 43, elo: 1790, gdpPerCapita: 53500, population: 39000000, managerNationality: "USA", sameNationalityManager: false, squadQuality: 68, recentForm: 60, climateFamiliarity: 85 },
  { id: "italy", name: "Italy", countryCode: "ITA", confederation: "UEFA", group: "B", flag: "🇮🇹", fifaRanking: 9, elo: 1965, gdpPerCapita: 35500, population: 58800000, managerNationality: "Italy", sameNationalityManager: true, squadQuality: 83, recentForm: 71, climateFamiliarity: 62 },
  { id: "nigeria", name: "Nigeria", countryCode: "NGA", confederation: "CAF", group: "B", flag: "🇳🇬", fifaRanking: 39, elo: 1780, gdpPerCapita: 2200, population: 223800000, managerNationality: "Nigeria", sameNationalityManager: true, squadQuality: 71, recentForm: 63, climateFamiliarity: 87 },
  { id: "tunisia", name: "Tunisia", countryCode: "TUN", confederation: "CAF", group: "B", flag: "🇹🇳", fifaRanking: 49, elo: 1720, gdpPerCapita: 3800, population: 12300000, managerNationality: "France", sameNationalityManager: false, squadQuality: 62, recentForm: 55, climateFamiliarity: 84 },

  // ---------------- Group C ----------------
  { id: "argentina", name: "Argentina", countryCode: "ARG", confederation: "CONMEBOL", group: "C", flag: "🇦🇷", fifaRanking: 1, elo: 2105, gdpPerCapita: 13600, population: 46200000, managerNationality: "Argentina", sameNationalityManager: true, squadQuality: 92, recentForm: 88, climateFamiliarity: 74 },
  { id: "uruguay", name: "Uruguay", countryCode: "URU", confederation: "CONMEBOL", group: "C", flag: "🇺🇾", fifaRanking: 11, elo: 1930, gdpPerCapita: 17700, population: 3420000, managerNationality: "Argentina", sameNationalityManager: false, squadQuality: 81, recentForm: 73, climateFamiliarity: 72 },
  { id: "sweden", name: "Sweden", countryCode: "SWE", confederation: "UEFA", group: "C", flag: "🇸🇪", fifaRanking: 27, elo: 1820, gdpPerCapita: 56000, population: 10500000, managerNationality: "England", sameNationalityManager: false, squadQuality: 72, recentForm: 60, climateFamiliarity: 55 },
  { id: "cameroon", name: "Cameroon", countryCode: "CMR", confederation: "CAF", group: "C", flag: "🇨🇲", fifaRanking: 53, elo: 1710, gdpPerCapita: 1700, population: 28000000, managerNationality: "Belgium", sameNationalityManager: false, squadQuality: 65, recentForm: 54, climateFamiliarity: 86 },

  // ---------------- Group D ----------------
  { id: "usa", name: "United States", countryCode: "USA", confederation: "CONCACAF", group: "D", flag: "🇺🇸", fifaRanking: 16, elo: 1860, gdpPerCapita: 76300, population: 333300000, managerNationality: "Argentina", sameNationalityManager: false, squadQuality: 75, recentForm: 67, climateFamiliarity: 92 },
  { id: "colombia", name: "Colombia", countryCode: "COL", confederation: "CONMEBOL", group: "D", flag: "🇨🇴", fifaRanking: 12, elo: 1915, gdpPerCapita: 6600, population: 52000000, managerNationality: "Argentina", sameNationalityManager: false, squadQuality: 79, recentForm: 76, climateFamiliarity: 80 },
  { id: "ukraine", name: "Ukraine", countryCode: "UKR", confederation: "UEFA", group: "D", flag: "🇺🇦", fifaRanking: 24, elo: 1830, gdpPerCapita: 4500, population: 38000000, managerNationality: "Ukraine", sameNationalityManager: true, squadQuality: 71, recentForm: 61, climateFamiliarity: 56 },
  { id: "mali", name: "Mali", countryCode: "MLI", confederation: "CAF", group: "D", flag: "🇲🇱", fifaRanking: 52, elo: 1715, gdpPerCapita: 900, population: 22600000, managerNationality: "Mali", sameNationalityManager: true, squadQuality: 63, recentForm: 56, climateFamiliarity: 89 },

  // ---------------- Group E ----------------
  { id: "france", name: "France", countryCode: "FRA", confederation: "UEFA", group: "E", flag: "🇫🇷", fifaRanking: 2, elo: 2080, gdpPerCapita: 44400, population: 68000000, managerNationality: "France", sameNationalityManager: true, squadQuality: 91, recentForm: 84, climateFamiliarity: 64 },
  { id: "morocco", name: "Morocco", countryCode: "MAR", confederation: "CAF", group: "E", flag: "🇲🇦", fifaRanking: 13, elo: 1900, gdpPerCapita: 3800, population: 37500000, managerNationality: "Morocco", sameNationalityManager: true, squadQuality: 78, recentForm: 75, climateFamiliarity: 85 },
  { id: "poland", name: "Poland", countryCode: "POL", confederation: "UEFA", group: "E", flag: "🇵🇱", fifaRanking: 28, elo: 1815, gdpPerCapita: 18300, population: 37700000, managerNationality: "Poland", sameNationalityManager: true, squadQuality: 71, recentForm: 58, climateFamiliarity: 54 },
  { id: "paraguay", name: "Paraguay", countryCode: "PAR", confederation: "CONMEBOL", group: "E", flag: "🇵🇾", fifaRanking: 50, elo: 1730, gdpPerCapita: 6200, population: 6800000, managerNationality: "Argentina", sameNationalityManager: false, squadQuality: 64, recentForm: 57, climateFamiliarity: 79 },

  // ---------------- Group F ----------------
  { id: "brazil", name: "Brazil", countryCode: "BRA", confederation: "CONMEBOL", group: "F", flag: "🇧🇷", fifaRanking: 5, elo: 2030, gdpPerCapita: 8900, population: 216400000, managerNationality: "Italy", sameNationalityManager: false, squadQuality: 89, recentForm: 78, climateFamiliarity: 88 },
  { id: "japan", name: "Japan", countryCode: "JPN", confederation: "AFC", group: "F", flag: "🇯🇵", fifaRanking: 18, elo: 1860, gdpPerCapita: 33800, population: 124700000, managerNationality: "Japan", sameNationalityManager: true, squadQuality: 76, recentForm: 74, climateFamiliarity: 70 },
  { id: "norway", name: "Norway", countryCode: "NOR", confederation: "UEFA", group: "F", flag: "🇳🇴", fifaRanking: 38, elo: 1795, gdpPerCapita: 89200, population: 5500000, managerNationality: "Norway", sameNationalityManager: true, squadQuality: 73, recentForm: 65, climateFamiliarity: 50 },
  { id: "costa-rica", name: "Costa Rica", countryCode: "CRC", confederation: "CONCACAF", group: "F", flag: "🇨🇷", fifaRanking: 54, elo: 1700, gdpPerCapita: 13400, population: 5200000, managerNationality: "Costa Rica", sameNationalityManager: true, squadQuality: 61, recentForm: 53, climateFamiliarity: 86 },

  // ---------------- Group G ----------------
  { id: "spain", name: "Spain", countryCode: "ESP", confederation: "UEFA", group: "G", flag: "🇪🇸", fifaRanking: 3, elo: 2070, gdpPerCapita: 30100, population: 47800000, managerNationality: "Spain", sameNationalityManager: true, squadQuality: 90, recentForm: 86, climateFamiliarity: 66 },
  { id: "switzerland", name: "Switzerland", countryCode: "SUI", confederation: "UEFA", group: "G", flag: "🇨🇭", fifaRanking: 19, elo: 1855, gdpPerCapita: 92400, population: 8800000, managerNationality: "Switzerland", sameNationalityManager: true, squadQuality: 74, recentForm: 63, climateFamiliarity: 58 },
  { id: "iran", name: "Iran", countryCode: "IRN", confederation: "AFC", group: "G", flag: "🇮🇷", fifaRanking: 21, elo: 1840, gdpPerCapita: 4400, population: 88500000, managerNationality: "Iran", sameNationalityManager: true, squadQuality: 70, recentForm: 64, climateFamiliarity: 82 },
  { id: "panama", name: "Panama", countryCode: "PAN", confederation: "CONCACAF", group: "G", flag: "🇵🇦", fifaRanking: 41, elo: 1740, gdpPerCapita: 17000, population: 4400000, managerNationality: "Denmark", sameNationalityManager: false, squadQuality: 60, recentForm: 56, climateFamiliarity: 87 },

  // ---------------- Group H ----------------
  { id: "england", name: "England", countryCode: "ENG", confederation: "UEFA", group: "H", flag: "ENG", fifaRanking: 4, elo: 2055, gdpPerCapita: 46100, population: 56500000, managerNationality: "Germany", sameNationalityManager: false, squadQuality: 88, recentForm: 80, climateFamiliarity: 60 },
  { id: "denmark", name: "Denmark", countryCode: "DEN", confederation: "UEFA", group: "H", flag: "🇩🇰", fifaRanking: 20, elo: 1850, gdpPerCapita: 68000, population: 5900000, managerNationality: "Denmark", sameNationalityManager: true, squadQuality: 75, recentForm: 66, climateFamiliarity: 53 },
  { id: "australia", name: "Australia", countryCode: "AUS", confederation: "AFC", group: "H", flag: "🇦🇺", fifaRanking: 25, elo: 1825, gdpPerCapita: 64500, population: 26400000, managerNationality: "Australia", sameNationalityManager: true, squadQuality: 69, recentForm: 62, climateFamiliarity: 83 },
  { id: "jamaica", name: "Jamaica", countryCode: "JAM", confederation: "CONCACAF", group: "H", flag: "🇯🇲", fifaRanking: 55, elo: 1695, gdpPerCapita: 6000, population: 2800000, managerNationality: "Iceland", sameNationalityManager: false, squadQuality: 60, recentForm: 54, climateFamiliarity: 85 },

  // ---------------- Group I ----------------
  { id: "portugal", name: "Portugal", countryCode: "POR", confederation: "UEFA", group: "I", flag: "🇵🇹", fifaRanking: 6, elo: 2025, gdpPerCapita: 24500, population: 10300000, managerNationality: "Spain", sameNationalityManager: false, squadQuality: 87, recentForm: 81, climateFamiliarity: 67 },
  { id: "senegal", name: "Senegal", countryCode: "SEN", confederation: "CAF", group: "I", flag: "🇸🇳", fifaRanking: 17, elo: 1870, gdpPerCapita: 1600, population: 17700000, managerNationality: "Senegal", sameNationalityManager: true, squadQuality: 77, recentForm: 72, climateFamiliarity: 88 },
  { id: "egypt", name: "Egypt", countryCode: "EGY", confederation: "CAF", group: "I", flag: "🇪🇬", fifaRanking: 36, elo: 1800, gdpPerCapita: 4300, population: 112700000, managerNationality: "Egypt", sameNationalityManager: true, squadQuality: 70, recentForm: 64, climateFamiliarity: 85 },
  { id: "qatar", name: "Qatar", countryCode: "QAT", confederation: "AFC", group: "I", flag: "🇶🇦", fifaRanking: 37, elo: 1770, gdpPerCapita: 83900, population: 2700000, managerNationality: "Spain", sameNationalityManager: false, squadQuality: 64, recentForm: 58, climateFamiliarity: 84 },

  // ---------------- Group J ----------------
  { id: "netherlands", name: "Netherlands", countryCode: "NED", confederation: "UEFA", group: "J", flag: "🇳🇱", fifaRanking: 7, elo: 2010, gdpPerCapita: 57000, population: 17800000, managerNationality: "Netherlands", sameNationalityManager: true, squadQuality: 86, recentForm: 79, climateFamiliarity: 59 },
  { id: "south-korea", name: "South Korea", countryCode: "KOR", confederation: "AFC", group: "J", flag: "🇰🇷", fifaRanking: 22, elo: 1845, gdpPerCapita: 32400, population: 51700000, managerNationality: "South Korea", sameNationalityManager: true, squadQuality: 73, recentForm: 68, climateFamiliarity: 76 },
  { id: "ivory-coast", name: "Ivory Coast", countryCode: "CIV", confederation: "CAF", group: "J", flag: "🇨🇮", fifaRanking: 40, elo: 1775, gdpPerCapita: 2500, population: 28200000, managerNationality: "Ivory Coast", sameNationalityManager: true, squadQuality: 72, recentForm: 67, climateFamiliarity: 88 },
  { id: "iraq", name: "Iraq", countryCode: "IRQ", confederation: "AFC", group: "J", flag: "🇮🇶", fifaRanking: 56, elo: 1705, gdpPerCapita: 5300, population: 44500000, managerNationality: "Spain", sameNationalityManager: false, squadQuality: 60, recentForm: 55, climateFamiliarity: 83 },

  // ---------------- Group K ----------------
  { id: "germany", name: "Germany", countryCode: "GER", confederation: "UEFA", group: "K", flag: "🇩🇪", fifaRanking: 8, elo: 2000, gdpPerCapita: 48700, population: 84500000, managerNationality: "Germany", sameNationalityManager: true, squadQuality: 85, recentForm: 77, climateFamiliarity: 61 },
  { id: "serbia", name: "Serbia", countryCode: "SRB", confederation: "UEFA", group: "K", flag: "🇷🇸", fifaRanking: 29, elo: 1815, gdpPerCapita: 9200, population: 6700000, managerNationality: "Serbia", sameNationalityManager: true, squadQuality: 73, recentForm: 60, climateFamiliarity: 57 },
  { id: "saudi-arabia", name: "Saudi Arabia", countryCode: "KSA", confederation: "AFC", group: "K", flag: "🇸🇦", fifaRanking: 57, elo: 1700, gdpPerCapita: 30400, population: 36900000, managerNationality: "Greece", sameNationalityManager: false, squadQuality: 62, recentForm: 56, climateFamiliarity: 84 },
  { id: "uzbekistan", name: "Uzbekistan", countryCode: "UZB", confederation: "AFC", group: "K", flag: "🇺🇿", fifaRanking: 58, elo: 1710, gdpPerCapita: 2300, population: 35600000, managerNationality: "Italy", sameNationalityManager: false, squadQuality: 61, recentForm: 59, climateFamiliarity: 75 },

  // ---------------- Group L ----------------
  { id: "belgium", name: "Belgium", countryCode: "BEL", confederation: "UEFA", group: "L", flag: "🇧🇪", fifaRanking: 14, elo: 1950, gdpPerCapita: 51200, population: 11700000, managerNationality: "France", sameNationalityManager: false, squadQuality: 84, recentForm: 72, climateFamiliarity: 60 },
  { id: "austria", name: "Austria", countryCode: "AUT", confederation: "UEFA", group: "L", flag: "🇦🇹", fifaRanking: 26, elo: 1825, gdpPerCapita: 53600, population: 9100000, managerNationality: "Germany", sameNationalityManager: false, squadQuality: 73, recentForm: 69, climateFamiliarity: 56 },
  { id: "algeria", name: "Algeria", countryCode: "ALG", confederation: "CAF", group: "L", flag: "🇩🇿", fifaRanking: 35, elo: 1790, gdpPerCapita: 4300, population: 45600000, managerNationality: "Switzerland", sameNationalityManager: false, squadQuality: 70, recentForm: 63, climateFamiliarity: 85 },
  { id: "new-zealand", name: "New Zealand", countryCode: "NZL", confederation: "OFC", group: "L", flag: "🇳🇿", fifaRanking: 89, elo: 1620, gdpPerCapita: 48800, population: 5200000, managerNationality: "England", sameNationalityManager: false, squadQuality: 55, recentForm: 52, climateFamiliarity: 70 },
];

export const teamById = new Map(teams.map((t) => [t.id, t]));
