/**
 * Phase 1.26B - MOCK provider payload (illustrative, NOT a real provider/feed).
 * ---------------------------------------------------------------------------
 * Hand-authored payload in an illustrative provider-native schema, used only to
 * exercise the normalizer. There is NO network, NO real provider, NO secrets. The
 * provider-native ids/codes/venue names are deliberately different from the app's
 * canonical ids so the tests prove name-based mapping + provenance-only ids.
 *
 * Group A is complete (4 matches) so standings/qualification derive; a few matches
 * across other groups exercise team aliases (Turkey, DR Congo, United States,
 * Bosnia and Herzegovina); two knockout matches exercise winner/penalty + a
 * scheduled (no-score) row. Provider standings/bracket are present to prove they
 * stay comparison-only.
 */
import type { ProviderPayload } from "@/lib/live-ingest/types";

export const mockProviderPayload: ProviderPayload = {
  meta: {
    sourceId: "mock-provider",
    sourceName: "Illustrative mock provider (no real network)",
    sourceType: "external",
    sourceUrl: "https://example.invalid/mock-feed",
    retrievedAt: "2026-06-24T14:33:36Z",
    asOf: "2026-06-24T14:09:06Z",
    reliability: "medium",
  },
  matches: [
    // --- Group A (complete) ---
    { providerId: "evt_1001", matchNumber: 1, round: "Group Stage", group: "Group A", homeName: "Mexico", awayName: "South Africa", homeCode: "MEX", awayCode: "RSA", state: "finished", homeGoals: 2, awayGoals: 0, kickoffUtc: "2026-06-11T19:00:00Z", venueName: "Mexico City Stadium" },
    { providerId: "evt_1002", matchNumber: 2, round: "Group Stage", group: "Group A", homeName: "South Korea", awayName: "Czechia", homeCode: "KOR", awayCode: "CZE", state: "finished", homeGoals: 2, awayGoals: 1, kickoffUtc: "2026-06-12T02:00:00Z", venueName: "Guadalajara Stadium" },
    { providerId: "evt_1025", matchNumber: 25, round: "Group Stage", group: "Group A", homeName: "Czechia", awayName: "South Africa", homeCode: "CZE", awayCode: "RSA", state: "finished", homeGoals: 1, awayGoals: 1, kickoffUtc: "2026-06-18T16:00:00Z", venueName: "Atlanta Stadium" },
    { providerId: "evt_1028", matchNumber: 28, round: "Group Stage", group: "Group A", homeName: "Mexico", awayName: "South Korea", homeCode: "MEX", awayCode: "KOR", state: "finished", homeGoals: 1, awayGoals: 0, kickoffUtc: "2026-06-19T01:00:00Z", venueName: "Guadalajara Stadium" },

    // --- Alias-exercising completed matches (other groups; partial) ---
    { providerId: "evt_1003", matchNumber: 3, round: "Group Stage", group: "Group B", homeName: "Canada", awayName: "Bosnia and Herzegovina", homeCode: "CAN", awayCode: "BIH", state: "finished", homeGoals: 1, awayGoals: 1, kickoffUtc: "2026-06-12T19:00:00Z", venueName: "Toronto Stadium" },
    { providerId: "evt_1004", matchNumber: 4, round: "Group Stage", group: "Group D", homeName: "United States", awayName: "Paraguay", homeCode: "USA", awayCode: "PAR", state: "finished", homeGoals: 4, awayGoals: 1, kickoffUtc: "2026-06-13T01:00:00Z", venueName: "Los Angeles Stadium" },
    { providerId: "evt_1006", matchNumber: 6, round: "Group Stage", group: "Group D", homeName: "Australia", awayName: "Turkey", homeCode: "AUS", awayCode: "TUR", state: "finished", homeGoals: 2, awayGoals: 0, kickoffUtc: "2026-06-14T04:00:00Z", venueName: "Vancouver Stadium" },
    { providerId: "evt_1048", matchNumber: 48, round: "Group Stage", group: "Group K", homeName: "Colombia", awayName: "DR Congo", homeCode: "COL", awayCode: "COD", state: "finished", homeGoals: 1, awayGoals: 0, kickoffUtc: "2026-06-24T02:00:00Z", venueName: "Guadalajara Stadium" },

    // --- In-progress (live -> in-progress) ---
    { providerId: "evt_1005", matchNumber: 5, round: "Group Stage", group: "Group C", homeName: "Haiti", awayName: "Scotland", homeCode: "HTI", awayCode: "SCO", state: "live", homeGoals: 0, awayGoals: 1, kickoffUtc: "2026-06-14T01:00:00Z", venueName: "Boston Stadium" },

    // --- Knockout: completed with penalties (winner via shootout) ---
    { providerId: "evt_1074", matchNumber: 74, round: "Round of 32", homeName: "Germany", awayName: "Brazil", homeCode: "GER", awayCode: "BRA", state: "finished", homeGoals: 1, awayGoals: 1, winnerName: "Germany", shootout: { home: 4, away: 2 }, kickoffUtc: "2026-06-29T19:00:00Z", venueName: "Dallas Stadium" },

    // --- Knockout: scheduled (must carry NO scores) ---
    { providerId: "evt_1073", matchNumber: 73, round: "Round of 32", homeName: "Spain", awayName: "Uruguay", homeCode: "ESP", awayCode: "URU", state: "scheduled", homeGoals: null, awayGoals: null, kickoffUtc: "2026-06-29T16:00:00Z", venueName: "Atlanta Stadium" },
  ],
  // Provider-supplied standings - COMPARISON ONLY (never ingested).
  standings: [
    { group: "Group A", position: 1, teamName: "Mexico", played: 2, points: 6 },
    { group: "Group A", position: 2, teamName: "South Korea", played: 2, points: 3 },
    { group: "Group A", position: 3, teamName: "Czechia", played: 2, points: 1 },
    { group: "Group A", position: 4, teamName: "South Africa", played: 2, points: 1 },
  ],
  // Provider-supplied bracket - COMPARISON ONLY (never ingested).
  bracket: [
    { round: "Round of 32", matchNumber: 74, homeName: "Germany", awayName: "Brazil", winnerName: "Germany" },
  ],
};

/** A payload containing one unmappable team, to prove fail-closed normalization. */
export const mockProviderPayloadUnknownTeam: ProviderPayload = {
  meta: {
    sourceId: "mock-provider",
    sourceName: "Illustrative mock provider (no real network)",
    sourceType: "external",
    retrievedAt: "2026-06-24T14:33:36Z",
    asOf: "2026-06-24T14:09:06Z",
  },
  matches: [
    { providerId: "evt_9001", matchNumber: 1, round: "Group Stage", group: "Group A", homeName: "Atlantis", awayName: "South Africa", state: "finished", homeGoals: 1, awayGoals: 0, kickoffUtc: "2026-06-11T19:00:00Z" },
  ],
};
