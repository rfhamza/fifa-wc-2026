# Production / Backtesting Parity Audit (Phase 1.18C-2)

> **Audit / documentation only.** No code, calibration, replay, tuning, or prediction-core extraction
> is performed here. This document records how the isolated historical backtesting evaluator relates to
> the production 2026 prediction path, what is shared vs duplicated vs omitted, and what must be proven
> before any calibration. **Parity is reasoned here, NOT test-proven.** The only *identified* prediction
> -output difference today is production's 4-decimal rounding, but **full numerical parity remains
> unproven** until a pure-core extraction + parity test exists (see §6). Calibration remains **NO-GO**.

## 1. Purpose & scope
The historical evaluator deliberately re-implements a small slice of production-style prediction so it
can stay isolated from 2026 `data/model-inputs`. That is appropriate for **descriptive diagnostics**.
Before any calibration could inform production behaviour, the parity gap must be understood and
eventually proven. This audit covers the match-level prediction path only (90-minute W/D/L); it does
not cover tournament replay, advancement, or champion outcomes (none implemented).

## 2. Current production prediction summary
Entry point: `predictFromFeatures(a, b, weights = MODEL_WEIGHTS)` in `lib/model/predict.ts`:
1. `computeDrivers(a, b, w)` produces the **full 10-driver path** (Elo; FIFA ranking, clamped to
   ±`fifaRankingCap` = 90; squadQuality; recentForm; manager; host; regional; climate; structural;
   tournamentContext), each expressed in Elo-equivalent points from A's perspective.
2. `explainDrivers(...)` applies `applyInputStatusAndCaps` — per-driver caps via `contributionCapFor` +
   `getFeatureStatus` (**placeholder → ±25**, **climate → ±25**, **tournamentContext → ±15**, with a
   pooled placeholder cap of ±40; all other families uncapped) — then sums to a net Elo advantage.
3. `expectedGoalsFromAdvantage(netAdvantage)` converts to per-side expected goals using
   `SCORELINE_CONFIG` (baseTotalGoals 2.6, supremacyPerGoal 250, minExpectedGoals 0.18).
4. `scorelineMatrix` → `outcomeProbabilities` (`lib/simulation/poisson.ts`) gives the W/D/L split.
5. Returns W/D/L **rounded to 4 decimals** (plus xG, top scorelines, and an explanation).

Pure/stateless given feature sets: `computeDrivers`, `contributionCapFor`,
`expectedGoalsFromAdvantage`, the Poisson functions, and the `config.ts` constants. **2026-tied:**
`predict.ts` statically imports `buildFeatureSet` (→ `getModelInputsForTeam`) and `getFeatureStatus`
from `@/data/model-inputs`, so **importing `predict.ts` loads the 2026 model-input module graph** — it
cannot be imported by the isolated harness today even though the underlying math is pure.

## 3. Current backtesting evaluator summary
`lib/backtesting/match-evaluator.ts` builds historical `TeamFeatureSet`s via `feature-adapter.ts`
(Elo + FIFA rank from the pack; host/regional relative to the pack's host; **every other feature set to
identical neutral constants for all teams**), then for each **diagnostic variant** computes a net Elo
advantage over the **active drivers only** — **Elo, FIFA rank (clamped ±90), host, regional** — using
the shared `MODEL_WEIGHTS`, replicates `expectedGoalsFromAdvantage` (≈6 lines, same `SCORELINE_CONFIG`),
and then uses the **shared** `scorelineMatrix` / `outcomeProbabilities`. It returns **unrounded**
probabilities; metrics live in `metrics.ts`; cross-tournament aggregation in `consolidate.ts`.
- **Shared production-safe imports:** `@/lib/model/config` (constants), `@/lib/simulation/poisson`
  (W/D/L), type-only `@/lib/types`.
- **Intentionally duplicated:** the four active driver formulas + the netAdvantage→expected-goals formula.
- **Intentionally omitted:** the other six drivers; status/caps; production's 4-dp rounding; production
  feature construction.
- **Isolation:** guard tests assert production never imports historical, and `lib/backtesting/*`
  imports no `data/model-inputs` / `lib/model/predict` / `lib/model/features` / 2026 path.

## 4. Parity comparison table
| Item | Classification | Note |
| --- | --- | --- |
| Elo driver | intentionally duplicated, expected to match | `(a.elo − b.elo) * w.elo` on both sides |
| FIFA-rank driver | intentionally duplicated, expected to match | `(b.rank − a.rank) * 1.4`, clamped ±90 on both sides |
| Host advantage | intentionally duplicated, expected to match | `(isHost A − B) * 60`; host derived per tournament in the harness |
| Regional advantage | intentionally duplicated, expected to match | `(isRegional A − B) * 18`; relative to the host confederation in the harness |
| Inactive/excluded drivers | production-only / omitted in backtesting | production computes all 10; on **equal neutral** historical features their A−B contribution is 0 |
| Placeholder/candidate caps | production-only (expected inert for the active set) | caps bind only placeholder/climate/tournamentContext (all zero here); active drivers are uncapped |
| Net advantage | intentionally duplicated, expected to match | active-driver sum equals production's sum **when** excluded contributions are 0 |
| Expected-goals conversion | intentionally duplicated, expected to match | harness mirrors `expectedGoalsFromAdvantage` via the same constants |
| Poisson W/D/L conversion | **shared exactly** | both call `lib/simulation/poisson.ts` |
| Probability normalisation / rounding | **parity risk (identified)** | production rounds to 4 dp; harness returns raw. Log-loss clamping is a metric step, not a prediction step |
| Metric targets | historical-only | production has no W/D/L scoring metrics; harness owns RPS/logLoss/Brier/accuracy |
| Score semantics | shared intent | 90-minute W/D/L; harness `goalsA/goalsB` = 90-minute score |
| Source-status handling | production-only | `getFeatureStatus` from `data/model-inputs`; harness has none (not needed for the active set) |
| 2026 data dependency | production-only | `predict.ts` → `data/model-inputs`; harness has none |
| Historical pack dependency | historical-only | harness reads `WC20xx_PACK`; production never does |

## 5. Parity risks & sufficiency
**Good enough for diagnostics (today).** The active-driver math, the shared Poisson step, and the
shared `config` constants make the harness a faithful Elo / FIFA / host / regional **diagnostic**. The
reasoning that production's extra six drivers do not change the comparison rests on the historical
features being neutral and equal between teams (so those drivers contribute 0 to production's net
advantage as well). This is **reasoned, not test-proven.**

**Not good enough for calibration.**
1. **Parity is not test-proven** — `predict.ts` cannot be imported in isolation (it pulls in 2026
   `data/model-inputs`), so no test currently asserts harness == production on identical inputs. The
   only *identified* output difference is production's 4-dp rounding; other differences cannot be ruled
   out until a parity test exists.
2. **The diagnostic variants are a 4-driver subset**, not the production 10-driver model — calibrating
   the subset would not directly calibrate production.
3. **Historical packs lack production-equivalent features** (squad / climate / structural /
   tournamentContext / manager), so a "production-equivalent" variant cannot be evaluated historically.
4. **Target is 90-minute W/D/L only** — no advancement, replay, or champion calibration.

**Must be proven before calibration:** a numerical-parity test showing the harness path and the
production **stateless core** yield identical W/D/L (within rounding) for identical feature sets — which
in practice requires a pure prediction core importable without `data/model-inputs`.

## 6. Pure prediction-core extraction — feasibility / design (NOT implemented here)
- **Shape:** a pure `lib/model/prediction-core.ts` exporting e.g.
  `predictCoreFromFeatures(a, b, weights, capPolicy?) → { drivers, netAdvantage, expectedGoals, wdl }`,
  with `computeDrivers` / `expectedGoalsFromAdvantage` relocated into it.
- **Inputs:** two already-built `TeamFeatureSet`s, `ModelWeights`, and an **injected** cap/status policy
  (e.g. a family→status map or a cap resolver) so the core never imports `getFeatureStatus`. **Outputs:**
  drivers, net advantage, expected goals, and **unrounded** W/D/L (rounding stays in the production wrapper).
- **Callers:** production `predict.ts` calls the core with the real status map (sourced from
  `data/model-inputs` in the wrapper, not the core) and applies its 4-dp rounding; the backtesting
  evaluator calls the core with a "no extra drivers / uncapped active set" policy and drops its
  duplicated math.
- **Avoiding 2026 imports:** the core imports only `config` + `poisson` + types; status/caps are
  parameters. The isolation guard would be updated to permit `lib/backtesting → lib/model/prediction-core`
  while still forbidding `data/model-inputs` / `predict` / `features`.
- **Proving no drift:** a golden test snapshots current `predictFromFeatures` outputs over a battery of
  feature pairs and asserts they are byte-identical after the refactor; plus a harness-vs-core parity
  test on neutral-excluded historical features (equal within 4-dp rounding).
- **Likely files (future PR):** add `lib/model/prediction-core.ts`; refactor `lib/model/predict.ts` to
  delegate (behaviour-preserving); optionally later refactor `match-evaluator.ts` to delegate; update the
  isolation guard. **Excluded:** any weight / probability / behaviour change, calibration, new drivers.

## 7. Calibration implications
- Calibration is **NO-GO today**: parity is unproven, the diagnostic variants are not the production
  model, and four tournaments / 192 group matches is small and match-correlated.
- The parity audit (this doc) is the prerequisite; **pure-core extraction is likely the right next
  engineering gate** so a parity test can run without 2026 data and so production + harness share one
  scoring path.
- Feature-weight tuning on four tournaments is risky (overfitting, era drift, non-independence). Any
  future calibration should **prefer probability / temperature scaling over feature-weight tuning**,
  validated by leave-one-tournament-out (LOTO), with champion/top-N as sanity only.
- **Calibration parameters must remain separate from the source-backed historical snapshots** (their
  own file, reversible, documented); production weights are never changed silently.

## 8. Staged path
1. **Parity audit** (this document) — reasoned audit + extraction plan. *(Phase 1.18C-2.)*
2. **Pure prediction-core extraction + parity tests** — behaviour-preserving; establishes test-proven
   numerical parity without 2026 imports. *(Separate, later.)*
3. **Leave-one-tournament-out (LOTO) diagnostics** — descriptive only, no tuning. *(Separate, later.)*
4. **Calibration** — only if separately approved, temperature/probability scaling preferred. *(Later.)*

## 9. GO / NO-GO ladder
- **A. Parity audit docs — GO now:** documentation only; no code/model risk; existing tests untouched.
- **B. Pure-core extraction — GO when** scoped as its own behaviour-preserving PR (golden test
  byte-identical to current `predictFromFeatures`), the core imports no `data/model-inputs`, no
  weights/probabilities change, and isolation guards stay green. **NO-GO if** it changes any output or
  pulls 2026 data into the core.
- **C. LOTO diagnostics — GO when** core parity is established (or explicitly scoped) and LOTO is
  descriptive only. **NO-GO if** it tunes anything.
- **D. Calibration — GO only when** the parity audit is complete; numerical parity is **established or
  explicitly scoped**; the calibration **objective is defined before tuning**; a **LOTO** validation is
  designed; no 2026 post-cutoff data is used; and no production weight changes without separate
  approval. **NO-GO if:** parity is unclear; production imports historical snapshots; historical imports
  `data/model-inputs`; the objective is vague; the target is champion-only; calibration parameters are
  mixed into source snapshots; or production weights are changed silently.
