import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildBaselineForecastSnapshot,
  loadForecastSnapshot,
  loadForecastManifest,
  validateForecastSnapshot,
  findForbiddenSubstrings,
  FORECAST_PROBABILITY_KEYS,
  FORECAST_SNAPSHOT_TEAM_COUNT,
} from "@/lib/model/forecast-snapshots";
import { MODEL_WEIGHTS, SIMULATION_CONFIG } from "@/lib/model/config";

/**
 * Phase 1.29 (PR-2) - guards the committed, frozen pre-tournament baseline
 * snapshot. Proves it is schema-valid, public-safe, referenced by the manifest,
 * and EXACTLY reproducible by rerunning the generator with the same deterministic
 * parameters (seed/iterations/generatedAt). NO lockedResults / live-aware /
 * ledger / delta work is in scope here.
 *
 * These parameters must match how the artifact was generated:
 *   npm run forecast:snapshot -- --generated-at 2026-06-11T00:00:00.000Z \
 *     --out data/forecast/snapshots/baseline-2026-06-11.pre-tournament.json
 * (seed and iterations default to the production SIMULATION_CONFIG.)
 */
const BASELINE_GENERATED_AT = "2026-06-11T00:00:00.000Z";
const BASELINE_FILE = "baseline-2026-06-11.pre-tournament.json";
const BASELINE_DIR = "data/forecast/snapshots";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const committed = loadForecastSnapshot(read(join(BASELINE_DIR, BASELINE_FILE)));

describe("committed pre-tournament baseline snapshot", () => {
  it("validates against the snapshot schema", () => {
    expect(validateForecastSnapshot(committed)).toEqual([]);
  });

  it("is a pre-tournament baseline with no completed results locked", () => {
    expect(committed.meta.snapshotType).toBe("baseline");
    expect(committed.meta.completedMatchesLocked).toBe(0);
    expect(committed.meta.liveStateSource).toBeNull();
    expect(committed.meta.liveStateAsOf).toBeNull();
    expect(committed.meta.seed).toBe(SIMULATION_CONFIG.defaultSeed);
    expect(committed.meta.simulationIterations).toBe(SIMULATION_CONFIG.defaultIterations);
  });

  it("records the current model configuration with manager weight 0", () => {
    expect(committed.meta.weightsSummary).toEqual({ ...MODEL_WEIGHTS });
    expect(committed.meta.weightsSummary.manager).toBe(0);
    expect(committed.meta.dataVersion).toMatch(/^td-/);
    expect(committed.meta.fixtureVersion).toMatch(/^fx-/);
    expect(committed.meta.modelConfigHash).toMatch(/^mw-/);
  });

  it("contains 48 teams, each with numeric probabilities in [0,1]", () => {
    expect(committed.teams).toHaveLength(FORECAST_SNAPSHOT_TEAM_COUNT);
    for (const t of committed.teams) {
      for (const key of FORECAST_PROBABILITY_KEYS) {
        expect(typeof t[key]).toBe("number");
        expect(t[key]).toBeGreaterThanOrEqual(0);
        expect(t[key]).toBeLessThanOrEqual(1);
      }
    }
  });

  it("leaks no provider/private data", () => {
    expect(findForbiddenSubstrings(JSON.stringify(committed))).toEqual([]);
  });

  it("is exactly reproducible by rerunning the generator with the same parameters", () => {
    const regenerated = buildBaselineForecastSnapshot({
      generatedAt: BASELINE_GENERATED_AT,
    });
    expect(regenerated).toEqual(committed);
    expect(JSON.stringify(regenerated)).toBe(JSON.stringify(committed));
  });
});

describe("forecast manifest references the baseline", () => {
  const manifest = loadForecastManifest(read(join(BASELINE_DIR, "manifest.json")));

  it("has exactly one baseline entry", () => {
    const baselines = manifest.snapshots.filter((s) => s.isBaseline);
    expect(baselines).toHaveLength(1);
    expect(baselines[0]!.snapshotType).toBe("baseline");
  });

  it("references the committed baseline file and snapshotId correctly", () => {
    const entry = manifest.snapshots.find((s) => s.snapshotId === committed.meta.snapshotId);
    expect(entry).toBeDefined();
    expect(entry!.file).toBe(BASELINE_FILE);
    expect(entry!.completedMatchesLocked).toBe(0);
    expect(entry!.previousSnapshotId).toBeNull();
    // The referenced file exists and round-trips.
    expect(() => loadForecastSnapshot(read(join(BASELINE_DIR, entry!.file)))).not.toThrow();
  });
});
