/**
 * Phase 1.14 - tournament-context layer (public surface).
 * -------------------------------------------------------
 * Pure, source-backed venue geo/context -> ordered group-stage itineraries ->
 * travel/rest/altitude/time-zone/venue-continuity metrics -> a signed -1..+1
 * context score. STANDALONE: not imported by lib/model/* and not wired into the
 * prediction pipeline. No probabilities and no model weights are affected.
 */
import type {
  ItineraryMetrics,
  TeamItinerary,
  TournamentContextScore,
} from "@/lib/types";
import { computeItineraryMetrics } from "./metrics";
import { scoreItineraryMetrics } from "./score";
import { groupStageItineraries, itineraryForTeam } from "./itineraries";

export { EARTH_RADIUS_KM, haversineKm, tzOffsetHours } from "./geo";
export {
  deriveItineraries,
  groupStageItineraries,
  itineraryForTeam,
} from "./itineraries";
export { computeItineraryMetrics } from "./metrics";
export {
  TRAVEL_FULL_PENALTY_KM,
  REST_CONGESTED_DAYS,
  REST_COMFORTABLE_DAYS,
  ALTITUDE_LOWER_THRESHOLD_M,
  ALTITUDE_FULL_BURDEN_M,
  TIMEZONE_FULL_PENALTY_HOURS,
  COMPOSITE_WEIGHTS,
  DEFERRED_SUB_METRICS,
  travelScore,
  restScore,
  altitudeBurden,
  altitudeScore,
  timeZoneScore,
  venueContinuityScore,
  scoreItineraryMetrics,
} from "./score";

/** Metrics + signed score for one itinerary (pure composition). */
export function scoreItinerary(itin: TeamItinerary): {
  metrics: ItineraryMetrics;
  score: TournamentContextScore;
} {
  const metrics = computeItineraryMetrics(itin);
  return { metrics, score: scoreItineraryMetrics(metrics) };
}

/** Signed tournament-context score for one team (group-stage itinerary). */
export function tournamentContextScoreForTeam(
  teamId: string,
): TournamentContextScore | undefined {
  const itin = itineraryForTeam(teamId);
  return itin ? scoreItineraryMetrics(computeItineraryMetrics(itin)) : undefined;
}

/** Signed tournament-context scores for every team in the active dataset. */
export function tournamentContextScores(): TournamentContextScore[] {
  return groupStageItineraries().map((itin) =>
    scoreItineraryMetrics(computeItineraryMetrics(itin)),
  );
}
