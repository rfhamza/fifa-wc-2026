# Tournament Context (Phase 1.14) - method

A pure, signed `-1..+1` tournament-context score for each team's group-stage
itinerary. **Not wired into the prediction model** in this phase: it changes no
probabilities and no model weights. It exists as an explainable, independently
testable seam (`lib/tournament-context/`) that a later, approved phase can
calibrate and wire in.

## Pipeline

```
venue-geo snapshot (source-backed)        resolved group-stage fixtures
   data/model-inputs/snapshots/venue-geo-2026.ts    lib/data
                 \                                   /
                  v                                 v
            lib/tournament-context/itineraries.ts (deriveItineraries)
                              |
                              v   ordered stops per team (venue in time)
            lib/tournament-context/metrics.ts (computeItineraryMetrics)
                              |
                              v   raw travel / rest / altitude / tz / continuity
            lib/tournament-context/score.ts (scoreItineraryMetrics)
                              |
                              v
              signed -1..+1 sub-scores + composite (TournamentContextScore)
```

Everything is pure and deterministic. The IANA time-zone offset
(`tzOffsetHours`) uses the built-in `Intl` time-zone database - no network and no
live data.

## Itineraries

For each team, `deriveItineraries` collects its group-stage fixtures (read-only,
from the already-resolved official schedule), orders them by `(matchday,
kickoff)`, and resolves each stop's venue to the source-backed venue-geo row.
Every team has exactly 3 group-stage stops. The derivation never mutates
fixtures, schedule, or draw slots.

## Metrics (raw)

`computeItineraryMetrics` turns an ordered itinerary (N stops -> N-1 legs) into:

- **totalTravelKm / maxLegKm** - great-circle (haversine) distance between
  consecutive venues.
- **restGapsDays / minRestDays** - days between consecutive matches.
- **maxAltitudeMeters / maxAltitudeGainMeters** - altitude exposure and the
  largest single-leg climb.
- **totalTimeZoneShiftHours / maxTimeZoneShiftHours** - sum / max of absolute
  IANA offset changes between consecutive stops (evaluated at each stop's own
  date, so DST is handled).
- **repeatedVenueLegs / repeatedVenueFraction** - zero-movement legs (same
  stadium back-to-back).

## Signed score (`-1..+1`, positive = favourable)

`scoreItineraryMetrics` maps the raw metrics onto five sub-scores. The constants
are **documented candidate heuristics** (calibration deferred), chosen against
realistic 2026 group-stage ranges:

| Sub-score | Rule | Range |
| --- | --- | --- |
| `travel` | `0 km -> +1`, `>= 8000 km -> -1` (linear) | -1..+1 |
| `rest` | `<= 3 days -> -1`, `>= 6 days -> +1` (linear); no legs -> +1 | -1..+1 |
| `altitude` | `sea level -> +1`, `>= 2200 m -> -1` (linear) | -1..+1 |
| `timeZone` | `0 h -> +1`, `>= 6 h cumulative -> -1` (linear) | -1..+1 |
| `venueContinuity` | repeated-venue fraction, a benefit only | 0..+1 |

`composite = mean(travel, rest, altitude, timeZone, venueContinuity)`, clamped to
`[-1, +1]`.

`venueContinuity` is a **benefit axis** (never a penalty), per the
"repeated-venue / low-movement benefit" framing: a team that never reuses a venue
scores `0` on this axis, not `-1`.

## Deferred: heat / venue-climate

Venue heat and venue-climate normals are **out of scope** this phase (no
source-backed venue climate-normal dataset; the existing `Venue.avgTempC` /
`Venue.climate` placeholders are not treated as sourced, and no live weather is
used). Every `TournamentContextScore` lists `["heat", "venueClimate"]` in its
`deferred` field, and the composite excludes them.

## What this phase does NOT do

- No model wiring: nothing under `lib/model/*` imports `lib/tournament-context/*`
  (a test guards this).
- No change to probabilities, model weights, fixtures, bracket, schedule, draw
  slots, the Elo / FIFA / structural / climate snapshots, host/regional logic, or
  global navigation.
