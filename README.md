# World Cup Probability Lab ⚽📊

A beautiful, **explainable** FIFA World Cup 2026 prediction and simulation app.
It blends football strength, squad quality, manager nationality, a weak
economic/structural prior and climate/acclimatization into transparent
probabilities, then runs a Monte Carlo simulation of the whole tournament.

> Educational forecasting — **not** a betting product. All figures are model
> estimates, not certainties.

This repository is the **phase-one foundation** (+ phase 1.1 hardening): a clean,
extensible base designed to be upgraded with fully official data and stronger
models later.

### Data provenance (tri-state)
The data layer tags every dataset so candidate data is never implied to be
official:

| Status | Meaning | Current use |
| --- | --- | --- |
| `verified` | Official FIFA source / authoritative JSON | *(none yet)* |
| `candidate` | Cross-verified from credible non-FIFA sources | **Group composition + 48-team identities** (Final Draw, 5 Dec 2025) |
| `mock` | Hand-authored placeholder | Fallback dataset; all **model feature values** (Elo, economy, squad, form, climate) |

Fixtures are tagged `official` or `generated`. Currently **generated** (the
official 72-match schedule and the Round-of-32 / Annexe C bracket could not be
fetched — FIFA endpoints returned HTTP 403 — so they remain TODO and the
simulator uses a documented placeholder bracket).

## Features
- **Forecast Dashboard** — title-win table, stage columns, probability bars,
  top contenders chart, top movers, model summary.
- **Match Predictor** — every group fixture with win/draw/loss, expected goals,
  most-likely scorelines and key drivers.
- **Team Detail** — full feature profile, manager & climate signals, stage
  funnel chart, per-match model explanations.
- **Scenario Lab** — override any group result and watch standings &
  qualification recompute live.
- **Methodology** — the whole model explained in plain English.

## Tech stack
Next.js 14 (App Router) · TypeScript (strict) · Tailwind CSS · shadcn/ui-style
components · Recharts · Vitest. No database, no APIs, no keys.

## Run locally
```bash
npm install
npm run dev      # http://localhost:3000
```

Other scripts:
```bash
npm run build      # production build (runs the simulation at build time)
npm run test       # Vitest unit tests
npm run typecheck  # strict tsc, no emit
npm run lint       # Next.js eslint
```

No environment variables or API keys are required.

## Project structure
```
app/          App Router pages (dashboard, matches, teams, scenario, methodology)
components/   UI primitives, charts, and feature components
lib/types     Domain types (single source of truth)
lib/data      Data access layer (groups, fixtures, getters)
lib/model     Weights/config, features, prediction engine, forecast layer
lib/simulation Poisson engine, seeded RNG, standings, Monte Carlo, scenarios
data/         Static seed data (48 teams, venues)
docs/         Product spec, architecture, methodology, data & roadmap
tests/        Vitest suites
```
See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design and
[`docs/MODEL_METHOD.md`](docs/MODEL_METHOD.md) for the model math.

## How it works (60-second version)
1. Each matchup is scored across seven signals into one Elo-equivalent edge
   (`lib/model/predict.ts`, weights in `lib/model/config.ts`).
2. That edge becomes expected goals, fed to a Poisson engine for scorelines and
   win/draw/loss (`lib/simulation/poisson.ts`).
3. A seeded Monte Carlo simulator plays the tournament thousands of times and
   counts how often each team reaches each stage
   (`lib/simulation/tournament.ts`).

## Replacing placeholder data & tuning
- All team numbers are realistic **mock** placeholders — see
  [`docs/DATA_SOURCES_TO_ADD_LATER.md`](docs/DATA_SOURCES_TO_ADD_LATER.md).
- Tune the model entirely from `lib/model/config.ts`.
- Roadmap (real data, Supabase, live updates, player data) in
  [`docs/NEXT_PHASES.md`](docs/NEXT_PHASES.md).

## License
Hobby/educational project. Verify third-party data licensing before integrating
real feeds.
