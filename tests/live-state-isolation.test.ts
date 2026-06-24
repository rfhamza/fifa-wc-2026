import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Phase 1.25B: the live-state layer (`lib/live-state/*`) is an ISOLATED data-layer
 * foundation. Production prediction code must never import it, it must never pull in
 * model weights / the simulator engine / prediction-core, and it must carry NO
 * in-play fields and NO calibration/tuning surface.
 */
const root = process.cwd();

const collect = (dir: string): string[] => {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...collect(p));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
};

const importSpecifiers = (src: string): string[] => {
  const out: string[] = [];
  const re = /(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1]!);
  return out;
};

const importsLiveState = (src: string) =>
  /(?:from|import|require)\s*\(?\s*["'][^"']*live-state[^"']*["']/.test(src);

describe("live-state is isolated FROM production (no one imports it)", () => {
  // Production surfaces that must NOT depend on the live-state layer.
  const PROD_DIRS = [
    "app",
    "components",
    join("lib", "model"),
    join("lib", "simulation"),
    join("lib", "data"),
    join("lib", "tournament-context"),
    join("lib", "recent-form"),
    join("lib", "backtesting"),
    join("data", "model-inputs"),
    join("data", "official"),
    join("data", "mock"),
  ];

  it("no production module imports lib/live-state", () => {
    for (const dir of PROD_DIRS) {
      for (const file of collect(join(root, dir))) {
        expect({ file, imports: importsLiveState(readFileSync(file, "utf8")) }).toEqual({ file, imports: false });
      }
    }
  });

  it("prediction-core does not import the live-state layer", () => {
    const src = readFileSync(join(root, "lib", "model", "prediction-core.ts"), "utf8");
    expect(importsLiveState(src)).toBe(false);
  });

  it("no simulator module imports the live-state layer", () => {
    for (const file of collect(join(root, "lib", "simulation"))) {
      expect(importsLiveState(readFileSync(file, "utf8"))).toBe(false);
    }
  });
});

describe("live-state avoids model/prediction/simulator-engine coupling", () => {
  // Forbidden: model code (weights/predict/features/core) and the simulator engine.
  // Allowed: pure helpers lib/simulation/{standings,bracket,bracket-validate},
  // the data layer (lib/data), and official static data (data/official).
  const FORBIDDEN = [
    /lib\/model\//, // config, predict, prediction-core, features
    /lib\/simulation\/tournament/, // the Monte Carlo engine
    /data\/model-inputs/,
    /lib\/backtesting/,
    /data\/historical/,
    /^@\/app\//,
    /^@\/components\//,
  ];

  it("lib/live-state/* imports no forbidden model/simulator-engine module", () => {
    const files = collect(join(root, "lib", "live-state"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const specs = importSpecifiers(readFileSync(file, "utf8"));
      const bad = specs.find((s) => FORBIDDEN.some((re) => re.test(s)));
      expect({ file, forbidden: bad ?? null }).toEqual({ file, forbidden: null });
    }
  });

  it("the live-state contract module is type-only at runtime (every import is `import type`)", () => {
    const src = readFileSync(join(root, "lib", "live-state", "types.ts"), "utf8");
    for (const line of src.split("\n")) {
      if (/^\s*import\b/.test(line)) {
        expect({ line, typeOnly: /^\s*import\s+type\b/.test(line) }).toEqual({ line, typeOnly: true });
      }
    }
  });
});

describe("live-state carries no in-play / calibration / tuning surface", () => {
  const liveFiles = collect(join(root, "lib", "live-state"));

  it("the type contract declares no in-play event fields", () => {
    const src = readFileSync(join(root, "lib", "live-state", "types.ts"), "utf8");
    // Field declarations only (avoid matching the deliberate rejection list comments).
    for (const term of ["lineup", "xG", "shotsOnTarget", "yellowCard", "possession", "substitution:"]) {
      expect({ term, present: src.includes(`${term}:`) }).toEqual({ term, present: false });
    }
  });

  it("no live-state module references weights / calibration / tuning identifiers", () => {
    for (const file of liveFiles) {
      const src = readFileSync(file, "utf8");
      for (const term of ["MODEL_WEIGHTS", "calibrat", "temperatureScaling", "tuneWeights"]) {
        expect({ file, term, present: src.includes(term) }).toEqual({ file, term, present: false });
      }
    }
  });

  it("the expected live-state modules exist", () => {
    for (const f of ["types.ts", "validate.ts", "derive.ts", "ingest.ts"]) {
      expect(existsSync(join(root, "lib", "live-state", f))).toBe(true);
    }
  });
});
