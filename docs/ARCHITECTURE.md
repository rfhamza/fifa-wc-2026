# Architecture

## Tech stack
- **Next.js 14 (App Router)** + **React 18** + **TypeScript** (strict)
- **Tailwind CSS** with a dark-first design-token palette
- **shadcn/ui-style** primitives (hand-built, no runtime CLI dependency)
- **Recharts** for charts
- **Vitest** for unit tests
- Local **TypeScript/JSON seed data** (no database, no APIs in phase one)

The first simulation engine is **TypeScript** (not Python): it shares types
with the UI, runs in the same process during SSG, and avoids a separate
runtime. Python remains an option later for a heavier engine, kept fully
separate behind the same data contracts.

## Layered design
Data flows in one direction; each layer only knows the layer beneath it.

```
 UI (app/, components/)
        │  reads selectors only
        ▼
 Forecast layer (lib/model/forecast.ts)   ← memoizes the snapshot
        │
        ├── Prediction model (lib/model/*)
        │        uses → Poisson engine
        └── Simulation engine (lib/simulation/*)
                 uses → model + Poisson + RNG + standings
        │
        ▼
 Data access layer (lib/data/index.ts)
        │  the ONLY place seed data is imported
        ▼
 Seed data (data/*.ts)        Types (lib/types)
```

### Key rule
UI components **never** call the model or simulator directly — they call
`lib/model/forecast.ts`, which runs the simulation **once** and memoizes the
snapshot for the process. This keeps pages fast and the data contract narrow.

## Data resolution & provenance
`lib/data/index.ts` resolves the active dataset once via
`lib/data/source.ts → resolveDataset()`:

- **Candidates** are assembled in `data/official/` (real Final-Draw identities,
  `sourceStatus: "candidate"`) and `data/mock/` (placeholders, `"mock"`).
- The resolver prefers the highest-priority dataset (`verified` > `candidate` >
  `mock`) **that passes `validateDataset()`** (48 teams, 12 groups × 4, unique
  ids, referential integrity). Fallback is keyed on **validity/completeness**, not
  on any boolean flag.
- Fixtures (tri-state): an official chronological schedule is used only if
  present, position-resolvable, **and** referentially valid
  (`fixtureSource: "official"`); otherwise pairings are generated from the FIFA
  Article 12.4 draw-position chart — `"position-generated"` on the
  official/candidate field, `"mock-generated"` on the mock field. Generated
  fixtures carry the regulation pairing but no kickoff dates/official order.
- Draw positions: only source-backed slots live on `Team` (the 3 co-hosts today);
  the generator fills remaining positions with an internal placeholder ordering
  that is never persisted onto a team.
- `sourceStatus`, `fixtureSource`, and `bracket` are re-exported and surfaced in
  the UI (`components/data-source-badge.tsx`, per-fixture chips, footer) so
  candidate/generated data is never implied to be official.

Swapping in fully official data later means only editing `data/official/*` and
flipping its status — consumers and the simulator are untouched.

## Directory map
```
app/                      App Router pages
  page.tsx                Forecast dashboard
  matches/                Match predictor
  teams/ , teams/[teamId] Team list + detail
  scenario/               Scenario lab (what-if)
  methodology/            Plain-English methodology
  layout.tsx, globals.css Shell + design tokens

components/
  ui/                     shadcn-style primitives (card, badge, button, table)
  charts/                 ProbabilityBar/Meter, Recharts (winner, stage funnel)
  dashboard/              Hero, winner table, model summary, standout contenders
  matches/                FixtureCard
  teams/                  StatTile
  scenario/               ScenarioSimulator (client)
  site-header.tsx, team-flag.tsx

lib/
  types/                  All domain types (single source of truth)
  data/                   Data access layer (groups, fixtures, getters)
  model/                  config (weights), features, predict, forecast
  simulation/             poisson, rng, standings, tournament, scenario
  utils.ts                cn(), pct(), clamp(), round(), signedPct()

data/                     Static seed data (teams, venues)
docs/                     This documentation
tests/                    Vitest suites
```

## Purity & testability
- `lib/simulation/poisson.ts`, `rng.ts`, `standings.ts` and the model math are
  **pure** (no I/O, deterministic). They are unit-tested directly.
- The simulator is **seeded** (mulberry32) → identical output for a given
  `(iterations, seed)` pair, which makes snapshots and tests reproducible.

## Rendering model
All pages are statically generated (SSG). The simulation runs at build time and
its memoized snapshot feeds every page. There are no client-side data fetches;
the only client component is the interactive Scenario Lab, which recomputes
group standings locally using the same pure `standings` code.

## Extension seams (designed for, not yet built)
- **Swap data**: replace `data/*.ts` or back `lib/data/index.ts` with a DB/API.
- **Swap the scoreline model**: `lib/simulation/poisson.ts` exposes a narrow
  interface (lambdas in → scorelines out) for a Dixon-Coles upgrade.
- **Swap the bracket**: `seedBracket()` + qualifier ordering in
  `lib/simulation/tournament.ts` is isolated and clearly marked replaceable.
- **Tune the model**: every weight lives in `lib/model/config.ts`.
