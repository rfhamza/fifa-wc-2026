import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MODEL_WEIGHTS } from "@/lib/model/config";
import { getFeatureStatus, getModelInputsForTeam, MODEL_INPUT_SOURCES } from "@/data/model-inputs";
import { buildFeatureSet } from "@/lib/model/features";
import { getTeam, fixtureSource } from "@/lib/data";

/**
 * Phase 1.17B squad roster layer is STANDALONE + UNWIRED: it must not change the
 * active `squadQuality` placeholder, the model, or any probability.
 */
describe("squad layer is NOT wired into the model (Phase 1.17B)", () => {
  const root = process.cwd();
  const collectTs = (dir: string): string[] => {
    const out: string[] = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) out.push(...collectTs(p));
      else if (e.name.endsWith(".ts")) out.push(p);
    }
    return out;
  };
  const importsSquad = (src: string) =>
    /(?:from|import|require)\s*\(?\s*["'][^"']*(squad-2026-06-11|validate-squad|lib\/types\/squad)[^"']*["']/.test(src);

  it("no file under lib/model imports the squad layer", () => {
    for (const file of collectTs(join(root, "lib", "model"))) {
      expect(importsSquad(readFileSync(file, "utf8"))).toBe(false);
    }
  });

  it("the active model-input assembly does not import the squad layer", () => {
    const src = readFileSync(join(root, "data", "model-inputs", "team-inputs.ts"), "utf8");
    expect(importsSquad(src)).toBe(false);
  });

  it("squadQuality stays a placeholder family (not promoted)", () => {
    expect(getFeatureStatus("squadQuality")).toBe("placeholder");
    expect(MODEL_INPUT_SOURCES.squadQuality.status).toBe("placeholder");
  });

  it("MODEL_WEIGHTS.squadQuality is unchanged (4.0); no new squad weight key", () => {
    expect(MODEL_WEIGHTS.squadQuality).toBe(4.0);
    expect(Object.keys(MODEL_WEIGHTS)).not.toContain("squadRoster");
    expect(Object.keys(MODEL_WEIGHTS)).not.toContain("squadPlayer");
  });

  it("the active squadQuality value is still the placeholder Team value", () => {
    for (const id of ["argentina", "brazil", "france"]) {
      const team = getTeam(id);
      expect(getModelInputsForTeam(id)!.squadQuality).toBe(team.squadQuality);
      expect(buildFeatureSet(team).squadQuality).toBe(team.squadQuality);
    }
  });

  it("no squad family is registered in MODEL_INPUT_SOURCES", () => {
    expect(Object.keys(MODEL_INPUT_SOURCES)).not.toContain("squadRoster");
    expect(Object.keys(MODEL_INPUT_SOURCES)).not.toContain("squadPlayer");
  });

  it("fixtureSource remains official", () => {
    expect(fixtureSource).toBe("official");
  });
});
