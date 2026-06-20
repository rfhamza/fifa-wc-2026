/**
 * Phase 1.14 - group-stage itineraries.
 * -------------------------------------
 * Derives each team's ORDERED sequence of group-stage match locations (a venue in
 * time) from existing resolved fixtures + the venue-geo snapshot. Read-only: it
 * does not modify fixtures, schedule, draw slots, or the resolver, and it is not
 * wired into the prediction model.
 */
import type {
  Fixture,
  ItineraryStop,
  TeamItinerary,
  VenueGeoRow,
} from "@/lib/types";
import { fixtures as resolvedFixtures } from "@/lib/data";
import { venueGeoById } from "@/data/model-inputs/snapshots/venue-geo-2026";

/** Chronological key for a fixture: matchday first, then kickoff/date. */
function orderKey(f: Fixture): [number, number] {
  const t = Date.parse(f.kickoff ?? f.date);
  return [f.matchday, Number.isFinite(t) ? t : 0];
}

/**
 * Pure: build ordered group-stage itineraries for every team that appears in the
 * supplied fixtures. A team's stops are sorted by (matchday, kickoff/date). Throws
 * if a fixture references a venue with no geo row (referential integrity is the
 * validator's job; this keeps the derivation honest).
 */
export function deriveItineraries(
  fixtures: Fixture[],
  geoById: Map<string, VenueGeoRow>,
): TeamItinerary[] {
  const byTeam = new Map<string, Fixture[]>();
  for (const f of fixtures) {
    for (const teamId of [f.homeTeamId, f.awayTeamId]) {
      const list = byTeam.get(teamId) ?? [];
      list.push(f);
      byTeam.set(teamId, list);
    }
  }

  const itineraries: TeamItinerary[] = [];
  for (const [teamId, teamFixtures] of byTeam) {
    const ordered = [...teamFixtures].sort((a, b) => {
      const [am, at] = orderKey(a);
      const [bm, bt] = orderKey(b);
      return am !== bm ? am - bm : at - bt;
    });
    const stops: ItineraryStop[] = ordered.map((f) => {
      const geo = geoById.get(f.venueId);
      if (!geo) {
        throw new Error(
          `itinerary: fixture ${f.id} references venue "${f.venueId}" with no geo row`,
        );
      }
      return {
        matchNumber: f.matchNumber,
        matchday: f.matchday,
        date: f.kickoff ?? f.date,
        venueId: f.venueId,
        geo,
      };
    });
    itineraries.push({ teamId, stops });
  }

  // Deterministic team order for stable consumers/tests.
  itineraries.sort((a, b) => a.teamId.localeCompare(b.teamId));
  return itineraries;
}

/** Group-stage itineraries for the active dataset (resolved fixtures + venue geo). */
export function groupStageItineraries(): TeamItinerary[] {
  return deriveItineraries(resolvedFixtures, venueGeoById);
}

/** A single team's group-stage itinerary, or undefined if the team has no fixtures. */
export function itineraryForTeam(teamId: string): TeamItinerary | undefined {
  return groupStageItineraries().find((it) => it.teamId === teamId);
}
