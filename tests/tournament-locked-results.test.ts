import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runTournamentSimulation } from "@/lib/simulation/tournament";
import { resolveLockedResults, type LockedResult } from "@/lib/simulation/locked-results";
import { computeGroupStandings, type MatchResult } from "@/lib/simulation/standings";
import { fixtures, groups, teams as allTeams } from "@/lib/data";
import { MODEL_WEIGHTS } from "@/lib/model/config";
import type { Fixture, GroupId, SimulationSnapshot } from "@/lib/types";

/**
 * Phase 1.29 (PR-3A) - `lockedResults` simulator capability. Locks completed
 * group-stage results into the Monte Carlo run while every other fixture is
 * simulated by the existing model. Tests the empty-locked parity invariant, RNG
 * alignment (common random numbers via burned draws), standings integration,
 * orientation, fail-closed validation, and that nothing leaks or drifts.
 */
const SEED = 20260611;

// Mirrors how the simulator builds per-team tiebreaker metadata.
const teamMeta = allTeams.map((t) => ({ teamId: t.id, fifaRanking: t.fifaRanking, conductScore: 0 }));

// Compare snapshots ignoring the volatile wall-clock `generatedAt`.
function stable(snap: SimulationSnapshot) {
  const { generatedAt: _drop, ...rest } = snap;
  return rest;
}

function groupFixtures(groupId: GroupId): Fixture[] {
  return fixtures
    .filter((f) => f.group === groupId && typeof f.matchNumber === "number")
    .sort((a, b) => a.matchNumber! - b.matchNumber!);
}

const G = groups[0]!;
const f0 = groupFixtures(G.id)[0]!;
const valid = (over: Partial<LockedResult> = {}): LockedResult => ({
  matchNumber: f0.matchNumber!,
  homeTeamId: f0.homeTeamId,
  awayTeamId: f0.awayTeamId,
  homeGoals: 1,
  awayGoals: 0,
  ...over,
});

describe("empty-locked parity (no drift)", () => {
  const base = runTournamentSimulation({ seed: SEED, iterations: 100 });

  it("lockedResults: [] reproduces the baseline exactly (excluding generatedAt)", () => {
    const empty = runTournamentSimulation({ seed: SEED, iterations: 100, lockedResults: [] });
    expect(stable(empty)).toEqual(stable(base));
  });

  it("lockedResults: undefined reproduces the baseline exactly", () => {
    const undef = runTournamentSimulation({ seed: SEED, iterations: 100, lockedResults: undefined });
    expect(stable(undef)).toEqual(stable(base));
  });
});

describe("locked group-stage results integrate correctly", () => {
  const gfx = groupFixtures(G.id);
  const scores: [number, number][] = [[2, 0], [1, 1], [0, 3], [2, 2], [1, 0], [0, 0]];
  const locked: LockedResult[] = gfx.map((f, i) => {
    const [hg, ag] = scores[i]!;
    return { matchNumber: f.matchNumber!, homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId, homeGoals: hg, awayGoals: ag };
  });

  it("a fully locked group matches hand-computed standings and is fixed across iterations", () => {
    const snap = runTournamentSimulation({ seed: SEED, iterations: 50, lockedResults: locked });
    const results: MatchResult[] = gfx.map((f, i) => {
      const [hg, ag] = scores[i]!;
      return { homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId, homeGoals: hg, awayGoals: ag };
    });
    const expected = computeGroupStandings(G.id, G.teamIds, results, teamMeta);
    const expByTeam = new Map(expected.map((s) => [s.teamId, s]));

    const simGroup = snap.expectedStandings.filter((s) => s.group === G.id);
    expect(simGroup).toHaveLength(G.teamIds.length);
    for (const s of simGroup) {
      const e = expByTeam.get(s.teamId)!;
      expect(s.played).toBe(e.played);
      expect(s.won).toBe(e.won);
      expect(s.drawn).toBe(e.drawn);
      expect(s.lost).toBe(e.lost);
      expect(s.goalsFor).toBe(e.goalsFor);
      expect(s.goalsAgainst).toBe(e.goalsAgainst);
      expect(s.goalDifference).toBe(e.goalDifference);
      expect(s.points).toBe(e.points);
      // Fixed across iterations => exact integer averages, no sampling variance.
      expect(Number.isInteger(s.points)).toBe(true);
      expect(Number.isInteger(s.goalsFor)).toBe(true);
    }
  });

  it("unlocked groups still simulate (fractional averaged standings persist)", () => {
    const snap = runTournamentSimulation({ seed: SEED, iterations: 80, lockedResults: locked });
    const others = snap.expectedStandings.filter((s) => s.group !== G.id);
    expect(others.some((s) => !Number.isInteger(s.points))).toBe(true);
  });

  it("burning RNG draws keeps unlocked groups aligned with the baseline (iterations=1)", () => {
    const base = runTournamentSimulation({ seed: SEED, iterations: 1 });
    const withLock = runTournamentSimulation({ seed: SEED, iterations: 1, lockedResults: locked });
    const baseOthers = base.expectedStandings.filter((s) => s.group !== G.id);
    const lockOthers = withLock.expectedStandings.filter((s) => s.group !== G.id);
    expect(lockOthers).toEqual(baseOthers);
  });

  it("still routes a full 32-team knockout (Article 13 / Annexe C / bracket pipeline intact)", () => {
    const snap = runTournamentSimulation({ seed: SEED, iterations: 100, lockedResults: locked });
    const totalR32 = snap.stageProbabilities.reduce((s, p) => s + p.roundOf32, 0);
    const totalWinner = snap.stageProbabilities.reduce((s, p) => s + p.winner, 0);
    expect(totalR32).toBeCloseTo(32, 1);
    expect(totalWinner).toBeCloseTo(1, 2);
  });
});

describe("orientation", () => {
  it("swapped team order equals canonical order (goals reoriented to the fixture)", () => {
    const canonical: LockedResult[] = [
      { matchNumber: f0.matchNumber!, homeTeamId: f0.homeTeamId, awayTeamId: f0.awayTeamId, homeGoals: 2, awayGoals: 1 },
    ];
    const swapped: LockedResult[] = [
      { matchNumber: f0.matchNumber!, homeTeamId: f0.awayTeamId, awayTeamId: f0.homeTeamId, homeGoals: 1, awayGoals: 2 },
    ];
    const a = runTournamentSimulation({ seed: SEED, iterations: 50, lockedResults: canonical });
    const b = runTournamentSimulation({ seed: SEED, iterations: 50, lockedResults: swapped });
    expect(stable(b)).toEqual(stable(a));
  });
});

describe("validation fails closed", () => {
  it("rejects a duplicate matchNumber", () => {
    expect(() => resolveLockedResults([valid(), valid()], fixtures)).toThrow(/duplicate/i);
  });
  it("rejects teams that do not match the fixture", () => {
    expect(() => resolveLockedResults([valid({ homeTeamId: "not-a-real-team" })], fixtures)).toThrow(/do not match/i);
  });
  it("rejects an unknown matchNumber", () => {
    expect(() => resolveLockedResults([valid({ matchNumber: 9999 })], fixtures)).toThrow(/unknown/i);
  });
  it("rejects a knockout / non-group matchNumber (M73+)", () => {
    expect(() => resolveLockedResults([valid({ matchNumber: 73 })], fixtures)).toThrow(/unknown|non-group/i);
  });
  it("rejects negative, non-integer, and missing goals", () => {
    expect(() => resolveLockedResults([valid({ homeGoals: -1 })], fixtures)).toThrow(/non-negative/i);
    expect(() => resolveLockedResults([valid({ awayGoals: 1.5 })], fixtures)).toThrow(/integer/i);
    expect(() => resolveLockedResults([valid({ homeGoals: undefined as unknown as number })], fixtures)).toThrow(/missing|number/i);
  });
  it("surfaces validation errors through runTournamentSimulation", () => {
    expect(() =>
      runTournamentSimulation({ seed: SEED, iterations: 1, lockedResults: [valid({ matchNumber: 9999 })] }),
    ).toThrow(/unknown/i);
  });
});

describe("public-safe + no model drift", () => {
  it("the LockedResult type/source carries no provider/private fields", () => {
    const src = readFileSync(join(process.cwd(), "lib/simulation/locked-results.ts"), "utf8").toLowerCase();
    for (const bad of ["providerid", "providermatchid", "providerteamid", "x-auth-token", "authorization", "blob", "crest", "payload"]) {
      expect(src).not.toContain(bad);
    }
    const score = [...resolveLockedResults([valid()], fixtures).values()][0]!;
    expect(Object.keys(score).sort()).toEqual(["away", "home"]);
    expect(Object.keys(valid()).sort()).toEqual(["awayGoals", "awayTeamId", "homeGoals", "homeTeamId", "matchNumber"]);
  });

  it("does not mutate MODEL_WEIGHTS", () => {
    const before = { ...MODEL_WEIGHTS };
    runTournamentSimulation({ seed: SEED, iterations: 5, lockedResults: [valid()] });
    expect({ ...MODEL_WEIGHTS }).toEqual(before);
  });
});
