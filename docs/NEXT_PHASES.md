# Next Phases

A roadmap from the foundation to a richer product. Each item lists the
**seam** it plugs into so work stays modular.

## Done in phase 1.1 (hardening)

- Tri-state data provenance (`mock` / `candidate` / `verified`) plus
  resolver/validation with mock fallback.
- Candidate official group composition and 48-team identities.
- FIFA Article 13 group tiebreakers and a separate third-place ranking.
- Weak structural/economic driver; honest "Standout contenders" plus the
  pure `computeProbabilityDeltas` snapshot-delta seam.
- CI on pull requests into `main` and pushes to `main`; expanded test suite.

## Done in phase 1.2 (official bracket engine)

- Typed knockout graph (R32 M73-M88 + R16/QF/SF/3rd/final propagation) and an
  explicit 495-row Annexe C allocation type as the source of truth.
- Validation layer (`bracket-validate.ts`): 16 R32 matches, each group
  winner/runner-up once, 8 third slots, valid propagation, full 495 coverage.
- Realiser (`realiseOfficialBracket`) + simulator integration behind an
  `isBracketActive` gate; placeholder seeding preserved as fallback.
- Synthetic fixture proves the engine; real graph + Annexe C stay empty
  templates (`sourceStatus: "mock"`) until transcribed and confirmed verified.

## Done in phase 1.4 (fixtures & draw positions)

- Draw positions on `Team` (`drawPosition`/`drawSlot`/`drawSlotStatus`): only the
  3 co-hosts are source-backed (Mexico A1, Canada B1, USA D1); all other slots
  stay undefined - no placeholder slot is ever stored on a team.
- Group fixtures generated strictly from the FIFA Article 12.4 pairing chart
  (MD1 1v2/3v4, MD2 1v3/4v2, MD3 4v1/2v3) via `buildGroupStageFixtures`.
- Tri-state fixture provenance: `official` / `position-generated` /
  `mock-generated`, surfaced per fixture (chips) and in the data badge.
- Empty position-keyed schedule template (`data/official/fixtures.ts`) +
  `validateDrawPositions` / `validatePositionPairings` / `validateOfficialFixtures`.

> **Fixtures note (draw positions & schedule).**
>
> Generated fixtures carry the regulation Art. 12.4 pairing but NO kickoff dates
> or official chronological order, and the real schedule may differ from the
> pairing chart. Go/no-go to `verified`: (1) draw positions - supply all 48 Final
> Draw positions so `validateDrawPositions` passes, then flip non-host
> `drawSlotStatus`; (2) schedule - populate all 72 rows of
> `data/official/fixtures.ts` so `validateOfficialFixtures` passes, which flips
> `fixtureSource` to `"official"`. Until then nothing claims an official order.

## Done in phase 1.5 (candidate schedule & draw-order staging)

- Staged an **isolated** candidate layer under `data/candidate/` from two
  THIRD-PARTY sources (a newspaper wallchart + a fan-made interactive Excel
  workbook), reconciled against each other and the Article 12.4 chart:
  candidate group membership, intra-group draw order (positions 1-4), and a
  72-fixture chronological schedule with kickoffs (UTC), venues, and match
  numbers. See `docs/CANDIDATE_SCHEDULE_RECONCILIATION.md`.
- `lib/data/validate-candidate.ts` validates coverage (48/12/72, 6 per group,
  every team in 3 games, host slots preserved, Article 12.4 pairings) and
  `reconcileSources` compares the two sources by (group, unordered pair). The
  Excel value is kept as the candidate value; the Telegraph is the visual
  cross-check; conflicts are reported, never auto-resolved. Two date conflicts
  (M20 Austria v Jordan, M36 Tunisia v Japan) are flagged for manual review.
- Provenance-bearing raw snapshots committed (`data/candidate/raw/*.json`) plus
  a dev-only extractor (`scripts/extract-candidate-schedule.py`); the source
  binaries are NOT committed. No runtime dependencies were added.

> **Candidate layer is staging only - NOT official.** The production resolver
> (`lib/data/source.ts`) never imports `data/candidate/`, so `fixtureSource`
> stays `position-generated` and no non-host draw slot is written onto a `Team`.
> A safety regression test locks this. There is no preview UI in this phase
> (`CANDIDATE_SCHEDULE_PREVIEW = false`).
>
> **Go/no-go to promote candidate -> official/verified.** Agreement between the
> two third-party sources RAISES CONFIDENCE but is NOT sufficient. Promotion
> requires an **official FIFA source** OR **user-supplied authoritative JSON the
> user explicitly approves as authoritative**. Only then (a separate, approved
> change) populate `data/official/fixtures.ts` (position-keyed M1-M72) and the
> 48 `Team.drawPosition`/`drawSlot`/`drawSlotStatus`, let
> `validateOfficialFixtures`/`validateDrawPositions` pass, and the resolver
> flips `fixtureSource` to `"official"`.

## Done in phase 1.6 Step A (official schedule staged for verification)

- Transcribed the **official** FIFA 2026 group-stage schedule (M1-M72) from the
  user-supplied PDF (`FWC26_Match_Schedule_v17_10042026_EN.pdf`, v17 / 10 Apr
  2026, all times ET, **subject to change**) into an isolated staging layer
  (`data/official/staging/`) that the resolver never imports.
- Solved + validated all 48 Final-Draw positions from the schedule's directed
  Art. 12.4 pairings (unique solution per group; host slots A1/B1/D1 preserved),
  and proved via a **dry-run** that activation would pass the existing
  `validateOfficialFixtures` / `validateFixtures` / `validateDrawPositions`.
- Cross-checked every fixture against the Telegraph/Excel candidate layer: 72/72
  agree, and the official schedule **confirms** the manual M20/M36 resolutions.
  See `docs/OFFICIAL_SCHEDULE_TRANSCRIPTION_AUDIT.md`.
- Provenance kept (v17 / 10 Apr 2026 / ET / subject-to-change) on every staged
  row + the raw snapshot; the PDF binary is NOT committed; no runtime deps added.

## Done in phase 1.6 Step B (official schedule ACTIVATED)

- Populated `data/official/fixtures.ts` from the staged schedule (72 rows, derived
  via `.map` - no duplication) and wrote all 48 verified draw positions to
  `data/official/teams.ts` from `stagedDrawPositions` (host slots A1/B1/D1
  preserved). The resolver now serves `fixtureSource: "official"` (no fallback);
  72 official fixtures materialise with match numbers, kickoffs and venues.
- UI surfaces official venues/dates/match numbers and the provenance label
  "Official FIFA schedule, v17, 10 Apr 2026, subject to change". Team identities +
  model features are unchanged (`sourceStatus` stays `candidate`); the
  Telegraph/Excel candidate layer remains a cross-check only.
- No bracket/model/simulation/nav changes; bracket + tournament suites stay green.

## Done in phase 1.7 (model-input layer + honest provenance + placeholder caps)

- Added a versioned model-input layer (`data/model-inputs/`): a per-family source
  registry (`sources.ts`) with honest statuses (verified / source-backed /
  candidate / manual / placeholder) + a derived per-team snapshot
  (`team-inputs.ts`) the model now reads strength values from (via
  `lib/model/features.ts`), so a future source-backed snapshot drops in without
  changing model logic.
- Nothing is claimed source-backed: Elo/FIFA ranking/structural are `manual`;
  squad quality/recent form/climate are `placeholder`; host/regional/manager are
  identity-derived. Promotion to source-backed requires a supplied snapshot +
  `lib/data/validate-model-inputs.ts`.
- Placeholder families are **weight-capped** so they cannot silently drive
  probabilities: per-driver +/-`PLACEHOLDER_CONTRIBUTION_CAP` and combined
  +/-`TOTAL_PLACEHOLDER_CONTRIBUTION_CAP` (`lib/model/config.ts`), applied +
  disclosed (family/status/capped) in `lib/model/predict.ts` explanations. Finite
  guards remove any NaN risk.
- Methodology page + team-detail tiles show each input's status; schedule,
  bracket, Annexe C, draw slots and `fixtureSource: "official"` are unchanged.

## Done in phase 1.8 (FIFA ranking promoted to source-backed)

- Promoted ONLY the `fifaRanking` family from `manual` to `source-backed` from a
  user-supplied FIFA/Coca-Cola Men's World Ranking PDF snapshot (date 11 Jun 2026),
  reviewer-transcribed + visually verified (`data/model-inputs/snapshots/
  fifa-ranking-2026-06-11.ts`, 48 teams). Added `fifaRankingPoints` (carried for
  explainability; not a new driver). Points are FIFA-published, not recalculated.
- `validateFifaRankingSnapshot` asserts 48 rows, unique ids/ranks, ranges, name
  mapping, source metadata, and that no other family status changed. Elo +
  structural stay `manual`; squad/form/climate stay `placeholder` (capped). No
  model weights changed; `fixtureSource` stays `"official"`. See
  `docs/FIFA_RANKING_SNAPSHOT_AUDIT.md`.

## Done in phase 1.9 (frozen pre-tournament forecast behaviour audit)

- Added a deterministic QA audit (`tests/forecast-behavior.test.ts`, invariant-only)
  over the **frozen pre-tournament baseline** (11 Jun 2026 FIFA snapshot + manual
  Elo + official schedule): determinism, finiteness, probability bounds/sums, the
  stage funnel, placeholder caps binding, source-backed/manual driver disclosure,
  and `fixtureSource === "official"`. Plus an audit-only group-winner sim
  (P(finish 1st) via the production Article-13 standings) - distinct from
  qualifyTop2.
- Generated `docs/FORECAST_BEHAVIOR_AUDIT.md` (guarded behind
  `WRITE_FORECAST_AUDIT=1`; real numbers, frozen seed `20260611`). **Finding:**
  manual Elo dominates the source-backed FIFA ranking (abs-magnitude ~61% vs ~16%).
  Recommendation: run a **separate calibration phase** before/with Elo ingestion.
  No model weights/data/schedule/bracket changed; baseline-only (not conditioned on
  matches played after 11 Jun, not compared to actual outcomes).

## Phase 2 - Verified data

- Obtain official FIFA group/fixture/venue data (or authoritative JSON);
  populate `data/official/*` and flip `sourceStatus` to `verified`.
- Parse the regulations PDF for the R32 skeleton (M73-M88) and Annexe C;
  implement `lib/simulation/bracket.ts` and un-skip the guarded bracket tests.
- Build `lib/data/sources/` adapters for Elo, FIFA ranking, market value, and
  World Bank; compute `recentForm` / `climateFamiliarity` / `conductScore`
  from data.
- Replace position-generated fixtures with the official schedule: populate
  `data/official/fixtures.ts` (position-keyed M1-M72) + the 48 Final Draw
  positions, flipping `fixtureSource` to `"official"`.

> **Bracket note (R32 / Annexe C).**
>
> The engine (types, validation, realiser, integration, fallback) is built and
> tested against a synthetic fixture as of phase 1.2. What remains is the
> **data**: transcribe the R32 skeleton (M73-M88) + propagation into
> `data/official/knockout-graph.ts`, and all 495 Annexe C rows into
> `data/official/third-place-allocation.ts`, from the official regulations PDF
> (which returned HTTP 403 to our fetch agent).
>
> **The official path stays inactive until everything is source-verified.** Do
> not flip `data/official/bracket.ts` to `verified` until the graph + all 495
> Annexe C rows are present, `validateBracket` passes, and the source is
> confirmed authoritative. Until then the simulator uses placeholder seeding
> (`seedBracket`).

## Phase 3 - Stronger model

- Upgrade the scoreline engine to **bivariate Poisson / Dixon-Coles** (goal
  correlation and low-score correction). Seam: `lib/simulation/poisson.ts`.
- Calibrate weights against historical results (log-loss / Brier on past
  tournaments) instead of hand-tuning. Seam: `lib/model/config.ts`.
- Add a proper home-advantage term and travel/rest effects.

## Phase 4 - Persistence (Supabase)

- Introduce Supabase **as a data store only** (still no auth required).
- Suggested tables mirror the types: `teams`, `venues`, `fixtures`,
  `feature_sets`, `snapshots`, `stage_probabilities`, `predictions`.
- Store dated `snapshots` so **Standout contenders can evolve into real
  snapshot-over-snapshot movers once Supabase snapshot history exists** (today
  the card compares against the field baseline only).
- Seam: back `lib/data/index.ts` and `lib/model/forecast.ts` with DB reads;
  keep the selector API identical so the UI is untouched.
- Generate the SQL schema as documentation first (see the schema sketch below).

## Phase 5 - Live match updates

- During the tournament, ingest live scores (polling or webhook).
- Re-run the simulation for the **remaining** matches only and write a new
  snapshot.
- Add a lightweight client refresh (or Supabase Realtime) so the dashboard
  updates between matches.
- Surface "before vs after this result" deltas using the snapshot history.

## Phase 6 - Player-level depth

- Add `players` with value/availability; derive `squadQuality` bottom-up.
- Model injuries/suspensions as squad-quality adjustments per match.
- Optional: position-level strength for matchup-aware predictions.

## Phase 7 - Product polish

- Shareable team/match cards (OG images), saved scenarios, comparison view.
- Accessibility pass and motion-reduced mode.
- Optional Python service for a heavier simulation engine, kept behind the same
  data contracts (TypeScript stays the default).

## Supabase schema sketch (documentation only - not wired up)

```sql
create table teams (
  id text primary key,
  name text not null,
  country_code text not null,
  confederation text not null,
  group_id text not null,
  flag text,
  fifa_ranking int,
  elo numeric,
  gdp_per_capita numeric,
  population bigint,
  manager_nationality text,
  same_nationality_manager boolean,
  squad_quality numeric,
  recent_form numeric,
  climate_familiarity numeric
);

create table venues (
  id text primary key,
  name text,
  city text,
  country text,
  climate text,
  avg_temp_c numeric,
  capacity int
);

create table fixtures (
  id text primary key,
  matchday int,
  group_id text,
  home_team_id text references teams(id),
  away_team_id text references teams(id),
  venue_id text references venues(id),
  kickoff timestamptz
);

create table snapshots (
  id uuid primary key default gen_random_uuid(),
  iterations int,
  seed bigint,
  generated_at timestamptz default now()
);

create table stage_probabilities (
  snapshot_id uuid references snapshots(id),
  team_id text references teams(id),
  qualify_top2 numeric,
  qualify_third numeric,
  round_of_32 numeric,
  round_of_16 numeric,
  quarter_final numeric,
  semi_final numeric,
  final numeric,
  winner numeric,
  primary key (snapshot_id, team_id)
);
```

## Guardrails to keep through every phase

- No betting/gambling framing, odds, or monetization.
- Always present outputs as probabilities with uncertainty.
- Keep model logic out of UI components and behind `lib/model/forecast.ts`.
