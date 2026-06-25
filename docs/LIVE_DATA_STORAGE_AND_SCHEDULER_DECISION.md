# Live-data storage, runner & publication decision record (Phase 1.28L)

> **Docs-only decision record.** Phase 1.28L records the architecture decisions for
> scheduled live-data storage, the scheduler runner, the app read path, cadence, the
> failure/write policy, and the publication/ToU posture — **before** any scheduler or
> storage code is written. It implements **nothing**: **no storage vendor, no scheduler,
> no cron, no network fetch, no API token, no provider-derived public display, no app
> runtime change, no UI/probability/model/simulator/official-data/calibration change**.
> It does **not** approve provider-derived public display. The manual/FIFA snapshot
> remains the fallback/audit path.

Related: [`LIVE_API_PROVIDER_DECISION.md`](./LIVE_API_PROVIDER_DECISION.md) ·
[`LIVE_API_INGESTION_PLAN.md`](./LIVE_API_INGESTION_PLAN.md) ·
[`FOOTBALL_DATA_LOCAL_RUNBOOK.md`](./FOOTBALL_DATA_LOCAL_RUNBOOK.md) ·
[`LIVE_STATE.md`](./LIVE_STATE.md).

---

## 1. Status

**Status: `Accepted for next spike / not yet implemented`.**

- This is an **architecture decision record (ADR)**, not an implementation.
- It does **not** implement a scheduler or storage.
- It does **not** approve provider-derived **public** display. Provider-derived state
  stays private/cache-side until a later explicit publication/ToU review.
- It sets the contract the next spikes (1.28M write-path, 1.28N scheduler) must satisfy.

Decisions already fixed by the user and carried here:

- **Deployment target = Vercel** (primary assumption).
- **Public source posture = provider-derived state remains private; public source
  decision deferred.**

## 2. Current architecture baseline (verified)

- App **targets Vercel**; it is **server-capable but mostly static today** (`next.config`
  has no `output: "export"`, but there were no `app/api/**` routes, server actions,
  middleware, runtime fetch, or app-runtime env use before Phase 1.28K).
- **`/api/live-state`** exists as an **isolated, sanitized read-path scaffold** (PR #57).
  It currently serves the **sanitized manual/FIFA-derived fixture only**
  (`data/live/public-safe-sample.json`); it performs **no provider fetch**, reads **no
  token/env**, and is not linked into any user-facing page.
- The **football-data.org fetch remains server/CI-side only** (the manual
  `workflow_dispatch` dry-run); there is **no client-side provider fetch** and **no
  provider token in public/client code** (`FOOTBALL_DATA_TOKEN` lives only as a GitHub
  Actions secret).
- **No storage vendor implemented. No scheduler implemented.**

Verified signals grounding these decisions:

- football-data.org manual dry-run clean: HTTP `200`; `resultSet.count = 104`;
  `resultSet.played = 54`; mapped to canonical `M{n}` = `72`; unresolved knockout = `32`;
  unknown/unmapped = `0`; validation warnings = `0`.
- No-network CSV reconciliation clean: completed rows = `54`; standings rows = `48`;
  unknown CSV teams = none; core-field mismatches = `0`; ordering advisories = `0`;
  **M73 = South Africa vs Canada**.
- Public-safe projection (`PublicSafeLiveState`): no provider IDs; no raw provider
  payloads; no token/env/header exposure; canonical `M{n}` preserved; provider standings
  excluded; standings/bracket internally derived; no provider-derived public display yet.

## 3. Data boundary (private vs public-safe)

**Private — never published, never written to public storage:**

- the football-data.org **API token**;
- **raw provider payloads** (`matches.raw.json` / `standings.raw.json`);
- **raw response headers**;
- **`X-Authenticated-Client`** and any **provider account identity**;
- **provider raw artifacts**;
- **provider IDs as provenance** (provider match/team ids);
- **provider standings**;
- **provider-derived full snapshots** — until the publication/ToU policy is settled.

**Public-safe — minimized, sanitized, canonical (shape already proven in PR #57):**

- canonical `matchNumber` / `M{n}`;
- canonical **app team IDs**;
- **match status and scores**;
- **internally derived** group standings (Article 13);
- **internally derived** bracket participants;
- **attribution** (`sourceName` / `sourceUrl` where safe);
- `fetchedAt` / `asOf` / `generatedAt`;
- **freshness**;
- **validation status**;
- `publicSourcePolicy`.

**Clarification:** **public-safe does not automatically mean public-approved.** The
sanitized *shape* is safe to compute and read internally; whether a **provider-derived**
instance of that shape may be displayed publicly is a **separate, deferred** decision
(§4). Until then the public app uses the **manual/FIFA-derived** instance only.

## 4. Publication / ToU posture (conservative project policy)

Phrased as a conservative project policy — **not** a legal determination, and asserting no
legal certainty beyond what is known:

- **Raw provider payloads are never public.**
- **Provider IDs do not become canonical app identity** — canonical `M{n}` / app team IDs
  only; provider ids stay private provenance.
- **Provider standings / bracket are not source of truth** — app standings and bracket are
  internally derived (Article 13); provider standings stay comparison-only.
- **football-data.org-derived state remains private / cache-side** until a later **explicit
  publication/ToU review**.
- The **public app may continue to show manual/FIFA-attributed** snapshot-derived state
  where applicable.
- **Any later provider-derived public display requires explicit approval and agreed
  attribution wording.**
- **Attribution must be carried with the sanitized state** at all times (it already is, in
  `PublicSafeLiveState.attribution`).

This **supersedes** the older `LIVE_API_INGESTION_PLAN.md` suggestion of a scheduled job
that **commits** a validated JSON snapshot to the repo (now disfavoured — see §5, option
D, and §6).

## 5. Storage options comparison

Scoring legend: ✓ good / ~ caveat / ✗ poor.

| Option | Privacy | ToU/publication risk | Vercel ease | App read ergonomics | Cadence support | Ops burden | Cost / free-tier | Raw-payload-leak risk | Hobby/portfolio fit |
|---|---|---|---|---|---|---|---|---|---|
| **A. No storage / manual-only** | ✓ | ✓ none | ✓ | ✗ (no live source) | ✗ | ✓ none | ✓ | ✓ none | ✓ baseline/fallback |
| **B. GitHub Actions logs only** | ✓ | ✓ very low | ~ | ✗ (not a data source) | ~ (monitor) | ✓ low | ✓ | ✓ low | ~ monitoring only |
| **C. GitHub artifact** | ~ (auth/retention) | ~ low–med | ✗ (awkward auth) | ✗ (auth, ~90d retention) | ~ | ~ | ✓ | ~ | ✗ as app source |
| **D. Commit sanitized JSON to repo** | ~ | ✗ **high** for provider-derived (public history, commit noise, deploy triggers) | ✓ | ✓ (static import) | ~ (per-commit) | ~ | ✓ | ~ (commit discipline) | ✗ for provider-derived scheduled state |
| **E. Vercel Blob private store/object** | ✓ (private) | ✓ low (private + sanitized) | ✓✓ native | ✓✓ (JSON object + server read) | ✓ | ~ (1 token + store) | ✓ free-tier fits one small JSON | ✓ (we never write raw) | ✓✓ |
| **F. Vercel KV** | ✓ (private) | ✓ low | ✓✓ native | ~ (key/value; fine for 1 key/manifest) | ✓ | ~ | ✓ | ✓ | ✓ (better for a manifest than a snapshot) |
| **G. Cloudflare R2 / S3 private bucket** | ✓ (private) | ✓ low | ~ (extra vendor/SDK) | ✓ (object read) | ✓ | ✗ higher (new vendor) | ✓/~ | ✓ | ~ (provider-agnostic alt) |
| **H. Supabase storage** | ✓ (private) | ✓ low | ~ (extra vendor) | ✓ | ✓ | ✗ higher | ✓/~ | ✓ | ~ (overkill unless DB needed) |
| **I. Fully static build-time baked JSON fallback** | ✓ | ✓ (manual/FIFA only) | ✓✓ | ✓✓ | ✗ (rebuild-bound) | ✓ low | ✓ | ✓ | ✓✓ keep as safe fallback |

**Stance:**

- **Do not** recommend **committed repo JSON (D)** for provider-derived **scheduled**
  state (publication/ToU + commit-noise + deploy-trigger risk).
- **Do not** use **GitHub artifacts (C)** as the **app data source**.
- **Keep the fully static fallback (I)** available as the safe escape hatch.
- **Prefer private object / key-value storage (E/F, with G/H as alternatives)** for later
  **provider-derived sanitized** state.

## 6. Recommended storage for the next spike

**Recommendation: Vercel Blob private store/object** holding a single
`live-state.sanitized.json`, optionally alongside a small **manifest** object
(`asOf` / `fetchedAt` / `freshness` / `validationStatus`).

Rationale:

- **natural for a Vercel-hosted Next.js app** (native integration);
- a **JSON object fits the sanitized projection** directly;
- **easy server-side read** from `/api/live-state`;
- **avoids repo commits** (no commit noise / deploy triggers / public history);
- **avoids raw-payload persistence** — we write only the sanitized projection;
- **repointable later** by the same `/api/live-state` read seam;
- **simpler than relational storage**;
- **more natural for snapshot JSON than KV**, unless we are only storing a single key
  (KV remains a good fit for the small **manifest**).

**Precise Vercel Blob wording (governance):**

- Use a **Vercel Blob *private* store/object** — **provider-derived sanitized state must
  not be written to a public Blob store**.
- **Raw football-data.org payloads must never be written to Blob** (raw stays ephemeral in
  the runner; only the sanitized projection is persisted).
- The app must **read from private storage only via a server-side read path**
  (`/api/live-state`) — never from the client.
- **No public Blob URL may become the source of provider-derived state** unless a later
  explicit publication policy (§4) approves it.

**Alternatives kept on the table (documented, not chosen):** Vercel **KV** (especially for
the manifest), **Cloudflare R2 / S3** private bucket, **Supabase storage**. If a future
spike prefers KV over Blob, it must justify it on read ergonomics (single-key vs object),
cost, and cache-invalidation. **Not implemented in 1.28L.**

## 7. Scheduler runner comparison

| Option | Token location | Cadence freedom | Vercel Hobby vs Pro | Proven here? | Ops simplicity | Logs/observability | Storage-write compat | Accidental-artifact-exposure risk |
|---|---|---|---|---|---|---|---|---|
| **A. GitHub Actions schedule** | already in **GH Secrets** | ✓✓ unrestricted cron | n/a (off Vercel) | ✓ workflow proven (#54) | ✓ | ✓ Actions logs | ✓ writes to private store | ~ (must keep uploads off; we already commit/upload nothing) |
| **B. Vercel Cron** | Vercel env (re-home token) | ~ **Hobby caps frequency**; fine on **Pro** | **Hobby: not suitable for 30–60 min or 1–5 min**; Pro: ✓ | ✗ not yet | ✓✓ one vendor | ✓ Vercel logs | ✓✓ co-located w/ Blob/KV | ✓ low |
| **C. External worker (CF / Lambda / Supabase Edge)** | new vendor secret store | ✓✓ | n/a | ✗ | ✗ new vendor/ops | ~ | ✓ | ~ |
| **D. Manual-only** | GH Secrets | n/a (manual) | n/a | ✓✓ | ✓✓ | ✓ | n/a | ✓ none |

**Explicit Vercel Hobby limitation:** **Vercel Hobby Cron is not suitable for 30–60 minute
or 1–5 minute cadence** (Hobby cron is effectively ~daily). Therefore:

- If we want **sub-daily match-window cadence while staying low-cost**, **GitHub Actions
  schedule is likely the better runner** (token already in GH Secrets; the workflow is
  proven; cron cadence is unrestricted).
- **Vercel Cron remains attractive** if the cadence limits are acceptable **or** if we move
  to **Vercel Pro**.
- **External worker (C) is overkill** for a portfolio app.

**Stance:** **manual-only now**; for the first scheduled implementation, lean **GitHub
Actions schedule** for the fetch/compute/write, with **Vercel** serving the read path/ISR.

## 8. Recommended runner for the next spikes

- **Phase 1.28M (next):** still **manual `workflow_dispatch`** — **no schedule yet**. The
  manual job writes the **sanitized** state to the chosen **private** storage; the goal is
  to **prove the write/read path first**.
- **Phase 1.28N (later):** enable a **GitHub Actions schedule** *or* **Vercel Cron**
  depending on the cadence/free-tier decision — **matchday-gated** cadence only **after the
  manual storage write-path is stable**.

## 9. App read path

- **`/api/live-state` remains the read seam.**
- **Today** it reads the sanitized **manual/FIFA fixture**.
- The **next storage spike (1.28M)** should **repoint it server-side to private storage
  with fallback** (last-known-good, then static fallback).
- **No client-side provider fetch.** **No public token.**
- **No broad UI / probability integration yet.**
- **ISR / `revalidate` remains acceptable** (the route already sets `revalidate = 300`).
- The **static last-known-good fallback remains available**.

## 10. Cadence recommendation (tiered)

Cadence is expressed as **tiers** so the architecture stays product-ambitious without
committing to aggressive polling on a delayed/free feed.

**Tier 1 — Manual / conservative (now).**

- Manual runs only, until the storage **write** and `/api/live-state` **read** gates are
  proven. No schedule.

**Tier 2 — Default scheduled mode (later, recommended first scheduled mode).**

- **30–60 minutes during active match windows.**
- **Off or daily on non-matchdays.**
- **One request per run** by default: **matches only, standings disabled**.
- **No minute-by-minute polling** — the free feed is delayed/stale, so it gives no
  minute-by-minute value.
- **One safe retry for 429/5xx only**; **no tight loop**.
- Suited to the delayed/free feed and lower operational risk. **Note (§7):** Hobby Cron
  cannot do this cadence → use **GitHub Actions schedule** (or Vercel Pro Cron).

**Tier 3 — Future aggressive match-window mode (documented; NOT for immediate
implementation).**

- **1–5 minute refresh during active match windows.**
- **Gated by ALL of:** provider **tier / rate-limit** suitability confirmed; **private
  storage write-path proven**; **`/api/live-state` read path + stale/failure labels
  proven**; **UI consumption policy designed**; **cost / quota impact understood**; **raw
  provider payloads remain ephemeral and never public**; **validation still gates every
  write**; **bad data never overwrites last-known-good**.
- **Not implemented in 1.28L**, and **not before the 1.28M / 1.28N gates**.
- **Rationale:** we intend the product to eventually reflect live tournament changes in the
  UI; even on a currently delayed feed, the architecture should **not be artificially
  capped at 30–60 minutes forever**. Tier 3 is recorded as an explicit, gated future
  option — not a near-term action.

> Do **not** implement the 1–5 minute cadence now. Tier 3 is a documented future option
> only.

## 11. Failure / write policy

**Validation gates the write. Never overwrite last-known-good with bad data.**

**Write blockers (do NOT write; keep last-known-good):**

- token missing;
- HTTP **401 / 403**;
- HTTP **429 after retry**;
- HTTP **5xx after retry**;
- **malformed JSON** / invalid payload;
- **unknown-team > 0**;
- **validation warnings/errors > 0**;
- **`resultSet.count` not 104**;
- **stage count mismatch**;
- **score regression vs prior canonical state without manual confirmation**;
- **storage write failure** (keep the prior object; next run retries).

**Allowed but labelled:**

- **`freshness: stale`** — a stale write is permitted but **must be stamped stale**; the UI
  must label it and never claim live.

**Rules:**

- **Validation gates the write** — bad data is dropped, not stored.
- **Never overwrite last-known-good with bad data.**
- On read failure or blocked write, **serve last-known-good or the manual fallback with a
  stale label** — never blank, never a silent guess.

## 12. Manual fallback

The manual paths remain the audit/fallback and are **not removed** by any scheduler:

- the **manual GitHub dry-run** remains;
- the **local reconciliation reporter** remains;
- the **manual CSV snapshot** remains the fallback/audit path;
- the **public-safe manual fixture** (`data/live/public-safe-sample.json`) remains the
  **last-known-good** fallback;
- an **ability to freeze live state** (pin last-known-good);
- an **ability to mark stale**.

## 13. Next phase recommendation

**Phase 1.28M — manual private-storage write-path spike.**

Scope:

- **no schedule**;
- **no public provider display**;
- **no UI / probability refresh**;
- a **manually triggered** workflow or local command **writes sanitized public-safe state
  to the chosen private storage** (Vercel Blob private store, per §6);
- **raw provider payloads remain ephemeral** (never stored);
- **`/api/live-state` can read from private storage with fallback** (last-known-good →
  static);
- **storage secrets added only as server / CI secrets** (never `NEXT_PUBLIC_*`);
- **tests for the read/write seam**;
- **no client-side provider calls**.

A separate **1.28L-bis** docs/SDK-evaluation spike is **not required** — the Blob SDK
choice can be settled inside 1.28M. Recommend proceeding straight to **1.28M**.

## 14. Gates before scheduled automation (1.28N)

All must be green before any **schedule** is enabled:

- private storage decision **accepted**;
- manual **write** to private storage **works**;
- `/api/live-state` **reads storage and falls back safely**;
- **no raw provider payloads are stored**;
- **provider-derived public display still private / deferred**;
- **failure policy tested**;
- **stale label tested**;
- **write blockers tested**;
- **cadence selected**;
- **attribution text reviewed**;
- **cost / free-tier constraints understood**;
- **manual rollback / freeze path exists**.

## 15. Exact non-goals (this phase)

- **No code beyond docs** in this phase.
- **No storage implementation.**
- **No scheduler.**
- **No cron.**
- **No network fetch.**
- **No API token.**
- **No provider-derived public display.**
- **No raw provider payloads.**
- **No provider IDs as canonical identity.**
- **No provider standings / bracket as source of truth.**
- **No UI integration.**
- **No probability refresh.**
- **No model changes.**
- **No simulator changes.**
- **No official data changes.**
- **No calibration / tuning.**

---

## Cross-links

- [`LIVE_API_PROVIDER_DECISION.md`](./LIVE_API_PROVIDER_DECISION.md) — approved provider
  strategy and ToU posture.
- [`LIVE_API_INGESTION_PLAN.md`](./LIVE_API_INGESTION_PLAN.md) — adapter boundary &
  provider-agnostic flow (this ADR supersedes its "commit a validated JSON snapshot"
  automation suggestion for provider-derived state).
- [`FOOTBALL_DATA_LOCAL_RUNBOOK.md`](./FOOTBALL_DATA_LOCAL_RUNBOOK.md) — operator runbook
  for the local-only fetch and reconciliation, plus the public-safe read-path note.
- [`LIVE_STATE.md`](./LIVE_STATE.md) — canonical live tournament-state contract &
  freshness.
