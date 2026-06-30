# Product Spec — World Cup Probability Lab

## Vision
A beautiful, **explainable** FIFA World Cup 2026 prediction and simulation web
app. It blends football strength, squad quality, manager nationality, a **weak
economic/structural prior** and climate/acclimatization into transparent
probabilities, and uses Monte Carlo simulation to project the whole tournament.
It is an **educational data-science hobby project** — never a betting product.

> Status note: group composition + 48-team identities are `candidate`
> (cross-verified). The official 72-match schedule (v17, **subject to change**),
> the 48 draw positions, and the knockout bracket graph + all 495 Annexe C rows
> are now `verified` and active (Article 13 + Annexe C are the internal source of
> truth; provider standings/bracket are not canonical). Model feature values are
> mixed: `eloRating` and `fifaRanking` are source-backed; squad/recent-form remain
> capped placeholders; structural/economic and climate are candidate priors — not
> determinative predictors.

## Phase one (this build) — what exists
A clean, extensible foundation running entirely on **static seed data** and
**deterministic model logic**. No live APIs, no auth, no paid services, no ML.

### Delivered
- **48-team field** drawn into **12 groups of 4**, with venues and a generated
  group-stage fixture list.
- **Baseline prediction engine** — transparent, Elo-anchored, fully documented
  weights; outputs win/draw/loss, expected goals and ranked driver
  explanations.
- **Poisson scoreline engine** — exact scoreline probabilities and the
  win/draw/loss split, decoupled from team logic.
- **Monte Carlo tournament simulator** — simulates every group match, builds
  standings, qualifies top-2 + best-8 thirds, runs a seeded knockout bracket,
  and aggregates per-team stage probabilities (R32 → Winner).
- **Five pages**: Forecast Dashboard, Match Predictor, Team Detail, Scenario
  Lab, Methodology.
- **Premium dark-first UI** with cards, probability bars, responsive tables and
  Recharts visualizations.
- **Tests** for prediction shape, standings, simulation shape and probability
  sums (Vitest).

## Audience
Football and data-curious users who want to *understand* forecasts, not just
read a single number.

## Non-goals (phase one)
- No live data integration.
- No authentication or user accounts.
- No paid/3rd-party services or Supabase wiring (schema only, as docs).
- No advanced ML.
- **No betting/gambling language, odds, or monetization of any kind.**

## Success definition
The app runs locally with no API keys, looks polished, simulates a tournament
from seed data, shows team and match probabilities, and clearly explains the
model — and placeholder data and the model weights can be replaced/tuned
without rewrites.

## Responsible-use stance
All figures are model estimates with inherent uncertainty. The UI consistently
frames outputs as probabilities (not certainties) and carries an explicit
"not a betting product" notice on the Methodology page and in the footer.
