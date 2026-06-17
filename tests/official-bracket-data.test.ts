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
import type { BracketDefinition, GroupId } from "@/lib/types";

describe("official knockout graph (candidate)", () => {
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
});

describe("realiser on the real candidate bracket", () => {
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

describe("tournament under the official bracket (verified-for-test preview)", () => {
  // Production stays gated (candidate); tests may preview the official path by
  // marking a COPY verified. This does not change the shipped data.
  const verified: BracketDefinition = {
    ...officialBracket,
    sourceStatus: "verified",
  };

  it("activates only the verified copy, never the shipped candidate", () => {
    expect(isBracketActive(officialBracket)).toBe(false);
    expect(isBracketActive(verified)).toBe(true);
  });

  it("holds the stage invariants (32, 16, 8, 4, 2, 1)", () => {
    const snap = runTournamentSimulation({
      iterations: 300,
      seed: 7,
      bracket: verified,
    });
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
