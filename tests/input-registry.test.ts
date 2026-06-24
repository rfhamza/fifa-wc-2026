import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MODEL_WEIGHTS } from "@/lib/model/config";
import { MODEL_INPUT_SOURCES } from "@/data/model-inputs/sources";
import {
  INPUT_REGISTRY,
  INPUT_STATUSES,
  INPUT_PHASES,
  SOURCE_TYPES,
  REFRESH_CADENCES,
  CURRENT_USAGES,
  CONFIDENCE_LEVELS,
  getInputRegistryEntry,
} from "@/lib/model/input-registry";

/**
 * Phase 1.24B - the model input registry is a GOVERNANCE CATALOG, not behavioural
 * config. These tests lock in: completeness against the production weight keys,
 * the reference-don't-duplicate rules (weightRef -> config, sourceRef -> sources),
 * required governance metadata, controlled vocabularies, and strict import
 * isolation from all production prediction code.
 */

const weightKeys = (e: (typeof INPUT_REGISTRY)[number]): string[] =>
  e.weightRef == null ? [] : Array.isArray(e.weightRef) ? e.weightRef : [e.weightRef];

describe("input registry: completeness vs production weights", () => {
  it("every MODEL_WEIGHTS key is referenced by some registry entry's weightRef", () => {
    const referenced = new Set(INPUT_REGISTRY.flatMap(weightKeys));
    for (const key of Object.keys(MODEL_WEIGHTS)) {
      expect({ key, referenced: referenced.has(key) }).toEqual({ key, referenced: true });
    }
  });

  it("every weightRef points to a valid MODEL_WEIGHTS key", () => {
    const valid = new Set(Object.keys(MODEL_WEIGHTS));
    for (const e of INPUT_REGISTRY) {
      for (const k of weightKeys(e)) {
        expect({ inputId: e.inputId, k, valid: valid.has(k) }).toEqual({ inputId: e.inputId, k, valid: true });
      }
    }
  });
});

describe("input registry: references, does not duplicate", () => {
  it("the registry module does not import the weight source of truth (config)", () => {
    const src = readFileSync(join(process.cwd(), "lib", "model", "input-registry.ts"), "utf8");
    const re = /(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g;
    const specs: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) specs.push(m[1]!);
    // It must reference weights/sources by string pointer only - never import their values.
    expect(specs).toEqual([]);
  });

  it("no registry entry carries a numeric value (so no weight/cap can be duplicated)", () => {
    for (const e of INPUT_REGISTRY) {
      for (const [field, value] of Object.entries(e)) {
        const numericLeaf =
          typeof value === "number" ||
          (Array.isArray(value) && value.some((v) => typeof v === "number"));
        expect({ inputId: e.inputId, field, numericLeaf }).toEqual({ inputId: e.inputId, field, numericLeaf: false });
      }
    }
  });

  it("every non-null sourceRef points to a valid sources.ts family", () => {
    const families = new Set(Object.keys(MODEL_INPUT_SOURCES));
    for (const e of INPUT_REGISTRY) {
      if (e.sourceRef == null) continue;
      expect({ inputId: e.inputId, sourceRef: e.sourceRef, valid: families.has(e.sourceRef) }).toEqual({
        inputId: e.inputId,
        sourceRef: e.sourceRef,
        valid: true,
      });
    }
  });
});

describe("input registry: required governance metadata", () => {
  const REQUIRED_STRINGS = [
    "inputId",
    "displayName",
    "family",
    "description",
    "fallback",
    "freshnessRequirement",
    "knownLimitations",
    "testsRequired",
    "governanceNotes",
  ] as const;
  const REQUIRED_BOOLEANS = [
    "publicExplanationAllowed",
    "calibrationEligible",
    "tuningEligible",
    "liveEligible",
  ] as const;

  it("every entry has non-empty required string metadata", () => {
    for (const e of INPUT_REGISTRY) {
      for (const f of REQUIRED_STRINGS) {
        const v = (e as unknown as Record<string, unknown>)[f];
        expect({ inputId: e.inputId, f, ok: typeof v === "string" && v.trim().length > 0 }).toEqual({
          inputId: e.inputId,
          f,
          ok: true,
        });
      }
    }
  });

  it("every entry has explicit boolean governance flags", () => {
    for (const e of INPUT_REGISTRY) {
      for (const f of REQUIRED_BOOLEANS) {
        const v = (e as unknown as Record<string, unknown>)[f];
        expect({ inputId: e.inputId, f, isBool: typeof v === "boolean" }).toEqual({ inputId: e.inputId, f, isBool: true });
      }
    }
  });

  it("inputIds are unique and resolvable via the lookup helper", () => {
    const ids = INPUT_REGISTRY.map((e) => e.inputId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(getInputRegistryEntry(id)?.inputId).toBe(id);
  });
});

describe("input registry: governance invariants", () => {
  it("planned/deferred and future-live entries are NOT production probability drivers", () => {
    for (const e of INPUT_REGISTRY) {
      const isFutureish = e.status === "planned" || e.status === "deferred" || e.phase === "liveFuture";
      if (!isFutureish) continue;
      expect({ inputId: e.inputId, usage: e.currentUsage }).not.toEqual({
        inputId: e.inputId,
        usage: "productionProbability",
      });
    }
  });

  it("future-live entries are not calibration- or tuning-eligible", () => {
    for (const e of INPUT_REGISTRY) {
      if (e.phase !== "liveFuture") continue;
      expect({ inputId: e.inputId, cal: e.calibrationEligible, tune: e.tuningEligible }).toEqual({
        inputId: e.inputId,
        cal: false,
        tune: false,
      });
    }
  });

  it("calibration is NO-GO and tuning unapproved project-wide: no entry is eligible", () => {
    for (const e of INPUT_REGISTRY) {
      expect({ inputId: e.inputId, cal: e.calibrationEligible, tune: e.tuningEligible }).toEqual({
        inputId: e.inputId,
        cal: false,
        tune: false,
      });
    }
  });

  it("only production-probability entries carry a weightRef", () => {
    for (const e of INPUT_REGISTRY) {
      if (e.weightRef == null) continue;
      expect({ inputId: e.inputId, usage: e.currentUsage }).toEqual({
        inputId: e.inputId,
        usage: "productionProbability",
      });
    }
  });
});

describe("input registry: controlled vocabularies", () => {
  it("every entry uses valid status / phase / usage / refresh-cadence / source-type / confidence values", () => {
    const statuses = new Set<string>(INPUT_STATUSES);
    const phases = new Set<string>(INPUT_PHASES);
    const usages = new Set<string>(CURRENT_USAGES);
    const cadences = new Set<string>(REFRESH_CADENCES);
    const sourceTypes = new Set<string>(SOURCE_TYPES);
    const confidences = new Set<string>(CONFIDENCE_LEVELS);
    for (const e of INPUT_REGISTRY) {
      expect(statuses.has(e.status)).toBe(true);
      expect(phases.has(e.phase)).toBe(true);
      expect(usages.has(e.currentUsage)).toBe(true);
      expect(cadences.has(e.refreshCadence)).toBe(true);
      expect(e.sourceType == null || sourceTypes.has(e.sourceType)).toBe(true);
      expect(confidences.has(e.confidenceLevel)).toBe(true);
    }
  });
});

describe("input registry: import isolation from production prediction code", () => {
  const root = process.cwd();
  const collectTs = (dir: string): string[] => {
    if (!existsSync(dir)) return [];
    const out: string[] = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) out.push(...collectTs(p));
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
    }
    return out;
  };
  const importsRegistry = (src: string) =>
    /(?:from|import|require)\s*\(?\s*["'][^"']*input-registry[^"']*["']/.test(src);

  // Production surfaces that must NEVER depend on the governance catalog.
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

  it("no production module imports lib/model/input-registry", () => {
    for (const dir of PROD_DIRS) {
      for (const file of collectTs(join(root, dir))) {
        // the registry module itself is allowed to exist; only IMPORTS are forbidden
        if (file.endsWith(join("lib", "model", "input-registry.ts"))) continue;
        expect({ file, imports: importsRegistry(readFileSync(file, "utf8")) }).toEqual({ file, imports: false });
      }
    }
  });

  it("prediction-core does not import the registry", () => {
    const src = readFileSync(join(root, "lib", "model", "prediction-core.ts"), "utf8");
    expect(importsRegistry(src)).toBe(false);
  });

  it("the simulator does not import the registry", () => {
    for (const file of collectTs(join(root, "lib", "simulation"))) {
      expect(importsRegistry(readFileSync(file, "utf8"))).toBe(false);
    }
  });

  it("the registry module itself imports nothing (fully standalone)", () => {
    const src = readFileSync(join(root, "lib", "model", "input-registry.ts"), "utf8");
    expect(/^\s*import\s/m.test(src)).toBe(false);
  });
});
