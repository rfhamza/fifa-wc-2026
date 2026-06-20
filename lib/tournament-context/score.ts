/**
 * Tournament-context scoring (pure, signed -1..+1).
 * -------------------------------------------------
 * Maps raw itinerary metrics onto signed sub-scores and a weighted composite in
 * [-1, +1], where POSITIVE is favourable (less travel, more rest, less altitude
 * burden, less time-zone shift, more venue continuity).
 *
 * Phase 1.15A refinements (from the Phase 1.15 audit):
 *  - ALTITUDE = per-match DOSE, not campaign max. Each match gets an altitude
 *    burden (0..1) from its own venue elevation; the team burden is the AVERAGE
 *    across its group-stage matches. A single high-altitude match no longer
 *    saturates the whole campaign (the old `maxAltitudeMeters` -> -1 behaviour).
 *  - COMPOSITE = WEIGHTED mean with named weights. travel / rest / altitude carry
 *    the main signal; the near-inert time-zone component and the travel-overlapping
 *    venue-continuity benefit are down-weighted (but stay visible in the breakdown).
 *  - SKEW is documented, not hard-corrected. The realised 48-team composite is
 *    favourability-skewed (most teams positive). We deliberately do NOT subtract a
 *    tournament-wide mean: that would be fragile (it depends on the specific draw
 *    and would change if the draw changed). Model integration, IF later approved,
 *    will use PAIRWISE DIFFERENCES (a - b) behind a tight cap, so the constant skew
 *    cancels and only relative differences matter.
 *
 * Honesty / scope:
 *  - Constants below are DOCUMENTED CANDIDATE heuristics (calibration deferred).
 *  - Venue heat / venue-climate is DEFERRED (no source-backed venue climate normals);
 *    every score lists those sub-metrics in `deferred` and the composite omits them.
 *  - This utility is PURE and is NOT wired into the prediction model. It changes no
 *    probabilities and no model weights.
 */
import { clamp } from "@/lib/utils";
import type {
  DeferredContextSubMetric,
  ItineraryMetrics,
  TournamentContextScore,
} from "@/lib/types";

/** Total group-stage travel (km) at/above which the travel sub-score bottoms at -1. */
export const TRAVEL_FULL_PENALTY_KM = 8000;

/** Rest gap (days) at/below which the rest sub-score is -1 (congested turnaround). */
export const REST_CONGESTED_DAYS = 3;
/** Rest gap (days) at/above which the rest sub-score is +1 (comfortable turnaround). */
export const REST_COMFORTABLE_DAYS = 6;

/**
 * Per-match altitude dose thresholds (m). Below the lower threshold a match carries
 * no altitude burden; between the thresholds the burden ramps linearly 0..1; at or
 * above the upper threshold (Mexico City level) the burden is full (1).
 */
export const ALTITUDE_LOWER_THRESHOLD_M = 1000;
export const ALTITUDE_FULL_BURDEN_M = 2200;

/** Cumulative time-zone shift (h) at/above which the time-zone sub-score is -1. */
export const TIMEZONE_FULL_PENALTY_HOURS = 6;

/**
 * Named composite weights (Phase 1.15A). travel / rest / altitude carry the main
 * signal; time-zone (near-inert in the realised field) and venue-continuity (a
 * benefit-only axis that overlaps travel, since a repeated venue is already a 0 km
 * leg) are down-weighted but remain visible in the per-component breakdown. The
 * composite is the WEIGHTED mean, so it stays within [-1, +1].
 */
export const COMPOSITE_WEIGHTS = {
  travel: 1,
  rest: 1,
  altitude: 1,
  timeZone: 0.5,
  venueContinuity: 0.5,
} as const;

/** Sub-metrics intentionally omitted this phase (documented deferral). */
export const DEFERRED_SUB_METRICS: DeferredContextSubMetric[] = [
  "heat",
  "venueClimate",
];

/** Map a 0..1 "badness" fraction to a signed advantage score: 0 -> +1, 1 -> -1. */
function signedFromBadness(badness: number): number {
  return 1 - 2 * clamp(badness, 0, 1);
}

/** -1..+1: less total travel is better. 0 km -> +1, >= full-penalty -> -1. */
export function travelScore(totalTravelKm: number): number {
  return signedFromBadness(totalTravelKm / TRAVEL_FULL_PENALTY_KM);
}

/**
 * -1..+1: more rest (larger MINIMUM gap) is better. <= congested -> -1,
 * >= comfortable -> +1, linear between. No legs (Infinity) -> +1 (no congestion).
 */
export function restScore(minRestDays: number): number {
  if (!Number.isFinite(minRestDays)) return 1;
  const frac = clamp(
    (minRestDays - REST_CONGESTED_DAYS) /
      (REST_COMFORTABLE_DAYS - REST_CONGESTED_DAYS),
    0,
    1,
  );
  return frac * 2 - 1;
}

/**
 * Per-match altitude burden (0..1): 0 below the lower threshold, linear between the
 * thresholds, 1 at/above the full-burden altitude. Pure and deterministic.
 */
export function altitudeBurden(meters: number): number {
  if (!Number.isFinite(meters)) return 0;
  return clamp(
    (meters - ALTITUDE_LOWER_THRESHOLD_M) /
      (ALTITUDE_FULL_BURDEN_M - ALTITUDE_LOWER_THRESHOLD_M),
    0,
    1,
  );
}

/**
 * -1..+1 altitude sub-score from a team's per-match altitudes (DOSE model): the
 * mean per-match burden mapped to a signed score. All matches at sea level -> +1;
 * all matches at/above the full-burden altitude -> -1; a single high-altitude match
 * out of three yields only a partial penalty. An empty list -> +1 (no exposure).
 */
export function altitudeScore(matchAltitudesMeters: number[]): number {
  if (matchAltitudesMeters.length === 0) return 1;
  const meanBurden =
    matchAltitudesMeters.reduce((s, m) => s + altitudeBurden(m), 0) /
    matchAltitudesMeters.length;
  return signedFromBadness(meanBurden);
}

/** -1..+1: less cumulative time-zone shift is better. 0 h -> +1, >= full-penalty -> -1. */
export function timeZoneScore(totalTimeZoneShiftHours: number): number {
  return signedFromBadness(totalTimeZoneShiftHours / TIMEZONE_FULL_PENALTY_HOURS);
}

/**
 * 0..+1 benefit: repeated-venue / low-movement. fraction of zero-movement legs
 * maps linearly to 0..+1 (never a penalty - it is a benefit axis by design).
 */
export function venueContinuityScore(repeatedVenueFraction: number): number {
  return clamp(repeatedVenueFraction, 0, 1);
}

/**
 * Compose the signed sub-scores + WEIGHTED composite for one team's itinerary
 * metrics. The composite is the weighted mean (COMPOSITE_WEIGHTS) of the five
 * sub-scores and lies in [-1, +1]. Climate/heat is excluded (deferred). The raw
 * composite is favourability-skewed by design (see file header); integration would
 * use pairwise differences, so the skew is not corrected here.
 */
export function scoreItineraryMetrics(
  metrics: ItineraryMetrics,
): TournamentContextScore {
  const travel = travelScore(metrics.totalTravelKm);
  const rest = restScore(metrics.minRestDays);
  const altitude = altitudeScore(metrics.matchAltitudesMeters);
  const timeZone = timeZoneScore(metrics.totalTimeZoneShiftHours);
  const venueContinuity = venueContinuityScore(metrics.repeatedVenueFraction);

  const w = COMPOSITE_WEIGHTS;
  const weightSum =
    w.travel + w.rest + w.altitude + w.timeZone + w.venueContinuity;
  const composite =
    (travel * w.travel +
      rest * w.rest +
      altitude * w.altitude +
      timeZone * w.timeZone +
      venueContinuity * w.venueContinuity) /
    weightSum;

  return {
    teamId: metrics.teamId,
    travel,
    rest,
    altitude,
    timeZone,
    venueContinuity,
    composite: clamp(composite, -1, 1),
    deferred: [...DEFERRED_SUB_METRICS],
  };
}
