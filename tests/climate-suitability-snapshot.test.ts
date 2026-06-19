import { describe, expect, it } from "vitest";
import {
  climateSuitabilitySnapshot,
  CLIMATE_SUITABILITY_SOURCE,
  CLIMATE_CODE_TO_ID,
  getClimateSuitability,
  getModelInputsForTeam,
  getFeatureStatus,
} from "@/data/model-inputs";
import { validateClimateSnapshot } from "@/lib/data/validate-model-inputs";
import { climateSuitabilityTo100, computeClimateSuitability } from "@/lib/model/climate-suitability";
import { buildFeatureSet } from "@/lib/model/features";
import { getTeam } from "@/lib/data";
import { officialTeams } from "@/data/official/teams";
import type { ClimateSuitabilityRow } from "@/lib/types";

const DERIVED_TEAMS = ["england", "scotland"];

describe("climate-suitability snapshot - coverage & validity", () => {
  it("has exactly one row per official team (48)", () => {
    expect(climateSuitabilitySnapshot).toHaveLength(48);
    const ids = new Set(climateSuitabilitySnapshot.map((r) => r.teamId));
    expect(ids.size).toBe(48);
    for (const t of officialTeams) expect(ids.has(t.id)).toBe(true);
  });

  it("has 46 CCKP source-backed rows, exactly England/Scotland official-derived, zero unresolved", () => {
    const sourceBacked = climateSuitabilitySnapshot.filter((r) => r.dataStatus === "source-backed");
    const derived = climateSuitabilitySnapshot.filter((r) => r.dataStatus === "official-derived");
    const unresolved = climateSuitabilitySnapshot.filter((r) => r.dataStatus === "unresolved");
    expect(sourceBacked).toHaveLength(46);
    expect(derived.map((r) => r.teamId).sort()).toEqual([...DERIVED_TEAMS].sort());
    expect(unresolved).toHaveLength(0);
    // Only the 46 CCKP rows carry an ISO3 climate code; derived rows carry none.
    expect(sourceBacked.every((r) => /^[A-Z]{3}$/.test(r.climateCode))).toBe(true);
    expect(derived.every((r) => r.climateCode === "")).toBe(true);
  });

  it("Curacao is source-backed from CCKP (CUW), not unresolved", () => {
    const cuw = climateSuitabilitySnapshot.find((r) => r.teamId === "curacao")!;
    expect(cuw.dataStatus).toBe("source-backed");
    expect(cuw.climateCode).toBe("CUW");
  });

  it("every row carries length-12 finite monthly temperature + precipitation, 1991-2020", () => {
    for (const r of climateSuitabilitySnapshot) {
      expect(r.monthlyTempC).toHaveLength(12);
      expect(r.monthlyPrecipMm).toHaveLength(12);
      expect(r.monthlyTempC.every((v) => Number.isFinite(v) && v > -60 && v < 60)).toBe(true);
      expect(r.monthlyPrecipMm.every((v) => Number.isFinite(v) && v >= 0 && v < 2000)).toBe(true);
      expect(r.baselinePeriod).toBe("1991-2020");
    }
  });

  it("England/Scotland come from Met Office (empty code) and are NOT mapped to GBR", () => {
    for (const id of DERIVED_TEAMS) {
      const r = climateSuitabilitySnapshot.find((x) => x.teamId === id)!;
      expect(r.dataStatus).toBe("official-derived");
      expect(r.climateCode).toBe("");
    }
    expect(Object.keys(CLIMATE_CODE_TO_ID)).not.toContain("GBR");
  });

  it("maps every source-backed CCKP code to its app id", () => {
    for (const r of climateSuitabilitySnapshot.filter((x) => x.dataStatus === "source-backed")) {
      expect(CLIMATE_CODE_TO_ID[r.climateCode]).toBe(r.teamId);
    }
  });

  it("every row's derived suitability score is bounded 0..1", () => {
    for (const r of climateSuitabilitySnapshot) {
      const s = computeClimateSuitability(r);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it("carries explicit CCKP + Met Office provenance, status candidate (mixed)", () => {
    expect(CLIMATE_SUITABILITY_SOURCE.status).toBe("candidate");
    expect(CLIMATE_SUITABILITY_SOURCE.sourceName).toMatch(/Climate Knowledge Portal/i);
    expect(CLIMATE_SUITABILITY_SOURCE.sourceName).toMatch(/Met Office/i);
    expect(CLIMATE_SUITABILITY_SOURCE.sourceDate).toBe("1991-2020");
  });

  it("passes validateClimateSnapshot with no errors or warnings", () => {
    const r = validateClimateSnapshot();
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it("flags an unexpected official-derived row (only England/Scotland may be)", () => {
    const bad: ClimateSuitabilityRow[] = climateSuitabilitySnapshot.map((r) =>
      r.teamId === "brazil" ? { ...r, dataStatus: "official-derived", climateCode: "" } : r,
    );
    const res = validateClimateSnapshot(bad);
    expect(res.valid).toBe(false);
    expect(res.errors.join(" ")).toMatch(/unexpected official-derived climate row: brazil/);
  });

  it("flags a wrong-length monthly array", () => {
    const bad: ClimateSuitabilityRow[] = climateSuitabilitySnapshot.map((r) =>
      r.teamId === "germany" ? { ...r, monthlyTempC: r.monthlyTempC.slice(0, 11) } : r,
    );
    const res = validateClimateSnapshot(bad);
    expect(res.valid).toBe(false);
    expect(res.errors.join(" ")).toMatch(/monthlyTempC must have 12/);
  });

  it("flags a climateCode that does not map to its id", () => {
    const bad: ClimateSuitabilityRow[] = climateSuitabilitySnapshot.map((r) =>
      r.teamId === "germany" ? { ...r, climateCode: "ZZZ" } : r,
    );
    expect(validateClimateSnapshot(bad).errors.join(" ")).toMatch(/does not map/);
  });
});

describe("climate-suitability - model integration", () => {
  it("the model consumes the candidate suitability score as climateFamiliarity (0..100)", () => {
    const ger = getClimateSuitability("germany")!;
    const expected = climateSuitabilityTo100(ger);
    expect(buildFeatureSet(getTeam("germany")).climateFamiliarity).toBeCloseTo(expected, 9);
    expect(getModelInputsForTeam("germany")?.climateFamiliarity).toBeCloseTo(expected, 9);
    expect(expected).toBeGreaterThanOrEqual(0);
    expect(expected).toBeLessThanOrEqual(100);
  });

  it("climate family is candidate; Elo/FIFA stay source-backed; squad/form stay placeholder", () => {
    expect(getFeatureStatus("climateFamiliarity")).toBe("candidate");
    expect(getFeatureStatus("eloRating")).toBe("source-backed");
    expect(getFeatureStatus("fifaRanking")).toBe("source-backed");
    expect(getFeatureStatus("structural")).toBe("candidate");
    expect(getFeatureStatus("squadQuality")).toBe("placeholder");
    expect(getFeatureStatus("recentForm")).toBe("placeholder");
  });
});
