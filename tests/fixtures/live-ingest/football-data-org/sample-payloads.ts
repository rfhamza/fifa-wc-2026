/**
 * Phase 1.28A - MINIMIZED / SANITIZED football-data.org test fixtures.
 * -------------------------------------------------------------------
 * Hand-authored, minimal representations of football-data.org v4 shapes - NOT the
 * raw API payloads. Crest/logo URLs, odds, referees, bookings, substitutions, and
 * event arrays are intentionally omitted. Real official team pairings are used so
 * canonical `M{n}` resolution works. The penalty fixture is SYNTHETIC/doc-shaped
 * (no live 2026 shootout has occurred yet).
 */
import type { FdMatchesResponse, FdStandingsResponse } from "@/lib/live-ingest/football-data-org/types";

const WC = { id: 2000, name: "FIFA World Cup", code: "WC", type: "CUP" } as const;
const UPDATED = "2026-06-24T14:09:06Z";

/** 1) Finished group-stage win: Mexico 2-0 South Africa (GROUP_A) -> official M1. */
export const finishedGroupWin: FdMatchesResponse = {
  competition: { ...WC },
  matches: [
    {
      id: 1001,
      utcDate: "2026-06-11T19:00:00Z",
      status: "FINISHED",
      matchday: 1,
      stage: "GROUP_STAGE",
      group: "GROUP_A",
      lastUpdated: UPDATED,
      homeTeam: { id: 769, name: "Mexico", shortName: "Mexico", tla: "MEX" },
      awayTeam: { id: 774, name: "South Africa", shortName: "South Africa", tla: "RSA" },
      score: { winner: "HOME_TEAM", duration: "REGULAR", fullTime: { home: 2, away: 0 }, halfTime: { home: 1, away: 0 } },
    },
  ],
};

/** 2) Finished group-stage draw: Canada 1-1 Bosnia-Herzegovina (GROUP_B) -> official M3. */
export const finishedGroupDraw: FdMatchesResponse = {
  competition: { ...WC },
  matches: [
    {
      id: 1003,
      utcDate: "2026-06-12T19:00:00Z",
      status: "FINISHED",
      matchday: 1,
      stage: "GROUP_STAGE",
      group: "GROUP_B",
      lastUpdated: UPDATED,
      homeTeam: { id: 828, name: "Canada", shortName: "Canada", tla: "CAN" },
      awayTeam: { id: 1060, name: "Bosnia-Herzegovina", shortName: "Bosnia-H.", tla: "BIH" },
      score: { winner: "DRAW", duration: "REGULAR", fullTime: { home: 1, away: 1 }, halfTime: { home: 0, away: 1 } },
    },
  ],
};

/** 3) Scheduled/future match (TIMED, no scores): USA v Australia (GROUP_D) -> official M32. */
export const scheduledMatch: FdMatchesResponse = {
  competition: { ...WC },
  matches: [
    {
      id: 1032,
      utcDate: "2026-06-19T19:00:00Z",
      status: "TIMED",
      matchday: 2,
      stage: "GROUP_STAGE",
      group: "GROUP_D",
      lastUpdated: UPDATED,
      homeTeam: { id: 771, name: "United States", shortName: "USA", tla: "USA" },
      awayTeam: { id: 779, name: "Australia", shortName: "Australia", tla: "AUS" },
      score: { winner: null, duration: "REGULAR", fullTime: { home: null, away: null }, halfTime: { home: null, away: null } },
    },
  ],
};

/** 4) Future unresolved knockout shell (TIMED, null teams) -> excluded from live results. */
export const unresolvedKnockout: FdMatchesResponse = {
  competition: { ...WC },
  matches: [
    {
      id: 9001,
      utcDate: "2026-06-28T19:00:00Z",
      status: "TIMED",
      stage: "LAST_32",
      group: null,
      lastUpdated: UPDATED,
      homeTeam: { id: null, name: null, shortName: null, tla: null },
      awayTeam: { id: null, name: null, shortName: null, tla: null },
      score: { winner: null, duration: "REGULAR", fullTime: { home: null, away: null } },
    },
  ],
};

/**
 * 5) SYNTHETIC / doc-shaped knockout decided on penalties (Germany beat Brazil on pens).
 * No live 2026 shootout exists yet; this fixture proves optional regularTime/extraTime/
 * penalties are handled. Paired with knockoutMatchIdMap { "9100": 89 } -> official M89.
 */
export const syntheticPenaltyKnockout: FdMatchesResponse = {
  competition: { ...WC },
  matches: [
    {
      id: 9100,
      utcDate: "2026-07-05T19:00:00Z",
      status: "FINISHED",
      stage: "LAST_16",
      group: null,
      lastUpdated: UPDATED,
      homeTeam: { id: 759, name: "Germany", shortName: "Germany", tla: "GER" },
      awayTeam: { id: 764, name: "Brazil", shortName: "Brazil", tla: "BRA" },
      score: {
        winner: "HOME_TEAM",
        duration: "PENALTY_SHOOTOUT",
        fullTime: { home: 1, away: 1 },
        halfTime: { home: 0, away: 1 },
        regularTime: { home: 1, away: 1 },
        extraTime: { home: 0, away: 0 },
        penalties: { home: 4, away: 2 },
      },
    },
  ],
};
export const SYNTHETIC_PENALTY_KO_MAP: Record<string, number> = { "9100": 89 };

/** Combined small group-stage sample (win + draw + scheduled) for snapshot tests. */
export const groupStageSample: FdMatchesResponse = {
  competition: { ...WC },
  matches: [
    finishedGroupWin.matches[0]!,
    finishedGroupDraw.matches[0]!,
    scheduledMatch.matches[0]!,
  ],
};

/** 6) Minimal standings comparison fixture (overall TOTAL table; 3 rows only). */
export const standingsComparison: FdStandingsResponse = {
  competition: { ...WC },
  standings: [
    {
      stage: "GROUP_STAGE",
      type: "TOTAL",
      group: null,
      table: [
        { position: 1, team: { id: 788, name: "Switzerland", shortName: "Switzerland", tla: "SUI" }, playedGames: 3, won: 2, draw: 1, lost: 0, points: 7, goalsFor: 7, goalsAgainst: 3, goalDifference: 4 },
        { position: 2, team: { id: 759, name: "Germany", shortName: "Germany", tla: "GER" }, playedGames: 2, won: 2, draw: 0, lost: 0, points: 6, goalsFor: 9, goalsAgainst: 2, goalDifference: 7 },
        { position: 3, team: { id: 771, name: "United States", shortName: "USA", tla: "USA" }, playedGames: 2, won: 2, draw: 0, lost: 0, points: 6, goalsFor: 6, goalsAgainst: 1, goalDifference: 5 },
      ],
    },
  ],
};
