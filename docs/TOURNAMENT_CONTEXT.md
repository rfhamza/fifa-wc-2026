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
- **matchAltitudesMeters** - the altitude of each group-stage match (the basis for
  the per-match altitude dose, Phase 1.15A).
- **maxAltitudeMeters / maxAltitudeGainMeters** - peak altitude exposure and the
  largest single-leg climb (kept for the explanation breakdown).
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
| `altitude` | **per-match dose** (see below), mean over matches -> signed | -1..+1 |
| `timeZone` | `0 h -> +1`, `>= 6 h cumulative -> -1` (linear) | -1..+1 |
| `venueContinuity` | repeated-venue fraction, a benefit only | 0..+1 |

### Altitude: per-match dose (Phase 1.15A)

Altitude is **not** a campaign maximum. Each match gets an altitude burden in
`0..1` from its own venue elevation, and the team's altitude sub-score is the mean
burden over its three group-stage matches, mapped to a signed score:

- below `ALTITUDE_LOWER_THRESHOLD_M` (1000 m): burden `0`;
- between the thresholds: linear `0..1`;
- at/above `ALTITUDE_FULL_BURDEN_M` (2200 m, Mexico City level): burden `1`;
- `altitude = 1 - 2 * mean(burden)`.

So **one** high-altitude match out of three yields only a partial penalty
(e.g. a single Mexico City match -> mean burden `1/3` -> `altitude ~= +0.33`), while
a team genuinely playing several matches at altitude still gets a strong penalty.
This replaces the earlier single-match `max`-saturation that drove the negative
tail. The audit confirming this is in `docs/TOURNAMENT_CONTEXT_SCORE_AUDIT.md`.

### Weighted composite (Phase 1.15A)

`composite = weighted mean of the five sub-scores`, using named `COMPOSITE_WEIGHTS`
(travel `1`, rest `1`, altitude `1`, timeZone `0.5`, venueContinuity `0.5`), clamped
to `[-1, +1]`. travel / rest / altitude carry the main signal; `timeZone` (near-inert
across the realised field) and `venueContinuity` (a benefit-only axis that overlaps
travel, since a repeated venue is already a 0 km leg) are **down-weighted but stay
visible** in the per-component breakdown.

`venueContinuity` is a **benefit axis** (never a penalty): a team that never reuses
a venue scores `0` on this axis, not `-1`.

### Skew / interpretation

The realised 48-team composite is **favourability-skewed** (most teams positive;
after the altitude-dose change essentially all positive, since a single altitude
match is no longer punishing). This skew is **documented, not hard-corrected**: a
fixed re-centring was considered and rejected as fragile (it would depend on the
specific draw and change if the draw changed). If model integration is later
approved, it will use **pairwise differences `(a - b)` behind a tight cap**, so the
constant skew cancels and only relative differences between two teams matter.

## Excluded: host / regional advantage (no double-counting)

The score deliberately **excludes** host-nation and regional/confederation
advantage. Those remain entirely in the existing `hostAdvantage` (+60) and
`regionalAdvantage` (+18) drivers in `lib/model/predict.ts`, which are untouched.
tournament-context only measures the **draw-specific logistics** (travel, rest,
altitude, time-zone, venue continuity) of a team's actual three group-stage
matches, so it does not re-count the host/regional edge.

## Deferred: heat / venue-climate

Venue heat and venue-climate normals are **out of scope** this phase (no
source-backed venue climate-normal dataset; the existing `Venue.avgTempC` /
`Venue.climate` placeholders are not treated as sourced, and no live weather is
used). Every `TournamentContextScore` lists `["heat", "venueClimate"]` in its
`deferred` field, and the composite excludes them.

## Status: candidate, unwired

The score is a **candidate** heuristic (calibration deferred) and is **not wired
into the prediction model**. Future model integration (e.g. a capped
`tournamentContext` candidate driver) **requires separate approval** and is not
part of this phase.

## What this phase does NOT do

- No model wiring: nothing under `lib/model/*` imports `lib/tournament-context/*`
  (a test guards this).
- No change to probabilities, model weights, fixtures, bracket, schedule, draw
  slots, the Elo / FIFA / structural / climate snapshots, host/regional logic, or
  global navigation.
