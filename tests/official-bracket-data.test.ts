import { describe, expect, it } from "vitest";
import { officialKnockoutGraph } from "@/data/official/knockout-graph";
import { officialBracket } from "@/data/official/bracket";
import {
  isBracketActive,
  realiseOfficialBracket,
  type GroupResult,
} from "@/lib/simulation/bracket";
import {
  validateGraph,
  GROUP_LETTERS,
} from "@/lib/simulation/bracket-validate";
import { runTournamentSimulation } from "@/lib/simulation/tournament";
import type { GroupId } from "@/lib/types";

describe("official knockout graph (verified)", () => {
  it("passes validateGraph", () => {
    expect(validateGraph(officialKnockoutGraph)).toEqual([]);
  });

  it("preserves the eight Art. 12.6 third-place eligible-group sets", () => {
    const elig = (mn: number) => {
      const m = officialKnockoutGraph.matches.find(
        (x) => x.matchNumber === mn,
      )!;
      const slot = m.home.kind === "thirdPlace" ? m.home : m.away;
      if (slot.kind !== "thirdPlace")
        throw new Error("expected third-place slot");
      return (slot.eligibleGroups ?? []).join("");
    };
    expect(elig(74)).toBe("ABCDF");
    expect(elig(77)).toBe("CDFGH");
    expect(elig(79)).toBe("CEFHI");
    expect(elig(80)).toBe("EHIJK");
    expect(elig(81)).toBe("BEFIJ");
    expect(elig(82)).toBe("AEHIJ");
    expect(elig(85)).toBe("EFGIJ");
    expect(elig(87)).toBe("DEIJL");
  });

  it("marks every match validationStatus verified", () => {
    for (const m of officialKnockoutGraph.matches) {
      expect(m.validationStatus).toBe("verified");
    }
  });
});

describe("realiser on the real official bracket", () => {
  const groupResults = new Map<GroupId, GroupResult>(
    GROUP_LETTERS.map((g) => [
      g,
      { winner: `${g}1`, runnerUp: `${g}2`, third: `${g}3` },
    ]),
  );

  it("resolves 32 distinct teams + correct stage counts for a sample combination", () => {
    const r = realiseOfficialBracket({
      graph: officialBracket.graph,
      allocation: officialBracket.thirdPlaceAllocation,
      groupResults,
      thirdGroups: ["A", "B", "C", "D", "E", "F", "G", "H"],
      decideWinner: (home) => home,
    });
    expect(r.r32Entrants).toHaveLength(32);
    expect(new Set(r.r32Entrants).size).toBe(32);
    expect(r.roundOf16).toHaveLength(16);
    expect(r.quarterFinal).toHaveLength(8);
    expect(r.semiFinal).toHaveLength(4);
    expect(r.finalists).toHaveLength(2);
    expect(typeof r.champion).toBe("string");
  });

  it("is deterministic across runs", () => {
    const run = () =>
      realiseOfficialBracket({
        graph: officialBracket.graph,
        allocation: officialBracket.thirdPlaceAllocation,
        groupResults,
        thirdGroups: ["A", "C", "E", "G", "I", "K", "B", "D"],
        decideWinner: (h, a) => (h < a ? h : a),
      });
    expect(run()).toEqual(run());
  });
});

describe("production now uses the official bracket path", () => {
  it("the shipped official bracket is verified + active", () => {
    expect(officialBracket.sourceStatus).toBe("verified");
    expect(isBracketActive(officialBracket)).toBe(true);
  });

  it("default production simulation holds the invariants (32, 16, 8, 4, 2, 1)", () => {
    // No bracket override -> uses the resolved dataset bracket (now official).
    const snap = runTournamentSimulation({ iterations: 300, seed: 7 });
    const sum = (
      k:
        | "roundOf32"
        | "roundOf16"
        | "quarterFinal"
        | "semiFinal"
        | "final"
        | "winner",
    ) => snap.stageProbabilities.reduce((s, p) => s + p[k], 0);
    expect(sum("roundOf32")).toBeCloseTo(32, 1);
    expect(sum("roundOf16")).toBeCloseTo(16, 1);
    expect(sum("quarterFinal")).toBeCloseTo(8, 1);
    expect(sum("semiFinal")).toBeCloseTo(4, 1);
    expect(sum("final")).toBeCloseTo(2, 1);
    expect(sum("winner")).toBeCloseTo(1, 1);
  });
});
