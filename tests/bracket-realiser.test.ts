import { describe, expect, it } from "vitest";
import { realiseOfficialBracket, type GroupResult } from "@/lib/simulation/bracket";
import { GROUP_LETTERS } from "@/lib/simulation/bracket-validate";
import { sampleBracket } from "./fixtures/sample-bracket";
import type { GroupId } from "@/lib/types";

/** Synthetic finishers: group X -> winner "X1", runner-up "X2", third "X3". */
function buildGroupResults(): Map<GroupId, GroupResult> {
  return new Map(
    GROUP_LETTERS.map((g) => [g, { winner: `${g}1`, runnerUp: `${g}2`, third: `${g}3` }]),
  );
}

const thirdGroups: GroupId[] = ["A", "B", "C", "D", "E", "F", "G", "H"];

describe("realiseOfficialBracket", () => {
  const realise = (decideWinner: (a: string, b: string) => string) =>
    realiseOfficialBracket({
      graph: sampleBracket.graph,
      allocation: sampleBracket.thirdPlaceAllocation,
      groupResults: buildGroupResults(),
      thirdGroups,
      decideWinner,
    });

  it("resolves 32 distinct R32 entrants and the right stage counts", () => {
    const r = realise((a) => a); // always-home
    expect(r.r32Entrants).toHaveLength(32);
    expect(new Set(r.r32Entrants).size).toBe(32);
    expect(r.roundOf16).toHaveLength(16);
    expect(r.quarterFinal).toHaveLength(8);
    expect(r.semiFinal).toHaveLength(4);
    expect(r.finalists).toHaveLength(2);
    expect(typeof r.champion).toBe("string");
  });

  it("places the eight third-placed teams via Annexe C", () => {
    const r = realise((a) => a);
    // Combo ABCDEFGH -> T1..T8 = A..H thirds.
    for (const g of thirdGroups) {
      expect(r.r32Entrants).toContain(`${g}3`);
    }
    // Unselected groups' thirds never enter.
    expect(r.r32Entrants).not.toContain("I3");
    expect(r.r32Entrants).not.toContain("L3");
  });

  it("propagates winners deterministically (always-home -> A1 champion)", () => {
    // With always-home, the champion traces M104<-M101<-M97<-M89<-M73 = group A winner.
    expect(realise((a) => a).champion).toBe("A1");
  });

  it("propagates the away side when always-away is chosen", () => {
    const r = realise((_a, b) => b);
    expect(r.champion).not.toBe("A1");
    expect(r.finalists).toHaveLength(2);
  });

  it("is deterministic for a fixed decision function", () => {
    const pick = (a: string, b: string) => (a < b ? a : b);
    expect(realise(pick)).toEqual(realise(pick));
  });

  it("throws when no Annexe C allocation exists for the combination", () => {
    expect(() =>
      realiseOfficialBracket({
        graph: sampleBracket.graph,
        allocation: {}, // empty -> no key
        groupResults: buildGroupResults(),
        thirdGroups,
        decideWinner: (a) => a,
      }),
    ).toThrow(/Annexe C/);
  });
});
