import { describe, expect, it } from "vitest";
import {
  computeGroupStandings,
  type MatchResult,
} from "@/lib/simulation/standings";

describe("group standings", () => {
  const teamIds = ["a", "b", "c", "d"];
  // a beats b and c, draws d; b beats c and d; c beats d.
  const results: MatchResult[] = [
    { homeTeamId: "a", awayTeamId: "b", homeGoals: 2, awayGoals: 0 },
    { homeTeamId: "a", awayTeamId: "c", homeGoals: 1, awayGoals: 0 },
    { homeTeamId: "a", awayTeamId: "d", homeGoals: 1, awayGoals: 1 },
    { homeTeamId: "b", awayTeamId: "c", homeGoals: 3, awayGoals: 1 },
    { homeTeamId: "b", awayTeamId: "d", homeGoals: 2, awayGoals: 1 },
    { homeTeamId: "c", awayTeamId: "d", homeGoals: 2, awayGoals: 0 },
  ];

  const table = computeGroupStandings("A", teamIds, results);

  it("ranks every team exactly once", () => {
    expect(table).toHaveLength(4);
    expect(new Set(table.map((s) => s.rank))).toEqual(new Set([1, 2, 3, 4]));
  });

  it("awards 3 points per win and 1 per draw", () => {
    const a = table.find((s) => s.teamId === "a")!;
    expect(a.won).toBe(2);
    expect(a.drawn).toBe(1);
    expect(a.points).toBe(7); // 2*3 + 1
  });

  it("orders by points then goal difference", () => {
    expect(table[0]!.teamId).toBe("a"); // 7 pts, top
    expect(table[1]!.teamId).toBe("b"); // 6 pts
    expect(table[3]!.teamId).toBe("d"); // bottom
  });

  it("keeps each team's played count at games actually played", () => {
    for (const s of table) expect(s.played).toBe(3);
  });

  it("conserves goals: total for equals total against", () => {
    const totalFor = table.reduce((sum, s) => sum + s.goalsFor, 0);
    const totalAgainst = table.reduce((sum, s) => sum + s.goalsAgainst, 0);
    expect(totalFor).toBe(totalAgainst);
  });
});
