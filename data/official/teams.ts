import type { Team } from "@/lib/types";
import { stagedDrawPositions } from "./staging/schedule";

/**
 * OFFICIAL (CANDIDATE) 2026 FIELD — group composition from the Final Draw
 * (Washington D.C., 5 Dec 2025).
 *
 * PROVENANCE (A2): sourceStatus = "candidate".
 *   Team IDENTITIES (name, code, confederation, group, seed position) are
 *   CROSS-VERIFIED from multiple credible non-FIFA outlets — NOT fetched from an
 *   official FIFA endpoint (fifa.com/Wikipedia blocked our fetch agent with 403).
 *   SOURCES:
 *     - https://www.nbcsports.com/soccer/news/2026-world-cup-groups-confirmed-full-draw-groups-details
 *     - https://www.espn.com/soccer/story/_/id/47108758/2026-fifa-world-cup-format-tiebreakers-fixtures-schedule
 *     - https://sports.yahoo.com/articles/2026-world-cup-groups-confirmed-191406172.html
 *
 *   Model FEATURE VALUES (fifaRanking, elo, gdpPerCapita, population,
 *   squadQuality, recentForm, climateFamiliarity, manager) remain MOCK
 *   placeholders and must NOT be read as real. Flip to "verified" only when
 *   sourced from official FIFA data or user-supplied authoritative JSON.
 *
 * Seed (Pot 1 / co-host) is listed first in each group as position 1.
 *
 * DRAW POSITIONS (A3): ACTIVE (Phase 1.6 Step B). All 48 draw slots are now
 * source-backed from the OFFICIAL FIFA schedule (v17, 10 Apr 2026): they are
 * SOLVED from the schedule's Art. 12.4 pairings and applied below from
 * `stagedDrawPositions` with `drawSlotStatus: "verified"`. The three regulation
 * host slots (Mexico A1, Canada B1, USA D1) are part of that set and preserved.
 * The host literals on the rows below are retained for readability; the map
 * reasserts them with identical values. Team identities + model fields are
 * unchanged (still candidate/mock).
 */
const RAW_TEAMS: Team[] = [
  // ---------------- Group A ----------------
  { id: "mexico", name: "Mexico", countryCode: "MEX", confederation: "CONCACAF", group: "A", drawPosition: 1, drawSlot: "A1", drawSlotStatus: "verified", flag: "🇲🇽", fifaRanking: 15, elo: 1875, gdpPerCapita: 11500, population: 128900000, managerNationality: "Mexico", sameNationalityManager: true, squadQuality: 74, recentForm: 66, climateFamiliarity: 90 },
  { id: "south-korea", name: "South Korea", countryCode: "KOR", confederation: "AFC", group: "A", flag: "🇰🇷", fifaRanking: 22, elo: 1845, gdpPerCapita: 32400, population: 51700000, managerNationality: "South Korea", sameNationalityManager: true, squadQuality: 73, recentForm: 68, climateFamiliarity: 76 },
  { id: "south-africa", name: "South Africa", countryCode: "RSA", confederation: "CAF", group: "A", flag: "🇿🇦", fifaRanking: 60, elo: 1700, gdpPerCapita: 6800, population: 60400000, managerNationality: "South Africa", sameNationalityManager: true, squadQuality: 63, recentForm: 60, climateFamiliarity: 84 },
  { id: "czechia", name: "Czechia", countryCode: "CZE", confederation: "UEFA", group: "A", flag: "🇨🇿", fifaRanking: 42, elo: 1790, gdpPerCapita: 30500, population: 10500000, managerNationality: "Czechia", sameNationalityManager: true, squadQuality: 70, recentForm: 61, climateFamiliarity: 56 },

  // ---------------- Group B ----------------
  { id: "canada", name: "Canada", countryCode: "CAN", confederation: "CONCACAF", group: "B", drawPosition: 1, drawSlot: "B1", drawSlotStatus: "verified", flag: "🇨🇦", fifaRanking: 43, elo: 1790, gdpPerCapita: 53500, population: 39000000, managerNationality: "USA", sameNationalityManager: false, squadQuality: 68, recentForm: 60, climateFamiliarity: 85 },
  { id: "switzerland", name: "Switzerland", countryCode: "SUI", confederation: "UEFA", group: "B", flag: "🇨🇭", fifaRanking: 19, elo: 1855, gdpPerCapita: 92400, population: 8800000, managerNationality: "Italy", sameNationalityManager: false, squadQuality: 74, recentForm: 63, climateFamiliarity: 58 },
  { id: "qatar", name: "Qatar", countryCode: "QAT", confederation: "AFC", group: "B", flag: "🇶🇦", fifaRanking: 37, elo: 1770, gdpPerCapita: 83900, population: 2700000, managerNationality: "Spain", sameNationalityManager: false, squadQuality: 64, recentForm: 58, climateFamiliarity: 84 },
  { id: "bosnia-herzegovina", name: "Bosnia & Herzegovina", countryCode: "BIH", confederation: "UEFA", group: "B", flag: "🇧🇦", fifaRanking: 62, elo: 1720, gdpPerCapita: 7600, population: 3200000, managerNationality: "Bosnia & Herzegovina", sameNationalityManager: true, squadQuality: 66, recentForm: 62, climateFamiliarity: 57 },

  // ---------------- Group C ----------------
  { id: "brazil", name: "Brazil", countryCode: "BRA", confederation: "CONMEBOL", group: "C", flag: "🇧🇷", fifaRanking: 5, elo: 2030, gdpPerCapita: 8900, population: 216400000, managerNationality: "Brazil", sameNationalityManager: true, squadQuality: 89, recentForm: 78, climateFamiliarity: 88 },
  { id: "morocco", name: "Morocco", countryCode: "MAR", confederation: "CAF", group: "C", flag: "🇲🇦", fifaRanking: 13, elo: 1900, gdpPerCapita: 3800, population: 37500000, managerNationality: "Morocco", sameNationalityManager: true, squadQuality: 78, recentForm: 75, climateFamiliarity: 85 },
  { id: "scotland", name: "Scotland", countryCode: "SCO", confederation: "UEFA", group: "C", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", fifaRanking: 44, elo: 1785, gdpPerCapita: 38000, population: 5500000, managerNationality: "Scotland", sameNationalityManager: true, squadQuality: 69, recentForm: 62, climateFamiliarity: 52 },
  { id: "haiti", name: "Haiti", countryCode: "HAI", confederation: "CONCACAF", group: "C", flag: "🇭🇹", fifaRanking: 83, elo: 1640, gdpPerCapita: 1700, population: 11700000, managerNationality: "France", sameNationalityManager: false, squadQuality: 57, recentForm: 55, climateFamiliarity: 86 },

  // ---------------- Group D ----------------
  { id: "usa", name: "United States", countryCode: "USA", confederation: "CONCACAF", group: "D", drawPosition: 1, drawSlot: "D1", drawSlotStatus: "verified", flag: "🇺🇸", fifaRanking: 16, elo: 1860, gdpPerCapita: 76300, population: 333300000, managerNationality: "USA", sameNationalityManager: true, squadQuality: 75, recentForm: 67, climateFamiliarity: 92 },
  { id: "australia", name: "Australia", countryCode: "AUS", confederation: "AFC", group: "D", flag: "🇦🇺", fifaRanking: 25, elo: 1825, gdpPerCapita: 64500, population: 26400000, managerNationality: "Australia", sameNationalityManager: true, squadQuality: 69, recentForm: 62, climateFamiliarity: 83 },
  { id: "paraguay", name: "Paraguay", countryCode: "PAR", confederation: "CONMEBOL", group: "D", flag: "🇵🇾", fifaRanking: 50, elo: 1730, gdpPerCapita: 6200, population: 6800000, managerNationality: "Argentina", sameNationalityManager: false, squadQuality: 64, recentForm: 57, climateFamiliarity: 79 },
  { id: "turkiye", name: "Türkiye", countryCode: "TUR", confederation: "UEFA", group: "D", flag: "🇹🇷", fifaRanking: 26, elo: 1820, gdpPerCapita: 13100, population: 85300000, managerNationality: "Italy", sameNationalityManager: false, squadQuality: 74, recentForm: 66, climateFamiliarity: 70 },

  // ---------------- Group E ----------------
  { id: "germany", name: "Germany", countryCode: "GER", confederation: "UEFA", group: "E", flag: "🇩🇪", fifaRanking: 8, elo: 2000, gdpPerCapita: 48700, population: 84500000, managerNationality: "Germany", sameNationalityManager: true, squadQuality: 85, recentForm: 77, climateFamiliarity: 61 },
  { id: "ecuador", name: "Ecuador", countryCode: "ECU", confederation: "CONMEBOL", group: "E", flag: "🇪🇨", fifaRanking: 31, elo: 1810, gdpPerCapita: 6400, population: 18000000, managerNationality: "Spain", sameNationalityManager: false, squadQuality: 70, recentForm: 64, climateFamiliarity: 78 },
  { id: "ivory-coast", name: "Ivory Coast", countryCode: "CIV", confederation: "CAF", group: "E", flag: "🇨🇮", fifaRanking: 40, elo: 1775, gdpPerCapita: 2500, population: 28200000, managerNationality: "Ivory Coast", sameNationalityManager: true, squadQuality: 72, recentForm: 67, climateFamiliarity: 88 },
  { id: "curacao", name: "Curaçao", countryCode: "CUW", confederation: "CONCACAF", group: "E", flag: "🇨🇼", fifaRanking: 82, elo: 1645, gdpPerCapita: 16000, population: 150000, managerNationality: "Netherlands", sameNationalityManager: false, squadQuality: 56, recentForm: 58, climateFamiliarity: 85 },

  // ---------------- Group F ----------------
  { id: "netherlands", name: "Netherlands", countryCode: "NED", confederation: "UEFA", group: "F", flag: "🇳🇱", fifaRanking: 7, elo: 2010, gdpPerCapita: 57000, population: 17800000, managerNationality: "Netherlands", sameNationalityManager: true, squadQuality: 86, recentForm: 79, climateFamiliarity: 59 },
  { id: "japan", name: "Japan", countryCode: "JPN", confederation: "AFC", group: "F", flag: "🇯🇵", fifaRanking: 18, elo: 1860, gdpPerCapita: 33800, population: 124700000, managerNationality: "Japan", sameNationalityManager: true, squadQuality: 76, recentForm: 74, climateFamiliarity: 70 },
  { id: "tunisia", name: "Tunisia", countryCode: "TUN", confederation: "CAF", group: "F", flag: "🇹🇳", fifaRanking: 49, elo: 1720, gdpPerCapita: 3800, population: 12300000, managerNationality: "Tunisia", sameNationalityManager: true, squadQuality: 62, recentForm: 55, climateFamiliarity: 84 },
  { id: "sweden", name: "Sweden", countryCode: "SWE", confederation: "UEFA", group: "F", flag: "🇸🇪", fifaRanking: 27, elo: 1820, gdpPerCapita: 56000, population: 10500000, managerNationality: "Sweden", sameNationalityManager: true, squadQuality: 72, recentForm: 60, climateFamiliarity: 55 },

  // ---------------- Group G ----------------
  { id: "belgium", name: "Belgium", countryCode: "BEL", confederation: "UEFA", group: "G", flag: "🇧🇪", fifaRanking: 14, elo: 1950, gdpPerCapita: 51200, population: 11700000, managerNationality: "Germany", sameNationalityManager: false, squadQuality: 84, recentForm: 72, climateFamiliarity: 60 },
  { id: "iran", name: "Iran", countryCode: "IRN", confederation: "AFC", group: "G", flag: "🇮🇷", fifaRanking: 21, elo: 1840, gdpPerCapita: 4400, population: 88500000, managerNationality: "Iran", sameNationalityManager: true, squadQuality: 70, recentForm: 64, climateFamiliarity: 82 },
  { id: "egypt", name: "Egypt", countryCode: "EGY", confederation: "CAF", group: "G", flag: "🇪🇬", fifaRanking: 36, elo: 1800, gdpPerCapita: 4300, population: 112700000, managerNationality: "Egypt", sameNationalityManager: true, squadQuality: 70, recentForm: 64, climateFamiliarity: 85 },
  { id: "new-zealand", name: "New Zealand", countryCode: "NZL", confederation: "OFC", group: "G", flag: "🇳🇿", fifaRanking: 89, elo: 1620, gdpPerCapita: 48800, population: 5200000, managerNationality: "New Zealand", sameNationalityManager: true, squadQuality: 55, recentForm: 52, climateFamiliarity: 70 },

  // ---------------- Group H ----------------
  { id: "spain", name: "Spain", countryCode: "ESP", confederation: "UEFA", group: "H", flag: "🇪🇸", fifaRanking: 3, elo: 2070, gdpPerCapita: 30100, population: 47800000, managerNationality: "Spain", sameNationalityManager: true, squadQuality: 90, recentForm: 86, climateFamiliarity: 66 },
  { id: "uruguay", name: "Uruguay", countryCode: "URU", confederation: "CONMEBOL", group: "H", flag: "🇺🇾", fifaRanking: 11, elo: 1930, gdpPerCapita: 17700, population: 3420000, managerNationality: "Argentina", sameNationalityManager: false, squadQuality: 81, recentForm: 73, climateFamiliarity: 72 },
  { id: "saudi-arabia", name: "Saudi Arabia", countryCode: "KSA", confederation: "AFC", group: "H", flag: "🇸🇦", fifaRanking: 57, elo: 1700, gdpPerCapita: 30400, population: 36900000, managerNationality: "France", sameNationalityManager: false, squadQuality: 62, recentForm: 56, climateFamiliarity: 84 },
  { id: "cape-verde", name: "Cape Verde", countryCode: "CPV", confederation: "CAF", group: "H", flag: "🇨🇻", fifaRanking: 70, elo: 1675, gdpPerCapita: 4300, population: 600000, managerNationality: "Cape Verde", sameNationalityManager: true, squadQuality: 60, recentForm: 63, climateFamiliarity: 85 },

  // ---------------- Group I ----------------
  { id: "france", name: "France", countryCode: "FRA", confederation: "UEFA", group: "I", flag: "🇫🇷", fifaRanking: 2, elo: 2080, gdpPerCapita: 44400, population: 68000000, managerNationality: "France", sameNationalityManager: true, squadQuality: 91, recentForm: 84, climateFamiliarity: 64 },
  { id: "senegal", name: "Senegal", countryCode: "SEN", confederation: "CAF", group: "I", flag: "🇸🇳", fifaRanking: 17, elo: 1870, gdpPerCapita: 1600, population: 17700000, managerNationality: "Senegal", sameNationalityManager: true, squadQuality: 77, recentForm: 72, climateFamiliarity: 88 },
  { id: "norway", name: "Norway", countryCode: "NOR", confederation: "UEFA", group: "I", flag: "🇳🇴", fifaRanking: 38, elo: 1795, gdpPerCapita: 89200, population: 5500000, managerNationality: "Norway", sameNationalityManager: true, squadQuality: 73, recentForm: 65, climateFamiliarity: 50 },
  { id: "iraq", name: "Iraq", countryCode: "IRQ", confederation: "AFC", group: "I", flag: "🇮🇶", fifaRanking: 56, elo: 1705, gdpPerCapita: 5300, population: 44500000, managerNationality: "Australia", sameNationalityManager: false, squadQuality: 60, recentForm: 55, climateFamiliarity: 83 },

  // ---------------- Group J ----------------
  { id: "argentina", name: "Argentina", countryCode: "ARG", confederation: "CONMEBOL", group: "J", flag: "🇦🇷", fifaRanking: 1, elo: 2105, gdpPerCapita: 13600, population: 46200000, managerNationality: "Argentina", sameNationalityManager: true, squadQuality: 92, recentForm: 88, climateFamiliarity: 74 },
  { id: "austria", name: "Austria", countryCode: "AUT", confederation: "UEFA", group: "J", flag: "🇦🇹", fifaRanking: 23, elo: 1830, gdpPerCapita: 53600, population: 9100000, managerNationality: "Germany", sameNationalityManager: false, squadQuality: 73, recentForm: 69, climateFamiliarity: 56 },
  { id: "algeria", name: "Algeria", countryCode: "ALG", confederation: "CAF", group: "J", flag: "🇩🇿", fifaRanking: 35, elo: 1790, gdpPerCapita: 4300, population: 45600000, managerNationality: "Algeria", sameNationalityManager: true, squadQuality: 70, recentForm: 63, climateFamiliarity: 85 },
  { id: "jordan", name: "Jordan", countryCode: "JOR", confederation: "AFC", group: "J", flag: "🇯🇴", fifaRanking: 64, elo: 1700, gdpPerCapita: 4400, population: 11300000, managerNationality: "Jordan", sameNationalityManager: true, squadQuality: 61, recentForm: 65, climateFamiliarity: 84 },

  // ---------------- Group K ----------------
  { id: "portugal", name: "Portugal", countryCode: "POR", confederation: "UEFA", group: "K", flag: "🇵🇹", fifaRanking: 6, elo: 2025, gdpPerCapita: 24500, population: 10300000, managerNationality: "Portugal", sameNationalityManager: true, squadQuality: 87, recentForm: 81, climateFamiliarity: 67 },
  { id: "colombia", name: "Colombia", countryCode: "COL", confederation: "CONMEBOL", group: "K", flag: "🇨🇴", fifaRanking: 12, elo: 1915, gdpPerCapita: 6600, population: 52000000, managerNationality: "Argentina", sameNationalityManager: false, squadQuality: 79, recentForm: 76, climateFamiliarity: 80 },
  { id: "uzbekistan", name: "Uzbekistan", countryCode: "UZB", confederation: "AFC", group: "K", flag: "🇺🇿", fifaRanking: 58, elo: 1710, gdpPerCapita: 2300, population: 35600000, managerNationality: "Uzbekistan", sameNationalityManager: true, squadQuality: 61, recentForm: 59, climateFamiliarity: 75 },
  { id: "congo-dr", name: "DR Congo", countryCode: "COD", confederation: "CAF", group: "K", flag: "🇨🇩", fifaRanking: 59, elo: 1715, gdpPerCapita: 650, population: 102300000, managerNationality: "France", sameNationalityManager: false, squadQuality: 67, recentForm: 64, climateFamiliarity: 87 },

  // ---------------- Group L ----------------
  { id: "england", name: "England", countryCode: "ENG", confederation: "UEFA", group: "L", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", fifaRanking: 4, elo: 2055, gdpPerCapita: 46100, population: 56500000, managerNationality: "England", sameNationalityManager: true, squadQuality: 88, recentForm: 80, climateFamiliarity: 60 },
  { id: "croatia", name: "Croatia", countryCode: "CRO", confederation: "UEFA", group: "L", flag: "🇭🇷", fifaRanking: 10, elo: 1955, gdpPerCapita: 18500, population: 3850000, managerNationality: "Croatia", sameNationalityManager: true, squadQuality: 80, recentForm: 70, climateFamiliarity: 60 },
  { id: "panama", name: "Panama", countryCode: "PAN", confederation: "CONCACAF", group: "L", flag: "🇵🇦", fifaRanking: 41, elo: 1740, gdpPerCapita: 17000, population: 4400000, managerNationality: "Panama", sameNationalityManager: true, squadQuality: 60, recentForm: 56, climateFamiliarity: 87 },
  { id: "ghana", name: "Ghana", countryCode: "GHA", confederation: "CAF", group: "L", flag: "🇬🇭", fifaRanking: 68, elo: 1690, gdpPerCapita: 2400, population: 33500000, managerNationality: "Ghana", sameNationalityManager: true, squadQuality: 64, recentForm: 52, climateFamiliarity: 88 },
];

/**
 * Apply the verified draw positions (solved from the official FIFA schedule in
 * Phase 1.6 Step A; see data/official/staging/schedule.ts) to every team. This is
 * the single source of truth for draw slots, so all 48 stay consistent with the
 * schedule and the solver, and the host slots A1/B1/D1 are preserved.
 */
const DRAW_BY_TEAM = new Map(stagedDrawPositions.map((p) => [p.teamId, p]));

export const officialTeams: Team[] = RAW_TEAMS.map((team) => {
  const draw = DRAW_BY_TEAM.get(team.id);
  if (!draw) return team;
  return {
    ...team,
    drawPosition: draw.position,
    drawSlot: draw.slot,
    drawSlotStatus: "verified" as const,
  };
});
