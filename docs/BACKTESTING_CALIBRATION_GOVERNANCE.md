# Backtesting Calibration Governance (WC-2010/2014/2018/2022) — GOVERNANCE / DECISION RECORD

> **GOVERNANCE DOCUMENT — DECISION RECORD, NOT CALIBRATION.** This document records the formal
> decision that follows the four-tournament and Leave-One-Tournament-Out (LOTO) diagnostics. It is
> **documentation only**: it fits nothing, changes no weights, adds no parameters, and changes no
> production probability. Its purpose is to **lock the calibration boundary** before any future
> calibration experiment, stretch-scope ingestion, or tournament replay — so that later work cannot
> become calibration-by-stealth. All metric values quoted here are **copied verbatim** from the
> existing pinned diagnostics (`docs/BACKTESTING_FOUR_TOURNAMENT_DIAGNOSTICS.md`,
> `docs/BACKTESTING_LOTO_DIAGNOSTICS.md`), whose Vitest tests
> (`tests/backtesting-consolidation.test.ts`, `tests/backtesting-match-evaluator.test.ts`,
> `tests/backtesting-loto.test.ts`) are the source of truth. **Calibration remains NO-GO.**

## 1. Headline decision — DO NOT CALIBRATE YET

**The formal decision is: DO NOT CALIBRATE YET. Calibration remains NO-GO.**

The diagnostics (four-tournament consolidation + LOTO) are complete and informative, but the current
evidence base **cannot defensibly calibrate the production model**. The reasons:

- **Only four historical tournaments are available** (2010, 2014, 2018, 2022) → only **four LOTO
  folds**. Any fitted parameter would be selected against an n=4 evidence base.
- **The diagnostic ladder is a 4-of-10-driver subset, not the production model.** The diagnostic
  variants use only **Elo, FIFA, host, regional**; the other six production drivers (squadQuality,
  recentForm, manager, climate, structural, tournamentContext) are **inert/zeroed** on the
  feature-sparse historical packs. **Calibrating this subset would not defensibly calibrate the
  production 10-driver model** — a category mismatch on top of the small sample.
- **Differences among the Elo-based variants are tiny and likely within noise** (group-stage
  macro-average RPS spread across elo-only / elo-fifa / elo-fifa-host-regional is ≈0.0003–0.0010, well
  inside the sampling noise of 48 correlated group matches per tournament).
- **The "best" variant is fold- and mode-dependent.** No variant wins a majority of folds across both
  the group-stage and all-64 views (see §2 / §6 of the LOTO doc).
- **Host/regional is not uniformly positive.** It helps in most folds but **hurts on held-out 2022**
  (group) and on **2014 and 2022** (all-64); effect sizes are tiny (|ΔRPS| ≈ 0.0005–0.003).
- **FIFA-only is the most stable but the weakest on average** — "stability is not skill."
- **The evidence is useful for diagnostics, not calibration.** It transparently characterises model
  behaviour across eras; it is not a basis for tuning weights or output probabilities.

This decision is recorded so that **stretch ingestion, tournament replay, and any calibration
experiment are gated behind the explicit approvals in §6 and §8**, not started implicitly.

### 1a. Stretch-pack status (Phase 1.20B) — context only, NO-GO unchanged

The stretch context packs **WC 1998, 2002, and 2006 are now merged** (see
`docs/BACKTESTING_STRETCH_CONTEXT.md`, the supplementary diagnostic in
`docs/BACKTESTING_STRETCH_DIAGNOSTICS.md`, and the cohort definitions in
`lib/backtesting/historical-cohorts.ts`). Their existence **does not change anything in this
decision record**:

- The **primary evidence set remains exactly 2010/2014/2018/2022** (`primaryDiagnosticPacks`); the
  headline four-tournament consolidation and the four-fold LOTO are unchanged.
- Stretch packs are **supplementary, qualitative robustness / era-sensitivity context only**. They
  carry older-era caveats (golden-goal era, older FIFA/Elo source precision, different tactical era,
  fewer modern model-feature equivalents) and are **not** calibration evidence.
- Their availability **does not** approve calibration, **does not** approve temperature scaling,
  **does not** approve model/weight tuning, **does not** change the decision ladder (§6) or the NO-GO
  list (§8), and **does not** change any production probability. **Calibration remains NO-GO.**
- There is intentionally **no all-seven headline average** and **no LOTO over stretch or all-seven
  packs**; "more tournaments exist" is explicitly **not** a route to calibration approval.

## 2. Evidence summary

All values below are verbatim from the pinned diagnostic docs; see those docs for full per-tournament
tables.

### Four-tournament macro-average (equal weight per tournament)
- **Group-stage headline (48 matches/tournament):** best probabilistic variant is
  **elo-fifa-host-regional** (RPS **0.204232**, logLoss **0.987796**, Brier **0.578330**); elo-fifa RPS
  **0.204891**; elo-only RPS **0.205214**; **fifa-only is worst** (RPS **0.227424**).
- **Accuracy conflicts with the probabilistic metrics** at group stage: elo-fifa has the highest
  accuracy (**0.583333**) while elo-fifa-host-regional is best on RPS/logLoss/Brier (accuracy
  **0.578125**).
- **All-64 secondary (64 matches/tournament, 90' W/D/L):** best is **elo-fifa-host-regional** (RPS
  **0.198794**), elo-fifa **0.199133**, elo-only **0.199640**, fifa-only worst **0.224166**; here
  accuracy no longer conflicts (elo-fifa and elo-fifa-host-regional tie at **0.566406**).

### LOTO stability (cross-fold, held-out)
- **FIFA-only is the most *stable*** (lowest cross-fold stdDev — group RPS stdDev **0.004319**, all-64
  **0.003965**) **but the worst on average.** Stability is not skill.
- The Elo-based variants have the best mean RPS but a **wider spread driven by 2022**.
- **Best-variant counts are fold- AND mode-dependent:** group-stage RPS — elo-fifa-host-regional wins
  **2/4** folds; all-64 RPS — elo-fifa wins **2/4**; all-64 logLoss is a **1/1/1/1** tie. **No variant
  wins a majority across both modes** — itself the headline diagnostic finding.

### Group-stage vs all-64
- **Same direction** (2022 is the hardest fold for every variant), **different magnitude** (all-64 has a
  smaller held-out spread because knockout matches add selection effects). Conclusions are **not
  metric- or mode-invariant**.

### Host/regional sign flips
- Δ = (elo-fifa-host-regional − elo-fifa) on the held-out tournament. **Group:** helps 2010/2014/2018
  (ΔRPS −0.000517 / −0.001232 / −0.002546) but **hurts 2022** (ΔRPS +0.001662). **All-64:** helps
  2010/2018 but **hurts 2014 and 2022** (ΔRPS +0.001079 / +0.001274). The effect is small and **not
  uniformly positive**.

### Accuracy vs probabilistic-metric conflicts
- At group stage the argmax-accuracy ranking disagrees with the RPS/logLoss/Brier ranking; at all-64 it
  does not. Accuracy is **descriptive only** and never an objective.

### Strong vs weak vs unknown
- **Strong evidence:** Elo-based variants consistently beat FIFA-only; FIFA-only is reliably worst;
  **2022 is a genuine outlier tournament** across all variants.
- **Weak / noisy:** differences *among* the three Elo-based variants (~0.0003–0.0009 RPS, within fold
  noise); the host/regional increment (sign flips by fold/mode); any single-fold ranking (n=4).
- **Unknown:** generalisation beyond these eras; the production-model (10-driver) behaviour;
  advancement/champion skill; whether the observed spread reflects real miscalibration or sampling
  noise.

## 3. Calibration objective options

These are options for **what a future calibration would optimise**, *if* it were ever approved. Listing
them is **not approval to calibrate.**

| # | Objective | Pros | Cons / overfitting risk | Validation feasibility | Status |
|---|-----------|------|-------------------------|------------------------|--------|
| A | **Group-stage RPS** | Primary metric; 48 matches/tournament; least knockout bias; matches the headline view | Inter-variant gaps within noise; n=4 | LOTO-feasible but fragile | **CAUTION** — preferred *if* calibration ever proceeds |
| B | Group-stage log loss | Sharper penalty on overconfidence | Overreacts to rare upsets in tiny samples | LOTO-feasible, less stable | **CAUTION** — guardrail only |
| C | Group-stage Brier | Interpretable | Less ordinal than RPS | LOTO-feasible | **CAUTION** — secondary |
| D | Multi-metric (RPS primary; logLoss must not materially degrade) | Guards against single-metric gaming | Governance complexity; selection ambiguity | Feasible if the rule is pre-registered | **CAUTION** — preferred guardrail form |
| E | All-64 | More matches | Knockout selection effects; still 90' W/D/L only | LOTO-feasible (secondary) | **CAUTION** — secondary view only |
| F | Tournament-outcome / champion | Intuitive | No replay implemented; n≤4 outcomes; very high variance | Not feasible now | **NO-GO** |

**Recommended *future* objective (only if calibration is ever separately approved):** group-stage
**RPS primary**, with a **logLoss non-degradation guardrail** (A + D), and **all-64 as a secondary
robustness view only** (E). **This is not approval to calibrate** — it is the objective that *would*
apply, recorded in advance to prevent post-hoc metric selection.

## 4. Calibration-family options

These are options for **how a future calibration would change outputs**, *if* it were ever approved.

| Family | What it changes | Why it might help | Why it is risky | Data requirement | Status |
|--------|-----------------|-------------------|-----------------|------------------|--------|
| No calibration | Nothing; diagnostics remain pure transparency | Zero overfitting; honest | None | None | **GO (current approved position)** |
| Probability-level temperature scaling | Output probabilities only (one scalar) | Preserves ranking; lowest-risk knob | Must handle the draw probability; still n=4 | Modest | **CAUTION** — preferred future knob |
| Net-advantage scalar | One scalar on net advantage pre-expected-goals | Model-native global sharpness control | Global sharpness shift; couples to xG/Poisson | Modest | **CAUTION** — alternative future knob |
| Draw-rate / draw intercept | Draw mass | Football-specific | Distorts probabilities; fits era/host noise | Higher | **NO-GO (for now)** |
| Feature-weight tuning | Production driver weights | Could raise skill | High overfit at n=4; undermines the source-backed design; subset ≠ production | Large | **NO-GO** |
| Variant selection only | Picks the "best" diagnostic variant | Cheap | Not the 10-driver model; fold/mode-dependent; not actually calibration | n/a | **NO-GO (mislabelled)** |
| Isotonic / non-parametric | Free-form probability remap | Flexible | Unstable on tiny data | Very large | **NO-GO** |

**Position:**
- **No calibration is the current approved position.**
- If future calibration is ever approved, **only single-scalar probability-level temperature scaling or
  a net-advantage scalar should be considered first.**
- **Feature-weight tuning is NO-GO** with the current evidence base.
- **Isotonic / non-parametric calibration is NO-GO.**
- **Champion-only calibration is NO-GO.**

## 5. Validation design (required before any future calibration experiment)

Any future calibration experiment — once separately approved — must use:

- **Leave-One-Tournament-Out (LOTO).** Fit on three tournaments, evaluate on the held-out one.
- **Equal tournament weighting, never pooled match weighting** (matches are not independent within a
  tournament).
- **Group-stage is the headline; all-64 is secondary only.**
- **The held-out fold must not select parameters** (no leakage from the evaluation fold into fitting).
- **No 2026 post-cutoff data** (as-of-before-kickoff rule; the target tournament is never an input).
- **No silent parameter selection** — any selection rule must be pre-registered and documented.
- **No metric cherry-picking** — the objective and guardrail are fixed in advance (§3).
- **"No improvement" must be an acceptable, expected result.** At n=4 folds, a null result is a valid
  and likely outcome and is not a reason to keep tuning.

## 6. Decision ladder

| Stage | Description | Status / gate |
|-------|-------------|----------------|
| 1 | **Descriptive diagnostics complete** (four-tournament + LOTO) | ✅ DONE |
| 2 | **Calibration governance proposal** (this document) | **THIS PR completes stage 2** |
| 3 | **Calibration experiment DESIGN** (pre-registered objective, selection rule, overfitting controls; still no production change) | Requires **separate approval** |
| 4 | **Offline calibration experiment** (LOTO; outputs candidate parameters + results to a separate file; no production wiring) | Requires **separate approval** |
| 5 | **Governance review** (decide whether any improvement is large AND robust enough to survive LOTO) | Requires **separate approval** |
| 6 | **Production adoption** (separate PR) | Requires **separate approval** |

**Explicitly:**
- **This PR completes only the governance-documentation stage (stage 2).**
- **Future experiment design (stage 3) still requires separate approval.**
- **Offline calibration (stage 4) still requires separate approval.**
- **Production adoption (stage 6) still requires separate approval.**
- **Production probabilities may change ONLY in a separately approved production-adoption PR (stage 6)** —
  no earlier stage may change production output.

## 7. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Overfitting four tournaments | Equal-weight LOTO; provisional parameters; accept "no improvement"; single-scalar families only |
| Match dependence within tournaments | Tournament-level units, never pooled-match weighting |
| Era drift 2010→2022 | Stated as a caveat; no extrapolation claims; prefer the simplest model on ties |
| Host variability | Per-fold host/regional reported; never average away the 2022 sign flip |
| Tuning to historical quirks | Pre-registered objective and selection rule; minimal-parameter knob |
| One metric improves while another degrades | Multi-metric guardrail (RPS primary, logLoss non-degradation) |
| All-64 knockout selection effects | All-64 secondary only; group-stage is the headline |
| Implying production readiness | "DIAGNOSTIC ONLY" / explicit NO-GO; the subset≠production gap stated |
| Premature production probability changes | Stage-6-only rule; separate approval + separate PR |
| Mixing calibration params into source snapshots | Any future parameters live in their own reversible, documented file — never in source data |
| Using 2026 post-cutoff data | Hard leakage ban; as-of-before-kickoff rule |
| Confusing diagnostic variants with the 10-driver production model | This doc states the 4-of-10-driver subset gap prominently (§1, §8) |

## 8. Universal NO-GO list

The following are **NO-GO** and must never be done implicitly or as a side effect of diagnostic work:

- **Production probability changes without separate approval.**
- **Feature-weight tuning hidden inside calibration.**
- **Using 2026 post-cutoff data.**
- **A champion-only target.**
- **A pooled micro-average as the main objective without approval.**
- **Silent metric cherry-picking.**
- **Changing historical source snapshots.**
- **Adding calibration parameters into source data files.**
- **Implying LOTO proves production superiority.**
- **Treating the 4-driver diagnostic ladder as equivalent to the full production 10-driver model.**

## 9. Cross-links

- `docs/BACKTESTING_FOUR_TOURNAMENT_DIAGNOSTICS.md` — four-tournament consolidation (DIAGNOSTIC ONLY).
- `docs/BACKTESTING_LOTO_DIAGNOSTICS.md` — Leave-One-Tournament-Out diagnostics (DIAGNOSTIC ONLY).
- `docs/BACKTESTING_PARITY_AUDIT.md` — production/backtesting parity audit.
- `docs/BACKTESTING_METHOD.md` — overall backtesting methodology and staged path.
- `docs/BACKTESTING_HISTORICAL_REPLAY_INTERPRETATION.md` — how to read the primary-only Monte Carlo replay (supplementary/approximate; not calibration evidence — calibration stays NO-GO).
- `lib/backtesting/README.md` — harness overview and isolation guarantees.

## 10. Verification (gates this PR passed)

This is a **docs-only** change. Before opening the PR the following gates were run and confirmed green:
`npm run scan:unicode`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. `git diff`
shows **documentation-only** changes (this new file plus limited navigation cross-links in
`docs/BACKTESTING_METHOD.md`, `docs/BACKTESTING_PARITY_AUDIT.md`, `lib/backtesting/README.md`,
`docs/BACKTESTING_FOUR_TOURNAMENT_DIAGNOSTICS.md`, `docs/BACKTESTING_LOTO_DIAGNOSTICS.md`): no `.ts`
changed, no tests changed, no snapshots/generators changed, no generated artifacts, no calibration
parameter files. Every quoted metric matches the pinned diagnostic tests/docs verbatim.

## 11. Final report

The PR summary records: docs-only confirmation; that this governance document was added; that the
headline decision is **"DO NOT CALIBRATE YET"** and calibration remains **NO-GO**; that no calibration,
tuning, temperature scaling, replay, or production change was performed; that no code/test/snapshot/
generator changes were made and no calibration parameter files were added; that quoted metric values are
copied verbatim from the existing pinned diagnostics; and the typecheck/lint/test/build/scan results.
