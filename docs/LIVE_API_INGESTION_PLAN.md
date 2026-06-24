# Live API ingestion plan (Phase 1.26)

> **Planning + adapter boundary only.** Phase 1.26B adds a **provider-agnostic**
> adapter boundary (`lib/live-ingest/*`) with a **mock** provider and tests. There is
> **no real API, no network, no scraping, no cron, no storage, no secrets, no UI, and
> no probability refresh**. The manual snapshot remains the fallback/audit path.

## Goal

Remove the manual source-pack step by feeding an external feed into the **existing**
`RawLiveSnapshot` contract — without coupling the app to any provider's schema. The app
keeps depending only on `LiveTournamentState`.

Flow: `provider payload → normalize() → RawLiveSnapshot → validateLiveSnapshot /
ingestLiveSnapshot → LiveTournamentState`.

## Source evaluation criteria

Score candidate **source types** (not a chosen vendor). **Gating** criteria (a fail
disqualifies): legality / terms-of-use **for our use incl. public display**;
reliability under live WC load; ability to map to official **FIFA match numbers**;
stable team identity. **Scored**: 104-match coverage; group + knockout results;
penalties / ET winner; status granularity; stable provider ids; team/venue naming;
kickoff + time zone; last-updated/as-of; rate limits; auth/key model; cost; uptime/SLA;
latency/cadence; correction support; JSON stability; licensing for public display;
deployability (Vercel/GH Actions). **Accessible ≠ allowed.**

## Provider gating rules

> The approved provider strategy is **free-first**, with per-provider status, the
> confirmation checklist, and paid-upgrade triggers recorded in
> `docs/LIVE_API_PROVIDER_DECISION.md` (Phase 1.27B).

- Confirm **terms-of-use / licence** (including public display + redistribution)
  **before** any real adapter. No provider is wired on accessibility alone.
- **Official FIFA feed** — *preferred* source, **only if** licensed/allowed.
- **Paid sports-data API** — strong candidate **if** terms + cost are accepted.
- **Free/community API** — **pilot / cross-check only**; verify ToU + reliability.
- **Direct scraping / HTML extraction** — **rejected** unless separately approved
  (legal + brittleness risk).

## Provider-agnostic adapter boundary (`lib/live-ingest/*`)

```
interface LiveProviderAdapter<TRaw> {
  source: LiveIngestionSource;       // sourceType "api" | "external"
  fetchRaw(): Promise<TRaw>;         // ONLY place a real adapter does network I/O
  normalize(raw): NormalizedResult;  // pure: snapshot + provenance + comparison + errors
}
```

- Provider-specific code is isolated; internal code depends on `LiveTournamentState`.
- `matchNumber` is canonical (`matchId="M{n}"`); **provider ids are provenance-only**.
- **Provider standings/bracket are comparison-only** (the app derives both from
  results); never source of truth.
- Unknown/ambiguous rows **fail closed** (excluded + recorded in `errors`).

## Match / team / venue mapping strategy

- **Match:** canonical key from the official `matchNumber`; the provider's native id is
  kept only in provenance. When a provider lacks the official number, resolve it from
  (group + unordered team pair + matchday).
- **Team:** map by **NAME** via an explicit alias table — **not** by code (codes mix
  IOC/FIFA/ISO, e.g. `IRI`/`IRN`, `DZA`/`ALG`). Aliases cover variants (`Turkey`→
  `turkiye`, `DR Congo`→`congo-dr`, `Bosnia and Herzegovina`→`bosnia-herzegovina`,
  `United States`→`usa`, …). **Fail closed** on unknown.
- **Status:** alias map; a feed's `live` → internal **`in-progress`**.
- **Venue:** explicit alias table; **provenance-only** (the snapshot omits `venueId`).
- **Timestamps:** normalize to **UTC ISO-8601**.

## Freshness, fallback & correction policy

Reuses the live-state freshness model (`fresh / stale / fallback / missing / invalid`).
- **Cadence:** a few minutes around active windows (tighter near kickoffs); off-window
  slower. Concrete values set when source + architecture are chosen.
- **Stale threshold:** tunable `staleAfterSeconds` per stage.
- **Fallback ladder (never silent; always a reason):** latest validated API state →
  last-known-good validated state → manual snapshot.
- **Invalid** payloads are rejected (not served); the prior good state is retained.
- **Corrections:** re-ingest produces a new validated state; under committed-snapshot
  automation the git diff is the correction audit trail.
- Any future surfaced live state must show **`asOf`** + freshness.

## Recommended automation architecture (future; not in this phase)

- **First automation:** a **GitHub Actions scheduled job** that fetches the feed →
  `normalize()` → `ingestLiveSnapshot()` (validate) → **commit a validated JSON
  snapshot** (generated artifact) → redeploy. Lowest ops; secrets via GH; git history =
  auditable state history + replay; rollback = revert. Mitigate commit noise with a
  dedicated path/branch and skip-if-unchanged.
- **Upgrade path:** **Vercel Cron + serverless endpoint + KV/Blob** when sub-build
  latency is needed; later Supabase/Postgres for richer history. No client-side
  provider calls, ever.

## Security & secrets principles

- API keys live in **server-only** env / **CI secrets**; never `NEXT_PUBLIC_*`.
- **No client-side provider calls** (no key/CORS/rate-limit exposure).
- `fetchRaw()` is the only networked unit; everything downstream is pure + offline-
  testable. Rate-limit/back-off; safe error handling; never log raw secrets/payload
  tokens. Under the GH-Actions-first plan the deployed app needs **no** new runtime
  secret.

## Non-goals (this phase)

No real API/network/fetch; no scraping; no client-side provider calls; no API routes;
no cron/scheduled jobs; no storage/KV/Blob/DB/S3; no env vars/secrets; no generated
artifacts; no UI; no probability refresh; no model/prediction-core/simulator/live-state
runtime changes; no calibration/tuning; no in-play prediction or in-play event fields.
Manual snapshot remains the fallback/audit path.
