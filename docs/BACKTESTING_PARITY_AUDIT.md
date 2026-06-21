# Production / Backtesting Parity Audit (Phase 1.18C-2; core extracted 1.18C-4)

> **Audit / documentation.** This document records how the isolated historical backtesting evaluator
> relates to the production 2026 prediction path, what is shared vs duplicated vs omitted, and what must
> be proven before any calibration.
>
> **Update (Phase 1.18C-4):** the pure, `data/model-inputs`-free prediction core
> (`lib/model/prediction-core.ts`) now exists; production `lib/model/predict.ts` **delegates** to it and
> **production output parity is test-proven** by golden tests (`tests/prediction-core-parity.test.ts`)
> that pin pre-refactor `predictFromFeatures` / `computeDrivers` / `explainDrivers` /
> `expectedGoalsFromAdvantage` output as byte-identical literals. There are now **two** model-internal
> rounding points: the **1-decimal net-advantage** rounding inside `explainDrivers` (model behaviour) and
> the **4-decimal W/D/L** (plus 2-dp xG) display rounding in the production wrapper. **The backtesting
> harness has NOT yet migrated to the core** — its harness↔production numerical parity remains a separate
> future PR (1.18C-5) and is not asserted here. **Historical diagnostic metrics are unchanged** by this
> phase. Calibration remains **NO-GO**.

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
1. **Harness↔production parity is still not test-proven.** As of Phase 1.18C-4 the production path is
   test-proven against the extracted core (golden tests), but the **backtesting harness has not yet
   migrated to the core** — it still runs its own duplicated math, so no test yet asserts harness ==
   production on identical inputs. That requires the 1.18C-5 harness migration. (Note: the harness uses
   the **raw** net advantage and no display rounding, whereas production rounds net advantage to 1 dp and
   W/D/L to 4 dp — so exact harness↔production agreement is a property to engineer in 1.18C-5, not assume.)
2. **The diagnostic variants are a 4-driver subset**, not the production 10-driver model — calibrating
   the subset would not directly calibrate production.
3. **Historical packs lack production-equivalent features** (squad / climate / structural /
   tournamentContext / manager), so a "production-equivalent" variant cannot be evaluated historically.
4. **Target is 90-minute W/D/L only** — no advancement, replay, or champion calibration.

**Proven so far / still to prove:** production now provably delegates to a pure, `data/model-inputs`-free
core (golden tests). What remains before calibration is a **harness-vs-core** numerical-parity test
(1.18C-5) showing the backtesting path and the core yield identical W/D/L for identical feature sets.

## 6. Pure prediction-core extraction — IMPLEMENTED (Phase 1.18C-4)
- **Shape (as built):** `lib/model/prediction-core.ts` exports `computePredictionCore(a, b, options)`
  plus the relocated pure functions `computeDrivers(a, b, weights, statusResolver)`,
  `applyInputStatusAndCaps`, `contributionCapFor`, `explainDrivers`, `expectedGoalsFromAdvantage`.
- **Inputs:** two already-built `TeamFeatureSet`s, `ModelWeights` (optional; defaults to `MODEL_WEIGHTS`),
  and an **injected** `statusResolver: (family) => ModelInputStatus | undefined` so the core never imports
  `getFeatureStatus`. **Outputs:** drivers (capped + status-tagged), `explanation` (incl. the 1-dp net
  advantage), `expectedGoals`, the scoreline matrix, top scorelines, and **unrounded** W/D/L `outcome`.
- **Callers:** production `predict.ts` is now a thin **wrapper** — it builds features, injects the real
  `getFeatureStatus`, calls `computePredictionCore`, and applies the existing 4-dp/2-dp display rounding;
  it re-exports `computeDrivers`/`explainDrivers`/`expectedGoalsFromAdvantage` for back-compat (the public
  `computeDrivers(a, b, weights?)` 3-arg signature is preserved). The backtesting evaluator **still uses
  its own duplicated math** — its migration to the core is deferred to 1.18C-5.
- **Avoiding 2026 imports:** the core imports only `config` + `poisson` + `lib/utils` + types; status/caps
  are parameters. A new isolation guard (`tests/backtesting-isolation.test.ts`) asserts the core imports no
  `data/model-inputs` / `features` / `predict` / backtesting / historical / 2026 / app path. The
  backtesting harness guard is **unchanged** (it does not yet import the core).
- **Proving no drift:** `tests/prediction-core-parity.test.ts` pins pre-refactor `predictFromFeatures` /
  `computeDrivers` / `explanation` / `expectedGoalsFromAdvantage` output (captured from `origin/main`) as
  byte-identical golden literals over a battery of synthetic feature pairs (balanced, large Elo/FIFA gaps,
  FIFA cap, host-only, regional-only, placeholder single + pooled caps, climate cap, tournamentContext
  cap, manager, structural, mixed, neutral) plus a real-team production-side check. **Harness-vs-core
  parity is NOT part of this PR.**
- **Files (this PR):** added `lib/model/prediction-core.ts`; refactored `lib/model/predict.ts` to delegate
  (behaviour-preserving); added the core isolation guard + golden parity tests. **Excluded:** any weight /
  probability / behaviour change, calibration, new drivers, backtesting migration.

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
1. **Parity audit** (this document) — reasoned audit + extraction plan. *(Phase 1.18C-2 — done.)*
2. **Pure prediction-core extraction + production parity tests** — behaviour-preserving; production output
   parity test-proven without 2026 imports in the core. *(Phase 1.18C-4 — done.)*
3. **Backtesting harness migration to the core** — harness calls the core; historical metrics unchanged
   or any change documented + re-approved. *(Phase 1.18C-5 — separate, later.)*
4. **Leave-one-tournament-out (LOTO) diagnostics** — descriptive only, no tuning. *(Separate, later.)*
5. **Calibration** — only if separately approved, temperature/probability scaling preferred. *(Later.)*

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
