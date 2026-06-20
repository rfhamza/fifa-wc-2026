# Recent-Form Replacement Audit & Decision (Phase 1.16C)

**Decision: DO NOT replace the active `recentForm` placeholder yet (Option A).** The
source-backed recent-form candidate layer (Phase 1.16B) stays **audit-only / unwired**. The
active model continues to use the hand-authored `recentForm` placeholder (0..100, weight 2.0,
placeholder-capped), `recentForm` source status stays `placeholder`, and **no probabilities
change**.

This document records the audit behind that decision. It is a decision record only - no model
wiring, no code behaviour change.

## Why this was evaluated
Phase 1.16B produced a `source-backed` last-10 results snapshot and a RAW
`recentFormCandidateScore` (signed -1..+1). The question: should the new source-backed score
replace the hand-authored placeholder? Recent form overlaps heavily with Elo/FIFA (both already
encode results), so replacement had to be conservative and only if clearly better.

## 1. Candidate score distribution
- composite: **min -0.68, max +0.88, mean 0.188, median 0.213, population stdev 0.361**;
  15/48 negative; ~35% within [-0.2, +0.2]. Reasonably centred and well-spread.
- last-5 vs last-10: Pearson **0.80** (stable; not single-match noise).

### Top 10 (recent-form candidate)
Germany 0.88, Argentina 0.80, Japan 0.72, Austria 0.69, Turkiye 0.69, Belgium 0.65,
France 0.64, Portugal 0.61, Morocco 0.55, England 0.53.

### Bottom 10
New Zealand -0.68, Qatar -0.61, Ghana -0.51, Saudi Arabia -0.27, Jordan -0.21, Tunisia -0.21,
Sweden -0.21, Curacao -0.19, Uzbekistan -0.13, Bosnia & Herzegovina -0.13.

## 2. Placeholder vs candidate
- Pearson correlation `Team.recentForm` (0..100) vs candidate composite: **0.745** (coherent but
  not a duplicate).
- Rank reordering (candidate rescaled to 0..100): **28/48 teams shift >5 places** - e.g.
  Spain #2 -> #13, Uruguay #12 -> #35, Brazil #7 -> #20 (down); Turkiye, Austria, Algeria, Czechia
  (up).
- The candidate is more defensible on **provenance** (source-backed, repeatable) than the
  hand-authored placeholder, but it injects the easy-fixture bias below.

## 3. Correlation with Elo / FIFA (double-counting)
| Pair | Pearson r |
| --- | --- |
| candidate composite vs Elo rating | **0.774** |
| candidate composite vs FIFA rank (inverted) | **0.779** |
| placeholder (0..100) vs Elo rating | 0.843 |

The candidate **mostly re-measures strength already in Elo/FIFA** (only marginally more
independent than the placeholder). Double-counting risk is **moderate-to-high**.

## 4. Easy-fixture / friendly-heavy risk
Several top-form scores are built largely on **friendlies and few World Cup opponents**:
- Argentina (0.80) - ~70% friendlies, 2 WC opponents
- Germany (0.88) - ~40% friendlies, 3 WC opponents
- Portugal (0.61), Turkiye (0.69), France (0.64), England (0.53) - 20-50% friendlies, <=3 WC opp.

Conversely, Brazil, Spain, Uruguay and USA are **dragged down by competitive preparation** vs
strong/WC opposition. Raw form rewards warm-up results, not tournament-quality opposition. The
true fix is an **opponent-adjusted / Elo-residual** form measure, which is **deferred** (the repo
has no opponent Elo at match time - the Elo snapshot is a single as-of, 48-team file).

## 5. Scale analysis (why wiring is delicate)
The placeholder driver reaches +/-25 Elo (capped); the candidate is -1..+1.
- **B-literal** (value -1..+1, weight 2.0): recentForm contribution range ~**[-3.0, +3.1] Elo**
  (vs placeholder [-24, +25]); ~**0.6% max per-pair** win-probability swing. **Safe but nearly
  negligible** - it effectively mutes recent form.
- **B-rescaled** ((composite+1)*50, weight 2.0): contribution up to ~**+/-78 Elo** (~3.1x the
  placeholder, uncapped); ~**15.6% per-pair** swing, and it **amplifies the easy-fixture bias**
  (e.g. Argentina boosted off friendlies). **Rejected - overpowered.**

## 6. Decision
**Do not replace yet (Option A).** Reasons: high Elo/FIFA double-counting (0.774), easy-fixture
inflation of friendly-heavy top teams, and the genuinely additive Elo-residual is deferred. The
placeholder is already transparently labelled `placeholder` and weight-capped (no honesty
violation), so there is no urgent reason to swap a calibrated curated value for a biased raw one.
B-literal would be safe but near-negligible; B-rescaled is rejected as overpowered.

## 7. Future route
- **Phase 1.18:** build the **opponent-Elo residual** (form vs rating expectation, removing both
  the Elo double-count and the easy-fixture bias) and/or a friendly-match discount, validated by
  **historical backtesting/calibration**. Revisit active replacement then; if adopted, wire
  conservatively (small individual cap, regenerated sensitivity audit gating merge) - never the
  rescaled, overpowered form.

## 8. The snapshot remains valuable
This decision does **not** discard Phase 1.16B. The `source-backed` recent-results snapshot
(`data/model-inputs/snapshots/recent-form-2026-06-11.ts`) + utilities remain a committed,
validated **audit foundation**: the basis for the future opponent-Elo residual, for backtesting,
and for explainability - without being wired into live probabilities today.
