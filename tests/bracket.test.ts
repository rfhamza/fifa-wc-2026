import { describe, expect, it } from "vitest";
import { isBracketActive, isBracketVerified } from "@/lib/simulation/bracket";
import { officialBracket } from "@/data/official/bracket";

describe("official bracket (real data)", () => {
  it("is NOT source-verified yet (FIFA regulations PDF returned 403)", () => {
    // Documents the current state: placeholder seeding remains active.
    expect(officialBracket.sourceStatus).not.toBe("verified");
    expect(isBracketVerified(officialBracket)).toBe(false);
    expect(isBracketActive(officialBracket)).toBe(false);
  });

  it("ships empty graph + allocation templates until transcribed", () => {
    expect(officialBracket.graph.matches).toHaveLength(0);
    expect(Object.keys(officialBracket.thirdPlaceAllocation)).toHaveLength(0);
  });

  // Guarded: only runs once an official, source-verified mapping is populated.
  const maybe = isBracketActive(officialBracket) ? describe : describe.skip;
  maybe("official R32 slot skeleton (M73-M88)", () => {
    it("defines 16 Round-of-32 matches", () => {
      const r32 = officialBracket.graph.matches.filter((m) => m.stage === "roundOf32");
      expect(r32).toHaveLength(16);
    });
  });
});
