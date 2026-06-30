# Forecast Refresh Operations Runbook

Operational guide for keeping the two production **forecast** Blob objects correct.
Companion to `docs/LIVE_STATE_RUNBOOK.md` (the live-state pipeline this builds on).

The forecast pipeline is **downstream of live-state**: it reads the public-safe
live-state projection and writes the forecast objects. It never re-fetches the
provider and never touches the live-state object.

## The two forecast Blob objects

| Object | What it holds | Written by |
| --- | --- | --- |
| `forecast-current.provider.sanitized.json` | The **rolling current** tournament forecast (per-team title/advancement probabilities) for the latest locked results. Convertible to a `ForecastSnapshot` for the PR-82 selectors. | `forecast:refresh:current` |
| `forecast-matches.provider.sanitized.json` | The **per-match** forecasts: the live `current-pre-match-forecast` for upcoming fixtures plus the `archived-pre-match-forecast` history of fixtures as they complete (and, only when explicitly requested, `retrospective-model-forecast` entries). | `forecast:refresh:matches` |

Both are **private** Blob objects and **public-safe** (validated + leak-scanned
before every write). They are never served raw; no public route reads them today.

## How the refresh works (read this first)

The forecast refresh runs **in the same workflow run as the live-state write**,
immediately after it, reading the **just-written** public-safe live-state Blob
(`live-state.provider.sanitized.json`) with `--source blob`:

```text
live-state write  ->  forecast-current  ->  forecast-matches  ->  forecast smoke
```

- **Forecast input is the public-safe live-state object only.** The forecast
  scripts do **not** call football-data and need **only** `BLOB_READ_WRITE_TOKEN`
  (not `FOOTBALL_DATA_TOKEN`). They read sanitized scores/results/status — never raw
  provider payloads, IDs, or headers.
- **Sequencing gives the guarantees for free.** A failed live-state write fails the
  job before any forecast step runs; `forecast-current` runs before
  `forecast-matches`; a failed `forecast-current` stops `forecast-matches` (so the
  pair never goes out of sync).
- **A forecast failure cannot corrupt live-state.** The objects are separate keys,
  and every forecast write **validates + leak-scans before** the Blob call — a
  refusal or Blob error exits non-zero **without a partial write**, preserving the
  last-known-good forecast objects.

## Idempotency

Both refreshes are idempotent and skip (exit 0) when nothing changed:

- **forecast-current** writes only when there is a newer supported-completed match
  **or** the locked-results fingerprint (`sourceResultsFingerprint`) changed (this
  catches a score/penalty **correction** that does not change the completed count).
- **forecast-matches** writes only when the merged set of entries actually changed
  (new fixture forecasts, or fixtures newly archived on completion).

Re-running the workflow on unchanged data is safe and writes nothing.

## Required env / secrets

The forecast steps need **only**:

```text
BLOB_READ_WRITE_TOKEN   # read live-state Blob + read/write forecast Blobs
```

**No new Vercel env vars** are introduced. The live-state app-runtime env
(`LIVE_STATE_SOURCE`, `LIVE_STATE_BLOB_OBJECT_PATH`,
`LIVE_STATE_ALLOW_PROVIDER_DERIVED_PUBLIC`) is unchanged and unused by the forecast
scripts. Tokens are passed only as step env vars and are never echoed or logged.

## Scheduled refresh

The scheduled workflow `live-state-write-blob-scheduled` runs every 30 minutes
(gated by the `LIVE_STATE_SCHEDULER_ENABLED` kill-switch, same as the live-state
write). After the provider live-state write it runs, in order:

```bash
npm run forecast:refresh:current -- --source blob \
  --live-state-object-path live-state.provider.sanitized.json \
  --forecast-object-path forecast-current.provider.sanitized.json

npm run forecast:refresh:matches -- --source blob \
  --live-state-object-path live-state.provider.sanitized.json \
  --matches-object-path forecast-matches.provider.sanitized.json \
  --forecast-current-object-path forecast-current.provider.sanitized.json

npm run forecast:smoke -- --source blob --strict \
  --current-object-path forecast-current.provider.sanitized.json \
  --matches-object-path forecast-matches.provider.sanitized.json
```

The scheduled run never passes `--include-retrospective`, `--force`,
`--force-rebuild`, `--allow-file-write`, or `--source file`.

## Manual refresh

The manual workflow `live-state-write-blob-manual` refreshes forecasts **only when
the `refresh_forecast` input is `true`** (default **false**), so a routine manual
live-state write never touches the forecast objects. Additional inputs:

- `include_retrospective` (default false) — append `--include-retrospective` to the
  matches refresh.
- `forecast_force` (default false) — append `--force` to both refreshes.

Manual safety rules (enforced in the workflow, fail-closed):

- **`dry_run = true` skips the forecast refresh entirely** with a message pointing
  to the local dry-run commands below (forecast objects are never written on a dry
  run).
- A real forecast refresh (`dry_run = false`, `refresh_forecast = true`) **requires
  `source = football-data` and `object_path = live-state.provider.sanitized.json`**;
  any other combination is **BLOCKED with a non-zero exit**. This guarantees a
  fixture/default manual live-state write can never overwrite the production
  forecast objects from the wrong input.

Manual forecast steps always use `--source blob` (never `--source file`, never
`--allow-file-write`) and never pass `--force-rebuild`.

## Smoke check

```bash
# Operator / CI — reads the Blob objects (requires BLOB_READ_WRITE_TOKEN):
npm run forecast:smoke -- --source blob --strict \
  --current-object-path forecast-current.provider.sanitized.json \
  --matches-object-path forecast-matches.provider.sanitized.json

# Offline / local — reads files, no token:
npm run forecast:smoke -- --source file \
  --current-input <path-to-current.json> \
  --matches-input <path-to-matches.json>
```

The smoke check asserts, for **forecast-current**: a valid public-safe shape, a
clean leak scan, that it converts to a valid `ForecastSnapshot`, and that its
`sourceLiveStateObjectPath` is `live-state.provider.sanitized.json`. For
**forecast-matches**: a valid public-safe shape (which enforces every entry's
provenance lifecycle) and a clean leak scan. It reports counts (teams,
matchForecasts, and the current-pre-match / archived-pre-match / retrospective
breakdown) and **prints no tokens, Blob URLs, or raw provider payloads**.

- **`--strict`** (used by the workflow): a **missing** forecast object is a
  **failure**.
- **non-strict** (default): a missing object is a **warning**, not a failure (useful
  for partial local checks).
- Exit `0` = all asserts passed; exit `1` = at least one failed (failing checks
  printed first).

## Safe local dry-run commands (no token, no write)

```bash
# Preview the current/matches refresh against a local public-safe live-state file:
npm run forecast:refresh:current -- --source file --dry-run
npm run forecast:refresh:matches -- --source file --dry-run

# Smoke a pair of local forecast files:
npm run forecast:smoke -- --source file \
  --current-input <path> --matches-input <path>
```

A **file** source never writes to the Blob unless `--allow-file-write` is passed
(do not use that flag for production work — operators always use `--source blob`).

## Interpreting the refresh result + common failure modes

Each refresh prints a JSON summary with a `decision`:

| `decision` | Meaning | Action |
| --- | --- | --- |
| `wrote` | The object changed and was written. | None. |
| `skipped` | Idempotent no-op (no newer result / unchanged fingerprint / unchanged entries). | None — expected on unchanged data. |
| `blocked` | The refresh refused (e.g. the live-state Blob was unreadable, or a safety gate tripped). The last-known-good object is preserved. | Read the `reason`; fix the upstream cause, then re-run. |

| Symptom | Likely cause | Action |
| --- | --- | --- |
| Action red on a forecast step | A forecast refresh or the smoke check failed | Inspect the run log; live-state is intact and the last-known-good forecast objects are preserved. Re-run after the cause is fixed. |
| `blocked` reading the live-state Blob | live-state object missing/unreadable in this env | Confirm the live-state write step succeeded on this run; check `BLOB_READ_WRITE_TOKEN`. |
| Smoke `forecast-current → snapshot` fails | A malformed/incompatible current object | Re-run `forecast:refresh:current`; if it persists, inspect the object shape against the contract. |
| Smoke `sourceLiveStateObjectPath` mismatch | current was built from the wrong live-state object | Ensure the refresh used `--live-state-object-path live-state.provider.sanitized.json`. |
| Malformed `forecast-matches` archive | A corrupted archive object | `--force-rebuild` rebuilds the matches object from scratch — **deliberate use only**: it discards the existing archive, so prefer fixing the source and re-running normally. (Not exposed as a manual workflow input.) |

## Why `--force-rebuild` is dangerous

`--force-rebuild` (matches refresh) ignores the existing `forecast-matches` object
and rebuilds it from the current live-state alone. That **discards the archived
pre-match history** for already-completed fixtures, which cannot be reconstructed
from current state. Use it only to recover from a genuinely corrupted archive, never
as a routine refresh. It is intentionally **not** a manual-workflow input.

## Why `--include-retrospective` is opt-in (and ≠ a pre-match archive)

By default the matches refresh emits, per fixture, a **pre-match** forecast captured
**before** the result was known — `current-pre-match-forecast` while upcoming, then
`archived-pre-match-forecast` once the fixture completes
(`capturedBeforeCompletion = true`).

A `retrospective-model-forecast` (`--include-retrospective`) is a model forecast
computed **after** the result is known (`capturedBeforeCompletion = false`,
`archived = true`). It is honest hindsight, **not** a pre-match prediction, so it is
labelled distinctly and is opt-in: the refresh never silently relabels a completed
match as a pre-match archive.

## Server-side runtime read helpers (not yet wired)

`lib/model/forecast-runtime-store.ts` (SERVER-ONLY) provides additive read helpers so
future server components / route handlers can consume the forecast Blob objects. They
are **not wired into any UI or route yet** — they exist so the read path is ready.

- `getRuntimeCurrentForecastSnapshot()` — the rolling Blob current converted to a
  `ForecastSnapshot`, falling back to the committed chain tail when the Blob is
  unavailable/invalid (null only when neither exists).
- `getRuntimeCurrentSnapshotPolicy()` — which source was used
  (`blob` / `committed-fallback` / `unavailable`), the resolved + baseline snapshot
  ids, any Blob error code, the embedded PR-82 committed policy, and warnings.
- `getRuntimeCurrentVsBaselineComparison()` / `getRuntimeCurrentVsBaselineMovers()` —
  committed baseline vs runtime current (the PR-82 selectors; movers default to
  winner / signed / top 5).
- `getRuntimeMatchForecasts()` / `getRuntimeMatchForecast(matchNumber)` — the
  match-forecasts object, and a single match classified strictly by provenance
  (`current-pre-match` / `archived-pre-match` / `retrospective` / `missing` /
  `unavailable`); a retrospective is never reported as a true pre-match forecast.

All reads are render-safe (never throw for ordinary Blob problems) and return only
public-safe objects — no tokens, Blob URLs, or raw payloads. They need only
`BLOB_READ_WRITE_TOKEN`; tests inject fake stores (no real Blob/token/network).
Team-pair lookup and a runtime snapshot timeline are intentionally deferred.
