import { officialTeams } from "@/data/official/teams";
import { officialVenues } from "@/data/official/venues";

/**
 * Normalization maps for the CANDIDATE layer.
 *
 * The third-party sources spell several teams differently from our canonical
 * `Team.id`s and print venues as free-text strings (stadium, city + a flag
 * emoji). These maps resolve both to our ids. Resolution is EXPLICIT — an
 * unmapped name/venue is surfaced by validation rather than silently guessed.
 */

const TEAM_IDS = new Set(officialTeams.map((t) => t.id));

/**
 * Source team name (Excel `Matches`/`Setup` + Telegraph codes expanded) -> id.
 * Includes the exact spelling variants seen in the workbook.
 */
export const TEAM_NAME_TO_ID: Record<string, string> = {
  // Group A
  Mexico: "mexico",
  "South Africa": "south-africa",
  "Korea Republic": "south-korea",
  "South Korea": "south-korea",
  Czechia: "czechia",
  "Czech Rep.": "czechia",
  // Group B
  Canada: "canada",
  "Bosnia and Herzegovina": "bosnia-herzegovina",
  "Bosnia-Herzeg.": "bosnia-herzegovina",
  Qatar: "qatar",
  Switzerland: "switzerland",
  // Group C
  Brazil: "brazil",
  Morocco: "morocco",
  Haiti: "haiti",
  Scotland: "scotland",
  // Group D
  USA: "usa",
  "United States": "usa",
  Paraguay: "paraguay",
  Australia: "australia",
  "Türkiye": "turkiye",
  Turkey: "turkiye",
  // Group E
  Germany: "germany",
  Curacao: "curacao",
  "Curaçao": "curacao",
  "Cote D'Voire": "ivory-coast",
  "Ivory Coast": "ivory-coast",
  Ecuador: "ecuador",
  // Group F
  Netherlands: "netherlands",
  Japan: "japan",
  Sweden: "sweden",
  Tunisia: "tunisia",
  // Group G
  Belgium: "belgium",
  Egypt: "egypt",
  Iran: "iran",
  "New Zealand": "new-zealand",
  // Group H
  Spain: "spain",
  "Cabo Verde": "cape-verde",
  "Cape Verde": "cape-verde",
  "Saudi Arabia": "saudi-arabia",
  Uruguay: "uruguay",
  // Group I
  France: "france",
  Senegal: "senegal",
  Iraq: "iraq",
  Norway: "norway",
  // Group J
  Argentina: "argentina",
  Algeria: "algeria",
  Austria: "austria",
  Jordan: "jordan",
  // Group K
  Portugal: "portugal",
  "DR Congo": "congo-dr",
  Uzbekistan: "uzbekistan",
  Colombia: "colombia",
  // Group L
  England: "england",
  Croatia: "croatia",
  Ghana: "ghana",
  Panama: "panama",
};

/**
 * Stadium name (the part before the comma in a source venue string) -> venue id.
 * The source venue string also carries a city and a flag emoji, which we ignore.
 */
export const VENUE_NAME_TO_ID: Record<string, string> = {
  "Estadio Azteca": "mexico-city",
  "Estadio Akron": "guadalajara",
  "Estadio BBVA": "monterrey",
  "BMO Field": "toronto",
  "BC Place": "vancouver",
  "MetLife Stadium": "new-york",
  "SoFi Stadium": "los-angeles",
  "AT&T Stadium": "dallas",
  "Mercedes-Benz Stadium": "atlanta",
  "Hard Rock Stadium": "miami",
  "NRG Stadium": "houston",
  "Arrowhead Stadium": "kansas-city",
  "Lincoln Financial Field": "philadelphia",
  "Lumen Field": "seattle",
  "Levi's Stadium": "san-francisco",
  // Some sources print the stadium with a typographic apostrophe (U+2019).
  "Levi’s Stadium": "san-francisco",
  "Gillette Stadium": "boston",
};

const VENUE_IDS = new Set(officialVenues.map((v) => v.id));

/** Resolve a source team name to a canonical team id (or undefined). */
export function resolveTeamId(name: string): string | undefined {
  const id = TEAM_NAME_TO_ID[name.trim()];
  return id && TEAM_IDS.has(id) ? id : undefined;
}

/**
 * Resolve a raw source venue string ("Estadio Azteca, Mexico City 🇲🇽") to a
 * venue id by matching the stadium name before the first comma.
 */
export function resolveVenueId(venueRaw: string): string | undefined {
  const stadium = venueRaw.split(",")[0]?.trim() ?? "";
  const id = VENUE_NAME_TO_ID[stadium];
  return id && VENUE_IDS.has(id) ? id : undefined;
}
