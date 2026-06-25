/**
 * Phase 1.28I - 54-match WC 2026 current-results snapshot (manual fixture, test-only).
 * ----------------------------------------------------------------------------------
 * Extends the existing 48-row fixture (`currentResultsSnapshot`, M1-M48) with the SIX
 * additional completed group matches (M49-M54) that the user-supplied refreshed CSV
 * reported through "Match 54, South Africa 1-0 South Korea". This completes Groups
 * A, B, C while D-L stay incomplete. Hand-authored, minimized, app-id-resolved at
 * authoring time - this is NOT the committed full CSV and carries no provider payload.
 *
 * Snapshot facts: structured snapshot as-of 2026-06-25T12:33:09Z. Group-stage rows
 * carry no winner/penalties. M1-M48 are reused verbatim from the prior fixture.
 */
import type { RawLiveMatch, RawLiveSnapshot } from "@/lib/live-state/types";
import { currentResultsSnapshot } from "./current-results-snapshot";

const SNAPSHOT_ASOF = "2026-06-25T12:33:09Z";

/** The six newly-completed matches (M49-M54), hand-authored from the refreshed CSV. */
const NEW_ROWS: RawLiveMatch[] = [
  { matchId: "M49", stage: "group", group: "C", teamA: "scotland", teamB: "brazil", status: "complete", goalsA: 0, goalsB: 3, kickoff: "2026-06-24T22:00:00Z", lastUpdatedAt: SNAPSHOT_ASOF },
  { matchId: "M50", stage: "group", group: "C", teamA: "morocco", teamB: "haiti", status: "complete", goalsA: 4, goalsB: 2, kickoff: "2026-06-24T22:00:00Z", lastUpdatedAt: SNAPSHOT_ASOF },
  { matchId: "M51", stage: "group", group: "B", teamA: "switzerland", teamB: "canada", status: "complete", goalsA: 2, goalsB: 1, kickoff: "2026-06-24T19:00:00Z", lastUpdatedAt: SNAPSHOT_ASOF },
  { matchId: "M52", stage: "group", group: "B", teamA: "bosnia-herzegovina", teamB: "qatar", status: "complete", goalsA: 3, goalsB: 1, kickoff: "2026-06-24T19:00:00Z", lastUpdatedAt: SNAPSHOT_ASOF },
  { matchId: "M53", stage: "group", group: "A", teamA: "czechia", teamB: "mexico", status: "complete", goalsA: 0, goalsB: 3, kickoff: "2026-06-25T01:00:00Z", lastUpdatedAt: SNAPSHOT_ASOF },
  { matchId: "M54", stage: "group", group: "A", teamA: "south-africa", teamB: "south-korea", status: "complete", goalsA: 1, goalsB: 0, kickoff: "2026-06-25T01:00:00Z", lastUpdatedAt: SNAPSHOT_ASOF },
];

/** The 54-match snapshot: prior M1-M48 (reused) + M49-M54. */
export const currentResults54Snapshot: RawLiveSnapshot = {
  sourceVersion: "current-2026-06-25",
  source: {
    sourceId: "wc2026-current-2026-06-25",
    sourceType: "manual",
    sourceName:
      "FIFA official fixtures/results + FIFA FWC26 match schedule PDF + structured live snapshot",
    sourceUrl:
      "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures",
    lastUpdatedAt: SNAPSHOT_ASOF,
    reliability: "high",
  },
  asOf: SNAPSHOT_ASOF,
  matches: [...currentResultsSnapshot.matches, ...NEW_ROWS],
};
