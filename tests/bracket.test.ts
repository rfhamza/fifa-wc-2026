import { describe, expect, it } from "vitest";
import { isBracketActive, isBracketVerified } from "@/lib/simulation/bracket";
import { validateBracket } from "@/lib/simulation/bracket-validate";
import { officialBracket } from "@/data/official/bracket";

describe("official bracket (verified transcription)", () => {
  it("is VERIFIED -> production uses the official path", () => {
    expect(officialBracket.sourceStatus).toBe("verified");
    expect(isBracketVerified(officialBracket)).toBe(true);
    // Verified + valid -> the production gate is active.
    expect(isBracketActive(officialBracket)).toBe(true);
  });

  it("has the transcribed graph (32 matches, M73-M104) and 495 Annexe C rows", () => {
    expect(officialBracket.graph.matches).toHaveLength(32);
    const r32 = officialBracket.graph.matches.filter(
      (m) => m.stage === "roundOf32",
    );
    expect(r32).toHaveLength(16);
    expect(Object.keys(officialBracket.thirdPlaceAllocation)).toHaveLength(495);
  });

  it("passes full structural validation", () => {
    const result = validateBracket(officialBracket);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.coverage).toEqual({
      combinations: 495,
      expected: 495,
      complete: true,
    });
  });
});
