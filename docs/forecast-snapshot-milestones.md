# Forecast snapshot milestones — runbook

How the committed **milestone forecast snapshots** are produced, wired, and surfaced. This is a
data + policy pipeline; no model, simulation, or generation-logic changes are involved.

## What is public vs internal

The **public checkpoint policy** is a single source of truth in
[`lib/model/forecast-checkpoints.ts`](../lib/model/forecast-checkpoints.ts):
`isPublicMilestoneLocked(completedMatchesLocked)` is true for

| locked | label | short |
|--------|-------|-------|
| 0   | Tournament start        | Start   |
| 24  | Group matchday 1 complete | MD1   |
| 48  | Group matchday 2 complete | MD2   |
| 72  | Group stage complete    | Groups  |
| 88  | Round of 32 complete    | R32     |
| 96  | Round of 16 complete    | R16     |
| 100 | Quarter-finals complete | QF      |
| 102 | Semi-finals complete    | SF      |
| 104 | Final complete          | Final   |

plus the runtime **Current projection** appended live when a valid Blob read extends the chain.

**Never public** (they stay committed as internal historical artifacts, filtered out of every
public surface — chart, movement rows, captions, serialized props):

- **locked 54** — a manual/dev checkpoint,
- **locked 73** — a knockout-lock-proof checkpoint,
- **locked 103** — the third-place play-off (`isTitleProbabilityMilestone` is false; not on the title path).

Both public UI helpers consume the policy: `lib/ui/team-trajectory.ts` (team pages) and
`lib/ui/home-trajectory-comparison.ts` (home Forecast race). New milestone snapshots appear
**automatically** once committed — no UI change is required.

## Generating a future milestone snapshot

Future round milestones (M88 after Round of 32, M96 after Round of 16, M100 after the
quarter-finals, M102 after the semi-finals, M104 after the final) are generated the same way the
M24/M48 backfills were — from a committed results ledger, with the existing generator.

1. **Commit a results ledger** truncated to the first N completed matches (group rows + any locked
   knockout rows through match N), under `data/forecast/results/`. Derive a **deterministic `asOf`**
   from the maximum `playedAt` in the slice (never `Date.now()`). Add the ledger to
   `data/forecast/results/manifest.json` with its `resultCount`.
2. **Run the generator** (`forecast:snapshot` = `vite-node scripts/generate-forecast-snapshot.ts`):

   ```
   npm run forecast:snapshot -- \
     --results data/forecast/results/results-as-of-<date>-after-match-0NN.json \
     --as-of <asOf> --generated-at <asOf-with-.000Z> \
     --snapshot-id snapshot-<date>-after-match-0NN --type post-match \
     --notes "…" \
     --out data/forecast/snapshots/snapshot-<date>-after-match-0NN.json
   ```

   Seed (`20260611`) and iterations (`2000`) default from `SIMULATION_CONFIG`; do not change them.
   The only otherwise-wall-clock field is `generatedAt`, pinned by `--generated-at`.

## Validating

- The generator runs `validateForecastSnapshot` + `assertNoForbiddenData` before writing.
- A snapshot must have **48 teams**, ranks **1..48**, and all probability fields
  (`winner`, `final`, `semiFinal`, `quarterFinal`, `roundOf16`, `roundOf32`, `qualifyTop2`,
  `qualifyThird`) in `[0, 1]`.
- **Determinism:** re-run the same command and confirm `git diff` on the snapshot file is empty.

## Manifest wiring

- Add an entry to `data/forecast/snapshots/manifest.json` ordered by `completedMatchesLocked`, keeping
  a **single linear `previousSnapshotId` chain** (each node has exactly one child — a branch makes
  `resolveManifestChain` report `chainBroken`). `current` stays the chain tail (highest locked count).
- Extend the **static import registry** in `lib/model/forecast-snapshot-store.ts`
  (`COMMITTED_SNAPSHOT_REGISTRY`) — the store reads snapshots via static JSON imports, not the
  filesystem, and a test asserts every manifest file is registered.

## Tests

- Add a **byte-for-byte regeneration** test (see `tests/forecast-milestone-backfill.test.ts`): build
  the snapshot from the committed ledger with the fixed parameters and assert it equals the committed
  file. Include schema, 48-team, rank, and no-leak checks.
- Update the hardcoded counts in `tests/forecast-snapshot-store.test.ts` (chain length, timeline
  indices, trajectory point counts) and any `previousSnapshotId` pins that shift.
- Run: `npm run scan:unicode && npm run typecheck && npm run lint && npm test && npm run build`.

## Safety

Never commit provider IDs, headers, tokens, or private Blob URLs. The `FORBIDDEN_SNAPSHOT_SUBSTRINGS`
scan (e.g. `blob_read_write_token`, `vercel-storage`, provider ids, crest/odds/referee) must pass. No
Blob write, no `/api/live-state`, no new dependency, and no changes to model weights, the prediction
formula, the simulation, live-state derivation, the provider adapter, the workflow, or the official graph.
