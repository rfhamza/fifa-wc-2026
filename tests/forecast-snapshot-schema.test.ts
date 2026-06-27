import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildBaselineForecastSnapshot,
  validateForecastSnapshot,
  validateForecastManifest,
  loadForecastManifest,
  findForbiddenSubstrings,
  FORECAST_PROBABILITY_KEYS,
  FORECAST_SNAPSHOT_SCHEMA_VERSION,
  FORECAST_SNAPSHOT_TEAM_COUNT,
} from "@/lib/model/forecast-snapshots";
import { MODEL_WEIGHTS } from "@/lib/model/config";

/**
 * Phase 1.29 (PR-1) - forecast snapshot foundation guard. Verifies the schema,
 * manifest, deterministic generation, and that no provider/private data leaks
 * into a snapshot. NO committed baseline artifact, no lockedResults, no deltas
 * are in scope here (later PRs).
 */
const FIXED_GENERATED_AT = "2026-06-11T00:00:00.000Z";
const TEST_BUILD = { generatedAt: FIXED_GENERATED_AT, seed: 20260611, iterations: 200 } as const;

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("forecast snapshot schema", () => {
  const snapshot = buildBaselineForecastSnapshot(TEST_BUILD);

  it("generator output passes schema validation", () => {
    expect(validateForecastSnapshot(snapshot)).toEqual([]);
  });

  it("has exactly 48 team entries", () => {
    expect(snapshot.teams).toHaveLength(FORECAST_SNAPSHOT_TEAM_COUNT);
  });

  it("every team has all probability fields, numeric and within [0,1]", () => {
    for (const t of snapshot.teams) {
      expect(typeof t.teamId).toBe("string");
      expect(typeof t.rank).toBe("number");
      for (const key of FORECAST_PROBABILITY_KEYS) {
        const v = t[key];
        expect(typeof v).toBe("number");
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("ranks are a 1..48 permutation ordered by descending winner probability", () => {
    const ranks = snapshot.teams.map((t) => t.rank);
    expect(ranks).toEqual(Array.from({ length: 48 }, (_, i) => i + 1));
    for (let i = 1; i < snapshot.teams.length; i++) {
      expect(snapshot.teams[i - 1]!.winner).toBeGreaterThanOrEqual(snapshot.teams[i]!.winner);
    }
  });

  it("carries auditable, deterministic metadata", () => {
    const m = snapshot.meta;
    expect(m.schemaVersion).toBe(FORECAST_SNAPSHOT_SCHEMA_VERSION);
    expect(m.snapshotType).toBe("baseline");
    expect(m.generatedAt).toBe(FIXED_GENERATED_AT);
    expect(m.seed).toBe(20260611);
    expect(m.simulationIterations).toBe(200);
    expect(m.completedMatchesLocked).toBe(0);
    expect(m.liveStateSource).toBeNull();
    expect(m.liveStateAsOf).toBeNull();
    expect(m.dataVersion).toMatch(/^td-/);
    expect(m.fixtureVersion).toMatch(/^fx-/);
    expect(m.modelConfigHash).toMatch(/^mw-/);
  });

  it("records the current model weights, with manager disabled (0)", () => {
    expect(snapshot.meta.weightsSummary).toEqual({ ...MODEL_WEIGHTS });
    expect(snapshot.meta.weightsSummary.manager).toBe(0);
  });
});

describe("forecast snapshot determinism", () => {
  it("is byte-stable for a fixed (seed, iterations, generatedAt)", () => {
    const a = buildBaselineForecastSnapshot(TEST_BUILD);
    const b = buildBaselineForecastSnapshot(TEST_BUILD);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("forecast snapshot is public-safe (no provider/private leakage)", () => {
  it("serialized snapshot contains no forbidden substrings", () => {
    const snapshot = buildBaselineForecastSnapshot(TEST_BUILD);
    expect(findForbiddenSubstrings(JSON.stringify(snapshot))).toEqual([]);
  });
});

describe("forecast manifest", () => {
  it("the committed manifest.json is schema-valid and starts empty", () => {
    const manifest = loadForecastManifest(read("data/forecast/snapshots/manifest.json"));
    expect(validateForecastManifest(manifest)).toEqual([]);
    expect(manifest.schemaVersion).toBe(FORECAST_SNAPSHOT_SCHEMA_VERSION);
    expect(manifest.snapshots).toEqual([]);
  });
});

describe("generator introduces no runtime live-state / Blob / env dependency", () => {
  const lib = read("lib/model/forecast-snapshots.ts");
  const script = read("scripts/generate-forecast-snapshot.ts");

  it("does not read runtime /api/live-state", () => {
    for (const src of [lib, script]) {
      expect(src).not.toContain("/api/live-state");
    }
  });

  it("does not fetch, read Blob, or read env vars", () => {
    for (const src of [lib, script]) {
      expect(src).not.toContain("fetch(");
      expect(src).not.toContain("@vercel/blob");
      expect(src).not.toContain("process.env");
    }
  });
});
