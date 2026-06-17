# Next Phases

A roadmap from the phase-one foundation to a richer product. Each item lists the
**seam** it plugs into so work stays modular.

## Phase 2 — Real data
- Build `lib/data/sources/` adapters for Elo, FIFA ranking, market value,
  World Bank (see `DATA_SOURCES_TO_ADD_LATER.md`).
- Add a refresh script that normalizes into the existing `Team`/`Venue` types.
- Compute `recentForm` and `climateFamiliarity` from data instead of hand
  values.
- Replace the generated fixtures + bracket with the official 2026 schedule.

## Phase 3 — Stronger model
- Upgrade the scoreline engine to **bivariate Poisson / Dixon-Coles** (goal
  correlation + low-score correction). Seam: `lib/simulation/poisson.ts`.
- Calibrate weights against historical results (log-loss / Brier on past
  tournaments) instead of hand-tuning. Seam: `lib/model/config.ts`.
- Add a proper home-advantage term and travel/rest effects.

## Phase 4 — Persistence (Supabase)
- Introduce Supabase **as a data store only** (still no auth required).
- Suggested tables mirror the types: `teams`, `venues`, `fixtures`,
  `feature_sets`, `snapshots`, `stage_probabilities`, `predictions`.
- Store dated `snapshots` so **Top Movers** can diff real snapshot-over-snapshot
  change (currently a placeholder vs field-average).
- Seam: back `lib/data/index.ts` + `lib/model/forecast.ts` with DB reads; keep
  the selector API identical so UI is untouched.
- Generate the SQL schema as documentation first (see schema sketch below).

## Phase 5 — Live match updates
- During the tournament, ingest live scores (polling or webhook).
- Re-run the simulation for **remaining** matches only and write a new snapshot.
- Add a lightweight client refresh (or Supabase Realtime) so the dashboard
  updates between matches.
- Surface "before vs after this result" deltas using the snapshot history.

## Phase 6 — Player-level depth
- Add `players` with value/availability; derive `squadQuality` bottom-up.
- Model injuries/suspensions as squad-quality adjustments per match.
- Optional: position-level strength for matchup-aware predictions.

## Phase 7 — Product polish
- Shareable team/match cards (OG images), saved scenarios, comparison view.
- Accessibility pass and motion-reduced mode.
- Optional Python service for a heavier simulation engine, kept behind the same
  data contracts (TS stays the default).

## Supabase schema sketch (documentation only — not wired up)
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
  id text primary key, name text, city text, country text,
  climate text, avg_temp_c numeric, capacity int
);

create table fixtures (
  id text primary key, matchday int, group_id text,
  home_team_id text references teams(id),
  away_team_id text references teams(id),
  venue_id text references venues(id),
  kickoff timestamptz
);

create table snapshots (
  id uuid primary key default gen_random_uuid(),
  iterations int, seed bigint, generated_at timestamptz default now()
);

create table stage_probabilities (
  snapshot_id uuid references snapshots(id),
  team_id text references teams(id),
  qualify_top2 numeric, qualify_third numeric,
  round_of_32 numeric, round_of_16 numeric, quarter_final numeric,
  semi_final numeric, final numeric, winner numeric,
  primary key (snapshot_id, team_id)
);
```

## Guardrails to keep through every phase
- No betting/gambling framing, odds, or monetization.
- Always present outputs as probabilities with uncertainty.
- Keep model logic out of UI components and behind `lib/model/forecast.ts`.
