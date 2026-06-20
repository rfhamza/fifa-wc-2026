/**
 * Phase 1.14 - itinerary metrics (pure, deterministic).
 * -----------------------------------------------------
 * Turns an ordered itinerary into raw travel / rest / altitude / time-zone /
 * venue-continuity metrics. No climate/heat here (deferred). Not wired into the
 * prediction model.
 */
import type { ItineraryMetrics, TeamItinerary } from "@/lib/types";
import { haversineKm, tzOffsetHours } from "./geo";

const MS_PER_DAY = 86_400_000;

/** Whole-and-fractional days between two ISO instants (>= 0 for ordered stops). */
function daysBetween(aIso: string, bIso: string): number {
  return (Date.parse(bIso) - Date.parse(aIso)) / MS_PER_DAY;
}

/**
 * Compute raw metrics for one itinerary. With N stops there are N-1 legs; a single
 * stop (or none) yields zeroed travel/shift metrics and minRestDays === +Infinity
 * (no congestion). Time-zone offsets are evaluated at each stop's own date so DST
 * is handled correctly.
 */
export function computeItineraryMetrics(itin: TeamItinerary): ItineraryMetrics {
  const stops = itin.stops;
  const legs = Math.max(0, stops.length - 1);

  let totalTravelKm = 0;
  let maxLegKm = 0;
  let maxAltitudeGainMeters = 0;
  let totalTimeZoneShiftHours = 0;
  let maxTimeZoneShiftHours = 0;
  let repeatedVenueLegs = 0;
  const restGapsDays: number[] = [];

  let maxAltitudeMeters = stops.length > 0 ? stops[0]!.geo.altitudeMeters : 0;
  const matchAltitudesMeters = stops.map((s) => s.geo.altitudeMeters);

  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1]!;
    const cur = stops[i]!;

    const legKm = haversineKm(
      prev.geo.latitude,
      prev.geo.longitude,
      cur.geo.latitude,
      cur.geo.longitude,
    );
    totalTravelKm += legKm;
    if (legKm > maxLegKm) maxLegKm = legKm;

    restGapsDays.push(daysBetween(prev.date, cur.date));

    if (cur.geo.altitudeMeters > maxAltitudeMeters) {
      maxAltitudeMeters = cur.geo.altitudeMeters;
    }
    const gain = cur.geo.altitudeMeters - prev.geo.altitudeMeters;
    if (gain > maxAltitudeGainMeters) maxAltitudeGainMeters = gain;

    const shift = Math.abs(
      tzOffsetHours(cur.geo.timeZone, cur.date) -
        tzOffsetHours(prev.geo.timeZone, prev.date),
    );
    totalTimeZoneShiftHours += shift;
    if (shift > maxTimeZoneShiftHours) maxTimeZoneShiftHours = shift;

    if (cur.venueId === prev.venueId) repeatedVenueLegs += 1;
  }

  const minRestDays =
    restGapsDays.length > 0
      ? Math.min(...restGapsDays)
      : Number.POSITIVE_INFINITY;

  return {
    teamId: itin.teamId,
    legs,
    totalTravelKm,
    maxLegKm,
    restGapsDays,
    minRestDays,
    maxAltitudeMeters,
    matchAltitudesMeters,
    maxAltitudeGainMeters,
    totalTimeZoneShiftHours,
    maxTimeZoneShiftHours,
    repeatedVenueLegs,
    repeatedVenueFraction: legs > 0 ? repeatedVenueLegs / legs : 0,
  };
}
