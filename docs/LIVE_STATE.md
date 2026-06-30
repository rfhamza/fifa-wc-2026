# Live tournament state — contract & freshness governance (Phase 1.25B)

> **Operations:** see `docs/LIVE_STATE_RUNBOOK.md` for the operator runbook —
> regenerating the Blob after a derivation change (the route serves the stored
> projection as-is), the required production env flags, and the `live:state:smoke`
> production smoke check.

> **Data-layer foundation only.** This is the first live-2026 ingestion layer:
> fixtures, results, match status, group standings, bracket progression, and data
> freshness/fallback. It is **not** in-play prediction, **not** model tuning, and it
> changes **no** model behaviour. There is **no API, no scraping, no UI, and no
> probability refresh** in this phase. Calibration remains **NO-GO**.

## What this layer answers

Which matches have been played, the latest results, the current group standings, who
has qualified/been eliminated (only when safely derivable), how the bracket is
progressing, and **how fresh** the data is (fresh / stale / fallback / missing /
invalid).

## Contract (`lib/live-state/types.ts`)

Standalone, type-only at runtime. Key entities: `LiveTournamentState` (top level),
`LiveMatchState`, `LiveGroupStanding`, `LiveBracketState` / `LiveBracketMatch`,
`LiveDataFreshness`, `LiveIngestionSource`, and the raw input shapes `RawLiveSnapshot`
/ `RawLiveMatch`.

**Status naming** aligns with the existing `FixtureStatus`: `scheduled` ·
`in-progress` · `complete` · `postponed` · `cancelled` · `unknown`. We deliberately
use `in-progress` rather than an ambiguous `live`; an external feed's `live` is
**adapter-mapped** to `in-progress`. No in-play event fields exist
(no lineups/injuries/xG/shots/cards/subs).

## Source strategy — manual snapshot first, API later

Manual JSON/snapshot-style input is the only source this phase
(`Option C` from the 1.25A plan). A future API adapter would map an external feed into
the **same** `RawLiveSnapshot` contract — no consumer changes. No API call and no
scraping exist now; sample snapshots live under `tests/fixtures/live-state/`.

**API ingestion (Phase 1.26B):** a provider-agnostic adapter boundary
(`lib/live-ingest/*`) normalizes a provider feed into this same `RawLiveSnapshot`
contract (matchNumber canonical; provider ids provenance-only; provider
standings/bracket comparison-only). It is a mock-only boundary — no real API/network —
see `docs/LIVE_API_INGESTION_PLAN.md`. Provider selection follows a **free-first**
strategy recorded in `docs/LIVE_API_PROVIDER_DECISION.md` (Phase 1.27B).

**Real snapshot (Phase 1.25C):** the first real source-backed case — a manual
current-results snapshot (48 completed group-stage matches) — is validated as a manual
snapshot in `tests/live-state-current-snapshot.test.ts`
(`tests/fixtures/live-state/current-results-snapshot.ts`). It keys matches by the
official `matchNumber` (`M{n}`), keeping the provider's feed id as provenance only.
Group standings are **derived from those results** through the live-state path and only
**compared** against the supplied standings file
(`current-standings-expected.ts`) for core fields — the uploaded standings are never
treated as the source of truth, and Article-13 deep-tie differences are flagged, not
forced.

## Pipeline: results → standings → bracket

1. **Ingest** a manual snapshot (`ingestLiveSnapshot`, `lib/live-state/ingest.ts`).
2. **Validate** every row against the official static reference built from `lib/data`
   + the official bracket (`buildOfficialReference`): known match id, valid team ids,
   stage/group consistency, score/status integrity, knockout winner/penalty integrity.
   Validation **never throws and never silently drops** — every exclusion is a fatal
   error (`freshnessStatus: "invalid"`) and every concern is a warning.
3. **Derive group standings** from completed group results by **reusing**
   `computeGroupStandings` (FIFA Article 13) read-only. Standings are derived, never
   trusted as supplied.
4. **Derive qualification** only when safe: a complete group marks ranks 1–2
   `qualified` and rank 4 `eliminated`; rank 3 stays `undecided` (cross-group
   best-third race). No full clinch/elimination maths in this phase.
5. **Derive bracket progression** by walking the official knockout graph read-only:
   completed knockout winners propagate through `matchWinner`/`matchLoser` edges;
   group-position slots resolve from completed groups; third-place slots are deferred.
   Unresolved slots stay unresolved; ties are **flagged, never force-decided**.
   `realiseBracketFromResults` is a thin read-only delegation to the existing
   `realiseOfficialBracket` for the fully-decided case.

## Freshness & fallback rules

Every state carries `asOf`, `generatedAt`, and the source's `lastUpdatedAt`. Per-item
freshness: `fresh` (within the window) · `stale` (older, still served + labelled) ·
`fallback` (serving a prior good snapshot, **always with a reason**) · `missing`
(expected but absent) · `invalid` (failed validation; excluded). The overall status is
the worst across sections (precedence `invalid > missing > fallback > stale > fresh`).
**No silent fallback** — a fallback always sets `fallbackReason`.

## Explicit non-goals (this phase)

No API integration; no scraping; no in-play prediction; no lineups/injuries/xG/
shots/cards/substitutions; no probability refresh; no model-weight, `prediction-core`,
`predict`, `features`, or simulator-behaviour changes; no calibration; no temperature
scaling; no tuning; no UI/routes; no generated artifacts; no public metric numbers.
Isolation is enforced by `tests/live-state-isolation.test.ts`: no production module
imports `lib/live-state/*`.
