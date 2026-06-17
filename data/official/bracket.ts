import type { BracketDefinition } from "@/lib/types";
import { officialKnockoutGraph } from "./knockout-graph";
import { officialThirdPlaceAllocation } from "./third-place-allocation";

/**
 * OFFICIAL ROUND-OF-32 BRACKET - assembled from the (template) knockout graph
 * and Annexe C third-place allocation.
 *
 * sourceStatus is "mock" while the graph + allocation are empty templates.
 * It only becomes "verified" when BOTH are fully transcribed from a cited source,
 * `validateBracket` passes (16 R32 matches, valid propagation, all 495 Annexe C
 * rows), AND the user confirms the source is authoritative. While not verified,
 * the production simulator uses placeholder strength-seeding (see
 * lib/simulation/bracket.ts -> isBracketActive) and bracket tests are guarded.
 */
export const officialBracket: BracketDefinition = {
  sourceStatus: "mock",
  graph: officialKnockoutGraph,
  thirdPlaceAllocation: officialThirdPlaceAllocation,
  sources: [
    {
      url: "https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf",
      method: "WebFetch (HTTP 403 - not retrievable)",
      retrievedAt: "2026-06-17",
    },
  ],
  notes:
    "Pending source verification - FIFA regulations PDF returned 403. Graph + Annexe C are empty templates; simulator uses placeholder seeding until fully transcribed, validated, and confirmed verified.",
};
