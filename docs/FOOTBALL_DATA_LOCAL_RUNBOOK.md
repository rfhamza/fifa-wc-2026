# football-data.org local runbook (Phase 1.28E)

> **Docs-only operator runbook.** How a maintainer safely runs the **local-only**
> football-data.org check merged in Phase 1.28C (PR #52). This doc adds **no code, no
> script, no test, no GitHub Actions, no secret, no env file, no cron, no storage, no
> UI, no probability refresh, no model/calibration change**. It does **not** run a real
> fetch. The manual snapshot remains the fallback/audit path.

Related: [`LIVE_STATE.md`](./LIVE_STATE.md) ·
[`LIVE_API_INGESTION_PLAN.md`](./LIVE_API_INGESTION_PLAN.md) ·
[`LIVE_API_PROVIDER_DECISION.md`](./LIVE_API_PROVIDER_DECISION.md).

---

## 1. Purpose

The local check validates WC 2026 data ingestion **end-to-end** against the real
football-data.org feed:

```
football-data.org  ->  local fetch script (scripts/football-data-org/run.ts)
  ->  football-data.org adapter (lib/live-ingest/football-data-org/normalize)
  ->  canonical M{n} mapping
  ->  live-state ingestion (lib/live-state/ingest -> ingestLiveSnapshot)
  ->  internally derived standings / bracket (Article 13)
  ->  private, git-ignored artifacts (artifacts/football-data-org/)
```

It exists so a maintainer can confirm, on demand, that the provider feed still parses,
maps, normalizes, and validates cleanly before anything is automated.

It is **not**:

- not production automation,
- not a scheduled process,
- not a public data-publication flow,
- not a probability or UI update (it changes no model output and renders nothing).

---

## 2. Security prerequisites

- **Regenerate the token** before use if it was ever pasted or exposed (the original
  was pasted in chat and must be treated as compromised).
- Use **only** the `FOOTBALL_DATA_TOKEN` environment variable.
- **Never** use a `NEXT_PUBLIC_*` name — that would ship the token to the client bundle.
- **Never** commit tokens.
- **Never** paste the token into ChatGPT, Claude, GitHub issues, PR comments, logs,
  screenshots, or docs.
- **Never** place the token in a query string.
- The token is sent **only** via the `X-Auth-Token` request header.
- Treat `X-Authenticated-Client` as potentially **account-identifying** and **redact it**
  from any shared summary. (The script never reads or echoes it.)

---

## 3. Local run command

```bash
export FOOTBALL_DATA_TOKEN="your-regenerated-token"
npm run live:football-data:check
```

Supported flags (passed after `--`), as implemented in
`scripts/football-data-org/live-state-fetch.ts`:

| Flag | Effect |
|---|---|
| `--summary-only` | Fetch + normalize + validate, print the summary, **write no artifacts**. |
| `--dry-run` | Same write-suppression as `--summary-only` (no files written). |
| `--no-standings` | Skip the optional standings call (one request only). |
| `--out <dir>` | Override the output directory (default `artifacts/football-data-org/`). Keep it under an ignored path. |
| `--partial` | Do **not** assert the full 104-match tournament feed (for partial/early feeds). |

Examples:

```bash
# real fetch, validate, print summary, write nothing to disk:
npm run live:football-data:check -- --summary-only

# matches only (single request), no standings:
npm run live:football-data:check -- --no-standings
```

If `FOOTBALL_DATA_TOKEN` is unset, the script fails safe (exit code 1) and makes **no
network call**.

### 3b. Local reconciliation reporter (Phase 1.28I)

A separate **local-only** reporter cross-checks a user-supplied current-results CSV
against the internal Article 13 derivation, audits Round-of-32 bracket activation
(e.g. **M73 = 2A vs 2B → South Africa vs Canada**), and can optionally compare against a
football-data.org live-state artifact or a local `--fetch`:

```bash
# CSV-only reconciliation (no network, no token):
npm run live:football-data:reconcile -- \
  --results-csv ./wc2026-current-results.csv \
  --standings-csv ./wc2026-current-group-standings.csv --summary-only

# also compare against an existing local fetch artifact:
npm run live:football-data:reconcile -- --results-csv ./results.csv \
  --fd-artifact artifacts/football-data-org/live-state.json
```

Flags: `--results-csv <path>` (required), `--standings-csv <path>`, `--fd-artifact <path>`,
`--fetch` (local-only, reuses `FOOTBALL_DATA_TOKEN`), `--out <ignored-dir>`,
`--summary-only`. The CSVs are **local reconciliation inputs only** — never commit them,
the FD artifacts, or `reconcile-summary.json` (all under the git-ignored
`artifacts/football-data-org/`). Provider/CSV standings stay **comparison-only**; the
internal derivation is authoritative.

### 3c. Public-safe live-state projection + read-path spike (Phase 1.28K)

A sanitized **public-safe** projection of the internal `LiveTournamentState` lives in
`lib/live-state/public-safe.ts` (`toPublicSafeLiveState`, types `PublicSafeLiveState`
etc.). It carries only canonical `M{n}`/app-team-id data + derived standings/bracket +
attribution/freshness/validation metadata, and **excludes** provider ids, raw
payloads/headers, account identity, provider standings, odds/referees/events, and crests.

The read path (`lib/live-state/public-safe-source.ts` + the isolated scaffold route
`app/api/live-state/route.ts`) reads the **committed app-safe fixture**
`data/live/public-safe-sample.json` through a repointable `PublicSafeSource` seam (swap
to private storage later) with a safe fallback. **Governance:** that fixture is derived
from the **manual FIFA snapshot, not football-data.org** (`isProviderDerived: false`,
`publicSourcePolicy: "manual-snapshot"`); provider-derived state stays private until the
publication/ToU phase. No scheduler, storage vendor, network, or token is involved.

### 3d. Manual private-Blob write-path spike (Phase 1.28M)

A **manual-only** writer persists the sanitized `PublicSafeLiveState` to a **private**
Vercel Blob object via the adapter `lib/live-state/public-safe-blob-store.ts`
(`putPublicSafeLiveStateToBlob` / `getPublicSafeLiveStateFromBlob`, default object
`live-state.sanitized.json`, `access: "private"`). The adapter is a mockable seam; the
real Vercel Blob SDK (`@vercel/blob`) is loaded lazily, server-side only.

Run (maintainer/CI; **never scheduled**):

```bash
# Mode 1 - write the manual/FIFA fixture (no provider data):
BLOB_READ_WRITE_TOKEN=*** npm run live:state:write-blob -- --source fixture
# Validate + gate only (no write):
BLOB_READ_WRITE_TOKEN=*** npm run live:state:write-blob -- --source fixture --dry-run
# Mode 2 - provider-derived sanitized write (stays PRIVATE/deferred):
FOOTBALL_DATA_TOKEN=*** BLOB_READ_WRITE_TOKEN=*** \
  npm run live:state:write-blob -- --source football-data
```

**Governance / security:** raw football-data.org payloads are **never** written to Blob
(provider mode fetches in `--dry-run` mode so raw stays ephemeral in memory) and never
committed. Validation gates the write (provider mode blocks on fetch failure, unmapped/
unknown teams, or validation warnings). Tokens (`BLOB_READ_WRITE_TOKEN`,
`FOOTBALL_DATA_TOKEN`) are read from env only, never logged, never written; private Blob
URLs are never printed. The manual GitHub workflow is
`.github/workflows/live-state-write-blob-manual.yml` (`workflow_dispatch` only,
`permissions: contents: read`, no schedule, no artifact upload, default `source=fixture`).

**App read path:** `/api/live-state` can be repointed to the private Blob via server env
`LIVE_STATE_SOURCE=blob` (default `fixture`). **Provider-derived state is never served
publicly by default:** if the Blob holds `isProviderDerived: true` and
`LIVE_STATE_ALLOW_PROVIDER_DERIVED_PUBLIC` is not `true`, the route returns the manual
fixture fallback. Blob read failures also fall back to the fixture. The private Blob
object path is configurable via `LIVE_STATE_BLOB_OBJECT_PATH` (default
`live-state.sanitized.json`; e.g. `live-state.provider.sanitized.json` for private
provider testing).

### 3e. Read-source observability metadata (Phase 1.28N)

`/api/live-state` adds an **additive** top-level `serving` block (all existing
`PublicSafeLiveState` fields are unchanged) so you can verify the read source safely:

```jsonc
"serving": {
  "servedFrom": "blob" | "fixture" | "fixture-fallback",
  "providerDerivedBlocked": false,
  "fallbackReason": "blob-read-failed" | "provider-derived-public-blocked"
                  | "invalid-blob-state" | "missing-blob-token", // only on a fixture-fallback
  "sourceObjectPath": "live-state.sanitized.json"  // object pathname only; present when Blob was attempted
}
```

`fallbackReason` is a **fixed enum** (raw Blob SDK errors are never surfaced) and
`sourceObjectPath` is an object **pathname, never a URL**. The block carries no token,
private Blob URL, header/account data, provider ids, or raw payloads.

### 3f. Scheduled private provider ingestion (Phase 1.28O)

A scheduled workflow `.github/workflows/live-state-write-blob-scheduled.yml` automates the
**provider** write. It runs on a conservative cadence and on manual dispatch:

- **Cadence:** `cron: "7,37 * * * *"` (every 30 min, UTC, best-effort). 1-5 min cadence is
  NOT implemented (future Tier 3, gated).
- **Provider object only:** it always runs
  `npm run live:state:write-blob -- --source football-data --object-path live-state.provider.sanitized.json`
  (path + source are hard-coded, not inputs). It **never** writes the public/manual object
  `live-state.sanitized.json`.
- **Disabled by default:** scheduled runs **no-op** unless the repo **Variable**
  `LIVE_STATE_SCHEDULER_ENABLED == "true"`. `workflow_dispatch` always runs (for
  verification), even when the variable is false.
- **Enable:** repo Settings -> Secrets and variables -> Actions -> Variables -> set
  `LIVE_STATE_SCHEDULER_ENABLED = true`.
- **Disable / rollback:** set `LIVE_STATE_SCHEDULER_ENABLED = false` (or unset); or Actions
  UI -> the workflow -> "Disable workflow"; or revert the PR. Disabling does not affect the
  public endpoint - the provider object just stops updating and keeps last-known-good.
- **Provider-derived stays private:** this phase does **not** serve provider-derived state
  publicly. `LIVE_STATE_ALLOW_PROVIDER_DERIVED_PUBLIC` stays `false`; the public endpoint
  keeps serving the manual snapshot.
- **Verify after merge:** trigger the scheduled workflow via `workflow_dispatch` (UI or
  `gh workflow run live-state-write-blob-scheduled.yml`); confirm the run log shows
  `WROTE live-state.provider.sanitized.json (... isProviderDerived=true)` and exit 0 with
  no token/URL/raw-payload output; then confirm the public `/api/live-state` is unchanged
  (`isProviderDerived=false`, `servedFrom=blob`, `sourceObjectPath=live-state.sanitized.json`).
- Hygiene matches the manual workflow: `permissions: contents: read`, no schedule on
  push/PR, no artifact upload, no commit, tokens only as step env (never echoed),
  `timeout-minutes: 10`, concurrency `cancel-in-progress: false`.

**Route hardening (Phase 1.28O):** `/api/live-state` is now `dynamic = "force-dynamic"`,
`revalidate = 0`, and responds with `Cache-Control: no-store, max-age=0`. Each request
reads the **current** private Blob, so scheduled Blob writes are reflected **without a
redeploy** and without ISR staleness (the route is function-backed, not static).

### 3g. Public-provider release gate (Phase 1.28P)

Prepares the controlled switch to publicly serving the provider-derived object. **This is
code/labelling preparation only** - no Vercel env change is made by this phase.

**Policy rename / labelling.** `PublicSourcePolicy` now includes `provider-public-delayed`
(provider-derived, public-safe, but delayed/stale-labelled). The legacy
`provider-private-deferred` value is **retained for backward-compat** with historical Blob
objects but is **no longer emitted** by the writer. Provider attribution is now public/ToU
safe: *"Football data provided by the Football-Data.org API. Group standings and the
knockout bracket are derived internally using FIFA Article 13 rules. Data may be delayed."*
(no "private"/"deferred" wording).

**A scheduler re-run is required after merge.** The provider object already in Blob still
carries the old `provider-private-deferred` policy and private/deferred attribution. Before
flipping the env, re-run the scheduled writer once (`workflow_dispatch` on
`live-state-write-blob-scheduled.yml`) so `live-state.provider.sanitized.json` is rewritten
by the NEW code. Confirm the run log:
`WROTE live-state.provider.sanitized.json (matches=72, isProviderDerived=true)`, exit 0, no
token/URL/raw-payload.

**Pre-env-switch verification.** Confirm (maintainer-side) the refreshed provider object has
`publicSourcePolicy: "provider-public-delayed"` and the public attribution; confirm the
public object `live-state.sanitized.json` is untouched (rollback target).

**Vercel env values for the eventual switch (Production):**
- `LIVE_STATE_BLOB_OBJECT_PATH = live-state.provider.sanitized.json`
- `LIVE_STATE_ALLOW_PROVIDER_DERIVED_PUBLIC = true`
- keep `LIVE_STATE_SOURCE = blob`
- keep `BLOB_READ_WRITE_TOKEN`

**Redeploy is required** after the env change (Vercel injects env at deploy time; dashboard
edits do not affect running deployments).

**Expected public `/api/live-state` after the switch:**
`serving.servedFrom=blob`, `serving.sourceObjectPath=live-state.provider.sanitized.json`,
`serving.providerDerivedBlocked=false`, `isProviderDerived=true`,
`publicSourcePolicy=provider-public-delayed`, `matches.length=72`, `freshness=stale`,
`status=stale`, response `Cache-Control: no-store, max-age=0`.

**Rollback (env-only + redeploy):** set `LIVE_STATE_ALLOW_PROVIDER_DERIVED_PUBLIC = false`
and/or `LIVE_STATE_BLOB_OBJECT_PATH = live-state.sanitized.json`, then redeploy. The public
object `live-state.sanitized.json` remains untouched, and the scheduled workflow keeps
writing **only** the provider object - so the manual snapshot is always a clean
last-known-good.

---

## 4. Expected healthy output

A clean full-tournament run currently looks like the shape below. Treat played/finished
counts as **examples that change as the tournament progresses** — do not hardcode them.

- Matches HTTP status: `200`
- Standings HTTP status: `200` (if standings were fetched)
- Competition: `WC` / `FIFA World Cup`
- `resultSet.count`: `104`
- `matchesReceived`: `104`
- Stage counts sum to `104`:
  - `GROUP_STAGE`: `72`
  - knockout stages total: `32` (`LAST_32` 16 + `LAST_16` 8 + `QUARTER_FINALS` 4 +
    `SEMI_FINALS` 2 + `THIRD_PLACE` 1 + `FINAL` 1)
- `TIMED`: expected for future fixtures (maps to internal **scheduled**).
- `FINISHED`: changes over time as matches are played (e.g. an example run showed
  `FINISHED: 54` / `TIMED: 50` — these will drift).
- `mapped group-stage matches`: `72`.
- `unresolved-knockout`: **expected** while knockout participants are unresolved.
- `unmapped` / unknown: should be `0`.
- `validation warnings`: should be `0` for a clean run.
- Provider standings: **comparison-only** (e.g. `48` rows for the single overall table).
- Internal standings: **derived from results** (Article 13), not from the provider.

---

## 5. Edge-case interpretation

| Signal | Interpretation | Class |
|---|---|---|
| `unresolved-knockout: N` | Knockout fixtures with **both** sides undetermined; the adapter excludes them from `M{n}` and reports the count. | **Expected** while knockout teams are unresolved |
| `partially-resolved-knockout: N` | Knockout fixtures with **one** side determined and the other still a null-id TBD placeholder (groups finishing at different times); excluded as a shell, **not** an unknown team. | **Expected** while knockout teams are partially resolved (added in Phase 1.28G) |
| `X-RequestsAvailable: null` | The free tier did not return the budget header; the standings rate-limit skip is inert when this is null. | **Non-blocking; monitor.** Script must handle the missing optional header. |
| `freshnessOverall: stale` | The free/delayed feed lags real time. | **Expected**; not a blocker for delayed snapshots. **Do not call this true live.** |
| provider standings rows `48` | Single overall 48-team table (`group: null`). | **Expected**; comparison-only |
| `TIMED` future fixtures | Scheduled matches not yet played. | **Expected**; maps to scheduled |
| `unmapped > 0` (e.g. `unknown-team`) | A team/match could not be mapped to canonical `M{n}`. After Phase 1.28G, `unknown-team` means a side with a **real provider id** whose name needs an alias (a true TBD slot is reported as `partially-resolved-knockout` instead). If you see `unknown-team`, share the minimized sanitized match objects (id/utcDate/status/stage/group/home+awayTeam id+name+shortName+tla) so an alias can be added — never the token, headers, or full payload. | **Investigate / potential blocker** |
| validation warnings / errors `> 0` | Internal ingestion flagged something. | **Investigate / potential blocker** |
| `resultSet.count` != `104` | Feed is not the full tournament. | **Blocker** for full-tournament validation (use `--partial` only when intentionally checking a partial feed) |

The app must **not** claim true live minute-by-minute scoring on the free/delayed tier;
that requires the paid live-score tier.

---

## 6. Artifact policy

Generated files are **local-only** and **git-ignored**. Default folder:

```
artifacts/football-data-org/
```

Possible files:

- `summary.json` — sanitized, redacted summary (safest artifact).
- `live-state.json` — provider-derived normalized state.
- `standings.raw.json` — raw provider standings payload.
- `matches.raw.json` — raw provider matches payload.

Rules:

- **Do not** commit these files.
- **Do not** paste raw payloads anywhere.
- **Do not** upload raw payloads publicly.
- **Do not** attach raw provider artifacts to GitHub PRs/issues.
- Share **only** the sanitized console summary or a sanitized `summary.json` — with
  **no token**, **no raw headers carrying account identity**, **no full match payload**,
  and **no full standings payload**.

To run without writing any files at all, use `--summary-only` (or `--dry-run`).

---

## 7. Git safety checks

```bash
git status --short
git status --ignored --short
git check-ignore -v artifacts/football-data-org/summary.json
```

Expected:

- `git status --short` stays **clean** (no generated files tracked or staged).
- `artifacts/` appears **only** under the ignored list (e.g. alongside `node_modules/`).
- `git check-ignore -v` confirms `.gitignore` covers the file (it prints the matching
  rule, e.g. `/artifacts/`).

If any artifact shows up as tracked/staged, **stop** and fix `.gitignore` before
committing anything.

---

## 8. What is safe to share

**Safe (sanitized):**

- HTTP statuses
- `resultSet.count`
- `resultSet.played`
- matches received
- status counts
- stage counts
- mapped / unresolved / unmapped counts
- validation warnings / errors count
- redacted throttling headers (`X-RequestsAvailable`, `X-RequestCounter-Reset`,
  `X-API-Version`)
- freshness summary
- confirmation that artifacts are ignored

**Not safe (never share):**

- the token
- raw provider payloads
- full raw headers
- account identity (`X-Authenticated-Client`)
- raw `matches.raw.json`
- raw `standings.raw.json`
- screenshots showing dashboard / account info
- public copies of provider-derived full snapshots

---

## 9. Governance reminders

- football-data.org **provider IDs remain provenance-only**.
- Canonical **`matchNumber` / `M{n}` remains the app's source of truth**.
- **Provider standings are comparison-only.**
- **Article 13 standings are derived internally** from results.
- The **manual snapshot remains the fallback/audit path**.
- **No** public committed provider snapshots yet.
- **No** scheduled automation yet.
- **No** GitHub Actions dry-run yet.
- **No** storage / cache yet.
- **No** UI / probability refresh yet.
- **No** calibration.

---

## 10. Next-step ladder

The approved sequence (do not skip ahead):

1. **Local-only manual runs** — accepted for maintainer use.
2. **Docs / runbook PR** — this document.
3. **Optional later manual GitHub Actions `workflow_dispatch` dry-run** — only after
   **explicit approval** to store `FOOTBALL_DATA_TOKEN` as a GitHub Secret.
   **Implemented (Phase 1.28F):** `.github/workflows/live-football-data-dryrun.yml` —
   manual `workflow_dispatch` only, runs `--summary-only --no-standings` by default,
   uses the repository secret `FOOTBALL_DATA_TOKEN`, `permissions: contents: read`,
   uploads no artifacts and commits nothing. It still **requires the secret** to be set
   and never runs on schedule/push/PR.
4. **Scheduled automation** — only after the manual CI dry-run is stable.
5. **Storage / cache and UI / probability refresh** — only after the
   provider-publication and artifact policy is settled.

---

## 11. Cross-links

- [`LIVE_STATE.md`](./LIVE_STATE.md) — live tournament-state contract & freshness.
- [`LIVE_API_INGESTION_PLAN.md`](./LIVE_API_INGESTION_PLAN.md) — adapter boundary &
  provider-agnostic flow.
- [`LIVE_API_PROVIDER_DECISION.md`](./LIVE_API_PROVIDER_DECISION.md) — approved provider
  strategy (see §9 for the Phase 1.28C local-fetch note).
- [`LIVE_DATA_STORAGE_AND_SCHEDULER_DECISION.md`](./LIVE_DATA_STORAGE_AND_SCHEDULER_DECISION.md)
  — storage / runner / publication ADR (Phase 1.28L).
- Script: `scripts/football-data-org/run.ts` (CLI) and
  `scripts/football-data-org/live-state-fetch.ts` (core); package script
  `live:football-data:check`.
