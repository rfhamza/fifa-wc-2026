/**
 * Phase 1.14 - venue-geo snapshot validation.
 *
 * Verification-only: asserts the venue-geo snapshot covers exactly the official
 * host venues (one source-backed row each), with finite in-range coordinates,
 * sane altitude, a resolvable IANA time zone, a per-row citation, and identity
 * fields consistent with the official `Venue` records. Also locks the Phase 1.14
 * scope: NO venue climate-normal fields may appear (heat/climate is deferred).
 * Mirrors the `{ valid, errors, warnings }` shape used elsewhere.
 */
import type {
  Venue,
  VenueGeoRow,
  VenueGeoSource,
  VenueGeoValidationResult,
} from "@/lib/types";
import { officialVenues } from "@/data/official/venues";
import {
  venueGeoSnapshot,
  VENUE_GEO_SOURCE,
} from "@/data/model-inputs/snapshots/venue-geo-2026";

const LAT_MIN = -90;
const LAT_MAX = 90;
const LON_MIN = -180;
const LON_MAX = 180;
/** Lowest dry-land elevations sit below sea level; host venues are well within this. */
const ALT_MIN_M = -500;
const ALT_MAX_M = 3000;

/** Climate fields that MUST NOT appear on a Phase 1.14 venue-geo row (deferred). */
const FORBIDDEN_CLIMATE_KEYS = ["monthlyTempC", "monthlyPrecipMm", "avgTempC", "climate"];

/** True if `tz` is a resolvable IANA zone (Intl does not throw for it). */
function isResolvableTimeZone(tz: string): boolean {
  if (!tz || !tz.includes("/")) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function validateVenueGeoSnapshot(
  snapshot: VenueGeoRow[] = venueGeoSnapshot,
  venues: Venue[] = officialVenues,
  source: VenueGeoSource = VENUE_GEO_SOURCE,
): VenueGeoValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const venueById = new Map(venues.map((v) => [v.id, v]));

  if (snapshot.length !== venues.length) {
    errors.push(
      `expected ${venues.length} venue-geo rows (one per official venue), got ${snapshot.length}`,
    );
  }

  const seen = new Set<string>();
  for (const row of snapshot) {
    if (seen.has(row.venueId)) errors.push(`duplicate venue-geo row: ${row.venueId}`);
    seen.add(row.venueId);

    const venue = venueById.get(row.venueId);
    if (!venue) {
      errors.push(`venue-geo row id not in official venues: ${row.venueId}`);
    } else {
      // Identity fields must stay consistent with the official Venue record.
      if (row.stadiumName !== venue.name) {
        errors.push(`${row.venueId}: stadiumName "${row.stadiumName}" != venue name "${venue.name}"`);
      }
      if (row.city !== venue.city) {
        errors.push(`${row.venueId}: city "${row.city}" != venue city "${venue.city}"`);
      }
      if (row.country !== venue.country) {
        errors.push(`${row.venueId}: country "${row.country}" != venue country "${venue.country}"`);
      }
    }

    if (!Number.isFinite(row.latitude) || row.latitude < LAT_MIN || row.latitude > LAT_MAX) {
      errors.push(`${row.venueId}: latitude ${row.latitude} out of range [${LAT_MIN}, ${LAT_MAX}]`);
    }
    if (!Number.isFinite(row.longitude) || row.longitude < LON_MIN || row.longitude > LON_MAX) {
      errors.push(`${row.venueId}: longitude ${row.longitude} out of range [${LON_MIN}, ${LON_MAX}]`);
    }
    if (
      !Number.isFinite(row.altitudeMeters) ||
      row.altitudeMeters < ALT_MIN_M ||
      row.altitudeMeters > ALT_MAX_M
    ) {
      errors.push(`${row.venueId}: altitudeMeters ${row.altitudeMeters} out of range [${ALT_MIN_M}, ${ALT_MAX_M}]`);
    }

    if (!isResolvableTimeZone(row.timeZone)) {
      errors.push(`${row.venueId}: timeZone "${row.timeZone}" is not a resolvable IANA zone`);
    }

    if (!row.sourceRef) errors.push(`${row.venueId}: missing per-row sourceRef`);
    if (row.dataStatus !== "source-backed") {
      errors.push(`${row.venueId}: dataStatus must be "source-backed", got "${row.dataStatus}"`);
    }

    // Scope guard: venue climate/heat normals are deferred - they must not appear.
    for (const key of FORBIDDEN_CLIMATE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(row, key)) {
        errors.push(`${row.venueId}: forbidden climate field "${key}" present (heat/climate is deferred in Phase 1.14)`);
      }
    }
  }

  // Every official venue must have exactly one geo row.
  for (const v of venues) {
    if (!seen.has(v.id)) errors.push(`missing venue-geo row for venue ${v.id}`);
  }

  // Snapshot-level provenance: honestly source-backed with citation metadata.
  if (source.status !== "source-backed") {
    errors.push(`venue-geo source status must be "source-backed", got "${source.status}"`);
  }
  for (const field of ["label", "sourceName", "sourceUrl", "retrievedAt"] as const) {
    if (!source[field]) errors.push(`venue-geo source missing ${field}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}
