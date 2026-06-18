import { describe, expect, it } from "vitest";
import { officialThirdPlaceAllocation } from "@/data/official/third-place-allocation";
import {
  EXPECTED_COMBINATIONS,
  THIRD_SLOT_IDS,
  normalizeCombinationKey,
  validateAllocation,
} from "@/lib/simulation/bracket-validate";
import type { GroupId } from "@/lib/types";

describe("official Annexe C allocation (verified transcription)", () => {
  it(`covers all ${EXPECTED_COMBINATIONS} combinations and validates`, () => {
    const r = validateAllocation(officialThirdPlaceAllocation);
    expect(r.errors).toEqual([]);
    expect(r.coverage.complete).toBe(true);
    expect(r.coverage.combinations).toBe(EXPECTED_COMBINATIONS);
  });

  it("every key is a normalized 8-group subset and every row fills T1..T8", () => {
    for (const [key, slots] of Object.entries(officialThirdPlaceAllocation)) {
      expect(key).toHaveLength(8);
      expect(normalizeCombinationKey(key.split("") as GroupId[])).toBe(key);
      for (const t of THIRD_SLOT_IDS) expect(slots[t]).toBeDefined();
      // Assigned groups equal the key groups exactly (once each).
      expect([...Object.values(slots)].sort().join("")).toBe(key);
    }
  });

  it("matches a spot-checked source row (Annexe C Option 1)", () => {
    // PDF p.80 Option 1: 1A=3E 1B=3J 1D=3I 1E=3F 1G=3H 1I=3G 1K=3L 1L=3K
    // -> groups {E,F,G,H,I,J,K,L} -> key "EFGHIJKL"
    // Column->slot: 1A=T3, 1B=T7, 1D=T5, 1E=T1, 1G=T6, 1I=T2, 1K=T8, 1L=T4
    expect(officialThirdPlaceAllocation["EFGHIJKL"]).toEqual({
      T1: "F", // col 1E
      T2: "G", // col 1I
      T3: "E", // col 1A
      T4: "K", // col 1L
      T5: "I", // col 1D
      T6: "H", // col 1G
      T7: "J", // col 1B
      T8: "L", // col 1K
    });
  });
});
