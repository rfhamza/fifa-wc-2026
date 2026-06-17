# Model Methodology

This document is the technical companion to the in-app `/methodology` page.

## 1. Feature engineering (`lib/model/features.ts`)
A raw `Team` is normalized into a `TeamFeatureSet`. This is also where context
flags are derived:
- `isHost` — team is USA, Canada or Mexico.
- `isRegional` — team is in CONCACAF but not a host.

Keeping this separate means a new data source only changes *how* features are
built, never the math.

## 2. Driver model (`lib/model/predict.ts` → `computeDrivers`)
Each signal contributes a **signed value in Elo-equivalent points** to Team A's
advantage over Team B (positive favours A). Using one unit lets every driver
combine and be ranked in the explanation.

| Driver | Formula (A vs B) | Weight (`config.ts`) |
| --- | --- | --- |
| Elo rating | `(eloA − eloB) × w.elo` | `elo = 1.0` |
| FIFA ranking | `(rankB − rankA) × w.fifaRankingPerPlace`, capped | `1.4` / cap `90` |
| Squad quality | `(sqA − sqB) × w.squadQuality` | `4.0` |
| Recent form | `(formA − formB) × w.recentForm` | `2.0` |
| Manager cohesion | `(sameA − sameB) × w.manager` | `15` |
| Host advantage | `(hostA − hostB) × w.host` | `60` |
| Regional advantage | `(regionalA − regionalB) × w.regional` | `18` |
| Climate familiarity | `(climA − climB) × w.climate` | `0.8` |
| Structural depth (economic) | `(structA − structB) × w.structural` | `10` (weak) |

`netAdvantage = Σ contributions`. `explainDrivers()` splits the drivers into
ranked positive/negative lists for the UI.

### Structural / economic prior
`structuralDepth ∈ [0,1]` blends **log-scaled GDP per capita** (footballing
infrastructure proxy) and **log-scaled population** (talent-pool proxy),
computed in `lib/model/features.ts`. It is deliberately a **weak** prior: the
full 0→1 range moves the rating by only `w.structural` (10) Elo points — an
order of magnitude below squad/Elo signals. It exists so the "uses economic
indicators" claim is true and auditable, **never** as a determinative match-level
predictor.

> **Why Elo as the anchor?** Elo is already a calibrated strength scale, so a
> weight of `1.0` makes it the natural reference and every other weight is "how
> many Elo points is this signal worth".

## 3. From advantage to expected goals (`expectedGoalsFromAdvantage`)
```
supremacy = netAdvantage / supremacyPerGoal        // 250 Elo pts ≈ 1 goal
home xG   = max(min, baseTotalGoals/2 + supremacy/2)
away xG   = max(min, baseTotalGoals/2 − supremacy/2)
```
`baseTotalGoals = 2.6`, `minExpectedGoals = 0.18`. The split is symmetric, so
swapping the two teams mirrors the prediction (verified by test).

## 4. Scoreline engine (`lib/simulation/poisson.ts`)
Each team's goals are modelled as independent Poisson variables with their xG as
λ. We enumerate the joint matrix up to 8 goals/side (upper tail folded into the
last bucket so it sums to ~1), then:
- **Win/draw/loss** = summing the appropriate matrix cells.
- **Top scorelines** = the most probable cells.

This module knows nothing about teams — only λ values — so it can be replaced by
a bivariate / Dixon-Coles model (adding goal correlation and a low-score
correction) without touching callers.

## 5. Monte Carlo tournament (`lib/simulation/tournament.ts`)
For each of `iterations` runs (default 2,000, seed 20260611):
1. **Group stage** — sample a Poisson goal count for both sides of all 72
   fixtures (λ precomputed once).
2. **Standings** — `computeGroupStandings` with full **FIFA Article 13**
   tiebreakers (see §5a).
3. **Qualification** — top 2 of each group (24) + the **8 best third-placed**
   teams across all groups (32 total). Best-thirds are ranked by
   `rankThirdPlacedTeams` using the SEPARATE all-group criteria (no H2H).
4. **Knockout** — seed the 32 qualifiers by strength, lay them into a standard
   single-elimination bracket (`seedBracket`), and simulate each tie: sample
   both scores; if level, a strength-weighted penalty shootout decides it.
5. **Aggregate** — count how often each team reaches each stage; divide by
   `iterations` → probabilities. Also accumulate average standings.

Determinism: one shared seeded RNG (mulberry32) → identical results for the same
`(iterations, seed)`.

### 5a. Group tiebreakers — FIFA Article 13 (`lib/simulation/standings.ts`)
Teams level on points are resolved in this exact order:
1. Points (all group matches)
2. **Head-to-head points** among the tied teams
3. Head-to-head goal difference
4. Head-to-head goals scored
5. **Reapply 2–4** to any teams still tied (recursive, on the smaller subset)
6. All-group goal difference
7. All-group goals scored
8. Conduct/fair-play score — **placeholder `0`** for all teams (TODO: real
   disciplinary data)
9. **FIFA ranking** (lower number wins) — deterministic final fallback

Drawing of lots is intentionally not modelled (the ranking fallback keeps runs
reproducible). The **third-placed ranking is separate** and uses points →
all-group GD → all-group GF → conduct → FIFA ranking (NO head-to-head, since
those teams did not meet).

### Bracket builder — ⚠️ PLACEHOLDER (Round of 32)
`seedBracket()` + qualifier ordering produce a **balanced, deterministic** bracket
(1v32, 2v31, …). This is **not** the official 2026 position chart. The official
R32 slot skeleton (M73–M88) and the Annexe C third-place allocation live in the
FIFA regulations PDF, which returned **HTTP 403** to our fetch agent, so it could
not be source-verified. `data/official/bracket.ts` ships a typed template
(`sourceStatus: "mock"`) and `lib/simulation/bracket.ts` exposes
`isBracketVerified()`; the official-bracket tests stay **skipped** until the
mapping is populated and flipped to `verified`.

## 6. Tuning guide
All knobs live in `lib/model/config.ts`:
- Make a signal matter more/less → change its weight in `MODEL_WEIGHTS`.
- More/less decisive matches → change `SCORELINE_CONFIG.supremacyPerGoal`
  (smaller = bigger favourites) or `baseTotalGoals`.
- Smoother probabilities / faster runs → change
  `SIMULATION_CONFIG.defaultIterations`.
After tuning, run `npm test` — the suite checks shapes and that probabilities
sum logically, so it will catch gross mistakes.

## 7. Known modelling limitations (phase one)
- No goal correlation (independent Poisson) and no explicit low-score
  correction.
- No home advantage beyond the host signal (venues are neutral).
- Manager cohesion is a crude binary proxy.
- Placeholder bracket (see above).
- Inputs are mock placeholders, so absolute probabilities are illustrative;
  the **relative** ordering is the meaningful output in phase one.
