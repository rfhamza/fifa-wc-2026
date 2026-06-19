import { describe, expect, it } from "vitest";
import {
  venueGeoSnapshot,
  venueGeoById,
  VENUE_GEO_SOURCE,
} from "@/data/official/venue-geo";
import { officialVenues } from "@/data/official/venues";
import { validateVenueGeoSnapshot } from "@/lib/data/validate-venue-geo";
import type { VenueGeoRow } from "@/lib/types";

describe("venue-geo snapshot - coverage & validity", () => {
  it("has exactly one row per official venue (16)", () => {
    expect(venueGeoSnapshot).toHaveLength(officialVenues.length);
    const ids = new Set(venueGeoSnapshot.map((r) => r.venueId));
    expect(ids.size).toBe(officialVenues.length);
    for (const v of officialVenues) expect(ids.has(v.id)).toBe(true);
  });

  it("every row is source-backed with a per-row citation", () => {
    for (const r of venueGeoSnapshot) {
      expect(r.dataStatus).toBe("source-backed");
      expect(r.sourceRef.length).toBeGreaterThan(0);
    }
  });

  it("coordinates and altitude are finite and in range", () => {
    for (const r of venueGeoSnapshot) {
      expect(Number.isFinite(r.latitude)).toBe(true);
      expect(r.latitude).toBeGreaterThanOrEqual(-90);
      expect(r.latitude).toBeLessThanOrEqual(90);
      expect(Number.isFinite(r.longitude)).toBe(true);
      expect(r.longitude).toBeGreaterThanOrEqual(-180);
      expect(r.longitude).toBeLessThanOrEqual(180);
      expect(Number.isFinite(r.altitudeMeters)).toBe(true);
      expect(r.altitudeMeters).toBeGreaterThanOrEqual(-500);
      expect(r.altitudeMeters).toBeLessThanOrEqual(3000);
    }
  });

  it("every timeZone is a resolvable IANA zone", () => {
    for (const r of venueGeoSnapshot) {
      expect(r.timeZone).toContain("/");
      expect(() => new Intl.DateTimeFormat("en-US", { timeZone: r.timeZone })).not.toThrow();
    }
  });

  it("identity fields match the official Venue records", () => {
    const byId = new Map(officialVenues.map((v) => [v.id, v]));
    for (const r of venueGeoSnapshot) {
      const v = byId.get(r.venueId)!;
      expect(r.stadiumName).toBe(v.name);
      expect(r.city).toBe(v.city);
      expect(r.country).toBe(v.country);
    }
  });

  it("Mexico City and Guadalajara carry the source-backed high altitudes", () => {
    expect(venueGeoById.get("mexico-city")!.altitudeMeters).toBe(2200);
    expect(venueGeoById.get("guadalajara")!.altitudeMeters).toBe(1566);
    // Sea-level coastal venues stay near 0.
    expect(venueGeoById.get("vancouver")!.altitudeMeters).toBe(0);
    expect(venueGeoById.get("miami")!.altitudeMeters).toBeLessThan(10);
  });

  it("carries NO venue climate-normal fields (heat/climate deferred this phase)", () => {
    for (const r of venueGeoSnapshot) {
      expect(Object.prototype.hasOwnProperty.call(r, "monthlyTempC")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(r, "monthlyPrecipMm")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(r, "avgTempC")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(r, "climate")).toBe(false);
    }
  });

  it("carries explicit LatLong.net + Starting11 + IANA provenance, status source-backed", () => {
    expect(VENUE_GEO_SOURCE.status).toBe("source-backed");
    expect(VENUE_GEO_SOURCE.sourceName).toMatch(/LatLong\.net/i);
    expect(VENUE_GEO_SOURCE.sourceName).toMatch(/Starting11/i);
    expect(VENUE_GEO_SOURCE.sourceName).toMatch(/IANA/i);
  });

  it("passes validateVenueGeoSnapshot with no errors or warnings", () => {
    const r = validateVenueGeoSnapshot();
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.warnings).toEqual([]);
  });
});

describe("venue-geo snapshot - validator negative cases", () => {
  it("flags an out-of-range latitude", () => {
    const bad: VenueGeoRow[] = venueGeoSnapshot.map((r) =>
      r.venueId === "dallas" ? { ...r, latitude: 120 } : r,
    );
    const res = validateVenueGeoSnapshot(bad);
    expect(res.valid).toBe(false);
    expect(res.errors.join(" ")).toMatch(/latitude 120 out of range/);
  });

  it("flags an unresolvable time zone", () => {
    const bad: VenueGeoRow[] = venueGeoSnapshot.map((r) =>
      r.venueId === "atlanta" ? { ...r, timeZone: "Mars/Olympus" } : r,
    );
    expect(validateVenueGeoSnapshot(bad).errors.join(" ")).toMatch(/not a resolvable IANA zone/);
  });

  it("flags an identity mismatch against the official venue", () => {
    const bad: VenueGeoRow[] = venueGeoSnapshot.map((r) =>
      r.venueId === "boston" ? { ...r, city: "Somewhere Else" } : r,
    );
    expect(validateVenueGeoSnapshot(bad).errors.join(" ")).toMatch(/city "Somewhere Else"/);
  });

  it("flags a forbidden climate field (deferral guard)", () => {
    const bad = venueGeoSnapshot.map((r) =>
      r.venueId === "houston" ? { ...r, monthlyTempC: Array(12).fill(20) } : r,
    ) as VenueGeoRow[];
    expect(validateVenueGeoSnapshot(bad).errors.join(" ")).toMatch(/forbidden climate field "monthlyTempC"/);
  });

  it("flags a missing row", () => {
    const bad = venueGeoSnapshot.filter((r) => r.venueId !== "seattle");
    const res = validateVenueGeoSnapshot(bad);
    expect(res.valid).toBe(false);
    expect(res.errors.join(" ")).toMatch(/missing venue-geo row for venue seattle/);
  });
});
