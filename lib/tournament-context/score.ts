/**
 * Phase 1.14 - tournament-context scoring (pure, signed -1..+1).
 * -------------------------------------------------------------
 * Maps raw itinerary metrics onto signed sub-scores and a composite in [-1, +1],
 * where POSITIVE is favourable (less travel, more rest, less altitude shock, less
 * time-zone shift, more venue continuity). The composite is the mean of the five
 * sub-scores.
 *
 * Honesty / scope (Phase 1.14):
 *  - The normalisation constants below are DOCUMENTED CANDIDATE heuristics
 *    (calibration deferred), chosen against realistic 2026 group-stage ranges.
 *  - Venue heat / venue-climate is DEFERRED (no source-backed venue climate
 *    normals this phase); every score lists those sub-metrics in `deferred` and
 *    the composite is built only from travel / rest / altitude / time zone /
 *    venue continuity.
 *  - This utility is PURE and is NOT wired into the prediction model. It changes
 *    no probabilities and no model weights.
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

/** Altitude (m) at/above which the altitude sub-score bottoms at -1 (e.g. Mexico City). */
export const ALTITUDE_FULL_PENALTY_M = 2200;

/** Cumulative time-zone shift (h) at/above which the time-zone sub-score is -1. */
export const TIMEZONE_FULL_PENALTY_HOURS = 6;

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

/** -1..+1: less altitude exposure is better. sea level -> +1, >= full-penalty -> -1. */
export function altitudeScore(maxAltitudeMeters: number): number {
  return signedFromBadness(maxAltitudeMeters / ALTITUDE_FULL_PENALTY_M);
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
 * Compose the signed sub-scores + composite for one team's itinerary metrics. The
 * composite is the mean of the five sub-scores and lies in [-1, +1]. Climate/heat
 * is excluded (deferred).
 */
export function scoreItineraryMetrics(
  metrics: ItineraryMetrics,
): TournamentContextScore {
  const travel = travelScore(metrics.totalTravelKm);
  const rest = restScore(metrics.minRestDays);
  const altitude = altitudeScore(metrics.maxAltitudeMeters);
  const timeZone = timeZoneScore(metrics.totalTimeZoneShiftHours);
  const venueContinuity = venueContinuityScore(metrics.repeatedVenueFraction);
  const composite =
    (travel + rest + altitude + timeZone + venueContinuity) / 5;

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
