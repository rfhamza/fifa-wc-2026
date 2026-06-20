import type { VenueGeoRow, VenueGeoSource } from "@/lib/types";

/**
 * Phase 1.14 - venue geo/context snapshot (16 host stadiums).
 * ----------------------------------------------------------
 * A MODELLING/PROVENANCE input snapshot (lives under data/model-inputs/snapshots/,
 * NOT data/official/) carrying source-backed venue coordinates, altitude and IANA
 * time zone for the 2026 host venues. Coordinates/altitude/time zone are modelling
 * inputs, not FIFA fixture/venue identity, so they belong here rather than in the
 * official fixture/venue resolver. Transcribed from a USER-SUPPLIED venue-geo CSV
 * (the raw CSV is NOT committed). Standalone: it is NOT added to `officialDataset`
 * and does NOT change the `Venue` type, fixtures, schedule, or the resolver.
 *
 * Provenance:
 *  - latitude / longitude: LatLong.net "2026 FIFA World Cup locations" table.
 *  - altitudeMeters: Starting11 World Cup stadium-altitude table.
 *  - timeZone: IANA Time Zone Database names.
 * Per-row `sourceRef` carries the exact citations; `notes` records the source basis.
 *
 * Scope (Phase 1.14): geo/context only - coordinates, altitude, time zone. Venue
 * heat / venue-climate normals (monthlyTempC / monthlyPrecipMm) are DEFERRED to a
 * later, separately source-backed phase and are intentionally absent here. The
 * existing `Venue.avgTempC` / `Venue.climate` placeholders are NOT treated as
 * source-backed. No live/current weather is used. See docs/VENUE_GEO_SNAPSHOT_AUDIT.md.
 */
export const VENUE_GEO_SOURCE: VenueGeoSource = {
  label: "Host-venue geo/context (coordinates, altitude, time zone)",
  sourceName:
    "LatLong.net (2026 FIFA World Cup locations); Starting11 (stadium altitude); IANA Time Zone Database",
  sourceUrl: "https://www.latlong.net/location/2026-fifa-world-cup-locations-2252",
  sourceFile: "venue_geo_template_filled_draft.csv",
  retrievedAt: "2026-06-19",
  status: "source-backed",
  notes:
    "User-supplied venue-geo CSV (raw CSV not committed). Coordinates from the LatLong.net 2026 FIFA World Cup locations table; altitudeMeters from the Starting11 World Cup stadium-altitude table; timeZone uses IANA names. Geo/context only - venue climate normals (monthlyTempC / monthlyPrecipMm) are deferred to a later source-backed phase and are intentionally omitted. Venue.avgTempC / Venue.climate placeholders are NOT used as source-backed inputs; no live weather.",
};

const COORDS_REF =
  "coords=https://www.latlong.net/location/2026-fifa-world-cup-locations-2252";
const ALT_REF = "altitude=https://starting11.com/world-cup/venues";
const TZ_REF = "timezone=IANA TZDB";
const ref = `${COORDS_REF}; ${ALT_REF}; ${TZ_REF}`;

/**
 * 16 host venues. `venueId` MUST match `data/official/venues.ts` / `data/mock`
 * ids (the join key for itineraries and validators).
 */
export const venueGeoSnapshot: VenueGeoRow[] = [
  {
    venueId: "mexico-city",
    stadiumName: "Estadio Azteca",
    city: "Mexico City",
    country: "Mexico",
    latitude: 19.302837,
    longitude: -99.150803,
    altitudeMeters: 2200,
    timeZone: "America/Mexico_City",
    sourceRef: ref,
    notes:
      "Coordinates from LatLong.net table; altitude from Starting11 stadium altitude list; IANA time zone for Mexico City.",
    dataStatus: "source-backed",
  },
  {
    venueId: "guadalajara",
    stadiumName: "Estadio Akron",
    city: "Guadalajara",
    country: "Mexico",
    latitude: 20.681721,
    longitude: -103.463135,
    altitudeMeters: 1566,
    timeZone: "America/Mexico_City",
    sourceRef: ref,
    notes:
      "Coordinates from LatLong.net table; altitude from Starting11 stadium altitude list; IANA time zone for Guadalajara/Zapopan.",
    dataStatus: "source-backed",
  },
  {
    venueId: "monterrey",
    stadiumName: "Estadio BBVA",
    city: "Monterrey",
    country: "Mexico",
    latitude: 25.669132,
    longitude: -100.244621,
    altitudeMeters: 540,
    timeZone: "America/Monterrey",
    sourceRef: ref,
    notes:
      "Coordinates from LatLong.net table; altitude from Starting11 stadium altitude list; IANA time zone for Monterrey.",
    dataStatus: "source-backed",
  },
  {
    venueId: "toronto",
    stadiumName: "BMO Field",
    city: "Toronto",
    country: "Canada",
    latitude: 43.633087,
    longitude: -79.418961,
    altitudeMeters: 76,
    timeZone: "America/Toronto",
    sourceRef: ref,
    notes:
      "Coordinates from LatLong.net table; altitude from Starting11 stadium altitude list; IANA time zone for Toronto.",
    dataStatus: "source-backed",
  },
  {
    venueId: "vancouver",
    stadiumName: "BC Place",
    city: "Vancouver",
    country: "Canada",
    latitude: 49.276646,
    longitude: -123.112564,
    altitudeMeters: 0,
    timeZone: "America/Vancouver",
    sourceRef: ref,
    notes:
      "Coordinates from LatLong.net table; altitude from Starting11 stadium altitude list; IANA time zone for Vancouver.",
    dataStatus: "source-backed",
  },
  {
    venueId: "new-york",
    stadiumName: "MetLife Stadium",
    city: "New York / New Jersey",
    country: "USA",
    latitude: 40.813477,
    longitude: -74.074951,
    altitudeMeters: 5,
    timeZone: "America/New_York",
    sourceRef: ref,
    notes:
      "Coordinates from LatLong.net table; altitude from Starting11 stadium altitude list; IANA time zone for East Rutherford/New York area.",
    dataStatus: "source-backed",
  },
  {
    venueId: "los-angeles",
    stadiumName: "SoFi Stadium",
    city: "Los Angeles",
    country: "USA",
    latitude: 33.953438,
    longitude: -118.339447,
    altitudeMeters: 30,
    timeZone: "America/Los_Angeles",
    sourceRef: ref,
    notes:
      "Coordinates from LatLong.net table; altitude from Starting11 stadium altitude list; IANA time zone for Inglewood/Los Angeles.",
    dataStatus: "source-backed",
  },
  {
    venueId: "dallas",
    stadiumName: "AT&T Stadium",
    city: "Dallas",
    country: "USA",
    latitude: 32.748138,
    longitude: -97.093231,
    altitudeMeters: 180,
    timeZone: "America/Chicago",
    sourceRef: ref,
    notes:
      "Coordinates from LatLong.net table; altitude from Starting11 stadium altitude list; IANA time zone for Arlington/Dallas.",
    dataStatus: "source-backed",
  },
  {
    venueId: "atlanta",
    stadiumName: "Mercedes-Benz Stadium",
    city: "Atlanta",
    country: "USA",
    latitude: 33.755371,
    longitude: -84.401436,
    altitudeMeters: 320,
    timeZone: "America/New_York",
    sourceRef: ref,
    notes:
      "Coordinates from LatLong.net table; altitude from Starting11 stadium altitude list; IANA time zone for Atlanta.",
    dataStatus: "source-backed",
  },
  {
    venueId: "miami",
    stadiumName: "Hard Rock Stadium",
    city: "Miami",
    country: "USA",
    latitude: 25.95783,
    longitude: -80.239326,
    altitudeMeters: 3,
    timeZone: "America/New_York",
    sourceRef: ref,
    notes:
      "Coordinates from LatLong.net table; altitude from Starting11 stadium altitude list; IANA time zone for Miami Gardens.",
    dataStatus: "source-backed",
  },
  {
    venueId: "houston",
    stadiumName: "NRG Stadium",
    city: "Houston",
    country: "USA",
    latitude: 29.684702,
    longitude: -95.410965,
    altitudeMeters: 15,
    timeZone: "America/Chicago",
    sourceRef: ref,
    notes:
      "Coordinates from LatLong.net table; altitude from Starting11 stadium altitude list; IANA time zone for Houston.",
    dataStatus: "source-backed",
  },
  {
    venueId: "kansas-city",
    stadiumName: "Arrowhead Stadium",
    city: "Kansas City",
    country: "USA",
    latitude: 39.048855,
    longitude: -94.484474,
    altitudeMeters: 270,
    timeZone: "America/Chicago",
    sourceRef: ref,
    notes:
      "Coordinates from LatLong.net table; altitude from Starting11 stadium altitude list; IANA time zone for Kansas City.",
    dataStatus: "source-backed",
  },
  {
    venueId: "philadelphia",
    stadiumName: "Lincoln Financial Field",
    city: "Philadelphia",
    country: "USA",
    latitude: 39.901325,
    longitude: -75.167862,
    altitudeMeters: 12,
    timeZone: "America/New_York",
    sourceRef: ref,
    notes:
      "Coordinates from LatLong.net table; altitude from Starting11 stadium altitude list; IANA time zone for Philadelphia.",
    dataStatus: "source-backed",
  },
  {
    venueId: "seattle",
    stadiumName: "Lumen Field",
    city: "Seattle",
    country: "USA",
    latitude: 47.595135,
    longitude: -122.331917,
    altitudeMeters: 50,
    timeZone: "America/Los_Angeles",
    sourceRef: ref,
    notes:
      "Coordinates from LatLong.net table; altitude from Starting11 stadium altitude list; IANA time zone for Seattle.",
    dataStatus: "source-backed",
  },
  {
    venueId: "san-francisco",
    stadiumName: "Levi's Stadium",
    city: "San Francisco Bay Area",
    country: "USA",
    latitude: 37.403297,
    longitude: -121.969765,
    altitudeMeters: 5,
    timeZone: "America/Los_Angeles",
    sourceRef: ref,
    notes:
      "Coordinates from LatLong.net table; altitude from Starting11 stadium altitude list; IANA time zone for Santa Clara/San Francisco Bay Area.",
    dataStatus: "source-backed",
  },
  {
    venueId: "boston",
    stadiumName: "Gillette Stadium",
    city: "Boston",
    country: "USA",
    latitude: 42.09079,
    longitude: -71.264404,
    altitudeMeters: 70,
    timeZone: "America/New_York",
    sourceRef: ref,
    notes:
      "Coordinates from LatLong.net table; altitude from Starting11 stadium altitude list; IANA time zone for Foxborough/Boston area.",
    dataStatus: "source-backed",
  },
];

/** venueId -> venue-geo row (lookup for itineraries/validators). */
export const venueGeoById: Map<string, VenueGeoRow> = new Map(
  venueGeoSnapshot.map((r) => [r.venueId, r]),
);
