import { describe, expect, it } from "vitest";
import {
  computeGroupStandings,
  rankThirdPlacedTeams,
  type MatchResult,
} from "@/lib/simulation/standings";
import type { GroupStanding, TeamMeta } from "@/lib/types";

const order = (s: GroupStanding[]) =>
  [...s].sort((a, b) => a.rank - b.rank).map((x) => x.teamId);

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

describe("FIFA Article 13 tiebreakers", () => {
  const ids = ["a", "b", "c", "d"];

  it("two teams level on points & overall GD/GF: head-to-head decides", () => {
    // a and b both finish 6 pts, GD +2, GF 3; a beat b head-to-head 1-0.
    const results: MatchResult[] = [
      { homeTeamId: "a", awayTeamId: "b", homeGoals: 1, awayGoals: 0 }, // a > b H2H
      { homeTeamId: "c", awayTeamId: "a", homeGoals: 1, awayGoals: 0 }, // a loses to c
      { homeTeamId: "a", awayTeamId: "d", homeGoals: 2, awayGoals: 0 },
      { homeTeamId: "b", awayTeamId: "c", homeGoals: 2, awayGoals: 0 },
      { homeTeamId: "b", awayTeamId: "d", homeGoals: 1, awayGoals: 0 },
      { homeTeamId: "d", awayTeamId: "c", homeGoals: 1, awayGoals: 0 },
    ];
    const t = computeGroupStandings("A", ids, results);
    const a = t.find((s) => s.teamId === "a")!;
    const b = t.find((s) => s.teamId === "b")!;
    expect(a.points).toBe(b.points);
    expect(a.goalDifference).toBe(b.goalDifference);
    expect(a.rank).toBeLessThan(b.rank); // head-to-head winner ranked higher
  });

  it("three-way tie: head-to-head mini-table (GD) is applied before all-group GD", () => {
    // a,b,c each 6 pts. Cycle a>b, b>c, c>a with different margins; all beat d
    // by different margins so OVERALL GD order (c,a,b) differs from H2H order.
    const results: MatchResult[] = [
      { homeTeamId: "a", awayTeamId: "b", homeGoals: 3, awayGoals: 0 },
      { homeTeamId: "b", awayTeamId: "c", homeGoals: 1, awayGoals: 0 },
      { homeTeamId: "c", awayTeamId: "a", homeGoals: 1, awayGoals: 0 },
      { homeTeamId: "a", awayTeamId: "d", homeGoals: 1, awayGoals: 0 },
      { homeTeamId: "c", awayTeamId: "d", homeGoals: 5, awayGoals: 0 },
      { homeTeamId: "b", awayTeamId: "d", homeGoals: 3, awayGoals: 0 },
    ];
    const t = computeGroupStandings("A", ids, results);
    // H2H mini-GD: a +2, c 0, b -2 → a,c,b (overall GD would be c,a,b).
    expect(order(t)).toEqual(["a", "c", "b", "d"]);
  });

  it("reapplies head-to-head to the remaining tied subset", () => {
    // a,b,c all 6 pts. Mini-table: a tops on H2H goals-for; b & c tie on the
    // 3-team key, so H2H is REAPPLIED to {b,c} where b beat c 1-0.
    // FIFA ranking is set to favour c — if the fallback (ranking) were used
    // instead of reapplied H2H, c would rank above b.
    const results: MatchResult[] = [
      { homeTeamId: "a", awayTeamId: "b", homeGoals: 2, awayGoals: 1 },
      { homeTeamId: "c", awayTeamId: "a", homeGoals: 2, awayGoals: 1 },
      { homeTeamId: "b", awayTeamId: "c", homeGoals: 1, awayGoals: 0 },
      { homeTeamId: "a", awayTeamId: "d", homeGoals: 1, awayGoals: 0 },
      { homeTeamId: "b", awayTeamId: "d", homeGoals: 1, awayGoals: 0 },
      { homeTeamId: "c", awayTeamId: "d", homeGoals: 1, awayGoals: 0 },
    ];
    const meta: TeamMeta[] = [
      { teamId: "a", fifaRanking: 10, conductScore: 0 },
      { teamId: "b", fifaRanking: 50, conductScore: 0 }, // worse ranking
      { teamId: "c", fifaRanking: 1, conductScore: 0 }, // better ranking
      { teamId: "d", fifaRanking: 99, conductScore: 0 },
    ];
    const t = computeGroupStandings("A", ids, results, meta);
    // b above c proves reapplied head-to-head beat the FIFA-ranking fallback.
    expect(order(t)).toEqual(["a", "b", "c", "d"]);
  });

  it("falls back to all-group GD when head-to-head is drawn", () => {
    // a,b both 7 pts; their H2H is a 1-1 draw → resolve on all-group GD (a +6).
    const results: MatchResult[] = [
      { homeTeamId: "a", awayTeamId: "b", homeGoals: 1, awayGoals: 1 },
      { homeTeamId: "a", awayTeamId: "c", homeGoals: 3, awayGoals: 0 },
      { homeTeamId: "a", awayTeamId: "d", homeGoals: 3, awayGoals: 0 },
      { homeTeamId: "b", awayTeamId: "c", homeGoals: 1, awayGoals: 0 },
      { homeTeamId: "b", awayTeamId: "d", homeGoals: 1, awayGoals: 0 },
      { homeTeamId: "c", awayTeamId: "d", homeGoals: 1, awayGoals: 0 },
    ];
    const t = computeGroupStandings("A", ids, results);
    const a = t.find((s) => s.teamId === "a")!;
    const b = t.find((s) => s.teamId === "b")!;
    expect(a.points).toBe(b.points);
    expect(a.goalDifference).toBeGreaterThan(b.goalDifference);
    expect(a.rank).toBeLessThan(b.rank);
  });

  it("uses FIFA ranking as the final deterministic fallback", () => {
    // a and b are identical on every prior criterion; ranking decides.
    const results: MatchResult[] = [
      { homeTeamId: "a", awayTeamId: "b", homeGoals: 0, awayGoals: 0 },
      { homeTeamId: "a", awayTeamId: "c", homeGoals: 1, awayGoals: 0 },
      { homeTeamId: "a", awayTeamId: "d", homeGoals: 1, awayGoals: 0 },
      { homeTeamId: "b", awayTeamId: "c", homeGoals: 1, awayGoals: 0 },
      { homeTeamId: "b", awayTeamId: "d", homeGoals: 1, awayGoals: 0 },
      { homeTeamId: "c", awayTeamId: "d", homeGoals: 0, awayGoals: 0 },
    ];
    const meta: TeamMeta[] = [
      { teamId: "a", fifaRanking: 5, conductScore: 0 },
      { teamId: "b", fifaRanking: 20, conductScore: 0 },
      { teamId: "c", fifaRanking: 30, conductScore: 0 },
      { teamId: "d", fifaRanking: 40, conductScore: 0 },
    ];
    const t = computeGroupStandings("A", ids, results, meta);
    const a = t.find((s) => s.teamId === "a")!;
    const b = t.find((s) => s.teamId === "b")!;
    expect(a.points).toBe(b.points);
    expect(a.goalDifference).toBe(b.goalDifference);
    expect(a.goalsFor).toBe(b.goalsFor);
    expect(a.rank).toBeLessThan(b.rank); // better FIFA ranking wins
  });
});

describe("third-placed team ranking (all-group criteria, not H2H)", () => {
  const standing = (
    teamId: string,
    points: number,
    gd: number,
    gf: number,
  ): GroupStanding => ({
    teamId,
    group: "A",
    played: 3,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: gf,
    goalsAgainst: gf - gd,
    goalDifference: gd,
    points,
    rank: 3,
  });

  it("orders by points → GD → GF", () => {
    const thirds = [
      standing("low", 3, 0, 2),
      standing("high", 4, 1, 3),
      standing("mid", 3, 1, 2),
    ];
    const ranked = rankThirdPlacedTeams(thirds);
    expect(ranked.map((s) => s.teamId)).toEqual(["high", "mid", "low"]);
  });

  it("breaks remaining ties with FIFA ranking (no head-to-head)", () => {
    const thirds = [standing("x", 3, 0, 2), standing("y", 3, 0, 2)];
    const meta: TeamMeta[] = [
      { teamId: "x", fifaRanking: 40, conductScore: 0 },
      { teamId: "y", fifaRanking: 9, conductScore: 0 },
    ];
    const ranked = rankThirdPlacedTeams(thirds, meta);
    expect(ranked.map((s) => s.teamId)).toEqual(["y", "x"]);
  });
});
