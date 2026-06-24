import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Phase 1.26B: the live-ingest adapter layer (`lib/live-ingest/*`) is ISOLATED.
 * Production code (incl. the live-state layer it depends on) must never import it;
 * it must never pull in model/simulator-engine/backtesting code; and it must contain
 * NO network I/O, NO env/secret reads, and NO model/calibration surface.
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

const importsLiveIngest = (src: string) =>
  /(?:from|import|require)\s*\(?\s*["'][^"']*live-ingest[^"']*["']/.test(src);

describe("live-ingest is isolated FROM production (no one imports it)", () => {
  // Production surfaces that must NOT depend on the live-ingest layer — including
  // the live-state layer, which live-ingest depends on (not the reverse).
  const PROD_DIRS = [
    "app",
    "components",
    join("lib", "model"),
    join("lib", "simulation"),
    join("lib", "data"),
    join("lib", "tournament-context"),
    join("lib", "recent-form"),
    join("lib", "backtesting"),
    join("lib", "live-state"),
    join("data", "model-inputs"),
    join("data", "official"),
    join("data", "mock"),
  ];

  it("no production module imports lib/live-ingest", () => {
    for (const dir of PROD_DIRS) {
      for (const file of collect(join(root, dir))) {
        expect({ file, imports: importsLiveIngest(readFileSync(file, "utf8")) }).toEqual({ file, imports: false });
      }
    }
  });

  it("prediction-core does not import the live-ingest layer", () => {
    const src = readFileSync(join(root, "lib", "model", "prediction-core.ts"), "utf8");
    expect(importsLiveIngest(src)).toBe(false);
  });

  it("no simulator module imports the live-ingest layer", () => {
    for (const file of collect(join(root, "lib", "simulation"))) {
      expect(importsLiveIngest(readFileSync(file, "utf8"))).toBe(false);
    }
  });
});

describe("live-ingest avoids model/simulator-engine coupling", () => {
  // Allowed: lib/live-state, lib/data, @/lib/types. Forbidden: everything below.
  const FORBIDDEN = [
    /lib\/model\//,
    /lib\/simulation\/tournament/,
    /data\/model-inputs/,
    /lib\/backtesting/,
    /data\/historical/,
    /^@\/app\//,
    /^@\/components\//,
  ];

  it("lib/live-ingest/* imports no forbidden module", () => {
    const files = collect(join(root, "lib", "live-ingest"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const specs = importSpecifiers(readFileSync(file, "utf8"));
      const bad = specs.find((s) => FORBIDDEN.some((re) => re.test(s)));
      expect({ file, forbidden: bad ?? null }).toEqual({ file, forbidden: null });
    }
  });

  it("the contract module is type-only at runtime (every import is `import type`)", () => {
    const src = readFileSync(join(root, "lib", "live-ingest", "types.ts"), "utf8");
    for (const line of src.split("\n")) {
      if (/^\s*import\b/.test(line)) {
        expect({ line, typeOnly: /^\s*import\s+type\b/.test(line) }).toEqual({ line, typeOnly: true });
      }
    }
  });
});

describe("live-ingest has no network / secrets / model surface", () => {
  const files = collect(join(root, "lib", "live-ingest"));

  it("performs no network I/O and reads no env/secrets", () => {
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const re of [/\bfetch\s*\(/, /\bprocess\.env\b/, /\baxios\b/, /XMLHttpRequest/, /require\s*\(/, /https?:\/\//]) {
        expect({ file, pattern: String(re), hit: re.test(src) }).toEqual({ file, pattern: String(re), hit: false });
      }
    }
  });

  it("references no weights / calibration / prediction code", () => {
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const term of ["MODEL_WEIGHTS", "calibrat", "prediction-core", "tuneWeights"]) {
        expect({ file, term, present: src.includes(term) }).toEqual({ file, term, present: false });
      }
    }
  });

  it("the expected live-ingest modules exist", () => {
    for (const f of ["types.ts", "mapping.ts", "normalize.ts"]) {
      expect(existsSync(join(root, "lib", "live-ingest", f))).toBe(true);
    }
  });
});
