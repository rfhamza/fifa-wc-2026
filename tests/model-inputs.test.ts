import { describe, expect, it } from "vitest";
import {
  MODEL_INPUT_SOURCES,
  modelInputSnapshot,
  getModelInputsForTeam,
  getFeatureStatus,
} from "@/data/model-inputs";
import { validateModelInputs } from "@/lib/data/validate-model-inputs";
import {
  computeDrivers,
  predictFromFeatures,
} from "@/lib/model/predict";
import { buildFeatureSet } from "@/lib/model/features";
import {
  PLACEHOLDER_CONTRIBUTION_CAP,
  TOTAL_PLACEHOLDER_CONTRIBUTION_CAP,
} from "@/lib/model/config";
import { getTeam } from "@/lib/data";
import { officialTeams } from "@/data/official/teams";
import type { ModelFeatureFamily, TeamModelInputs } from "@/lib/types";

const FAMILIES: ModelFeatureFamily[] = [
  "eloRating", "fifaRanking", "structural", "squadQuality", "recentForm",
  "climateFamiliarity", "hostAdvantage", "regionalAdvantage", "managerCohesion",
];

describe("model-input layer - shape & provenance", () => {
  it("covers all 48 teams with finite numeric inputs", () => {
    expect(modelInputSnapshot).toHaveLength(48);
    for (const m of modelInputSnapshot) {
      for (const v of [m.eloRating, m.fifaRanking, m.gdpPerCapita, m.population, m.recentForm, m.squadQuality, m.climateFamiliarity]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
    expect(new Set(modelInputSnapshot.map((m) => m.teamId)).size).toBe(48);
  });

  it("registers a source + explicit status for every feature family", () => {
    for (const f of FAMILIES) {
      const src = MODEL_INPUT_SOURCES[f];
      expect(src).toBeTruthy();
      expect(src.status).toBeTruthy();
      expect(src.sourceName).toBeTruthy();
    }
  });

  it("makes no source-backed/verified claim without source metadata (honesty)", () => {
    for (const f of FAMILIES) {
      const src = MODEL_INPUT_SOURCES[f];
      if (src.status === "source-backed" || src.status === "verified") {
        expect(src.sourceName.length).toBeGreaterThan(0);
      }
    }
    // squad/form/climate must be honestly placeholder this phase.
    expect(getFeatureStatus("squadQuality")).toBe("placeholder");
    expect(getFeatureStatus("recentForm")).toBe("placeholder");
    expect(getFeatureStatus("climateFamiliarity")).toBe("placeholder");
    // Elo anchor + FIFA ranking are both source-backed (Phase 1.10 / 1.8).
    expect(getFeatureStatus("eloRating")).toBe("source-backed");
    expect(getFeatureStatus("fifaRanking")).toBe("source-backed");
  });
});

describe("validateModelInputs", () => {
  it("passes for the committed snapshot", () => {
    const r = validateModelInputs();
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it("flags a non-finite value as an error", () => {
    const bad: TeamModelInputs[] = modelInputSnapshot.map((m, i) =>
      i === 0 ? { ...m, eloRating: NaN } : m,
    );
    const r = validateModelInputs(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/non-finite/);
  });

  it("flags an out-of-range value as an error", () => {
    const bad: TeamModelInputs[] = modelInputSnapshot.map((m, i) =>
      i === 0 ? { ...m, squadQuality: 999 } : m,
    );
    expect(validateModelInputs(bad).valid).toBe(false);
  });

  it("flags a team-id mismatch as an error", () => {
    const bad: TeamModelInputs[] = modelInputSnapshot.map((m, i) =>
      i === 0 ? { ...m, teamId: "atlantis" } : m,
    );
    const r = validateModelInputs(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/not in official teams|missing model-input row/);
  });
});

describe("model consumes the model-input layer", () => {
  it("buildFeatureSet reads strength values from the snapshot", () => {
    const team = getTeam("argentina");
    const mi = getModelInputsForTeam("argentina")!;
    const fs = buildFeatureSet(team);
    expect(fs.elo).toBe(mi.eloRating);
    expect(fs.squadQuality).toBe(mi.squadQuality);
    expect(fs.recentForm).toBe(mi.recentForm);
  });
});

describe("placeholder-weight caps", () => {
  // Argentina (strong) vs New Zealand (weak) -> large placeholder gaps.
  const a = buildFeatureSet(getTeam("argentina"));
  const b = buildFeatureSet(getTeam("new-zealand"));
  const drivers = computeDrivers(a, b);
  const byFamily = new Map(drivers.map((d) => [d.family, d]));

  it("caps each placeholder driver to +/- PLACEHOLDER_CONTRIBUTION_CAP", () => {
    for (const fam of ["squadQuality", "recentForm", "climateFamiliarity"] as const) {
      const d = byFamily.get(fam)!;
      expect(d.status).toBe("placeholder");
      expect(Math.abs(d.contribution)).toBeLessThanOrEqual(PLACEHOLDER_CONTRIBUTION_CAP + 1e-9);
    }
  });

  it("caps the combined placeholder contribution to +/- TOTAL cap", () => {
    const total = drivers
      .filter((d) => d.status === "placeholder")
      .reduce((s, d) => s + d.contribution, 0);
    expect(Math.abs(total)).toBeLessThanOrEqual(TOTAL_PLACEHOLDER_CONTRIBUTION_CAP + 1e-9);
  });

  it("marks capped drivers with capped: true", () => {
    expect(byFamily.get("squadQuality")!.capped).toBe(true);
    expect(byFamily.get("recentForm")!.capped).toBe(true);
  });

  it("does not cap the source-backed Elo anchor", () => {
    const elo = byFamily.get("eloRating")!;
    expect(elo.status).toBe("source-backed");
    expect(elo.capped).toBeFalsy();
    // Elo gap is hundreds of points, far above the placeholder cap.
    expect(Math.abs(elo.contribution)).toBeGreaterThan(PLACEHOLDER_CONTRIBUTION_CAP);
  });

  it("explanations disclose family, status and capped", () => {
    const { explanation } = predictFromFeatures(a, b);
    const all = [...explanation.positiveDrivers, ...explanation.negativeDrivers];
    for (const d of all) {
      expect(d.family).toBeTruthy();
      expect(d.status).toBeTruthy();
      expect(typeof d.capped).toBe("boolean");
    }
    expect(all.some((d) => d.status === "placeholder" && d.capped)).toBe(true);
  });
});

describe("regression - model + production unchanged", () => {
  it("predictions are finite and sum to ~1 (no NaN)", () => {
    const p = predictFromFeatures(
      buildFeatureSet(getTeam("brazil")),
      buildFeatureSet(getTeam("haiti")),
    );
    const total = p.homeWin + p.draw + p.awayWin;
    expect(Number.isNaN(total)).toBe(false);
    expect(total).toBeGreaterThan(0.98);
    expect(total).toBeLessThan(1.02);
  });

  it("non-finite inputs fall back without producing NaN drivers", () => {
    const teamA = { ...getTeam("brazil"), elo: NaN } as never;
    // buildFeatureSet falls back to snapshot value for known teams.
    const fs = buildFeatureSet(teamA);
    expect(Number.isFinite(fs.elo)).toBe(true);
    expect(officialTeams).toHaveLength(48);
  });

  it("resolver still serves the official schedule", async () => {
    const { resolveDataset } = await import("@/lib/data/source");
    expect(resolveDataset().fixtureSource).toBe("official");
  });
});
