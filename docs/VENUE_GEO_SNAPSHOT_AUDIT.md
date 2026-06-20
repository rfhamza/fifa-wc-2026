# Venue-Geo Snapshot Audit (Phase 1.14)

Provenance and scope for the host-venue geo/context snapshot
(`data/model-inputs/snapshots/venue-geo-2026.ts`).

## What this is

A source-backed snapshot of the 16 host stadiums carrying ONLY cleanly sourced
geo/context fields:

- `latitude` / `longitude` (decimal degrees)
- `altitudeMeters` (stadium elevation, m)
- `timeZone` (IANA time-zone name)

Plus identity fields (`stadiumName`, `city`, `country`) that mirror the official
`Venue` records, a per-row `sourceRef`, and `dataStatus: "source-backed"`.

It is a **standalone** snapshot. It is NOT added to `officialDataset`, does NOT
change the `Venue` type, and does NOT touch fixtures, schedule, draw slots, or the
resolver. `venueId` is the join key to `data/official/venues.ts`.

## Sources

| Field | Source |
| --- | --- |
| latitude / longitude | LatLong.net "2026 FIFA World Cup locations" table |
| altitudeMeters | Starting11 World Cup stadium-altitude table |
| timeZone | IANA Time Zone Database names |

Values were transcribed from a **user-supplied venue-geo CSV**
(`venue_geo_template_filled_draft.csv`). Per the project rule, the raw CSV is
**NOT committed**; the per-row `sourceRef` and the `VENUE_GEO_SOURCE` provenance
object carry the citations. No data was scraped or fetched; no live/current
weather was used.

## Rows (16)

| venueId | stadium | city | country | lat | lon | alt (m) | tz |
| --- | --- | --- | --- | --- | --- | --- | --- |
| mexico-city | Estadio Azteca | Mexico City | Mexico | 19.302837 | -99.150803 | 2200 | America/Mexico_City |
| guadalajara | Estadio Akron | Guadalajara | Mexico | 20.681721 | -103.463135 | 1566 | America/Mexico_City |
| monterrey | Estadio BBVA | Monterrey | Mexico | 25.669132 | -100.244621 | 540 | America/Monterrey |
| toronto | BMO Field | Toronto | Canada | 43.633087 | -79.418961 | 76 | America/Toronto |
| vancouver | BC Place | Vancouver | Canada | 49.276646 | -123.112564 | 0 | America/Vancouver |
| new-york | MetLife Stadium | New York / New Jersey | USA | 40.813477 | -74.074951 | 5 | America/New_York |
| los-angeles | SoFi Stadium | Los Angeles | USA | 33.953438 | -118.339447 | 30 | America/Los_Angeles |
| dallas | AT&T Stadium | Dallas | USA | 32.748138 | -97.093231 | 180 | America/Chicago |
| atlanta | Mercedes-Benz Stadium | Atlanta | USA | 33.755371 | -84.401436 | 320 | America/New_York |
| miami | Hard Rock Stadium | Miami | USA | 25.95783 | -80.239326 | 3 | America/New_York |
| houston | NRG Stadium | Houston | USA | 29.684702 | -95.410965 | 15 | America/Chicago |
| kansas-city | Arrowhead Stadium | Kansas City | USA | 39.048855 | -94.484474 | 270 | America/Chicago |
| philadelphia | Lincoln Financial Field | Philadelphia | USA | 39.901325 | -75.167862 | 12 | America/New_York |
| seattle | Lumen Field | Seattle | USA | 47.595135 | -122.331917 | 50 | America/Los_Angeles |
| san-francisco | Levi's Stadium | San Francisco Bay Area | USA | 37.403297 | -121.969765 | 5 | America/Los_Angeles |
| boston | Gillette Stadium | Boston | USA | 42.09079 | -71.264404 | 70 | America/New_York |

## Validation

`lib/data/validate-venue-geo.ts` (`validateVenueGeoSnapshot`) asserts:

- exactly one row per official venue (16), no duplicates, no missing rows;
- finite, in-range latitude (`-90..90`), longitude (`-180..180`),
  altitude (`-500..3000` m);
- a resolvable IANA `timeZone`;
- a per-row `sourceRef` and `dataStatus === "source-backed"`;
- identity fields consistent with the official `Venue` record;
- snapshot-level `VENUE_GEO_SOURCE` is honestly `source-backed` with citation
  metadata;
- **scope guard:** no venue climate-normal fields
  (`monthlyTempC` / `monthlyPrecipMm` / `avgTempC` / `climate`) appear on a row.

## Deferred: venue heat / venue-climate normals

Phase 1.14 intentionally does **not** include `monthlyTempC` or
`monthlyPrecipMm`, and does **not** use the existing `Venue.avgTempC` /
`Venue.climate` placeholders as if they were source-backed. Venue heat exposure
requires a separate, source-backed host-city or venue-level climate-normal
dataset and is deferred. The tournament-context score is built only from travel,
rest, altitude, time-zone shift, and repeated-venue / low-movement benefit; the
`heat` and `venueClimate` sub-metrics are listed as `deferred` on every score.
