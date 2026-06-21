# `lib/backtesting/` — historical backtesting harness (isolated)

Phase 1.18 historical test bench. **Isolated from the production 2026 forecast.**

- This layer is **never imported by the production app** (`app/`, `components/`, `lib/model/*`,
  `lib/simulation/*`, `lib/data/*`, `data/model-inputs/*`). A guard test enforces this.
- It will read **historical source packs** from `data/historical/` (a later phase) and evaluate
  the model against past tournaments. It must call the model through the **stateless seams**
  (`predictFromFeatures(a, b, weights)` / `computeDrivers` in `lib/model/predict.ts`) by building
  `TeamFeatureSet`s directly from historical snapshots — **bypassing** `buildFeatureSet` and the
  production `data/model-inputs/*` so 2026 inputs and probabilities are untouched.
- **No production weight/probability changes** come from backtesting code; calibration only ever
  *recommends* changes for a separate, explicitly approved phase.

## Status (Phase 1.18C-1)
Contract + one ingested pilot pack (WC-2022) + **the first match-level evaluator**. Still **no
tournament replay, no calibration, no weight tuning, no production/probability change.**
- `types.ts` — source-pack contract.
- `validate-historical.ts` — `validateHistoricalPack()`: coverage (32 teams / 8×4 groups / 64
  matches = 48+16), team-mapping resolution, result consistency, leakage (Elo/FIFA dated strictly
  before the opening kickoff), and a forbidden-field guard.
- `data/historical/snapshots/wc-2022.ts` — derived WC-2022 snapshot (generated; raw not committed).
  See `docs/BACKTESTING_WC2022_SNAPSHOT.md`.
- `metrics.ts` — pure RPS / log loss / Brier / accuracy / calibration + `validateProbabilityTriple`.
- `feature-adapter.ts` — builds `TeamFeatureSet`s directly from the pack (host/regional relative to
  the pack's host; excluded features neutral).
- `model-variants.ts` — diagnostic baseline ladder (Elo-only, FIFA-only, Elo+FIFA, Elo+FIFA+host/regional).
- `match-evaluator.ts` — 90-minute W/D/L scoring; group-stage headline (48), all-64 behind a flag.
  Pinned by `tests/backtesting-match-evaluator.test.ts`; summary in `docs/BACKTESTING_WC2022_BASELINE_RESULTS.md`.

### Safe-import rule (harness isolation)
`lib/backtesting/*` may reuse only **import-safe** production pieces: `@/lib/model/config`
(constants; no imports) and `@/lib/simulation/poisson` (types-only import), plus type-only
`@/lib/types`. It must **never** import `@/lib/model/predict` or `@/lib/model/features` (they pull
in `@/data/model-inputs` → 2026 data), nor `@/data/model-inputs`, `@/data/official`, `@/lib/data`,
or any 2026 snapshot. The 90-minute W/D/L conversion is reused from `poisson.ts`; the small
`netAdvantage → expected goals` formula mirrors `predict.ts` using the shared config constants.

## Contract
`types.ts` defines the per-tournament `HistoricalSourcePack` (identity, results, pre-tournament
Elo/FIFA, lagged macro, recent-form, optional managers/squads). See
`docs/BACKTESTING_DATA_CONTRACT.md`, `docs/BACKTESTING_SOURCE_AUDIT.md`,
`docs/BACKTESTING_METHOD.md`, `docs/BACKTESTING_WC2022_SNAPSHOT.md`.

## Leakage (hard rule)
Every as-of field must be **strictly before** the tournament `openingKickoff`. No tournament
result may feed a pre-tournament feature; no post-tournament rankings/Elo/rosters. Raw source files
are **never committed** — only derived snapshots with provenance + SHA-256.
