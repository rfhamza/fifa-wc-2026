/**
 * Phase 1.16B - recent-form layer (public surface, UNWIRED).
 * ---------------------------------------------------------
 * Source-backed last-10 results snapshot -> pure aggregates -> a RAW signed -1..+1
 * candidate score. STANDALONE and AUDIT-ONLY: nothing here is imported by
 * lib/model/*, the active `recentForm` placeholder is untouched, and no
 * probabilities change. Wiring (and the true opponent-Elo residual) is a later phase.
 */
import type { RecentFormRow, RecentFormScore } from "@/lib/types";
import { recentFormSnapshot, recentFormById } from "@/data/model-inputs/snapshots/recent-form-2026-06-11";
import { recentFormCandidateScore } from "./score";

export {
  pointsForResult,
  aggregateRecentForm,
  resultFromGoals,
  type RecentFormAggregate,
} from "./aggregate";
export {
  NEUTRAL_PPM,
  PPM_SCALE,
  LAST5_WEIGHT,
  LAST10_WEIGHT,
  rawFormScoreFromPpm,
  recentFormCandidateScore,
} from "./score";

/** RAW recent-form candidate score for one team (undefined if not in the snapshot). */
export function recentFormCandidateScoreForTeam(
  teamId: string,
): RecentFormScore | undefined {
  const row = recentFormById.get(teamId);
  return row ? recentFormCandidateScore(row) : undefined;
}

/** RAW recent-form candidate scores for every team in the snapshot. */
export function recentFormCandidateScores(): RecentFormScore[] {
  return recentFormSnapshot.map((row: RecentFormRow) => recentFormCandidateScore(row));
}
