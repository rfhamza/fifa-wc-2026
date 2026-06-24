/**
 * Phase 1.25C - FIRST REAL WC 2026 current-results snapshot (manual fixture).
 * --------------------------------------------------------------------------
 * Hand-authored from the user-supplied current-results CSV (PRIMARY source). Each
 * row is normalised to the live-state raw-input contract (`RawLiveMatch`) with the
 * app's internal team ids resolved at authoring time. There is NO runtime CSV
 * parsing; this is a static, typed fixture for tests only (not a production path).
 *
 * Source key rule (per README_SOURCE_NOTES): use the official FIFA `matchNumber`
 * as the fixture key (`matchId = "M{matchNumber}"`); the provider's structured-feed
 * match id is kept ONLY as provenance (`currentResultsProvenance`), never used for
 * matching.
 *
 * Snapshot facts: asOf 2026-06-24T14:09:06Z; schema/retrieved 2026-06-24T14:33:36Z;
 * 48 completed group-stage matches (M1-M48), groups A-L, 4 per group, every team has
 * 2 played. Group-stage rows intentionally carry no winner and no penalties. The
 * later 2026-06-24 match block is not included.
 */
import type { GroupId } from "@/lib/types";
import type { RawLiveMatch, RawLiveSnapshot } from "@/lib/live-state/types";

/** ISO instant carried on every row (snapshot generation time). */
const ROW_LAST_UPDATED = "2026-06-24T14:09:06Z";

/** One hand-authored row (compact internal shape; mapped to the contract below). */
interface CurrentRow {
  n: number; // official matchNumber (1..48)
  group: GroupId;
  aId: string; // app team id (resolved at authoring time)
  aCode: string; // provider/source team code (provenance only)
  bId: string;
  bCode: string;
  ga: number;
  gb: number;
  kickoff: string;
  prov: string; // provider structured-feed match id (provenance only)
  venueRaw: string;
  venueId: string; // provider venue id (provenance only; not the app venue id)
  notes?: string;
}

// Resolved from the user-supplied wc2026-current-results CSV. Team ids are the app's
// internal ids (mapped by name: Turkey->turkiye, DR Congo->congo-dr, Bosnia and
// Herzegovina->bosnia-herzegovina, United States->usa, etc.). Codes/provider ids are
// kept verbatim for provenance.
const ROWS: CurrentRow[] = [
  { n: 1, group: "A", aId: "mexico", aCode: "MEX", bId: "south-africa", bCode: "RSA", ga: 2, gb: 0, kickoff: "2026-06-11T19:00:00Z", prov: "66456904", venueRaw: "Mexico City Stadium", venueId: "mexico-city-stadium" },
  { n: 2, group: "A", aId: "south-korea", aCode: "KOR", bId: "czechia", bCode: "CZE", ga: 2, gb: 1, kickoff: "2026-06-12T02:00:00Z", prov: "66456906", venueRaw: "Guadalajara Stadium", venueId: "guadalajara-stadium" },
  { n: 3, group: "B", aId: "canada", aCode: "CAN", bId: "bosnia-herzegovina", bCode: "BIH", ga: 1, gb: 1, kickoff: "2026-06-12T19:00:00Z", prov: "66456916", venueRaw: "Toronto Stadium", venueId: "toronto-stadium" },
  { n: 4, group: "D", aId: "usa", aCode: "USA", bId: "paraguay", bCode: "PAR", ga: 4, gb: 1, kickoff: "2026-06-13T01:00:00Z", prov: "66456940", venueRaw: "Los Angeles Stadium", venueId: "los-angeles-stadium" },
  { n: 5, group: "C", aId: "haiti", aCode: "HTI", bId: "scotland", bCode: "SCO", ga: 0, gb: 1, kickoff: "2026-06-14T01:00:00Z", prov: "66456930", venueRaw: "Boston Stadium", venueId: "boston-stadium" },
  { n: 6, group: "D", aId: "australia", aCode: "AUS", bId: "turkiye", bCode: "TUR", ga: 2, gb: 0, kickoff: "2026-06-14T04:00:00Z", prov: "66456942", venueRaw: "Vancouver Stadium", venueId: "vancouver-stadium" },
  { n: 7, group: "C", aId: "brazil", aCode: "BRA", bId: "morocco", bCode: "MAR", ga: 1, gb: 1, kickoff: "2026-06-13T22:00:00Z", prov: "66456928", venueRaw: "New York/New Jersey Stadium", venueId: "new-york-new-jersey-stadium" },
  { n: 8, group: "B", aId: "qatar", aCode: "QAT", bId: "switzerland", bCode: "SUI", ga: 1, gb: 1, kickoff: "2026-06-13T19:00:00Z", prov: "66456918", venueRaw: "San Francisco Bay Area Stadium", venueId: "san-francisco-bay-area-stadium" },
  { n: 9, group: "E", aId: "ivory-coast", aCode: "CIV", bId: "ecuador", bCode: "ECU", ga: 1, gb: 0, kickoff: "2026-06-14T23:00:00Z", prov: "66457072", venueRaw: "Philadelphia Stadium", venueId: "philadelphia-stadium" },
  { n: 10, group: "E", aId: "germany", aCode: "GER", bId: "curacao", bCode: "CUW", ga: 7, gb: 1, kickoff: "2026-06-14T17:00:00Z", prov: "66457070", venueRaw: "Houston Stadium", venueId: "houston-stadium" },
  { n: 11, group: "F", aId: "netherlands", aCode: "NED", bId: "japan", bCode: "JPN", ga: 2, gb: 2, kickoff: "2026-06-14T20:00:00Z", prov: "66456968", venueRaw: "Dallas Stadium", venueId: "dallas-stadium" },
  { n: 12, group: "F", aId: "sweden", aCode: "SWE", bId: "tunisia", bCode: "TUN", ga: 5, gb: 1, kickoff: "2026-06-15T02:00:00Z", prov: "66456970", venueRaw: "Monterrey Stadium", venueId: "monterrey-stadium" },
  { n: 13, group: "H", aId: "saudi-arabia", aCode: "KSA", bId: "uruguay", bCode: "URU", ga: 1, gb: 1, kickoff: "2026-06-15T22:00:00Z", prov: "66456996", venueRaw: "Miami Stadium", venueId: "miami-stadium" },
  { n: 14, group: "H", aId: "spain", aCode: "ESP", bId: "cape-verde", bCode: "CPV", ga: 0, gb: 0, kickoff: "2026-06-15T16:00:00Z", prov: "66456994", venueRaw: "Atlanta Stadium", venueId: "atlanta-stadium" },
  { n: 15, group: "G", aId: "iran", aCode: "IRI", bId: "new-zealand", bCode: "NZL", ga: 2, gb: 2, kickoff: "2026-06-16T01:00:00Z", prov: "66456984", venueRaw: "Los Angeles Stadium", venueId: "los-angeles-stadium" },
  { n: 16, group: "G", aId: "belgium", aCode: "BEL", bId: "egypt", bCode: "EGY", ga: 1, gb: 1, kickoff: "2026-06-15T19:00:00Z", prov: "66456982", venueRaw: "Seattle Stadium", venueId: "seattle-stadium" },
  { n: 17, group: "I", aId: "france", aCode: "FRA", bId: "senegal", bCode: "SEN", ga: 3, gb: 1, kickoff: "2026-06-16T19:00:00Z", prov: "66457006", venueRaw: "New York/New Jersey Stadium", venueId: "new-york-new-jersey-stadium" },
  { n: 18, group: "I", aId: "iraq", aCode: "IRQ", bId: "norway", bCode: "NOR", ga: 1, gb: 4, kickoff: "2026-06-16T22:00:00Z", prov: "66457008", venueRaw: "Boston Stadium", venueId: "boston-stadium" },
  { n: 19, group: "J", aId: "argentina", aCode: "ARG", bId: "algeria", bCode: "DZA", ga: 3, gb: 0, kickoff: "2026-06-17T01:00:00Z", prov: "66457018", venueRaw: "Kansas City Stadium", venueId: "kansas-city-stadium" },
  { n: 20, group: "J", aId: "austria", aCode: "AUT", bId: "jordan", bCode: "JOR", ga: 3, gb: 1, kickoff: "2026-06-17T04:00:00Z", prov: "66457020", venueRaw: "San Francisco Bay Area Stadium", venueId: "san-francisco-bay-area-stadium" },
  { n: 21, group: "L", aId: "ghana", aCode: "GHA", bId: "panama", bCode: "PAN", ga: 1, gb: 0, kickoff: "2026-06-17T23:00:00Z", prov: "66457044", venueRaw: "Toronto Stadium", venueId: "toronto-stadium" },
  { n: 22, group: "L", aId: "england", aCode: "ENG", bId: "croatia", bCode: "CRO", ga: 4, gb: 2, kickoff: "2026-06-17T20:00:00Z", prov: "66457042", venueRaw: "Dallas Stadium", venueId: "dallas-stadium" },
  { n: 23, group: "K", aId: "portugal", aCode: "POR", bId: "congo-dr", bCode: "COD", ga: 1, gb: 1, kickoff: "2026-06-17T17:00:00Z", prov: "66457030", venueRaw: "Houston Stadium", venueId: "houston-stadium" },
  { n: 24, group: "K", aId: "uzbekistan", aCode: "UZB", bId: "colombia", bCode: "COL", ga: 1, gb: 3, kickoff: "2026-06-18T02:00:00Z", prov: "66457032", venueRaw: "Mexico City Stadium", venueId: "mexico-city-stadium" },
  { n: 25, group: "A", aId: "czechia", aCode: "CZE", bId: "south-africa", bCode: "RSA", ga: 1, gb: 1, kickoff: "2026-06-18T16:00:00Z", prov: "66456910", venueRaw: "Atlanta Stadium", venueId: "atlanta-stadium" },
  { n: 26, group: "B", aId: "switzerland", aCode: "SUI", bId: "bosnia-herzegovina", bCode: "BIH", ga: 4, gb: 1, kickoff: "2026-06-18T19:00:00Z", prov: "66456922", venueRaw: "Los Angeles Stadium", venueId: "los-angeles-stadium" },
  { n: 27, group: "B", aId: "canada", aCode: "CAN", bId: "qatar", bCode: "QAT", ga: 6, gb: 0, kickoff: "2026-06-18T22:00:00Z", prov: "66456920", venueRaw: "Vancouver Stadium", venueId: "vancouver-stadium" },
  { n: 28, group: "A", aId: "mexico", aCode: "MEX", bId: "south-korea", bCode: "KOR", ga: 1, gb: 0, kickoff: "2026-06-19T01:00:00Z", prov: "66456908", venueRaw: "Guadalajara Stadium", venueId: "guadalajara-stadium" },
  { n: 29, group: "C", aId: "brazil", aCode: "BRA", bId: "haiti", bCode: "HTI", ga: 3, gb: 0, kickoff: "2026-06-20T00:30:00Z", prov: "66456932", venueRaw: "Philadelphia Stadium", venueId: "philadelphia-stadium" },
  { n: 30, group: "C", aId: "scotland", aCode: "SCO", bId: "morocco", bCode: "MAR", ga: 0, gb: 1, kickoff: "2026-06-19T22:00:00Z", prov: "66456934", venueRaw: "Boston Stadium", venueId: "boston-stadium" },
  { n: 31, group: "D", aId: "turkiye", aCode: "TUR", bId: "paraguay", bCode: "PAR", ga: 0, gb: 1, kickoff: "2026-06-20T03:00:00Z", prov: "66456946", venueRaw: "San Francisco Bay Area Stadium", venueId: "san-francisco-bay-area-stadium" },
  { n: 32, group: "D", aId: "usa", aCode: "USA", bId: "australia", bCode: "AUS", ga: 2, gb: 0, kickoff: "2026-06-19T19:00:00Z", prov: "66456944", venueRaw: "Seattle Stadium", venueId: "seattle-stadium" },
  { n: 33, group: "E", aId: "germany", aCode: "GER", bId: "ivory-coast", bCode: "CIV", ga: 2, gb: 1, kickoff: "2026-06-20T20:00:00Z", prov: "66457074", venueRaw: "Toronto Stadium", venueId: "toronto-stadium" },
  { n: 34, group: "E", aId: "ecuador", aCode: "ECU", bId: "curacao", bCode: "CUW", ga: 0, gb: 0, kickoff: "2026-06-21T00:00:00Z", prov: "66457076", venueRaw: "Kansas City Stadium", venueId: "kansas-city-stadium" },
  { n: 35, group: "F", aId: "netherlands", aCode: "NED", bId: "sweden", bCode: "SWE", ga: 5, gb: 1, kickoff: "2026-06-20T17:00:00Z", prov: "66456972", venueRaw: "Houston Stadium", venueId: "houston-stadium" },
  { n: 36, group: "F", aId: "tunisia", aCode: "TUN", bId: "japan", bCode: "JPN", ga: 0, gb: 4, kickoff: "2026-06-21T04:00:00Z", prov: "66456974", venueRaw: "Monterrey Stadium", venueId: "monterrey-stadium" },
  { n: 37, group: "H", aId: "uruguay", aCode: "URU", bId: "cape-verde", bCode: "CPV", ga: 2, gb: 2, kickoff: "2026-06-21T22:00:00Z", prov: "66457000", venueRaw: "Miami Stadium", venueId: "miami-stadium" },
  { n: 38, group: "H", aId: "spain", aCode: "ESP", bId: "saudi-arabia", bCode: "KSA", ga: 4, gb: 0, kickoff: "2026-06-21T16:00:00Z", prov: "66456998", venueRaw: "Atlanta Stadium", venueId: "atlanta-stadium" },
  { n: 39, group: "G", aId: "belgium", aCode: "BEL", bId: "iran", bCode: "IRI", ga: 0, gb: 0, kickoff: "2026-06-21T19:00:00Z", prov: "66456986", venueRaw: "Los Angeles Stadium", venueId: "los-angeles-stadium" },
  { n: 40, group: "G", aId: "new-zealand", aCode: "NZL", bId: "egypt", bCode: "EGY", ga: 1, gb: 3, kickoff: "2026-06-22T01:00:00Z", prov: "66456988", venueRaw: "Vancouver Stadium", venueId: "vancouver-stadium" },
  { n: 41, group: "I", aId: "norway", aCode: "NOR", bId: "senegal", bCode: "SEN", ga: 3, gb: 2, kickoff: "2026-06-23T00:00:00Z", prov: "66457012", venueRaw: "New York/New Jersey Stadium", venueId: "new-york-new-jersey-stadium" },
  { n: 42, group: "I", aId: "france", aCode: "FRA", bId: "iraq", bCode: "IRQ", ga: 3, gb: 0, kickoff: "2026-06-22T21:00:00Z", prov: "66457010", venueRaw: "Philadelphia Stadium", venueId: "philadelphia-stadium", notes: "Weather delay reported; match completed." },
  { n: 43, group: "J", aId: "argentina", aCode: "ARG", bId: "austria", bCode: "AUT", ga: 2, gb: 0, kickoff: "2026-06-22T17:00:00Z", prov: "66457022", venueRaw: "Dallas Stadium", venueId: "dallas-stadium" },
  { n: 44, group: "J", aId: "jordan", aCode: "JOR", bId: "algeria", bCode: "DZA", ga: 1, gb: 2, kickoff: "2026-06-23T03:00:00Z", prov: "66457024", venueRaw: "San Francisco Bay Area Stadium", venueId: "san-francisco-bay-area-stadium" },
  { n: 45, group: "L", aId: "england", aCode: "ENG", bId: "ghana", bCode: "GHA", ga: 0, gb: 0, kickoff: "2026-06-23T20:00:00Z", prov: "66457046", venueRaw: "Boston Stadium", venueId: "boston-stadium" },
  { n: 46, group: "L", aId: "panama", aCode: "PAN", bId: "croatia", bCode: "CRO", ga: 0, gb: 1, kickoff: "2026-06-23T23:00:00Z", prov: "66457048", venueRaw: "Toronto Stadium", venueId: "toronto-stadium" },
  { n: 47, group: "K", aId: "portugal", aCode: "POR", bId: "uzbekistan", bCode: "UZB", ga: 5, gb: 0, kickoff: "2026-06-23T17:00:00Z", prov: "66457034", venueRaw: "Houston Stadium", venueId: "houston-stadium" },
  { n: 48, group: "K", aId: "colombia", aCode: "COL", bId: "congo-dr", bCode: "COD", ga: 1, gb: 0, kickoff: "2026-06-24T02:00:00Z", prov: "66457036", venueRaw: "Guadalajara Stadium", venueId: "guadalajara-stadium" },
];

/**
 * The validatable manual snapshot. Rows carry ONLY allowed contract keys (no
 * winner/penalties for group stage; no venueId, since the provider venue id is not
 * the app venue id - kept in provenance instead).
 */
export const currentResultsSnapshot: RawLiveSnapshot = {
  sourceVersion: "current-2026-06-24",
  source: {
    sourceId: "wc2026-current-2026-06-24",
    sourceType: "manual",
    sourceName:
      "FIFA official fixtures/results + FIFA FWC26 match schedule PDF + structured live snapshot",
    sourceUrl:
      "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures",
    lastUpdatedAt: "2026-06-24T14:33:36Z",
    reliability: "high",
  },
  asOf: "2026-06-24T14:09:06Z",
  matches: ROWS.map(
    (r): RawLiveMatch => ({
      matchId: `M${r.n}`,
      stage: "group",
      group: r.group,
      teamA: r.aId,
      teamB: r.bId,
      status: "complete",
      goalsA: r.ga,
      goalsB: r.gb,
      kickoff: r.kickoff,
      lastUpdatedAt: ROW_LAST_UPDATED,
    }),
  ),
};

/** Per-match provider provenance (NOT used for matching; external identifiers only). */
export interface CurrentResultsProvenanceRow {
  matchNumber: number;
  /** Provider structured-feed match id (NOT the official fixture key). */
  providerMatchId: string;
  venueRaw: string;
  providerVenueId: string;
  teamACode: string;
  teamBCode: string;
  notes: string;
}

export interface CurrentResultsProvenance {
  asOf: string;
  retrievedAt: string;
  sourceName: string;
  sourceUrl: string;
  matches: CurrentResultsProvenanceRow[];
}

export const currentResultsProvenance: CurrentResultsProvenance = {
  asOf: "2026-06-24T14:09:06Z",
  retrievedAt: "2026-06-24T14:33:36Z",
  sourceName:
    "FIFA official fixtures/results + FIFA FWC26 match schedule PDF + structured live snapshot",
  sourceUrl:
    "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures; https://digitalhub.fifa.com/m/1be9ce37eb98fcc5/original/FWC26-Match-Schedule_English.pdf",
  matches: ROWS.map((r) => ({
    matchNumber: r.n,
    providerMatchId: r.prov,
    venueRaw: r.venueRaw,
    providerVenueId: r.venueId,
    teamACode: r.aCode,
    teamBCode: r.bCode,
    notes: r.notes ?? "",
  })),
};
