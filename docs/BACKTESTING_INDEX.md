# Backtesting Index — read this first

> **Navigation map only.** This page orients you to the backtesting / historical-diagnostics
> / replay workstream and points to the **canonical** doc and code for each concept. It holds
> **no metric values and no replay numbers** — those live in the canonical docs and the pinned
> tests, which remain the single source of truth.

## Governance reminder (one line each)

- **Calibration remains NO-GO.** See `docs/BACKTESTING_CALIBRATION_GOVERNANCE.md`.
- **Primary headline** = the 2010/2014/2018/2022 **match-level** diagnostics. Nothing else.
- **LOTO** remains **primary-only**.
- **Stretch context** (1998/2002/2006) is **supplementary** — never the headline, never calibration.
- **Monte Carlo replay** is **primary-only, supplementary, approximate** — not headline, not
  calibration, not LOTO, not production.
- **No all-seven replay and no all-seven headline exist** (intentionally).

## Recommended read order

1. **This index** — orientation.
2. `docs/BACKTESTING_METHOD.md` — methodology, scope, staged path.
3. `lib/backtesting/README.md` — harness layout and isolation guarantees.
4. `docs/BACKTESTING_CALIBRATION_GOVERNANCE.md` — the standing **NO-GO** decision and the ladder.
5. Then the concept docs below as needed.

## Concept → canonical doc / code map

### Primary match-level diagnostics
- **Purpose:** score the model's 90' W/D/L probabilities on matches that actually occurred; the headline.
- **Scope:** 2010, 2014, 2018, 2022 (primary diagnostic set / primary cohort).
- **Canonical docs:** `docs/BACKTESTING_FOUR_TOURNAMENT_DIAGNOSTICS.md`; per-tournament `docs/BACKTESTING_WC{2010,2014,2018,2022}_BASELINE_RESULTS.md`.
- **Canonical code:** `lib/backtesting/consolidate.ts`, `lib/backtesting/match-evaluator.ts`, `lib/backtesting/metrics.ts`.
- **Allowed:** the sole headline macro-average (equal weight per tournament).
- **Prohibited:** a pooled micro-average as the headline; any calibration/tuning.

### LOTO (leave-one-tournament-out)
- **Purpose:** descriptive cross-fold stability; fits nothing.
- **Scope:** 2010, 2014, 2018, 2022 (primary-only).
- **Canonical docs:** `docs/BACKTESTING_LOTO_DIAGNOSTICS.md`.
- **Canonical code:** `lib/backtesting/loto.ts`.
- **Allowed:** describing stability/robustness; held-out values equal the existing per-tournament pins.
- **Prohibited:** training/tuning; any LOTO beyond the primary cohort; using it to approve calibration.

### Stretch context
- **Purpose:** define the cohorts and the era caveats (qualitative).
- **Scope:** 1998, 2002, 2006 (stretch context set).
- **Canonical docs:** `docs/BACKTESTING_STRETCH_CONTEXT.md`.
- **Canonical code:** `lib/backtesting/historical-cohorts.ts` (cohort source of truth).
- **Allowed:** qualitative robustness / era-sensitivity context.
- **Prohibited:** treating it as the headline or calibration evidence; constructing an all-seven average.

### Stretch diagnostics
- **Purpose:** supplementary stretch-cohort metrics (delegates to consolidation; no new metric math).
- **Scope:** 1998, 2002, 2006.
- **Canonical docs:** `docs/BACKTESTING_STRETCH_DIAGNOSTICS.md`.
- **Canonical code:** `lib/backtesting/stretch-context-diagnostics.ts` (governance flags: `supplementaryOnly:true`; `headlineEligible`/`calibrationEligible`/`lotoEligible:false`).
- **Allowed:** supplementary context only.
- **Prohibited:** headline; all-seven roll-up; LOTO; calibration.

### Deterministic tournament reconstruction
- **Purpose:** rebuild group standings + knockout progression from the actual results; structure/data validation.
- **Scope:** all seven packs (1998–2022).
- **Canonical docs:** `docs/BACKTESTING_TOURNAMENT_REPLAY_PLAN.md`.
- **Canonical code:** `lib/backtesting/tournament-reconstruction.ts`.
- **Allowed:** validating that packs support tournament-level structure; deriving champions cleanly.
- **Prohibited:** model probabilities; Monte Carlo; calibration.

### Source-backed winner metadata
- **Purpose:** optional source `winner` on knockout rows; reconstruction prefers it, the evaluator never reads it; the 90' diagnostic convention is unchanged.
- **Scope:** all seven packs.
- **Canonical docs:** `docs/BACKTESTING_DATA_CONTRACT.md` (field schema); reconstruction usage in `docs/BACKTESTING_TOURNAMENT_REPLAY_PLAN.md`.
- **Canonical code:** `lib/backtesting/types.ts` (`HistoricalMatchResult`).
- **Allowed:** champion derivation inside reconstruction.
- **Prohibited:** altering the 90' match-level target; feeding match-level diagnostics.

### Primary-only Monte Carlo replay
- **Purpose:** approximate tournament-path simulation from frozen pre-tournament inputs; descriptive stage-reach distributions.
- **Scope:** 2010, 2014, 2018, 2022 (primary-only).
- **Canonical docs:** `docs/BACKTESTING_TOURNAMENT_REPLAY_PLAN.md`.
- **Canonical code:** `lib/backtesting/historical-monte-carlo-replay.ts` (governance flags all `false` except `supplementaryOnly`; includes `tuningEligible:false`, `productionEligible:false`).
- **Allowed:** a qualitative plausibility lens.
- **Prohibited:** headline; calibration; LOTO; tuning; production; all-seven replay; stretch replay.

### Replay interpretation governance
- **Purpose:** how to read replay outputs — the MAY / MUST-NOT rules, labelling policy, and no-committed-numbers policy.
- **Canonical docs:** `docs/BACKTESTING_HISTORICAL_REPLAY_INTERPRETATION.md`.
- **Allowed:** interpreting replay as supplementary/approximate plausibility context.
- **Prohibited:** re-describing replay as calibration evidence, a headline, LOTO, or a production forecast.

### Calibration governance
- **Status:** **NO-GO** (DO NOT CALIBRATE YET).
- **Canonical docs:** `docs/BACKTESTING_CALIBRATION_GOVERNANCE.md` (decision ladder + universal NO-GO list); parity proven in `docs/BACKTESTING_PARITY_AUDIT.md`.
- **Allowed:** reading the decision record and the gated, staged path.
- **Prohibited:** any production probability/weight change outside a separately approved stage-6 PR; tuning hidden inside calibration; treating the 4-of-10-driver diagnostic ladder as the production model.

## Supporting references

- `docs/BACKTESTING_DATA_CONTRACT.md` — historical source-pack schema and leakage rules.
- `docs/BACKTESTING_SOURCE_AUDIT.md` — approved sources and provenance.
- `docs/BACKTESTING_PARITY_AUDIT.md` — production ↔ harness parity.
- `docs/BACKTESTING_WC{1998,2002,2006,2010,2014,2018,2022}_SNAPSHOT.md` — per-tournament pack identity/ingestion notes.

---

*When adding a new backtesting module or governance doc, update this index.*
