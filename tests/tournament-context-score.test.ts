import { describe, expect, it } from "vitest";
import {
  EARTH_RADIUS_KM,
  haversineKm,
  tzOffsetHours,
  computeItineraryMetrics,
  scoreItineraryMetrics,
  travelScore,
  restScore,
  altitudeScore,
  timeZoneScore,
  venueContinuityScore,
  TRAVEL_FULL_PENALTY_KM,
  REST_CONGESTED_DAYS,
  REST_COMFORTABLE_DAYS,
  ALTITUDE_FULL_PENALTY_M,
  TIMEZONE_FULL_PENALTY_HOURS,
  DEFERRED_SUB_METRICS,
} from "@/lib/tournament-context";
import { venueGeoById } from "@/data/official/venue-geo";
import type { ItineraryStop, TeamItinerary, VenueGeoRow } from "@/lib/types";

const stop = (
  geo: VenueGeoRow,
  date: string,
  matchday: number,
): ItineraryStop => ({ matchday, date, venueId: geo.venueId, geo });

describe("geo helpers - haversine", () => {
  it("is 0 for identical points", () => {
    expect(haversineKm(40, -74, 40, -74)).toBe(0);
  });

  it("matches one degree of latitude (~111.19 km)", () => {
    expect(haversineKm(0, 0, 1, 0)).toBeCloseTo((Math.PI / 180) * EARTH_RADIUS_KM, 2);
  });

  it("New York -> Los Angeles is ~3900-3990 km", () => {
    const ny = venueGeoById.get("new-york")!;
    const la = venueGeoById.get("los-angeles")!;
    const d = haversineKm(ny.latitude, ny.longitude, la.latitude, la.longitude);
    expect(d).toBeGreaterThan(3800);
    expect(d).toBeLessThan(4050);
  });

  it("is symmetric", () => {
    const a = haversineKm(19.3, -99.1, 47.6, -122.3);
    const b = haversineKm(47.6, -122.3, 19.3, -99.1);
    expect(a).toBeCloseTo(b, 9);
  });
});

describe("geo helpers - IANA time-zone offsets (June 2026)", () => {
  const inst = "2026-06-11T19:00:00Z";
  it("computes DST-correct US offsets", () => {
    expect(tzOffsetHours("America/New_York", inst)).toBe(-4); // EDT
    expect(tzOffsetHours("America/Los_Angeles", inst)).toBe(-7); // PDT
    expect(tzOffsetHours("America/Chicago", inst)).toBe(-5); // CDT
  });
  it("Mexico City has no summer DST (CST = -6)", () => {
    expect(tzOffsetHours("America/Mexico_City", inst)).toBe(-6);
  });
});

describe("tournament-context sub-scores - bounds & monotonicity", () => {
  it("travel: +1 at zero, -1 at/above full penalty, monotonic non-increasing", () => {
    expect(travelScore(0)).toBe(1);
    expect(travelScore(TRAVEL_FULL_PENALTY_KM)).toBe(-1);
    expect(travelScore(TRAVEL_FULL_PENALTY_KM * 2)).toBe(-1);
    let prev = travelScore(0);
    for (let km = 0; km <= TRAVEL_FULL_PENALTY_KM; km += 250) {
      const s = travelScore(km);
      expect(s).toBeLessThanOrEqual(prev + 1e-12);
      expect(s).toBeGreaterThanOrEqual(-1);
      expect(s).toBeLessThanOrEqual(1);
      prev = s;
    }
  });

  it("rest: -1 at/below congested, +1 at/above comfortable, +1 when no legs", () => {
    expect(restScore(REST_CONGESTED_DAYS)).toBe(-1);
    expect(restScore(REST_CONGESTED_DAYS - 1)).toBe(-1);
    expect(restScore(REST_COMFORTABLE_DAYS)).toBe(1);
    expect(restScore((REST_CONGESTED_DAYS + REST_COMFORTABLE_DAYS) / 2)).toBeCloseTo(0, 9);
    expect(restScore(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("altitude: +1 at sea level, -1 at/above full penalty (Mexico City)", () => {
    expect(altitudeScore(0)).toBe(1);
    expect(altitudeScore(ALTITUDE_FULL_PENALTY_M)).toBe(-1);
    expect(altitudeScore(ALTITUDE_FULL_PENALTY_M / 2)).toBeCloseTo(0, 9);
  });

  it("timeZone: +1 at zero, -1 at/above full penalty", () => {
    expect(timeZoneScore(0)).toBe(1);
    expect(timeZoneScore(TIMEZONE_FULL_PENALTY_HOURS)).toBe(-1);
  });

  it("venueContinuity: 0..+1 benefit, never a penalty", () => {
    expect(venueContinuityScore(0)).toBe(0);
    expect(venueContinuityScore(0.5)).toBe(0.5);
    expect(venueContinuityScore(1)).toBe(1);
  });
});

describe("itinerary metrics + composite score", () => {
  const mc = venueGeoById.get("mexico-city")!; // 2200 m, America/Mexico_City
  const ny = venueGeoById.get("new-york")!; // sea level, America/New_York
  const la = venueGeoById.get("los-angeles")!; // America/Los_Angeles

  it("a single-venue, well-rested itinerary scores strongly positive", () => {
    const itin: TeamItinerary = {
      teamId: "stay-put",
      stops: [
        stop(ny, "2026-06-12T19:00:00Z", 1),
        stop(ny, "2026-06-18T19:00:00Z", 2),
        stop(ny, "2026-06-24T19:00:00Z", 3),
      ],
    };
    const m = computeItineraryMetrics(itin);
    expect(m.totalTravelKm).toBe(0);
    expect(m.repeatedVenueFraction).toBe(1);
    expect(m.maxAltitudeMeters).toBe(ny.altitudeMeters);
    const s = scoreItineraryMetrics(m);
    expect(s.travel).toBe(1);
    expect(s.venueContinuity).toBe(1);
    expect(s.composite).toBeGreaterThan(0.5);
    expect(s.composite).toBeLessThanOrEqual(1);
  });

  it("a long-haul, altitude-heavy, congested itinerary scores worse", () => {
    const good: TeamItinerary = {
      teamId: "easy",
      stops: [
        stop(ny, "2026-06-12T19:00:00Z", 1),
        stop(ny, "2026-06-18T19:00:00Z", 2),
        stop(ny, "2026-06-24T19:00:00Z", 3),
      ],
    };
    const hard: TeamItinerary = {
      teamId: "hard",
      stops: [
        stop(ny, "2026-06-12T19:00:00Z", 1),
        stop(la, "2026-06-15T19:00:00Z", 2), // 3-day gap, transcontinental
        stop(mc, "2026-06-18T19:00:00Z", 3), // to high altitude
      ],
    };
    const sGood = scoreItineraryMetrics(computeItineraryMetrics(good));
    const sHard = scoreItineraryMetrics(computeItineraryMetrics(hard));
    expect(sHard.composite).toBeLessThan(sGood.composite);
    expect(sHard.travel).toBeLessThan(sGood.travel);
    expect(sHard.altitude).toBeLessThan(sGood.altitude);
  });

  it("composite is always within [-1, 1] and lists deferred climate sub-metrics", () => {
    const itin: TeamItinerary = {
      teamId: "x",
      stops: [
        stop(mc, "2026-06-12T19:00:00Z", 1),
        stop(la, "2026-06-14T19:00:00Z", 2),
        stop(ny, "2026-06-16T19:00:00Z", 3),
      ],
    };
    const s = scoreItineraryMetrics(computeItineraryMetrics(itin));
    expect(s.composite).toBeGreaterThanOrEqual(-1);
    expect(s.composite).toBeLessThanOrEqual(1);
    expect(s.deferred).toEqual([...DEFERRED_SUB_METRICS]);
    expect(s.deferred).toContain("heat");
    expect(s.deferred).toContain("venueClimate");
  });

  it("is deterministic (same input -> identical score)", () => {
    const itin: TeamItinerary = {
      teamId: "d",
      stops: [
        stop(ny, "2026-06-12T19:00:00Z", 1),
        stop(la, "2026-06-16T19:00:00Z", 2),
      ],
    };
    const a = scoreItineraryMetrics(computeItineraryMetrics(itin));
    const b = scoreItineraryMetrics(computeItineraryMetrics(itin));
    expect(a).toEqual(b);
  });

  it("zero/one-stop itineraries are safe (no legs, neutral travel/rest)", () => {
    const m = computeItineraryMetrics({ teamId: "lonely", stops: [stop(ny, "2026-06-12T19:00:00Z", 1)] });
    expect(m.legs).toBe(0);
    expect(m.totalTravelKm).toBe(0);
    expect(m.minRestDays).toBe(Number.POSITIVE_INFINITY);
    const s = scoreItineraryMetrics(m);
    expect(s.rest).toBe(1);
    expect(s.travel).toBe(1);
  });
});
