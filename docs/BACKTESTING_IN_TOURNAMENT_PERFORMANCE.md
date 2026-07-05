# In-Tournament Performance Driver — Pre-Registration (Stage 1A)

> **Pre-registration document. Frozen on merge.** This page fixes the definition, formula,
> constants, leakage rules, backtest subsets, and the activation decision rule for a candidate
> model driver **before any code is written and before any historical result is computed**.
> It contains **no results and no metric values**. Changing anything below after merge requires
> a separate governance-amendment PR that is merged *before* the affected run — never after seeing
> a number. This is the anti-cherry-picking anchor for the whole workstream.
>
> **Status:** a **candidate**, **shadow-only**, **evidence-gated** driver — not implemented, not
> active, not public, not tuned. Its **weight remains 0 unless separately approved in a later stage**.
> Calibration remains **NO-GO** (`docs/BACKTESTING_CALIBRATION_GOVERNANCE.md`). This document does
> not approve any production probability or weight change.

## 0. Scope and rollout position

This is **Stage 1A** of a staged, evidence-first workstream:

- **Stage 1A (this doc)** — pre-registration only. No code, no results.
- **Stage 1B** — isolated backtest harness in `lib/backtesting/` (synthetic tests, weight-0 parity,
  output-shape and governance-flag tests). **No real historical metrics committed.**
- **Stage 1C** — run the historical sweep **once**, pin and report the real metrics, apply the
  frozen decision rule (Section 8), produce a governance report. Gates fail here -> stop.
- **Stage 2** — production shadow driver at weight 0, **only if** Stage 1C passes.
- **Stage 3** — internal 2026 diagnostics (no publishing).
- **Stage 4** — activation (0 -> weight), separately approved.
- **Stage 5** — public methodology copy and the public-label decision.

Nothing beyond Stage 1A is authorised by this document.

## 1. Purpose

Today's forecast updates **tournament state** from locked results — standings, points, goal
difference, qualification, third-place ranking, knockout slots, eliminations, and the set of
remaining paths — but it **does not re-rate team strength** from how teams have actually played
inside the tournament. `recentForm` is a frozen pre-tournament placeholder; `tournamentContext` is
static draw/logistics. So a future England-vs-Mexico forecast cannot reflect "Mexico has
outperformed and England has underperformed so far this tournament."

`inTournamentPerformance` is designed to test a **controlled, evidence-based** strength signal
derived from a team's own completed matches inside the current tournament, measured against what
the baseline model expected before the tournament began. It is deliberately small, capped, and
shrunk toward zero at small samples.

This driver is explicitly **not**:

- **public** — no user-facing copy or chips until Stage 5;
- **active** — it ships (if it ships at all) at weight 0;
- **tuned to 2026** — the backtest uses **zero** 2026 data; the decision rule is frozen here,
  before any result exists;
- **tuned to England vs Mexico or any single matchup** — no example, intuition, or one-match
  outcome informs the formula or the weight.

## 2. Naming

- **Internal family key:** `inTournamentPerformance` (fixed). Chosen to be grep-distinct from the
  existing `tournamentContext` family.
- **Public label:** **undecided.** No public-label decision is made in this PR. Provisional
  candidates, to be chosen at Stage 5:
  - "In-tournament results"
  - "Tournament performance signal"
  - "Tournament results vs expectation"

The internal key does not depend on the eventual label.

## 3. Definition

> **What have we learned about this team from its own completed matches inside this tournament,
> measured against what the baseline model expected before the tournament began, adjusted for
> opponent strength through that expectation, and shrunk toward zero for small samples?**

It is distinct from every existing signal:

- **`recentForm`** — pre-tournament, frozen, hand-authored. This driver uses only matches inside
  the current tournament. `recentForm` is untouched by this workstream.
- **Elo / FIFA ranking** — frozen pre-tournament *levels*. This driver is a *residual against the
  expectation those levels generate* — orthogonal to them in expectation by construction.
- **host / climate / regional** — static context terms already inside the baseline expectation;
  because surprise is measured against the full baseline expectation, they are not double-counted.
- **`tournamentContext`** — static draw/logistics (travel/rest/altitude/time-zone/venue). Never
  redefined by this plan.
- **bracket state** — locked results already update standings/qualification/paths; this driver is
  the *strength* channel those state updates deliberately lack.
- **raw points / goal difference** — rejected: not opponent-adjusted (three points against a weak
  team masquerades as strength). This driver measures results *relative to expectation*.
- **xG** — **not used.** No expected-goals (shot-based) data exists in the repository, and the
  live-state contract rejects `xg` fields. Nothing of the kind is invented.
- **subjective eye test / manual overrides** — none. The signal is a deterministic function of
  committed results and the baseline model.

## 4. Recommended first formula — Formula C (opponent-adjusted, margin-aware, shrunk)

Formula C is pre-registered as the first candidate. (Formula A = raw form, rejected; Formula B =
points-residual only, coarse; Formula D = Bayesian posterior, deferred — the shrinkage below is
already a zero-mean posterior mean, so D is a later prior swap, not a rewrite.)

### 4.1 Per-match surprise

For a completed match *i* of team T against opponent O, with T in slot A, using the **baseline
model only** (Section 6):

```text
# baseline pre-match expectation (baseline model, this driver forced to 0)
expectedPoints  = 3 * pWin + pDraw                 # in (0, 3)
expectedMargin  = lambdaTeam - lambdaOpponent      # real Poisson lambdas (respects the 0.18 floor)

# actuals, at the 90-MINUTE framing (Section 5)
actualPoints    = 3 if 90' win, 1 if 90' draw, 0 if 90' loss
actualMargin    = 90' goals for - 90' goals against

# residuals
P_res = actualPoints - expectedPoints                                 # in [-3, +3]
M_res = clamp(actualMargin, -2, 2) - clamp(expectedMargin, -2, 2)     # in [-4, +4]

# per-match surprise (provably in [-1, +1]; no clamp applied)
s = 0.5 * (P_res / 3) + 0.5 * (M_res / 4)
```

- **Margin cap +/-2** each side: a 5-0 counts the same as a 2-0 beyond expectation. This is the
  blowout bound.
- **alpha = 0.5 is fixed and is NOT swept.** Exactly one free parameter — the weight — enters the
  sweep. Sweeping alpha (or the shrinkage constant, or the caps) on four tournaments would be a
  multiple-comparisons machine and is forbidden.
- **No extra opponent-strength multiplier.** `expectedPoints` / `expectedMargin` already condition
  fully on the opponent; a residual against them *is* the opponent adjustment. Adding another
  opponent term would double-count.

### 4.2 Aggregation and small-sample shrinkage

```text
S_team = sum(s_i) / (n + k)        # k = 2 (pseudo-count); n = matches in the team's history
                                   # empty history (n = 0) -> S = 0 exactly
```

Pseudo-count (sum) form, not a multiplier: it has no 0/0 at `n = 0` (the MD1 zero-state falls out
for free), it is exactly a Bayesian posterior mean with prior mass `k` at 0, and it is the scaffold
for a future Formula D. `S` is always in `(-1, +1)`, with `|S| <= n / (n + 2)`.

### 4.3 Driver contribution

```text
contribution = clamp( weight * (S_A - S_B), -25, +25 )   # weight = MODEL_WEIGHTS.inTournamentPerformance
```

Pairwise difference, matching the `tournamentContext` pattern. The +/-25 cap is enforced through a
new family branch in `contributionCapFor`; the family is registered as **candidate** status so it
is never pooled with the placeholder families.

## 5. Penalties / extra-time treatment (90-minute framing)

The signal is scored at the **90-minute result** everywhere. Availability of a clean 90' score
differs by source, and this document is deliberate about where the value is exact and where it is a
bounded approximation. **It is not called "exact" unless the 90-minute score is actually known.**

| Case | Rule | Status |
|---|---|---|
| Historical packs (all 7), incl. penalties / extra-time / golden-goal | Use `resultAt90` and the 90' `goalsA/goalsB` — the packs store the 90-minute split explicitly, separate from `afterExtraTime` / `penalties`. Golden-goal matches (1998) are stored as a 90' draw plus the flag, so the extra-time goal is already excluded. | **Exact** |
| 2026 group rows | Group matches never go to extra time, so the recorded final score is the 90' score. | **Exact** |
| 2026 knockout rows (any) | The 2026 results ledger carries **no 90'/extra-time split and no `afterExtraTime` flag**, so the recorded final score is used as a **proxy** for the 90' result. A shootout means the match was level *after extra time* but it **may have been a win at 90'** (a lead equalized in extra time); a non-penalty knockout **may have been won in extra time rather than at 90'**. The ledger cannot distinguish these. | **Approximation (bounded)** — not exact |
| Matchday 1 (no history) | S = 0, contribution exactly 0. | Exact (the weight-0 regression anchor) |

**Bound on the 2026-knockout approximation.** The worst case is a true 90' win (points 3, margin
~1) misread as a draw (points 1, margin 0), or the reverse: a single-match `s` error of at most
about 0.58. Through the shrinkage this is `dS <= 0.58 / (n + 2) <= 0.12` at `n = 3`, i.e. at most
about **3 Elo-equivalent points at weight 25** (0.012 goals of supremacy), affecting only
quarter-final/semi-final/final/third-place downstream predictions.

**This approximation is entirely absent from the backtest** — every historical pack carries the 90'
split, so the activation evidence in Stage 1C is computed on exact 90' inputs. The approximation
applies only when the driver is later computed on 2026 knockout inputs (Stage 2+). Mitigations: the
margin cap +/-2 already bounds the error; optionally, a future ledger-schema addition
(`afterExtraTime` / 90'-split) would make the 2026 knockout case exact (open question).

## 6. Leakage rules (walk-forward, day-strict)

**Master rule (day-strict, UTC):** a match *j* enters team T's history for predicting match *m* if
and only if *j* is T's own completed match in the **same tournament** and `date(j) < date(m)` — a
strictly earlier **day**. Day-strict (not kickoff-strict) because the historical pack dates are
day-level; this is leak-proof against same-day matchday-3 kickoffs by construction. The same rule is
used for 2026 (a team never plays twice in a day, so nothing is lost by ignoring the finer
timestamp — validate-what-you-run).

| Predicting | History available | n |
|---|---|---|
| Group matchday 1 | none | 0 (S = 0; byte-identical to baseline; excluded from the decision metric) |
| Group matchday 2 | own matchday 1 | 1 |
| Group matchday 3 | own matchdays 1-2 (the simultaneous matchday-3 pair is excluded by the day-strict rule) | 2 |
| Round of 32 (2026) / Round of 16 (historical) | all group matches | 3 |
| Quarter-final / semi-final / final | all prior own matches | 4 / 5 / 6 |
| Third-place match | includes own semi-final loss (motivation confound noted, not modelled) | 5 |
| Penalties / extra-time as *inputs* | historical: scored at 90' (exact); 2026 knockout: recorded score as a 90' proxy (bounded, Section 5) | - |

**Never used (explicitly forbidden):** the result of match N; any later match; final standings; the
eventual champion; post-match-N bracket state; post-tournament Elo or FIFA ranking; any
hindsight-inferred label; **any 2026 tuning** (the backtest sees zero 2026 data); and **any manual
correction based on intuition** (the signal is a deterministic function of committed results and the
baseline model — no eye test, no manual override).

**Recursive-contamination rule (hard).** `expectedPoints` and `expectedMargin` are always computed
from the **baseline model with `inTournamentPerformance` forced to 0** — at every matchday, in both
the backtest and production. If the expectation used a model that already included this driver, the
matchday-3 surprise would depend on the matchday-2 signal, which depends on the weight; the signal
would become weight-dependent and walk-forward would degenerate into a fixed-point problem. This is
enforced by construction: the signal module takes baseline predictions as input and **never sees the
candidate weight**. A corollary is that the per-match surprises are computed **once per pack** and
reused across the entire weight sweep. A second hard rule: baseline features stay frozen at their
pre-tournament values for the whole tournament (mirroring the production simulator's one-time feature
precompute); this driver is the only thing that updates.

## 7. Baseline the driver is validated against (limitation, stated up front)

The backtest validates the driver against the **historical four-driver baseline only**: `elo`,
`fifaRanking`, `host`, `regional`. This is **forced by the data**, not a preference. The historical
feature adapter (`lib/backtesting/feature-adapter.ts`) neutralizes `squadQuality`, `recentForm`,
`climateFamiliarity`, `structural`, `tournamentContext`, and `managerCohesion` to 0/false for every
historical team, because the historical packs carry **no** squad, climate, GDP/population,
venue-geo, or historical recent-form data. A "production-like" ten-driver historical baseline is
**not feasible** without fabricating historical inputs for five families, which the source-audit
rules forbid.

Production 2026 forecasts apply against the **full ten-driver baseline** (with
`inTournamentPerformance` at 0). There is therefore a **documented mismatch**: the driver's
incremental value is *validated* over a four-driver expectation but *applied* over a ten-driver
expectation. This is acceptable, and is mitigated, because:

- the five extra production drivers are exactly the families the repo already labels
  low-confidence — `squadQuality` and `recentForm` are capped placeholders; `climate`,
  `structural`, and `tournamentContext` are capped experimental priors; `manager` is disabled
  (weight 0). The backtested four-driver set is the **validated core** of the production model, and
  the extra drivers are small, capped perturbations on top of it;
- the residual-vs-expectation construction is self-correcting to first order: whatever the baseline
  is, the driver measures surprise against *that* baseline, so a slightly different (production)
  baseline shifts the expectation the driver reacts to, not the driver's logic.

The Stage 1C governance report **must** state this mismatch and label the backtest result as
evidence about the four-driver core, not a guarantee about the ten-driver production forecast.
Stage 3 partially closes the gap by recomputing the driver against the actual production baseline
on committed 2026 data (descriptive, non-activating). An optional report-only "core + recentForm"
sensitivity arm is an open question, not a Stage-1 deliverable.

## 8. Backtest subsets and the activation decision rule (frozen)

### 8.1 Constants (frozen)

```text
PERF_K                  = 2          # shrinkage pseudo-count
PERF_MARGIN_CAP         = 2          # per-side goal-margin cap inside s
PERF_CONTRIBUTION_CAP   = 25         # Elo-equivalent points, pairwise
PERF_ALPHA              = 0.5        # points/margin blend inside s (fixed, not swept)
PERF_SWEEP_WEIGHTS      = [0, 5, 10, 15, 20, 25]   # Elo-equivalent points
```

### 8.2 Reporting subsets

Every subset is **reported** at every weight; only the primary subset (plus the guardrails) **gates**
activation.

| Subset | Approx. size (per tournament / four-pack total) | Role |
|---|---|---|
| **Group matchday 2 + matchday 3** | 32 / 128 | **Primary decision subset** — statistically stable; matchday 1 carries no signal. Drives G1, G2, G3, G5. |
| **All post-matchday-1 forecastable** (every match where at least one team has at least one prior own match: matchday 2 + matchday 3 + all knockout) | 48 / 192 | **Reported headline view** — the broadest honest "where the driver is active" picture. Non-gating; shown alongside the primary subset. |
| **Knockout only** | 16 / 64 | **Reported + guardrail only.** Drives G4 (non-degradation). **Never a positive activation driver** — 64 matches across four tournaments with survivor/selection effects is too small to justify turning the driver on, but knockout behaviour is not ignored. |
| **Per-stage** (MD2, MD3, R16, QF, SF, final, third-place) | varies | **Diagnostic**, reported for shape. Non-gating. |
| **Group all-48 / all-64** | 48 / 64 | **Continuity** with the existing pinned diagnostics. Non-gating. |

Scope: the four **primary** packs (2010, 2014, 2018, 2022), equal weight per tournament (macro
average). The stretch packs (1998, 2002, 2006) are report-only and can neither veto nor approve.
**No 2026 data enters the backtest.**

### 8.3 The decision rule (evaluated once, in Stage 1C)

For each candidate weight `w` in `{5, 10, 15, 20, 25}`, all five gates must pass:

- **G1 (primary skill):** macro-average ranked probability score (RPS) on the group matchday-2+3
  subset improves versus `w = 0` by at least **0.002** (i.e. `delta RPS <= -0.002`).
- **G2 (guardrail):** macro-average log-loss on the same subset degrades by at most **0.001**.
- **G3 (fold consistency):** RPS on the matchday-2+3 subset improves versus `w = 0` in **at least
  3 of the 4** primary tournaments.
- **G4 (knockout non-degradation):** macro-average RPS on the knockout-only subset (90' W/D/L)
  degrades by at most **0.002**. Guardrail only — knockout can veto but never approve.
- **G5 (no single-fold blowup):** no individual tournament's matchday-2+3 RPS degrades by more than
  **0.005** versus `w = 0`.

**Selection:** among the weights that pass all five gates, choose the **smallest** `w` whose G1 RPS
is within **0.0005** of the best passing weight's G1 RPS. Ties resolve to the **smaller** weight. If
**no** weight passes all gates, the outcome is **keep weight 0** — recorded as a completed negative
result, with **no** re-runs under new thresholds.

**Threshold grounding.** The calibration governance record pins inter-variant group-stage spreads of
0.0003-0.0010 RPS and treats them as within-noise; G1 therefore demands 2-3x the largest previously
observed within-noise spread. G5's 0.005 is about the largest per-fold host/regional delta plus
margin. The rule is deliberately conservative: a driver that helps only in knockouts will not
activate (knockout is guardrail-only), which is a conscious choice given the known selection effects
there, not an oversight. The calibration buckets plus the G2 log-loss guardrail catch systematic
favourite-inflation ("does it just overreact to favourites").

**"No improvement" is an acceptable, expected, pre-registered outcome.** It is not a licence to
re-run with new thresholds, new subsets, or a new formula.

## 9. Governance flags

All backtest outputs for this workstream (Stage 1B/1C) carry, and tests assert, the flags:

```text
candidateDriverDiagnostic : true
supplementaryOnly         : true
headlineEligible          : false
calibrationEligible       : false
tuningEligible            : false
productionEligible        : false
```

Output field names stay neutral and descriptive (`byWeight`, `deltaVsZero`) and never imply a
selection or optimisation (`bestWeight`, `optimalWeight`, `recommendedWeight`, or any
`calibrat*` / `tuning*` / `optimi*` token). This document does not authorise any production
probability or weight change; any such change is a separate, explicitly approved later stage per
`docs/BACKTESTING_CALIBRATION_GOVERNANCE.md`.

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Overfitting to the four primary tournaments | One swept parameter (alpha, k, caps fixed); leave-one-tournament-out fold-consistency gate (G3); tie-to-zero selection; "no improvement" is an acceptable, pre-registered outcome |
| Overreacting to one blowout | Margin cap +/-2 inside `s`; provable per-match movement bound of at most `weight/3` (about 8 Elo points at weight 25); pairwise contribution cap +/-25 |
| Double-counting baseline drivers (Elo/FIFA/recentForm/host/climate/context) | Residual-vs-baseline-expectation construction (the baseline already contains them); no extra opponent term; `recentForm` untouched |
| Baseline mismatch (four-driver historical validation vs ten-driver production) | Stated up front (Section 7); flagged again in the Stage 1C report; the residual construction self-corrects to first order; Stage 3 recomputes descriptively against the real production baseline |
| 2026 knockout 90-minute / extra-time approximation | 90-minute framing everywhere; historical exact; 2026 knockout is a bounded approximation (about 3 Elo points), **never called exact** (Section 5); optional ledger field to make it exact |
| Cherry-picking / calibration by stealth | This pre-registration is merged before any harness code and before any result; gates are fixed on RPS with a log-loss guardrail; descriptive metrics never gate; neutral field names; any production change is a separate, approved stage |
| Recursive contamination | Expectations always come from the baseline with this driver at 0; the signal module never sees the candidate weight (enforced by construction) |
| Survivor bias in knockouts | Knockout is a non-degradation guardrail (G4) only, never a positive activation driver; shrinkage is still active at n = 5-6 |
| Mid-tournament forecast discontinuity | Backtest-first; activation is a separately approved decision; the per-match movement bound limits swing size; default posture holds activation for a future cycle |
| Public misunderstanding as "momentum" | Internal-only until Stage 5; the driver measures results relative to expectation, not psychological state; wording rules (this section, and future public copy) forbid momentum/hot-hand/live-form language |
| Tuning to 2026 or one matchup | The backtest uses zero 2026 data; the decision rule is frozen here, before any result; the weight is chosen only by the pre-registered gates; no example (e.g. England vs Mexico) informs the formula or the weight |

## 11. Open questions (deferred; not decided here)

- **Activation timing** if the gates pass: activate for the remaining 2026 knockouts (accepting a
  mid-tournament forecast-series discontinuity) or hold for a future cycle? Default is to hold.
- **Ledger schema:** add a 90-minute / extra-time split (an `afterExtraTime` flag or a 90' score)
  to the 2026 knockout results ledger, to make the Section 5 approximation exact — only if the
  sanitized feed can supply it.
- **Exploratory weights:** whether to later test clearly activation-*ineligible* weights (e.g. 35,
  50) purely for a dose-response shape, or keep the swept surface minimal.
- **Third-place match:** include a team's third-place match in its own history (default) or exclude
  it as a motivation confound.
- **Baseline-mismatch sensitivity arm:** whether a report-only "core + recentForm" historical
  variant is worth running to probe how much the Section 7 mismatch matters.
- **Public label:** choose among the Section 2 candidates at Stage 5.

These are recorded for later governance decisions; none is resolved by this document.

## 12. What this PR does and does not do

**Does:** add this pre-registration document and link it from `docs/BACKTESTING_INDEX.md` and
`docs/BACKTESTING_METHOD.md`.

**Does not:** implement the driver; implement the backtest harness; run any historical sweep;
compute or commit any real metric; add production code; add tests; change model weights or forecast
outputs; regenerate snapshots; touch live-state / provider / Blob / workflows; add public
methodology copy; or expose the driver publicly. The formula, constants, leakage rules, subsets, and
decision rule above are **frozen on merge**.
