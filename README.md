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
| `verified` | Official FIFA source / authoritative JSON | **Official 72-match schedule** (v17, subject to change), **48 draw positions**, and the **knockout bracket graph (M73–M104) + all 495 Annexe C rows** |
| `candidate` | Cross-verified from credible non-FIFA sources | **Group composition + 48-team identities** (Final Draw, 5 Dec 2025) |
| `mock` | Hand-authored placeholder | Fallback dataset; capped **model feature placeholders** (squad, recent form) |

Fixtures are tagged `official` or `generated`. The official 72-match schedule
(v17, 10 Apr 2026, **subject to change**) is active, and the **official Round-of-32
/ Annexe C knockout bracket is verified (2026-06-17) and production-active** — the
forecast simulator and the live-state derivation both use the official bracket
path. Article 13 standings and Annexe C allocation are the internal source of
truth; provider standings/bracket are not canonical. A balanced-seeding
placeholder remains only as an inactive fallback if the bracket is ever marked
unverified.

## Features
- **Forecast Dashboard** — title-win table, stage columns, probability bars,
  top contenders chart, standout contenders, model summary.
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
