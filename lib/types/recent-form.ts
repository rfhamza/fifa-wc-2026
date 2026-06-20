/**
 * Phase 1.16B - recent-form types (standalone, UNWIRED).
 * -----------------------------------------------------
 * Types for the source-backed recent-results snapshot and the pure RAW recent-form
 * candidate score. This layer is intentionally NOT wired into the prediction model:
 * the active `recentForm` placeholder family is untouched, and nothing here is read
 * by lib/model/*. A small standalone type module (no imports), re-exported from
 * lib/types/index.ts.
 *
 * Honesty: the raw match results are `source-backed` (CC0 international-results
 * dataset, via a user-supplied pre-derived CSV); the DERIVED recent-form score is a
 * documented `candidate` heuristic that OVERLAPS Elo/FIFA. The opponent-adjusted Elo
 * residual is DEFERRED (no opponent Elo at match time yet) - so nothing here is named
 * "residual".
 */

/** Provenance status for the recent-form snapshot / rows. */
export type RecentFormStatus = "source-backed" | "candidate" | "unresolved";

/** Provenance for the recent-form snapshot. */
export interface RecentFormSource {
  label: string;
  sourceName: string;
  /** Upstream raw dataset URL (GitHub `master`; mutable - checksum is the anchor). */
  sourceUrl?: string;
  /** User-supplied pre-derived CSV filename (NOT committed). */
  sourceFile?: string;
  /** SHA-256 of the supplied CSV - the reproducibility anchor for this phase. */
  sourceChecksumSha256?: string;
  retrievedAt?: string;
  /** Leakage cutoff: only matches strictly before this instant are included. */
  cutoff: string;
  status: RecentFormStatus;
  notes?: string;
}

export type MatchResult = "W" | "D" | "L";
export type VenuePerspective = "Home" | "Away" | "Neutral";

/** One completed pre-cutoff international match, from the WC team's perspective. */
export interface RecentMatch {
  /** 1..10, latest-first. */
  rank: number;
  /** Match date, ISO `YYYY-MM-DD` (strictly before the cutoff). */
  date: string;
  /** Opponent display name (dataset naming). */
  opponentName: string;
  /** Resolved only when the opponent is itself a World Cup team. */
  opponentId?: string;
  venue: VenuePerspective;
  goalsFor: number;
  goalsAgainst: number;
  result: MatchResult;
  competition: string;
  competitionCategory: string;
  neutral: boolean;
  /** Raw home/away orientation (dataset naming) - kept for auditability. */
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  /** Upstream source URL + line for this match row (provenance). */
  sourceUrl: string;
  sourceCsvLine: number;
}

/** One team's last-10 recent-form row: derived aggregates + the match rows. */
export interface RecentFormRow {
  teamId: string;
  /** CSV "Team" display value. */
  sourceTeamName: string;
  /** CSV "Team dataset name" (alias used by the upstream results, e.g. "Czech Republic"). */
  sourceDatasetName: string;
  cutoffDate: string;
  matchesConsidered5: number;
  matchesConsidered10: number;
  last5PointsPerMatch: number;
  last10PointsPerMatch: number;
  last5GoalDiffPerMatch: number;
  last10GoalDiffPerMatch: number;
  last5GoalsForPerMatch: number;
  last5GoalsAgainstPerMatch: number;
  last10GoalsForPerMatch: number;
  last10GoalsAgainstPerMatch: number;
  /** 10 matches, latest-first (rank 1..10). */
  recentMatches: RecentMatch[];
  dataStatus: RecentFormStatus;
  sourceRef: string;
  notes?: string;
}

export interface RecentFormValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Pure RAW recent-form candidate score (signed -1..+1). NOT a residual: it is a
 * documented raw-form heuristic that overlaps Elo/FIFA, for audit only, never wired.
 */
export interface RecentFormScore {
  teamId: string;
  /** -1..+1 from last-5 points-per-match. */
  last5: number;
  /** -1..+1 from last-10 points-per-match. */
  last10: number;
  /** -1..+1 blended composite (named weights). */
  composite: number;
}
