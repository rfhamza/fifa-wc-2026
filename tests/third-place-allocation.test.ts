import { describe, expect, it } from "vitest";
import { officialThirdPlaceAllocation } from "@/data/official/third-place-allocation";
import { officialBracket } from "@/data/official/bracket";
import { isBracketActive } from "@/lib/simulation/bracket";
import {
  EXPECTED_COMBINATIONS,
  validateAllocation,
} from "@/lib/simulation/bracket-validate";

describe("official Annexe C allocation (real data)", () => {
  it("is an empty template until transcribed from the source", () => {
    expect(Object.keys(officialThirdPlaceAllocation)).toHaveLength(0);
  });

  // Guarded: only runs once the official allocation is populated + verified.
  const maybe = isBracketActive(officialBracket) ? describe : describe.skip;
  maybe("once transcribed", () => {
    it(`covers all ${EXPECTED_COMBINATIONS} combinations and validates`, () => {
      const r = validateAllocation(officialThirdPlaceAllocation);
      expect(r.errors).toEqual([]);
      expect(r.coverage.complete).toBe(true);
      expect(r.coverage.combinations).toBe(EXPECTED_COMBINATIONS);
    });
  });
});
