/**
 * Corrective bracket pass — two-sided layout tests (pure). Asserts the LEFT/RIGHT split is
 * derived from the OFFICIAL graph (winner-edge ancestors of M101 vs M102), disjoint and
 * complete, with the Final (M104) centered and Third place (M103) separate.
 */
import { describe, expect, it } from "vitest";
import { officialKnockoutGraph } from "@/data/official/knockout-graph";
import { buildBracketView, type BracketTeamRef } from "@/lib/ui/bracket-view";
import { bracketHalfMembership, buildBracketLayout } from "@/lib/ui/bracket-layout";

const resolveTeam = (): BracketTeamRef | null => null; // placeholders are fine for layout shape
const view = buildBracketView({
  skeleton: officialKnockoutGraph.matches,
  liveBracket: [],
  liveMatches: [],
  provenanceByMatch: {},
  matchesObjectAvailable: false,
  resolveTeam,
});
const sorted = (a: number[]) => [...a].sort((x, y) => x - y);
const nums = (nodes: { matchNumber: number }[]) => sorted(nodes.map((n) => n.matchNumber));

describe("bracketHalfMembership (graph-derived from winner edges)", () => {
  const { left, right } = bracketHalfMembership(officialKnockoutGraph);

  it("left = winner-ancestors of the M101 semi-final", () => {
    expect(sorted([...left])).toEqual([73, 74, 75, 77, 81, 82, 83, 84, 89, 90, 93, 94, 97, 98, 101]);
  });
  it("right = winner-ancestors of the M102 semi-final", () => {
    expect(sorted([...right])).toEqual([76, 78, 79, 80, 85, 86, 87, 88, 91, 92, 95, 96, 99, 100, 102]);
  });
  it("halves are disjoint and exclude the Final (104) and third place (103)", () => {
    for (const m of left) expect(right.has(m)).toBe(false);
    for (const set of [left, right]) {
      expect(set.has(103)).toBe(false);
      expect(set.has(104)).toBe(false);
    }
    expect(left.size + right.size).toBe(30); // M73–M102
  });
});

describe("buildBracketLayout", () => {
  const layout = buildBracketLayout(view, officialKnockoutGraph);

  it("splits each round 8/8, 4/4, 2/2, 1/1 (left/right)", () => {
    expect(nums(layout.left.roundOf32)).toEqual([73, 74, 75, 77, 81, 82, 83, 84]);
    expect(nums(layout.right.roundOf32)).toEqual([76, 78, 79, 80, 85, 86, 87, 88]);
    expect(nums(layout.left.roundOf16)).toEqual([89, 90, 93, 94]);
    expect(nums(layout.right.roundOf16)).toEqual([91, 92, 95, 96]);
    expect(nums(layout.left.quarterFinal)).toEqual([97, 98]);
    expect(nums(layout.right.quarterFinal)).toEqual([99, 100]);
    expect(nums(layout.left.semiFinal)).toEqual([101]);
    expect(nums(layout.right.semiFinal)).toEqual([102]);
  });

  it("R32 has 16 total across both halves", () => {
    expect(layout.left.roundOf32.length + layout.right.roundOf32.length).toBe(16);
  });

  it("centers the Final (M104) and keeps third place (M103) separate", () => {
    expect(layout.final?.matchNumber).toBe(104);
    expect(layout.thirdPlace?.matchNumber).toBe(103);
  });

  it("covers M73–M104 exactly once, no match missing or duplicated", () => {
    const all = [
      ...layout.left.roundOf32, ...layout.left.roundOf16, ...layout.left.quarterFinal, ...layout.left.semiFinal,
      ...layout.right.roundOf32, ...layout.right.roundOf16, ...layout.right.quarterFinal, ...layout.right.semiFinal,
      ...(layout.final ? [layout.final] : []),
      ...(layout.thirdPlace ? [layout.thirdPlace] : []),
    ].map((n) => n.matchNumber);
    expect(all).toHaveLength(32);
    expect(sorted(all)).toEqual(Array.from({ length: 32 }, (_, i) => 73 + i));
  });

  it("no token / Blob URL in the serialized layout", () => {
    const s = JSON.stringify(layout);
    for (const bad of ["vercel-storage", "BLOB_READ_WRITE_TOKEN", "https://", "http://"]) expect(s.includes(bad)).toBe(false);
  });
});
