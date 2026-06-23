# Backtesting — Primary Historical Monte Carlo Replay: Interpretation & Governance

> **SUPPLEMENTARY / APPROXIMATE — NOT HEADLINE, NOT CALIBRATION EVIDENCE, NOT
> LOTO, NOT PRODUCTION. Calibration remains NO-GO.**

This document is the interpretation-governance layer for the **primary-only
Monte Carlo historical replay** (`lib/backtesting/historical-monte-carlo-replay.ts`,
`computePrimaryHistoricalReplay`, Phase 1.21F). It explains how replay outputs
**may** and **may not** be read so they are never mistaken for calibration
evidence, the primary diagnostic headline, a LOTO basis, a model-selection /
tuning mechanism, or a production forecast. It commits **no** replay numbers.

It is the third of the **three distinct backtesting views** (do not conflate):
match-level diagnostics (90' W/D/L scoring), deterministic reconstruction
(structure recovery from actual results), and Monte Carlo replay (this view).
See `docs/BACKTESTING_TOURNAMENT_REPLAY_PLAN.md` for the implementation and
`docs/BACKTESTING_CALIBRATION_GOVERNANCE.md` for the standing NO-GO decision.

## 1. What replay is (and is not)

- Replay is a **primary historical Monte Carlo replay** — an **approximate
  tournament-path simulation** run from **frozen pre-tournament inputs**.
- Replay is **not match-level scoring.** It does not compute or change RPS /
  log-loss / Brier on the matches that actually occurred. Those live in the
  match-level diagnostics (`consolidate.ts` / `loto.ts` / stretch) and remain the
  **sole primary diagnostic headline**, unchanged by replay.
- Replay is **approximate** (see the `assumptions[]` it emits): group tiebreakers
  reuse the production Article-13 standings helper as a deterministic
  approximation; knockout advancement is Poisson 90' goals with an xG-share
  coin-flip draw-breaker — **no** exact extra-time scoreline or penalty-shootout
  model.
- Replay is **primary-only.** It covers exactly **2010, 2014, 2018, 2022** and
  **excludes 1998, 2002, 2006**. There is **no all-seven replay** and **no
  all-seven replay headline**. There is no stretch replay.
- Replay is a **qualitative plausibility lens only.**

What replay **does not** do:
- does **not** change calibration governance (calibration remains **NO-GO**);
- does **not** change production probabilities;
- does **not** change match-level diagnostics;
- does **not** replace or re-baseline the primary diagnostic headline;
- does **not** constitute LOTO and is **not** a production forecast.

## 2. Interpretation rules

### Replay MAY be used to say

- How often the model's **frozen pre-tournament assumptions** simulated the
  **actual champion** winning.
- Whether the actual champion was among the model's **plausible contenders**.
- Whether the actual **finalists / semifinalists** appeared in the simulated
  distribution.
- Whether a particular **tournament path** was plausible under the model's
  assumptions.

Phrase every such statement **conditionally and descriptively** — e.g. "under
these frozen assumptions, the model **simulated** the actual champion winning
roughly X% of the time, which is **plausible**," as **supplementary** context.

### Replay MUST NOT be used to say

- the model is **calibrated**;
- the model **should be tuned**;
- **one variant is the winner**;
- **weights should change**;
- **production probabilities should change**;
- the **primary historical diagnostic headline should change**;
- **all-seven history supports the model**;
- **stretch tournaments should be blended** into the headline;
- replay **is LOTO**;
- replay **is a production forecast**.

### Wording

Use conditional, descriptive language: "under these frozen assumptions…",
"simulated…", "plausible…", "supplementary…".

Avoid evaluative language: "accurate", "calibrated", "validated", "best
variant", "winning model".

A single observed tournament outcome is **one draw** from the simulated
distribution. Read replay as **presence / plausibility**, never as a score.

## 3. Naming & labelling policy

**Approved labels:**
- "Primary historical Monte Carlo replay"
- "Supplementary replay diagnostic"
- "Approximate tournament-path simulation"
- "Not headline"
- "Not calibration evidence"
- "Not LOTO"
- "Not a production forecast"
- "Qualitative plausibility lens"

These are consistent with the canonical in-code label
`PRIMARY_REPLAY_DIAGNOSTIC_LABEL`.

**Forbidden / discouraged language:**
- "historical validation"
- "calibrated replay"
- "model accuracy"
- "best variant"
- "winning model"
- "forecast benchmark"
- "official historical score"
- "all-history result"

## 4. Numbers policy

- **No replay numbers are committed in this phase**, and **no illustrative
  replay table** is committed.
- Replay values depend on **seed and iteration count**. Any locally computed
  number is **not a fixed benchmark**.
- Replay values **should not be compared across seeds** as if they were official
  scores.
- Replay values are **not calibration metrics**.

Replay is deterministic for a given `{seed, iterations}` (the same inputs
reproduce identical output), but that reproducibility does **not** make any
particular value an official or comparable score. Do not paste champion
probabilities from prior reports into governance docs as if they were pinned
results.

## 5. Governance flags

Every replay result carries `PRIMARY_REPLAY_GOVERNANCE_FLAGS`
(`lib/backtesting/historical-monte-carlo-replay.ts`), pinned by
`tests/backtesting-historical-monte-carlo-replay.test.ts`:

| Flag | Value | Meaning |
|---|---|---|
| `supplementaryOnly` | `true` | Replay is supplementary context only. |
| `headlineEligible` | `false` | Never the headline benchmark. |
| `calibrationEligible` | `false` | Never calibration evidence. |
| `lotoEligible` | `false` | Never a LOTO basis. |
| `tuningEligible` | `false` | Never used to tune / select weights. |
| `productionEligible` | `false` | Never feeds production probabilities. |

These flags are sufficient. This phase adds **no new flags** and changes **no**
replay schema. The documented approximations remain in the result's
`assumptions[]` array.

## 6. Cross-links

- `docs/BACKTESTING_TOURNAMENT_REPLAY_PLAN.md` — replay (and reconstruction)
  implementation and scope.
- `lib/backtesting/README.md` — harness overview and isolation guarantees.
- `docs/BACKTESTING_CALIBRATION_GOVERNANCE.md` — the standing **NO-GO** decision;
  replay does not change it.
- `docs/BACKTESTING_STRETCH_CONTEXT.md` / `docs/BACKTESTING_STRETCH_DIAGNOSTICS.md`
  — the separate, match-level stretch cohort (1998/2002/2006); **not** replayed.

**Calibration remains NO-GO.** No all-seven replay, no stretch replay, no LOTO
sensitivity, no calibration, and no tuning are introduced or implied by this
document.
