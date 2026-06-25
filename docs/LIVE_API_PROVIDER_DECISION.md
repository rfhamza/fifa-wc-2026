# Live API provider decision record (Phase 1.27)

> **Docs-only decision record.** Phase 1.27B records the approved provider strategy,
> per-provider status, the confirmation checklist, and the paid-upgrade triggers for
> WC 2026 live tournament-state ingestion. It implements **no provider**: no real API,
> no fetch/network, no SDKs, no API keys/env vars, no cron, no storage, no UI, no
> probability refresh, no model change. See `docs/LIVE_API_INGESTION_PLAN.md` for the
> adapter boundary and `docs/LIVE_STATE.md` for the canonical contract.

## 1. Current strategy (approved)

- **Budget strategy: FREE-FIRST.** Paid providers are **upgrade candidates only**,
  considered later if free/open sources prove insufficient (see §4 triggers).
- **Manual snapshot remains the fallback and audit path** (a `RawLiveSnapshot` with
  `sourceType:"manual"`; the committed snapshot is the audit trail).
- **Official `matchNumber` / `M{n}` remains the canonical fixture key.**
- **Provider IDs remain provenance-only** (in `ProviderProvenance`, never the key).
- **Provider standings/bracket remain comparison-only** (in `ProviderComparison`,
  never ingested as truth).
- **Results remain the trusted primitive;** standings and bracket are **derived**
  through the app path (`deriveGroupStandings` / `deriveBracketState`).
- **No scraping** unless separately approved. **No client-side provider calls.**
- **Calibration remains formally NO-GO.**

Pipeline (unchanged): `provider payload → lib/live-ingest normalize() →
RawLiveSnapshot → validateLiveSnapshot / ingestLiveSnapshot → LiveTournamentState`.

## 2. Provider statuses

> **Evidence caveat (see §6):** provider Terms/pricing/coverage pages were **not
> directly retrievable** by automated fetch (HTTP 403). The confidence levels below
> are based on web-search-surfaced content from official pages, **not** verbatim
> reads, so all licensing/coverage claims are `needs confirmation` until checked
> manually against official docs/support/account access.

| Provider | Role | Current status | Coverage confidence | ToS/licensing confidence | Missing confirmations | Recommendation status |
|---|---|---|---|---|---|---|
| **football-data.org** | Leading free-first candidate | Needs ToS, attribution, caching, public-display, WC 2026 coverage, live/result, knockout/penalty, rate-limit confirmation | Medium | Low | All of §3 (football-data.org) | **Leading free-first candidate, pending confirmation** |
| **OpenFootball / `worldcup.json`** | Static/fallback seed + cross-check | License appears clean (CC0) from the retrieved repo; **not** a trusted live source (manual ~daily updates) | Medium (static) | High (CC0) | Fixture completeness; update cadence; fallback-only timeliness | **Fallback / static seed only** |
| **API-Football / API-SPORTS** | Development/pilot source only | Publication/public-display rights **not granted** by ToS; reselling prohibited; rich coverage incl. WC | Medium–High | Low | Publication/display rights; caching/redistribution; free-tier dev limits; internal/pilot-only use | **Pilot only unless publication rights clarified** |
| **Sportmonks (WC 2026 API)** | Paid upgrade candidate | Strong apparent coverage (104 matches, penalties, bracket, <15s, caching docs); one ambiguous ToS clause | High (coverage) | Low–Medium | Display + caching + committed-snapshot rights; cost/rate-limit/SLA | **Paid upgrade candidate only (not first under free-first)** |
| **SportsDataIO / TheStatsAPI / other paid** | Paid alternatives | Insufficient evidence / needs confirmation | Low | Low | Coverage, penalty/KO fields, display/cache rights, cost, SLA | **Paid upgrade candidates only** |
| **Official FIFA / public source** | Preferred if legally + technically accessible | Public API appears to cover **past** competitions; live 2026 automated feed + display/cache rights unconfirmed | Low | Low | Live 2026 results; automated-access + display/cache rights; structured numbering/penalties | **Needs confirmation** |
| **Stats Perform / Opta** | Enterprise/official-grade | Not self-serve; enterprise licensing/cost/redistribution constraints | High | N/A (impractical) | n/a | **Rejected / impractical** (unless access unexpectedly feasible) |
| **Direct scraping** | None | Rejected by default (legal/ToS + brittleness) | n/a | n/a | n/a | **Do not recommend** |

## 3. Missing-confirmations checklist (complete before any real adapter/fetch)

### football-data.org (free-first lead)
- [ ] Is **WC 2026** covered (on the needed tier)?
- [ ] Are **all 104 matches** covered?
- [ ] Are **live or near-live scores** available?
- [ ] Are **knockout results** covered?
- [ ] Are **penalties/shootouts and extra-time winners** exposed in payloads?
- [ ] Is **public hobby/demo usage** allowed under the relevant tier?
- [ ] Is **attribution** required — and the exact **text/placement**?
- [ ] Is **caching** allowed?
- [ ] Are **committed validated snapshots** allowed?
- [ ] Are **rate limits** sufficient for group-stage and knockout live windows?
- [ ] Does the **tier needed for live data remain free**, or require a paid upgrade?

### OpenFootball / `worldcup.json` (fallback/seed)
- [ ] Confirm **2026 fixture completeness**.
- [ ] Confirm **update cadence**.
- [ ] Confirm whether **results updates are timely enough for fallback only**.
- [ ] Confirm **no live-reliability assumption** is made.

### API-Football / API-SPORTS (pilot/dev only)
- [ ] Confirm whether **publication / public-display rights** can be obtained.
- [ ] Confirm **caching / redistribution** restrictions.
- [ ] Confirm **free-tier development limits**.
- [ ] Confirm whether **live data may be used only internally / pilot**.

### Paid upgrade candidates (Sportmonks / SportsDataIO / TheStatsAPI / other)
- [ ] Confirm **public-display rights**.
- [ ] Confirm **caching and committed-snapshot rights**.
- [ ] Confirm **coverage of all 104 matches**.
- [ ] Confirm **knockout winner / penalty support**.
- [ ] Confirm **cost and rate limits**.
- [ ] Confirm **support / SLA**.

## 4. Paid-upgrade triggers

Paid sources become relevant **only if** a free/open source fails on one or more of:

- WC 2026 coverage;
- reliable live status/results;
- knockout-winner or penalty support;
- public-display rights;
- caching / committed-snapshot rights;
- rate limits (insufficient for live windows);
- `matchNumber` mapping reliability;
- operational reliability during live tournament windows.

If a trigger fires for free/open sources, escalate to the paid upgrade candidates in
§2 (Sportmonks first on apparent coverage), subject to the §3 paid checklist.

## 5. Recommended next path

**Immediate next step after this docs PR:**
- **Resolve the football-data.org confirmation checklist** (§3) manually from official
  docs / support / account access.
- **Do not build a real fetch adapter yet.**

**Possible later phases (each separately approved):**
- **Phase 1.27C** — football-data.org provider-specific **adapter scaffold using a
  captured/mock payload only** (no real fetch), *if* terms/coverage look viable.
- **Phase 1.27D** — **real provider fetch** behind a **server/CI-only** boundary,
  *only after* ToS and field coverage are confirmed.
- **Later** — GitHub Actions **scheduled ingestion** + **committed validated snapshot**.
- **Later** — **UI integration**.
- **Later** — **probability refresh** (separately approved).

## 6. Evidence standard

- Provider pages **may be inaccessible to automated fetch/bot access** (several
  returned HTTP 403 during research); this does not change their terms.
- Any unverified provider detail must be labelled **`needs confirmation`** or
  **`insufficient evidence`**.
- **Do not** treat search snippets as final legal/coverage proof.
- **Official docs / pricing / terms / support replies** are required for final
  provider selection.
- An **accessible endpoint does not imply allowed use**.
- A **free API does not imply** public-display / caching / redistribution rights.

## 7. Non-goals (this phase)

No real API integration; no fetch/network code; no provider SDKs; no API keys/env
vars; no cron/scheduled jobs; no storage/KV/blob/DB/S3; no generated live JSON; no UI;
no probability refresh; no model changes; no calibration/tuning; no scraping; no
client-side provider calls; no changes to `lib/live-state/*`, `lib/live-ingest/*`,
`lib/model/*`, the simulator, official fixtures/bracket, snapshots, generators, app
routes, UI, CI workflows, or package scripts.

## 8. Phase 1.28A — first WC 2026 payload gate passed (mock adapter scaffold)

football-data.org cleared the first WC 2026 payload gate (locally verified): the
`/v4/competitions/WC/matches?season=2026` endpoint returned **HTTP 200**,
`resultSet.count: 104`, `matches.length: 104`; the standings endpoint is accessible
but is a single overall 48-team table (`group: null`) — **comparison-only**, never
Article-13 source of truth.

A **provider-specific mock adapter scaffold** now exists under
`lib/live-ingest/football-data-org/` (types + mapping + pure `normalize`), exercised
only by **minimized/sanitized** fixtures and tests — **no real fetch, no token, no
committed raw provider JSON**. Notes locked in by tests:

- `TIMED` maps to internal **scheduled**; `FINISHED` → complete; `LIVE`/`IN_PLAY`/
  `PAUSED` → in-progress.
- Canonical `matchNumber`/`M{n}` is resolved from the app's official fixtures by
  (group + unordered team pair); provider match ids stay **provenance-only**.
- Future **unresolved knockout** shells (null teams) are excluded; resolved knockouts
  need a small provider-id→`matchNumber` map (full mapping is future work).
- Extra-time/penalty handling is supported and proven by a **synthetic/doc-shaped**
  fixture; a **live 2026 penalty sample remains pending**.
- Real fetch, scheduled automation, storage, UI, and probability refresh remain out
  of scope. No raw provider JSON is committed.
