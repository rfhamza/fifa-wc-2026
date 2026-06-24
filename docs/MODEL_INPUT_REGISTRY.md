# Model Input Registry — feature & input governance catalog

> **Governance documentation, not behavioural config.** This registry catalogs every
> model input the World Cup Probability Lab uses today, has available-but-unwired, or
> plans (including future-live inputs). It changes **no** model behaviour and is read
> by **no** production prediction code. It holds **no numeric weights, no caps, and no
> metric/replay numbers** — those live in the sources of truth below.

## Purpose

A single map of the input universe with explicit governance metadata (status, phase,
source, freshness, fallback, usage, and live/calibration/tuning eligibility) so that:

- it is always clear which inputs affect probabilities **today** versus which are
  available-only, backtesting-only, explanatory, planned, or future-live;
- every input has a documented source/freshness/fallback story;
- adding or promoting a feature follows one consistent, reviewable process.

## Sources of truth (this registry references, never duplicates)

- **`lib/model/config.ts`** — the source of truth for **weights, caps, and production
  model configuration**. The registry refers to weights by **key** (`weightRef`),
  never by value.
- **`data/model-inputs/sources.ts`** — the source of truth for **existing source /
  provenance status** per feature family. The registry refers to a family by **key**
  (`sourceRef`), never by re-declaring its status.
- **`lib/model/input-registry.ts`** — the typed, metadata-only mirror of this catalog
  (controlled vocabularies + one entry per input). Machine-checked by
  `tests/input-registry.test.ts`. Imported by no production prediction code.

Related governance: `docs/MODEL_METHOD.md` (driver rationale) and
`docs/BACKTESTING_INDEX.md` (backtesting/replay governance; **calibration remains
NO-GO**).

## Registry schema (fields)

Each entry in `lib/model/input-registry.ts` carries:

`inputId` · `displayName` · `family` · `description` · `status` · `phase` ·
`sourceRef` · `sourceType` · `refreshCadence` · `currentUsage` · `weightRef` ·
`fallback` · `freshnessRequirement` · `confidenceLevel` · `publicExplanationAllowed` ·
`calibrationEligible` · `tuningEligible` · `liveEligible` · `knownLimitations` ·
`testsRequired` · `governanceNotes`.

Controlled vocabularies (exported from the typed registry):

- **status** — `implemented` · `partiallyImplemented` · `availableDataOnly` ·
  `planned` · `deferred`
- **phase** — `static` · `preTournament` · `matchContext` · `postMatch` ·
  `liveFuture`
- **sourceType** — `manual` · `csv` · `api` · `generated` · `external` (or `null`)
- **refreshCadence** — `static` · `annual` · `preTournamentFreeze` · `daily` ·
  `perMatch` · `live`
- **currentUsage** — `productionProbability` · `backtestingOnly` ·
  `explanationOnly` · `availableNotUsed` · `futureCandidate`
- **confidenceLevel** — `high` · `medium` · `low` · `none`

`weightRef` is a key (or keys) into `MODEL_WEIGHTS`; `sourceRef` is a
`ModelFeatureFamily` key in `sources.ts`, or `null` when no production family exists
yet (planned/future, backtesting-only, available-only).

## Static vs pre-tournament vs match-context vs live taxonomy

- **A. Static / structural** — population, GDP/GDP-per-capita, climate normals, venue
  geo (lat/long/altitude/TZ), host & regional status. Source-backed before kickoff;
  effectively immutable.
- **B. Pre-tournament freeze** — Elo, FIFA ranking, squad list/aggregates (when
  wired), recent form, the official venue schedule/fixtures. Frozen at a declared
  cutoff strictly before opening kickoff; leakage-guarded.
- **C. Match-context / rolling tournament** — opponent, venue, rest, travel, group
  state, bracket state, qualification pressure. **Today only the fixed pre-tournament
  itinerary exists** (tournament-context driver); rolling/per-match updates are
  future work.
- **D. Live / future** — lineups, injuries, cards, substitutions, xG, shots, in-play
  state. No source wired; deferred.

**Phase rules:** static & pre-tournament features are source-backed before kickoff and
frozen at a cutoff. Match-context features may update **between** matches **only**
behind a visible freshness/fallback flag. True live/in-play features stay deferred
until a reliable source exists. **No live or rolling input may silently fall back** —
every such input carries a visible freshness/fallback flag.

## Feature-governance rules (adding or promoting any input)

A new or promoted feature must:

1. be source-backed (or explicitly flagged `candidate`/`placeholder`);
2. be documented here and in the typed registry;
3. define a fallback;
4. add tests (snapshot/validation + no-wiring or fallback-flag, as applicable);
5. have its public explanation reviewed (no overstated claims);
6. change **no** production weight silently (weights live only in `config.ts`);
7. make **no** calibration claim and do **no** tuning-from-backtesting unless
   separately approved;
8. enter production probabilities **only** with explicit approval;
9. carry a `status` and a `currentUsage` classification.

**Definitions (the impact boundary):**

- **Available data** — ingested/validated but not read by the model.
- **Explanatory data** — shown for transparency; not a driver.
- **Model input** — consumed by `prediction-core` as a driver.
- **Production probability driver** — a model input with a live, non-zero weight
  (placeholders are drivers but hard-capped).
- **Live driver** — a production driver fed by a live/rolling source (none today).

## Live 2026 ingestion runway (planned; not built)

The first live state-ingestion layer (fixtures/results/standings/bracket + freshness;
no probability refresh) is contracted in `docs/LIVE_STATE.md` (`lib/live-state/*`).

Staged path, safest first. **Recommended safest first live phase: results / standings
/ bracket refresh only — NOT in-play prediction.** Re-simulate remaining matches from
resolved + frozen state; never silently fall back; always show an "as-of" stamp.

1. **Live fixtures & results** (`liveFixturesResults`) — resolves played matches;
   fall back to last frozen snapshot, flagged.
2. **Live standings** (`liveStandings`) — derived via the existing Article-13 logic.
3. **Bracket progression** (`liveBracketProgression`) — derived from standings + the
   official R32 mapping.
4. **Rolling rest/travel & tournament state** (`plannedRollingTournamentState`) —
   recomputed from realised fixtures; falls back to the frozen itinerary.
5. **Pre-match probability refresh** — re-run the sim for remaining matches only.
6. **Lineups / injuries** (`plannedPlayerAvailability`) — later; needs a source.
7. **In-play data** (`inPlayContext`) — much later; deferred indefinitely absent a
   reliable source. Not an in-play prediction product.

## Catalog

Full per-field detail lives in `lib/model/input-registry.ts`. Core columns below
(`weightRef`/`sourceRef` are **keys**, never values).

### Implemented production probability drivers

| inputId | family | phase | sourceRef | weightRef | confidence |
|---|---|---|---|---|---|
| `elo` | team strength | preTournament | `eloRating` | `elo` | high |
| `fifaRanking` | team strength | preTournament | `fifaRanking` | `fifaRankingPerPlace`, `fifaRankingCap` | high |
| `squadQuality` (partial/placeholder) | squad / player | preTournament | `squadQuality` | `squadQuality` | low |
| `recentForm` (partial/placeholder) | team strength | preTournament | `recentForm` | `recentForm` | low |
| `managerCohesion` | squad / player | preTournament | `managerCohesion` | `manager` | medium |
| `hostAdvantage` | tournament context | static | `hostAdvantage` | `host` | high |
| `regionalAdvantage` | tournament context | static | `regionalAdvantage` | `regional` | high |
| `climateFamiliarity` | climate / venue | static | `climateFamiliarity` | `climate` | medium |
| `structural` | structural / economic | static | `structural` | `structural` | medium |
| `tournamentContext` | travel / acclimatisation | preTournament | `tournamentContext` | `tournamentContext` | medium |

### Available-but-unwired data packs

| inputId | family | status | currentUsage |
|---|---|---|---|
| `recentFormSnapshot` | team strength | availableDataOnly | availableNotUsed |
| `squadRosterSnapshot` | squad / player | availableDataOnly | availableNotUsed |
| `venueClimateNormals` | climate / venue | deferred | availableNotUsed |

### Backtesting-only inputs (isolated historical harness)

| inputId | family | currentUsage |
|---|---|---|
| `backtestingHistoricalElo` | team strength | backtestingOnly |
| `backtestingHistoricalFifa` | team strength | backtestingOnly |
| `backtestingHostRegional` | tournament context | backtestingOnly |

### Explanation-only inputs

| inputId | family | currentUsage |
|---|---|---|
| `ratingRankDisplay` | team strength | explanationOnly |
| `economicIndicatorsDisplay` | structural / economic | explanationOnly |

### Planned inputs

| inputId | family | phase | status |
|---|---|---|---|
| `plannedWorldBankDevProxies` | structural / economic | static | planned |
| `plannedSquadQualityScore` | squad / player | preTournament | planned |
| `plannedPlayerAvailability` | squad / player | matchContext | planned |
| `plannedRollingTournamentState` | tournament context | matchContext | planned |

### Future-live inputs (require live ingestion)

| inputId | family | phase | status |
|---|---|---|---|
| `liveFixturesResults` | live match context | liveFuture | planned |
| `liveStandings` | live match context | liveFuture | planned |
| `liveBracketProgression` | live match context | liveFuture | planned |
| `inPlayContext` | live match context | liveFuture | deferred |

## What this registry does NOT contain

Numeric model weights or caps; metric values (RPS/log-loss/Brier/accuracy); replay
probabilities; performance/accuracy claims; calibration claims; tuning
recommendations. Those remain in the sources of truth and the pinned tests.
