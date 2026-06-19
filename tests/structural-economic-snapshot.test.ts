import { describe, expect, it } from "vitest";
import {
  structuralEconomicSnapshot,
  STRUCTURAL_ECONOMIC_SOURCE,
  STRUCTURAL_NAME_TO_ID,
  getStructuralEconomic,
  getModelInputsForTeam,
  getFeatureStatus,
} from "@/data/model-inputs";
import { validateStructuralSnapshot } from "@/lib/data/validate-model-inputs";
import { buildFeatureSet, structuralDepthScore } from "@/lib/model/features";
import { computeDrivers, predictFromFeatures } from "@/lib/model/predict";
import { MODEL_WEIGHTS } from "@/lib/model/config";
import { getTeam } from "@/lib/data";
import { officialTeams } from "@/data/official/teams";
import type { StructuralEconomicRow } from "@/lib/types";

const MANUAL_TEAMS = ["england", "scotland"];

describe("structural/economic snapshot - coverage & validity", () => {
  it("has exactly one row per official team (48)", () => {
    expect(structuralEconomicSnapshot).toHaveLength(48);
    const ids = new Set(structuralEconomicSnapshot.map((r) => r.teamId));
    expect(ids.size).toBe(48);
    for (const t of officialTeams) expect(ids.has(t.id)).toBe(true);
  });

  it("has 46 World Bank source-backed rows and exactly England/Scotland manual", () => {
    const sourceBacked = structuralEconomicSnapshot.filter((r) => r.mappingStatus === "source-backed");
    const manual = structuralEconomicSnapshot.filter((r) => r.mappingStatus === "manual");
    expect(sourceBacked).toHaveLength(46);
    expect(manual.map((r) => r.teamId).sort()).toEqual([...MANUAL_TEAMS].sort());
  });

  it("source-backed rows carry positive GDP / GDP-per-capita / population in 2024", () => {
    for (const r of structuralEconomicSnapshot.filter((x) => x.mappingStatus === "source-backed")) {
      expect(r.gdpCurrentUsd).toBeGreaterThan(0);
      expect(r.gdpPerCapitaCurrentUsd).toBeGreaterThan(0);
      expect(r.population).toBeGreaterThan(0);
      expect(/^[A-Z]{3}$/.test(r.worldBankCountryCode)).toBe(true);
      // Per-indicator years are stored (not collapsed); frozen 2024 baseline here.
      expect(r.gdpYear).toBe(2024);
      expect(r.gdpPerCapitaYear).toBe(2024);
      expect(r.populationYear).toBe(2024);
    }
  });

  it("manual rows (England/Scotland) carry no WB code and null per-indicator years", () => {
    for (const r of structuralEconomicSnapshot.filter((x) => x.mappingStatus === "manual")) {
      expect(r.worldBankCountryCode).toBe("");
      expect(r.gdpYear).toBeNull();
      expect(r.gdpPerCapitaYear).toBeNull();
      expect(r.populationYear).toBeNull();
      expect(r.gdpPerCapitaCurrentUsd).toBeGreaterThan(0);
      expect(r.population).toBeGreaterThan(0);
    }
  });

  it("maps every source-backed World Bank display name to its app id", () => {
    for (const r of structuralEconomicSnapshot.filter((x) => x.mappingStatus === "source-backed")) {
      expect(STRUCTURAL_NAME_TO_ID[r.countryNameRaw]).toBe(r.teamId);
    }
  });

  it("carries explicit World Bank provenance, status candidate (mixed)", () => {
    expect(STRUCTURAL_ECONOMIC_SOURCE.status).toBe("candidate");
    expect(STRUCTURAL_ECONOMIC_SOURCE.sourceName).toMatch(/World Bank/i);
    expect(STRUCTURAL_ECONOMIC_SOURCE.sourceUrl).toContain("worldbank.org");
    expect(STRUCTURAL_ECONOMIC_SOURCE.sourceDate).toBe("2024");
    expect(STRUCTURAL_ECONOMIC_SOURCE.notes).toMatch(/not parent-mapped/i);
  });

  it("passes validateStructuralSnapshot with no errors or warnings", () => {
    const r = validateStructuralSnapshot();
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it("flags an unexpected manual row (only England/Scotland may be manual)", () => {
    const bad: StructuralEconomicRow[] = structuralEconomicSnapshot.map((r) =>
      r.teamId === "brazil"
        ? { ...r, mappingStatus: "manual", worldBankCountryCode: "", gdpYear: null, gdpPerCapitaYear: null, populationYear: null }
        : r,
    );
    const res = validateStructuralSnapshot(bad);
    expect(res.valid).toBe(false);
    expect(res.errors.join(" ")).toMatch(/unexpected manual structural row: brazil/);
  });

  it("flags an out-of-range population", () => {
    const bad: StructuralEconomicRow[] = structuralEconomicSnapshot.map((r) =>
      r.teamId === "germany" ? { ...r, population: -1 } : r,
    );
    expect(validateStructuralSnapshot(bad).valid).toBe(false);
  });

  it("flags a source-backed row missing its data year", () => {
    const bad: StructuralEconomicRow[] = structuralEconomicSnapshot.map((r) =>
      r.teamId === "germany" ? { ...r, gdpYear: null } : r,
    );
    const res = validateStructuralSnapshot(bad);
    expect(res.valid).toBe(false);
    expect(res.errors.join(" ")).toMatch(/gdpYear/);
  });

  it("flags a name that does not map to its id", () => {
    const bad: StructuralEconomicRow[] = structuralEconomicSnapshot.map((r) =>
      r.teamId === "germany" ? { ...r, countryNameRaw: "Atlantis" } : r,
    );
    expect(validateStructuralSnapshot(bad).errors.join(" ")).toMatch(/does not map/);
  });
});

describe("structural/economic - model integration", () => {
  it("the model consumes the World Bank source-backed values", () => {
    const ger = getStructuralEconomic("germany")!;
    expect(ger.mappingStatus).toBe("source-backed");
    expect(buildFeatureSet(getTeam("germany")).gdpPerCapita).toBe(ger.gdpPerCapitaCurrentUsd);
    expect(buildFeatureSet(getTeam("germany")).population).toBe(ger.population);
    expect(getModelInputsForTeam("germany")?.gdpPerCapita).toBe(ger.gdpPerCapitaCurrentUsd);
    expect(getModelInputsForTeam("germany")?.gdpCurrentUsd).toBe(ger.gdpCurrentUsd);
  });

  it("England/Scotland model values come from their manual snapshot rows", () => {
    for (const id of MANUAL_TEAMS) {
      const row = getStructuralEconomic(id)!;
      expect(row.mappingStatus).toBe("manual");
      expect(buildFeatureSet(getTeam(id)).gdpPerCapita).toBe(row.gdpPerCapitaCurrentUsd);
      expect(buildFeatureSet(getTeam(id)).population).toBe(row.population);
    }
  });

  it("structuralDepthScore stays within [0,1] for every team", () => {
    for (const t of officialTeams) {
      const fs = buildFeatureSet(t);
      expect(fs.structuralDepth).toBeGreaterThanOrEqual(0);
      expect(fs.structuralDepth).toBeLessThanOrEqual(1);
      expect(structuralDepthScore(fs.gdpPerCapita, fs.population)).toBe(fs.structuralDepth);
    }
  });

  it("structural contribution is bounded by MODEL_WEIGHTS.structural for every pair", () => {
    const eps = 1e-9;
    for (const a of officialTeams) {
      for (const b of officialTeams) {
        if (a.id === b.id) continue;
        const drivers = computeDrivers(buildFeatureSet(a), buildFeatureSet(b));
        const s = drivers.find((d) => d.family === "structural");
        expect(s).toBeTruthy();
        expect(Math.abs(s!.contribution)).toBeLessThanOrEqual(MODEL_WEIGHTS.structural + eps);
      }
    }
  });

  it("structural stays a weak contextual prior - not a dominant contribution family", () => {
    // Aggregate absolute influence over all ordered team pairs: structural must be
    // a small share of total driver magnitude (it is a contextual prior, not an
    // anchor). NOTE: this is an aggregate claim, NOT a per-pair claim - for a very
    // close Elo/FIFA matchup the structural driver may exceed one individual driver.
    let structuralAbs = 0;
    let totalAbs = 0;
    for (const a of officialTeams) {
      for (const b of officialTeams) {
        if (a.id === b.id) continue;
        const drivers = computeDrivers(buildFeatureSet(a), buildFeatureSet(b));
        for (const d of drivers) {
          totalAbs += Math.abs(d.contribution);
          if (d.family === "structural") structuralAbs += Math.abs(d.contribution);
        }
      }
    }
    const share = structuralAbs / totalAbs;
    expect(share).toBeGreaterThan(0); // it does contribute
    expect(share).toBeLessThan(0.15); // but never dominates
  });

  it("the structural driver is disclosed as candidate and not capped", () => {
    const { explanation } = predictFromFeatures(
      buildFeatureSet(getTeam("germany")),
      buildFeatureSet(getTeam("haiti")),
    );
    const all = [...explanation.positiveDrivers, ...explanation.negativeDrivers];
    const s = all.find((d) => d.family === "structural");
    expect(s).toBeTruthy();
    expect(s!.status).toBe("candidate");
    expect(s!.capped).toBeFalsy();
  });

  it("only this phase's family flipped; Elo/FIFA stay source-backed, placeholders capped", () => {
    expect(getFeatureStatus("structural")).toBe("candidate");
    expect(getFeatureStatus("eloRating")).toBe("source-backed");
    expect(getFeatureStatus("fifaRanking")).toBe("source-backed");
    expect(getFeatureStatus("squadQuality")).toBe("placeholder");
    expect(getFeatureStatus("recentForm")).toBe("placeholder");
    expect(getFeatureStatus("climateFamiliarity")).toBe("placeholder");
  });

  it("probabilities remain finite and the resolver stays official", async () => {
    const p = predictFromFeatures(
      buildFeatureSet(getTeam("brazil")),
      buildFeatureSet(getTeam("haiti")),
    );
    expect(Number.isNaN(p.homeWin + p.draw + p.awayWin)).toBe(false);
    expect(p.homeWin + p.draw + p.awayWin).toBeCloseTo(1, 4);
    const { resolveDataset } = await import("@/lib/data/source");
    expect(resolveDataset().fixtureSource).toBe("official");
  });
});
