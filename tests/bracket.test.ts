import { describe, expect, it } from "vitest";
import { isBracketVerified, buildOfficialR32Order } from "@/lib/simulation/bracket";
import { officialBracket } from "@/data/official/bracket";

describe("official bracket (A4)", () => {
  it("is NOT source-verified yet (FIFA regulations PDF returned 403)", () => {
    // Documents the current state: placeholder seeding remains active.
    expect(officialBracket.sourceStatus).not.toBe("verified");
    expect(isBracketVerified()).toBe(false);
    expect(buildOfficialR32Order()).toBeNull();
  });

  // Guarded: only runs once an official, source-verified mapping is populated.
  const maybe = isBracketVerified() ? describe : describe.skip;
  maybe("official R32 slot skeleton (M73–M88)", () => {
    it("defines matches 73..88 with downstream propagation", () => {
      const r32 = officialBracket.matches.filter(
        (m) => m.matchNumber >= 73 && m.matchNumber <= 88,
      );
      expect(r32).toHaveLength(16);
    });
  });
});
