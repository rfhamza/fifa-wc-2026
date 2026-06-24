/**
 * Phase 1.25B - hand-authored sample fixtures for live-state tests.
 *
 * Synthetic/minimal ONLY: a tiny 4-team Group A + one knockout match. No real
 * results, no API-derived data, no generated artifacts, no metric numbers.
 */
import type {
  LiveIngestionSource,
  LiveStateReference,
  RawLiveSnapshot,
} from "@/lib/live-state/types";

/** Synthetic source descriptor (manual snapshot). */
export const SAMPLE_SOURCE: LiveIngestionSource = {
  sourceId: "sample-manual",
  sourceType: "manual",
  sourceName: "Sample manual snapshot",
  lastUpdatedAt: "2026-06-20T12:00:00Z",
  reliability: "high",
};

/** Tiny synthetic reference: Group A (a1..a4), M1..M6, plus knockout M73. */
export const SAMPLE_REFERENCE: LiveStateReference = {
  groups: [{ id: "A", teamIds: ["a1", "a2", "a3", "a4"] }],
  validTeamIds: ["a1", "a2", "a3", "a4"],
  groupMatches: [
    { matchId: "M1", matchNumber: 1, group: "A", homeTeamId: "a1", awayTeamId: "a2" },
    { matchId: "M2", matchNumber: 2, group: "A", homeTeamId: "a3", awayTeamId: "a4" },
    { matchId: "M3", matchNumber: 3, group: "A", homeTeamId: "a1", awayTeamId: "a3" },
    { matchId: "M4", matchNumber: 4, group: "A", homeTeamId: "a2", awayTeamId: "a4" },
    { matchId: "M5", matchNumber: 5, group: "A", homeTeamId: "a1", awayTeamId: "a4" },
    { matchId: "M6", matchNumber: 6, group: "A", homeTeamId: "a2", awayTeamId: "a3" },
  ],
  knockoutMatches: [{ matchId: "M73", matchNumber: 73, stage: "roundOf32" }],
  teamMeta: [
    { teamId: "a1", fifaRanking: 1, conductScore: 0 },
    { teamId: "a2", fifaRanking: 2, conductScore: 0 },
    { teamId: "a3", fifaRanking: 3, conductScore: 0 },
    { teamId: "a4", fifaRanking: 4, conductScore: 0 },
  ],
};

const FRESH = "2026-06-20T11:30:00Z";

/** Valid partial group state: two complete, one still scheduled. */
export const validPartialGroupSnapshot: RawLiveSnapshot = {
  sourceVersion: "sample-v1",
  source: SAMPLE_SOURCE,
  asOf: "2026-06-20T12:00:00Z",
  matches: [
    { matchId: "M1", stage: "group", group: "A", teamA: "a1", teamB: "a2", status: "complete", goalsA: 3, goalsB: 0, lastUpdatedAt: FRESH },
    { matchId: "M2", stage: "group", group: "A", teamA: "a3", teamB: "a4", status: "complete", goalsA: 1, goalsB: 1, lastUpdatedAt: FRESH },
    { matchId: "M3", stage: "group", group: "A", teamA: "a1", teamB: "a3", status: "scheduled", lastUpdatedAt: FRESH },
  ],
};

/** A fully-complete Group A so qualification states are derivable. */
export const completeGroupSnapshot: RawLiveSnapshot = {
  sourceVersion: "sample-v1",
  source: SAMPLE_SOURCE,
  asOf: "2026-06-20T12:00:00Z",
  matches: [
    { matchId: "M1", stage: "group", group: "A", teamA: "a1", teamB: "a2", status: "complete", goalsA: 1, goalsB: 0, lastUpdatedAt: FRESH },
    { matchId: "M2", stage: "group", group: "A", teamA: "a3", teamB: "a4", status: "complete", goalsA: 1, goalsB: 0, lastUpdatedAt: FRESH },
    { matchId: "M3", stage: "group", group: "A", teamA: "a1", teamB: "a3", status: "complete", goalsA: 1, goalsB: 0, lastUpdatedAt: FRESH },
    { matchId: "M4", stage: "group", group: "A", teamA: "a2", teamB: "a4", status: "complete", goalsA: 1, goalsB: 0, lastUpdatedAt: FRESH },
    { matchId: "M5", stage: "group", group: "A", teamA: "a1", teamB: "a4", status: "complete", goalsA: 1, goalsB: 0, lastUpdatedAt: FRESH },
    { matchId: "M6", stage: "group", group: "A", teamA: "a2", teamB: "a3", status: "complete", goalsA: 1, goalsB: 0, lastUpdatedAt: FRESH },
  ],
};

/** Invalid: duplicate match id. */
export const duplicateMatchIdSnapshot: RawLiveSnapshot = {
  source: SAMPLE_SOURCE,
  matches: [
    { matchId: "M1", stage: "group", group: "A", teamA: "a1", teamB: "a2", status: "complete", goalsA: 1, goalsB: 0, lastUpdatedAt: FRESH },
    { matchId: "M1", stage: "group", group: "A", teamA: "a1", teamB: "a2", status: "complete", goalsA: 2, goalsB: 0, lastUpdatedAt: FRESH },
  ],
};

/** Invalid: unknown team id. */
export const invalidTeamIdSnapshot: RawLiveSnapshot = {
  source: SAMPLE_SOURCE,
  matches: [
    { matchId: "M1", stage: "group", group: "A", teamA: "nonexistent", teamB: "a2", status: "complete", goalsA: 1, goalsB: 0, lastUpdatedAt: FRESH },
  ],
};

/** Invalid: unknown match id. */
export const unknownMatchIdSnapshot: RawLiveSnapshot = {
  source: SAMPLE_SOURCE,
  matches: [
    { matchId: "M999", stage: "group", group: "A", teamA: "a1", teamB: "a2", status: "complete", goalsA: 1, goalsB: 0, lastUpdatedAt: FRESH },
  ],
};

/** Invalid: negative/impossible score. */
export const negativeScoreSnapshot: RawLiveSnapshot = {
  source: SAMPLE_SOURCE,
  matches: [
    { matchId: "M1", stage: "group", group: "A", teamA: "a1", teamB: "a2", status: "complete", goalsA: -1, goalsB: 0, lastUpdatedAt: FRESH },
  ],
};

/** Invalid: completed match missing a score. */
export const completeMissingScoreSnapshot: RawLiveSnapshot = {
  source: SAMPLE_SOURCE,
  matches: [
    { matchId: "M1", stage: "group", group: "A", teamA: "a1", teamB: "a2", status: "complete", lastUpdatedAt: FRESH },
  ],
};

/** Invalid: scheduled match already carrying a score. */
export const scheduledWithScoreSnapshot: RawLiveSnapshot = {
  source: SAMPLE_SOURCE,
  matches: [
    { matchId: "M1", stage: "group", group: "A", teamA: "a1", teamB: "a2", status: "scheduled", goalsA: 1, goalsB: 0, lastUpdatedAt: FRESH },
  ],
};

/** Invalid: an in-play field smuggled in (must be rejected). Cast to bypass TS. */
export const inPlayFieldSnapshot = {
  source: SAMPLE_SOURCE,
  matches: [
    { matchId: "M1", stage: "group", group: "A", teamA: "a1", teamB: "a2", status: "complete", goalsA: 1, goalsB: 0, lastUpdatedAt: FRESH, xg: 1.7 },
  ],
} as unknown as RawLiveSnapshot;

/** Valid knockout result (clear winner by goals). */
export const validKnockoutSnapshot: RawLiveSnapshot = {
  source: SAMPLE_SOURCE,
  matches: [
    { matchId: "M73", stage: "roundOf32", teamA: "a1", teamB: "a2", status: "complete", goalsA: 2, goalsB: 1, winner: "a1", lastUpdatedAt: FRESH },
  ],
};

/** Valid knockout decided on penalties after a goals draw. */
export const penaltyKnockoutSnapshot: RawLiveSnapshot = {
  source: SAMPLE_SOURCE,
  matches: [
    { matchId: "M73", stage: "roundOf32", teamA: "a1", teamB: "a2", status: "complete", goalsA: 1, goalsB: 1, penalties: { a: 4, b: 2 }, lastUpdatedAt: FRESH },
  ],
};

/** Invalid: knockout winner is not a participant. */
export const winnerNotParticipantSnapshot: RawLiveSnapshot = {
  source: SAMPLE_SOURCE,
  matches: [
    { matchId: "M73", stage: "roundOf32", teamA: "a1", teamB: "a2", status: "complete", goalsA: 2, goalsB: 1, winner: "a3", lastUpdatedAt: FRESH },
  ],
};

/** Invalid: completed knockout drawn on goals with no winner/penalties. */
export const drawNeedsWinnerSnapshot: RawLiveSnapshot = {
  source: SAMPLE_SOURCE,
  matches: [
    { matchId: "M73", stage: "roundOf32", teamA: "a1", teamB: "a2", status: "complete", goalsA: 1, goalsB: 1, lastUpdatedAt: FRESH },
  ],
};

/** A stale snapshot: match updated long before `asOf`. */
export const staleSnapshot: RawLiveSnapshot = {
  source: { ...SAMPLE_SOURCE, lastUpdatedAt: "2026-06-10T00:00:00Z" },
  asOf: "2026-06-20T12:00:00Z",
  matches: [
    { matchId: "M1", stage: "group", group: "A", teamA: "a1", teamB: "a2", status: "complete", goalsA: 1, goalsB: 0, lastUpdatedAt: "2026-06-10T00:00:00Z" },
  ],
};

/** An empty snapshot (no matches) → matches section is `missing`. */
export const emptySnapshot: RawLiveSnapshot = {
  source: SAMPLE_SOURCE,
  asOf: "2026-06-20T12:00:00Z",
  matches: [],
};
