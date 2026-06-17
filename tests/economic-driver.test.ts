import { describe, expect, it } from "vitest";
import { buildFeatureSet, structuralDepthScore } from "@/lib/model/features";
import { computeDrivers, predictMatch } from "@/lib/model/predict";
import { MODEL_WEIGHTS } from "@/lib/model/config";
import { getTeam } from "@/lib/data";

describe("structural / economic driver", () => {
  it("structuralDepthScore is in [0,1] and monotonic in GDP", () => {
    const low = structuralDepthScore(1000, 5_000_000);
    const high = structuralDepthScore(60000, 5_000_000);
    expect(low).toBeGreaterThanOrEqual(0);
    expect(high).toBeLessThanOrEqual(1);
    expect(high).toBeGreaterThan(low);
  });

  it("exposes economic fields on the feature set", () => {
    const fs = buildFeatureSet(getTeam("germany"));
    expect(fs.gdpPerCapita).toBeGreaterThan(0);
    expect(fs.population).toBeGreaterThan(0);
    expect(fs.structuralDepth).toBeGreaterThanOrEqual(0);
    expect(fs.structuralDepth).toBeLessThanOrEqual(1);
  });

  it("adds a 'Structural depth' driver to the explanation", () => {
    const drivers = computeDrivers(
      buildFeatureSet(getTeam("germany")),
      buildFeatureSet(getTeam("haiti")),
    );
    expect(drivers.some((d) => d.label === "Structural depth")).toBe(true);
  });

  it("keeps the structural prior small (weak, non-determinative)", () => {
    // Full-range structural advantage must stay well below the Elo anchor scale.
    expect(MODEL_WEIGHTS.structural).toBeLessThanOrEqual(25);
  });

  it("preserves prediction symmetry when sides are swapped", () => {
    const ger = getTeam("germany");
    const hai = getTeam("haiti");
    const ab = predictMatch(ger, hai);
    const ba = predictMatch(hai, ger);
    expect(ba.awayWin).toBeCloseTo(ab.homeWin, 6);
    expect(ba.homeWin).toBeCloseTo(ab.awayWin, 6);
  });
});
