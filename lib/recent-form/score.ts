/**
 * Phase 1.16B - RAW recent-form candidate score (pure, signed -1..+1, UNWIRED).
 * ----------------------------------------------------------------------------
 * Maps a team's last-5 / last-10 points-per-match onto a signed -1..+1 candidate
 * score. This is RAW form (NOT a residual): it deliberately OVERLAPS Elo and FIFA
 * (both already encode results), so it is AUDIT-ONLY and is NOT wired into the
 * prediction model. The opponent-adjusted Elo residual is DEFERRED to a later phase
 * that has opponent Elo at match time; only then is "residual" naming appropriate.
 */
import { clamp } from "@/lib/utils";
import type { RecentFormRow, RecentFormScore } from "@/lib/types";

/**
 * Fixed neutral reference: 1.5 points per match (the midpoint of the 0..3 PPM range,
 * i.e. a draw-equivalent baseline). This is a CONSTANT, not an implicit field average.
 */
export const NEUTRAL_PPM = 1.5;

/** PPM distance from neutral that maps to the +/-1 bounds: 0 PPM -> -1, 3 PPM -> +1. */
export const PPM_SCALE = 1.5;

/** Composite blend weights (last-10 favoured slightly for stability). */
export const LAST5_WEIGHT = 0.4;
export const LAST10_WEIGHT = 0.6;

/** Map points-per-match to a signed -1..+1 raw-form score about NEUTRAL_PPM. */
export function rawFormScoreFromPpm(pointsPerMatch: number): number {
  if (!Number.isFinite(pointsPerMatch)) return 0;
  return clamp((pointsPerMatch - NEUTRAL_PPM) / PPM_SCALE, -1, 1);
}

/**
 * RAW recent-form candidate score for one team row. `last5`/`last10` are the signed
 * PPM scores; `composite` is the named-weight blend, clamped to [-1, +1]. Pure and
 * deterministic. NOT model-active.
 */
export function recentFormCandidateScore(row: RecentFormRow): RecentFormScore {
  const last5 = rawFormScoreFromPpm(row.last5PointsPerMatch);
  const last10 = rawFormScoreFromPpm(row.last10PointsPerMatch);
  const composite = clamp(last5 * LAST5_WEIGHT + last10 * LAST10_WEIGHT, -1, 1);
  return { teamId: row.teamId, last5, last10, composite };
}
