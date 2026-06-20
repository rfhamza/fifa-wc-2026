import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MODEL_WEIGHTS } from "@/lib/model/config";
import { getFeatureStatus, getModelInputsForTeam } from "@/data/model-inputs";
import { buildFeatureSet } from "@/lib/model/features";
import { getTeam, fixtureSource } from "@/lib/data";
import { MODEL_INPUT_SOURCES } from "@/data/model-inputs/sources";

/**
 * Phase 1.16B is a STANDALONE, UNWIRED layer: it must not change the active
 * `recentForm` placeholder, the model, or any probability.
 */
describe("recent-form layer is NOT wired into the model (Phase 1.16B)", () => {
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
  const importsRecentForm = (src: string) =>
    /(?:from|import|require)\s*\(?\s*["'][^"']*recent-form[^"']*["']/.test(src);

  it("no file under lib/model imports the recent-form layer", () => {
    for (const file of collectTs(join(root, "lib", "model"))) {
      expect(importsRecentForm(readFileSync(file, "utf8"))).toBe(false);
    }
  });

  it("the active model-input assembly does not import the recent-form layer", () => {
    // team-inputs.ts must still feed the placeholder recentForm, not the new layer.
    const src = readFileSync(join(root, "data", "model-inputs", "team-inputs.ts"), "utf8");
    expect(importsRecentForm(src)).toBe(false);
  });

  it("recentForm stays a placeholder family (not promoted)", () => {
    expect(getFeatureStatus("recentForm")).toBe("placeholder");
    expect(MODEL_INPUT_SOURCES.recentForm.status).toBe("placeholder");
  });

  it("MODEL_WEIGHTS.recentForm is unchanged (2.0) and no new recent-form weight key exists", () => {
    expect(MODEL_WEIGHTS.recentForm).toBe(2.0);
    expect(Object.keys(MODEL_WEIGHTS)).not.toContain("recentFormCandidate");
    expect(Object.keys(MODEL_WEIGHTS)).not.toContain("rawRecentForm");
  });

  it("the active recentForm value is still the placeholder Team value, not the new score", () => {
    for (const id of ["argentina", "brazil", "mexico"]) {
      const team = getTeam(id);
      const mi = getModelInputsForTeam(id)!;
      expect(mi.recentForm).toBe(team.recentForm);
      expect(buildFeatureSet(team).recentForm).toBe(team.recentForm);
    }
  });

  it("ModelFeatureFamily has no recent-form-candidate member (registry keys)", () => {
    expect(Object.keys(MODEL_INPUT_SOURCES)).not.toContain("recentFormCandidate");
    expect(Object.keys(MODEL_INPUT_SOURCES)).not.toContain("rawRecentForm");
  });

  it("fixtureSource remains official", () => {
    expect(fixtureSource).toBe("official");
  });
});
