import { describe, expect, it } from "vitest";
import {
  EXPECTED_COMBINATIONS,
  enumerateThirdPlaceCombinations,
  normalizeCombinationKey,
  validateAllocation,
  validateBracket,
  validateGraph,
} from "@/lib/simulation/bracket-validate";
import {
  buildSampleGraph,
  generateFullAllocation,
  sampleBracket,
} from "./fixtures/sample-bracket";
import type { GroupId, ThirdPlaceAllocationMap } from "@/lib/types";

describe("combination enumeration", () => {
  it("produces exactly 495 = C(12,8) normalized combinations", () => {
    const combos = enumerateThirdPlaceCombinations();
    expect(combos).toHaveLength(EXPECTED_COMBINATIONS);
    expect(new Set(combos).size).toBe(EXPECTED_COMBINATIONS);
    for (const c of combos) {
      expect(c).toBe(normalizeCombinationKey(c.split("") as GroupId[]));
      expect(c).toHaveLength(8);
    }
  });

  it("normalizeCombinationKey sorts + uppercases", () => {
    expect(normalizeCombinationKey(["C", "A", "B", "H", "E", "D", "G", "F"])).toBe("ABCDEFGH");
  });
});

describe("validateAllocation - full generated table", () => {
  const result = validateAllocation(generateFullAllocation());

  it("reports complete coverage with no errors", () => {
    expect(result.errors).toEqual([]);
    expect(result.coverage).toEqual({ combinations: 495, expected: 495, complete: true });
  });
});

describe("validateAllocation - negatives", () => {
  const base = generateFullAllocation();

  it("flags incomplete coverage when a key is missing", () => {
    const map: ThirdPlaceAllocationMap = { ...base };
    delete map["ABCDEFGH"];
    const r = validateAllocation(map);
    expect(r.coverage.combinations).toBe(494);
    expect(r.coverage.complete).toBe(false);
  });

  it("flags an invalid (non-combination) key", () => {
    const map: ThirdPlaceAllocationMap = { ...base, ZZZZZZZZ: base["ABCDEFGH"]! };
    const r = validateAllocation(map);
    expect(r.errors.some((e) => e.includes("ZZZZZZZZ"))).toBe(true);
    expect(r.coverage.complete).toBe(false);
  });

  it("flags a non-normalized key", () => {
    const r = validateAllocation({ HGFEDCBA: base["ABCDEFGH"]! });
    expect(r.errors.some((e) => e.includes("not normalized"))).toBe(true);
  });

  it("flags an unselected group assigned (and a selected group missing)", () => {
    // Key ABCDEFGH but slot T1 wrongly assigns I (unselected) instead of A.
    const r = validateAllocation({
      ABCDEFGH: { T1: "I", T2: "B", T3: "C", T4: "D", T5: "E", T6: "F", T7: "G", T8: "H" },
    });
    expect(r.errors.some((e) => e.includes("unselected group I assigned"))).toBe(true);
    expect(r.errors.some((e) => e.includes("selected group A not assigned"))).toBe(true);
  });

  it("flags a duplicate slot assignment", () => {
    const r = validateAllocation({
      ABCDEFGH: { T1: "A", T2: "A", T3: "C", T4: "D", T5: "E", T6: "F", T7: "G", T8: "H" },
    });
    expect(r.errors.some((e) => e.includes("assigned to more than one slot"))).toBe(true);
  });
});

describe("validateGraph", () => {
  it("accepts the synthetic sample graph", () => {
    expect(validateGraph(buildSampleGraph())).toEqual([]);
  });

  it("rejects an empty graph (no R32 matches)", () => {
    const errors = validateGraph({ matches: [] });
    expect(errors.some((e) => e.includes("16 R32 matches"))).toBe(true);
  });

  it("rejects a graph that drops a group winner", () => {
    const g = buildSampleGraph();
    // Corrupt: replace group A winner slot with a duplicate of group B winner.
    g.matches[0]!.home = { kind: "groupPosition", group: "B", position: 1 };
    const errors = validateGraph(g);
    expect(errors.some((e) => e.includes("group A winner"))).toBe(true);
    expect(errors.some((e) => e.includes("group B winner"))).toBe(true);
  });
});

describe("validateBracket", () => {
  it("validates the fully-populated sample bracket", () => {
    const r = validateBracket(sampleBracket);
    expect(r.valid).toBe(true);
    expect(r.coverage.complete).toBe(true);
  });
});
