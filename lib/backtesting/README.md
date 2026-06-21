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

## Status (Phase 1.18B-0)
Scaffold + contract only: `types.ts` (source-pack contract), docs, and templates. **No historical
data ingested, no match-level harness, no tournament replay, no calibration.**

## Contract
`types.ts` defines the per-tournament `HistoricalSourcePack` (identity, results, pre-tournament
Elo/FIFA, lagged macro, recent-form, optional managers/squads). See
`docs/BACKTESTING_DATA_CONTRACT.md`, `docs/BACKTESTING_SOURCE_AUDIT.md`,
`docs/BACKTESTING_METHOD.md`.

## Leakage (hard rule)
Every as-of field must be **strictly before** the tournament `openingKickoff`. No tournament
result may feed a pre-tournament feature; no post-tournament rankings/Elo/rosters. Raw source files
are **never committed** — only derived snapshots with provenance + SHA-256.
