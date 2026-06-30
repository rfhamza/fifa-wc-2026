# Live-State Operations Runbook

Operational guide for keeping production `/live` correct. Companion to
`docs/LIVE_STATE.md` (the contract) and `docs/LIVE_DATA_STORAGE_AND_SCHEDULER_DECISION.md`
(the architecture decisions). For the downstream forecast Blob objects refreshed in
the same workflow run, see `docs/FORECAST_REFRESH_RUNBOOK.md`.

## How serving works (read this first)

`/api/live-state` serves the **stored Blob projection as-is**. It does **not**
re-derive standings/bracket at request time — the `standings` and `bracket` in the
response were computed by the live-state write job when it wrote the Blob.

**Consequence:** merging live-state derivation code (e.g. `lib/live-state/derive.ts`,
`lib/live-state/ingest.ts`) does **not** rewrite the existing Blob object. The route
keeps serving the previously-baked projection until the write workflow runs again.

**The rule:** after any live-state derivation change, the live-state write workflow
must run **on latest `main`**, then the production smoke check must pass. **The
workflow run's commit matters** — a run on an old commit bakes old derivation.

## Required production env (Vercel)

```text
LIVE_STATE_SOURCE=blob
LIVE_STATE_BLOB_OBJECT_PATH=live-state.provider.sanitized.json
LIVE_STATE_ALLOW_PROVIDER_DERIVED_PUBLIC=true
```

`BLOB_READ_WRITE_TOKEN` (server) and `FOOTBALL_DATA_TOKEN` (CI) are secrets — never
expose, log, or commit them. Do not change these as part of a derivation PR.

## Operator workflow after a live-state derivation change

1. Merge the derivation PR to `main`; wait for `main` (and Vercel, if route code
   changed — note derivation-only changes do not require a redeploy because the
   route is unchanged and serves the Blob as-is).
2. Run the live-state write workflow **on `main`**: GitHub → Actions →
   **`live-state-write-blob-scheduled`** → *Run workflow* → branch `main`
   (it hardcodes `--source football-data --object-path live-state.provider.sanitized.json`
   and a manual dispatch bypasses the `LIVE_STATE_SCHEDULER_ENABLED` kill-switch),
   or wait for the next scheduled run on `main`.
   - The GitHub MCP integration cannot dispatch workflows (HTTP 403); dispatch from
     the Actions UI or use a token with `actions: write`.
3. Confirm the run wrote the provider object: the job log shows
   `WROTE live-state.provider.sanitized.json (matches=…, isProviderDerived=true)`.
4. Run the production smoke check:

   ```bash
   LIVE_STATE_URL=https://<prod-host>/api/live-state npm run live:state:smoke
   ```

   Expect exit `0` and (post-group stage) third-place `8 qualified / 4 eliminated /
   0 undecided`, R32 `16 resolved / 0 partial / 0 unresolved`, `servedFrom=blob`,
   `sourceObjectPath=live-state.provider.sanitized.json`, `providerDerivedBlocked=false`,
   leak scan clean.
5. Visually check `/live`.

## Smoke check reference

```bash
# default post-group invariants
LIVE_STATE_URL=https://<prod-host>/api/live-state npm run live:state:smoke
# or
npm run live:state:smoke -- --url https://<prod-host>/api/live-state

# structural-only (shape + serving + leak; no phase-specific counts) — for other phases
npm run live:state:smoke -- --url <url> --phase structural

# warn if asOf/generatedAt older than N hours (default 24; warning only, never fails)
npm run live:state:smoke -- --url <url> --max-age-hours 24
```

- Exit `0` = all assertions passed; exit `1` = at least one failed (failing checks
  printed first).
- `--phase post-group` asserts the post-group-stage invariants (8/4/0 + 16/0/0).
  Failure output explicitly labels these as **post-group-stage invariants**.
- Stale freshness and over-age `asOf`/`generatedAt` produce **warnings, not
  failures**.
- `unresolvedTies` is internal to the derivation (not exposed by `/api/live-state`);
  its fail-safe behaviour is covered by `tests/live-state-unresolved-knockout.test.ts`,
  and the API-visible invariant is R32 `unresolved = 0` / `partial = 0`.
- The script reads only the public app URL — no football-data fetch, no Blob access,
  no tokens.

## Common failure modes

| Symptom | Likely cause | Action |
| --- | --- | --- |
| `/live` shows stale third-place/R32 after a derivation merge | Blob not regenerated on new `main` | Run the write workflow on `main`, then re-run the smoke check |
| Smoke check `servedFrom != blob` | env not set / Blob read failed | Verify the three env flags; check the route's `serving.fallbackReason` |
| Smoke check `providerDerivedBlocked = true` | `LIVE_STATE_ALLOW_PROVIDER_DERIVED_PUBLIC` not `true` | Set the env flag |
| Write workflow "blocked" (no write) | unmapped team/knockout or validation failure | Inspect the run log; last-known-good Blob is preserved |
