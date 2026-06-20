/**
 * Phase 1.16B - recent-form aggregation (pure, deterministic).
 * -----------------------------------------------------------
 * Recomputes points/goal aggregates from a team's ordered (latest-first) match
 * rows. Used by both the snapshot generator and the validator (so stored
 * aggregates can be re-derived and checked). Not wired into the prediction model.
 */
import type { MatchResult, RecentMatch } from "@/lib/types";

/** Football points for a result (W=3, D=1, L=0). */
export function pointsForResult(result: MatchResult): number {
  return result === "W" ? 3 : result === "D" ? 1 : 0;
}

/** Aggregates over the most recent `n` matches (matches are latest-first). */
export interface RecentFormAggregate {
  count: number;
  pointsPerMatch: number;
  goalDiffPerMatch: number;
  goalsForPerMatch: number;
  goalsAgainstPerMatch: number;
}

/**
 * Aggregate the first `n` of `matches` (assumed latest-first). Returns zeros for an
 * empty window. Pure; performs no rounding (callers round for storage/compare).
 */
export function aggregateRecentForm(
  matches: RecentMatch[],
  n: number,
): RecentFormAggregate {
  const window = matches.slice(0, n);
  const count = window.length;
  if (count === 0) {
    return {
      count: 0,
      pointsPerMatch: 0,
      goalDiffPerMatch: 0,
      goalsForPerMatch: 0,
      goalsAgainstPerMatch: 0,
    };
  }
  let pts = 0;
  let gf = 0;
  let ga = 0;
  for (const m of window) {
    pts += pointsForResult(m.result);
    gf += m.goalsFor;
    ga += m.goalsAgainst;
  }
  return {
    count,
    pointsPerMatch: pts / count,
    goalDiffPerMatch: (gf - ga) / count,
    goalsForPerMatch: gf / count,
    goalsAgainstPerMatch: ga / count,
  };
}

/** The result a (goalsFor, goalsAgainst) pair implies (for consistency checks). */
export function resultFromGoals(goalsFor: number, goalsAgainst: number): MatchResult {
  if (goalsFor > goalsAgainst) return "W";
  if (goalsFor < goalsAgainst) return "L";
  return "D";
}
