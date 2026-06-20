/**
 * Phase 1.14 - tournament-context types (venue geo + signed context score).
 * ------------------------------------------------------------------------
 * A small, standalone type module (no imports, mirroring model-inputs.ts) for the
 * venue-geo snapshot and the DERIVED, signed tournament-context score. Re-exported
 * from lib/types/index.ts.
 *
 * Scope honesty (Phase 1.14): this layer uses ONLY cleanly sourced venue
 * geo/context fields - latitude, longitude, altitude, IANA time zone. Venue heat /
 * venue-climate normals (monthlyTempC / monthlyPrecipMm) are DEFERRED to a later,
 * separately source-backed phase and are intentionally NOT part of these types.
 * Nothing here is wired into the prediction model.
 */

/** Provenance status for a venue-geo row / the snapshot family. */
export type VenueGeoStatus = "source-backed" | "unresolved";

/** Provenance for the venue-geo snapshot (mirrors ModelInputSource in spirit). */
export interface VenueGeoSource {
  /** Human label shown in methodology/docs. */
  label: string;
  sourceName: string;
  sourceUrl?: string;
  /** User-supplied source file name (the raw CSV is NOT committed). */
  sourceFile?: string;
  /** When the snapshot was transcribed (ISO). */
  retrievedAt?: string;
  status: VenueGeoStatus;
  notes?: string;
}

/**
 * One source-backed venue geo/context row (Phase 1.14). Coordinates + altitude +
 * IANA time zone only. Venue climate normals are intentionally absent (deferred).
 */
export interface VenueGeoRow {
  /** Must match an official Venue id (the join key everywhere). */
  venueId: string;
  stadiumName: string;
  city: string;
  /** Co-host nation (matches Venue.country). */
  country: "USA" | "Canada" | "Mexico";
  /** Decimal degrees, -90..90. */
  latitude: number;
  /** Decimal degrees, -180..180. */
  longitude: number;
  /** Stadium elevation in metres above sea level. */
  altitudeMeters: number;
  /** IANA time-zone name, e.g. "America/New_York". */
  timeZone: string;
  /** Per-row citation (provenance). */
  sourceRef: string;
  notes?: string;
  dataStatus: VenueGeoStatus;
}

/** Result of validating the venue-geo snapshot (mirrors lib/data/validate.ts shape). */
export interface VenueGeoValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** One ordered stop on a team's group-stage itinerary (a match location in time). */
export interface ItineraryStop {
  /** Official match number (M1..M72) when known. */
  matchNumber?: number;
  /** Round-robin matchday within the group (1..3). */
  matchday: number;
  /** ISO datetime (kickoff) when known, otherwise the fixture date. */
  date: string;
  venueId: string;
  /** The resolved venue-geo row for this stop. */
  geo: VenueGeoRow;
}

/** A team's ordered group-stage itinerary (3 stops in the group phase). */
export interface TeamItinerary {
  teamId: string;
  stops: ItineraryStop[];
}

/**
 * Raw, signed-friendly metrics for one itinerary (before scoring). All distances
 * in km, gaps in days, time-zone shifts in hours. Climate/heat is NOT here.
 */
export interface ItineraryMetrics {
  teamId: string;
  /** Number of inter-match legs (stops - 1; never negative). */
  legs: number;
  /** Sum of great-circle distances across all legs (km). */
  totalTravelKm: number;
  /** Longest single leg (km). */
  maxLegKm: number;
  /** Days between consecutive matches (length === legs). */
  restGapsDays: number[];
  /** Smallest rest gap (days); Infinity-free, 0 legs -> Number.POSITIVE_INFINITY. */
  minRestDays: number;
  /** Highest altitude any match is played at (m). Kept for explanation/breakdown. */
  maxAltitudeMeters: number;
  /** Altitude (m) at each stop, in itinerary order. Basis for the per-match dose. */
  matchAltitudesMeters: number[];
  /** Largest altitude increase across a single leg (m; >= 0). */
  maxAltitudeGainMeters: number;
  /** Sum of absolute time-zone offset changes across legs (hours). */
  totalTimeZoneShiftHours: number;
  /** Largest single time-zone offset change across a leg (hours). */
  maxTimeZoneShiftHours: number;
  /** Legs where the venue is unchanged (zero-movement, same stadium). */
  repeatedVenueLegs: number;
  /** repeatedVenueLegs / legs (0 when legs === 0). */
  repeatedVenueFraction: number;
}

/** A sub-metric deferred this phase for lack of a source-backed dataset. */
export type DeferredContextSubMetric = "heat" | "venueClimate";

/**
 * Signed -1..+1 tournament-context sub-scores + composite for one team. Positive
 * is favourable (less travel, more rest, less altitude shock, less time-zone
 * shift, more venue continuity). NOT wired into the model.
 */
export interface TournamentContextScore {
  teamId: string;
  /** -1..+1: less total travel -> higher. */
  travel: number;
  /** -1..+1: more rest (larger minimum gap) -> higher. */
  rest: number;
  /** -1..+1: less altitude exposure -> higher. */
  altitude: number;
  /** -1..+1: less cumulative time-zone shift -> higher. */
  timeZone: number;
  /** 0..+1 benefit: more repeated-venue / low movement -> higher (never a penalty). */
  venueContinuity: number;
  /** -1..+1: mean of the five sub-scores above. */
  composite: number;
  /** Sub-metrics intentionally omitted this phase (documented deferral). */
  deferred: DeferredContextSubMetric[];
}
