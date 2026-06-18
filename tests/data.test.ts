import { describe, expect, it } from "vitest";
import { resolveDataset } from "@/lib/data/source";
import { validateDataset } from "@/lib/data/validate";
import { mockDataset } from "@/data/mock";
import { officialDataset } from "@/data/official";
import {
  teams,
  groups,
  fixtures,
  sourceStatus,
  fixtureSource,
} from "@/lib/data";

describe("dataset resolution & provenance", () => {
  it("resolves a valid 48-team / 12-group dataset", () => {
    expect(teams).toHaveLength(48);
    expect(groups).toHaveLength(12);
    for (const g of groups) expect(g.teamIds).toHaveLength(4);
    expect(fixtures).toHaveLength(72);
  });

  it("prefers the higher-priority (candidate) dataset over mock when valid", () => {
    const resolved = resolveDataset();
    expect(resolved.sourceStatus).toBe("candidate");
    expect(sourceStatus).toBe("candidate");
  });

  it("position-generates fixtures when the official schedule template is empty", () => {
    // The candidate dataset ships an empty schedule template → position-generated.
    expect(officialDataset.officialFixtures).toEqual([]);
    expect(fixtureSource).toBe("position-generated");
  });

  it("validates the mock and official datasets as complete", () => {
    expect(validateDataset(mockDataset).valid).toBe(true);
    expect(validateDataset(officialDataset).valid).toBe(true);
  });

  it("falls back logic keys on invalidity/incompleteness, not a boolean flag", () => {
    // A dataset missing teams is invalid → the resolver would skip it.
    const incomplete = { ...officialDataset, teams: officialDataset.teams.slice(0, 47) };
    const result = validateDataset(incomplete);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/48 teams/);
  });

  it("flags a group with the wrong number of teams", () => {
    const broken = {
      ...mockDataset,
      teams: mockDataset.teams.map((t, i) =>
        i === 0 ? { ...t, group: "B" as const } : t,
      ),
    };
    expect(validateDataset(broken).valid).toBe(false);
  });
});
