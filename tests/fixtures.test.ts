import { describe, expect, it } from "vitest";
import { buildGroupStageFixtures, ARTICLE_12_4_PAIRINGS } from "@/lib/data/fixtures";
import { validatePositionPairings } from "@/lib/data/validate";
import { resolveDataset, GROUP_IDS } from "@/lib/data/source";
import { officialTeams } from "@/data/official/teams";
import { officialVenues } from "@/data/official/venues";
import { mockDataset } from "@/data/mock";
import type { Group } from "@/lib/types";

const groupsFrom = (teams = officialTeams): Group[] =>
  GROUP_IDS.map((id) => ({
    id,
    teamIds: teams.filter((t) => t.group === id).map((t) => t.id),
  }));

describe("Article 12.4 fixture generation", () => {
  const fixtures = buildGroupStageFixtures(
    groupsFrom(),
    officialVenues,
    officialTeams,
    "position-generated",
  );

  it("produces 72 fixtures (12 groups x 6)", () => {
    expect(fixtures).toHaveLength(72);
  });

  it("matches the Article 12.4 ordered pairings in every group", () => {
    expect(validatePositionPairings(fixtures)).toEqual([]);
  });

  it("uses MD3 = 4v1 and 2v3 (regulation home/away orientation)", () => {
    const md3 = ARTICLE_12_4_PAIRINGS.slice(4);
    expect(md3).toEqual([
      [4, 1],
      [2, 3],
    ]);
    const groupAMd3 = fixtures.filter((f) => f.group === "A" && f.matchday === 3);
    expect(groupAMd3.map((f) => [f.homePosition, f.awayPosition])).toEqual([
      [4, 1],
      [2, 3],
    ]);
  });

  it("places a source-backed host at draw position 1", () => {
    // Mexico (A1) is the home side of the MD1 (1v2) fixture in group A.
    const md1 = fixtures.find(
      (f) => f.group === "A" && f.matchday === 1 && f.homePosition === 1,
    )!;
    expect(md1.homeTeamId).toBe("mexico");
  });

  it("stamps each generated fixture with its source and no kickoff", () => {
    for (const f of fixtures) {
      expect(f.source).toBe("position-generated");
      expect(f.status).toBe("unknown");
      expect(f.kickoff).toBeUndefined();
    }
  });

  it("labels the mock field as mock-generated", () => {
    const mockFixtures = buildGroupStageFixtures(
      groupsFrom(mockDataset.teams),
      mockDataset.venues,
      mockDataset.teams,
      "mock-generated",
    );
    expect(mockFixtures.every((f) => f.source === "mock-generated")).toBe(true);
  });
});

describe("resolver fixture provenance", () => {
  it("position-generates from the candidate field (empty official template)", () => {
    const ds = resolveDataset();
    expect(ds.fixtureSource).toBe("position-generated");
    expect(ds.fixtures).toHaveLength(72);
    expect(validatePositionPairings(ds.fixtures)).toEqual([]);
  });
});
