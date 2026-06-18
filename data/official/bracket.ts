import type { BracketDefinition } from "@/lib/types";
import { officialKnockoutGraph } from "./knockout-graph";
import { officialThirdPlaceAllocation } from "./third-place-allocation";

/**
 * OFFICIAL ROUND-OF-32 BRACKET - assembled from the transcribed knockout graph
 * and Annexe C third-place allocation.
 *
 * sourceStatus is "verified": the graph (M73-M104) and all 495 Annexe C rows were
 * transcribed verbatim from the user-supplied official FIFA World Cup 26
 * regulations PDF (FWC26_regulations_EN.pdf), pass `validateBracket`, and the
 * transcription was manually reviewed and confirmed by the user on 2026-06-17
 * (R32 p.23, propagation p.24-25, column-to-slot mapping, Annexe C spot-checks
 * for Options 1, 60, 150, 248, 372, 460).
 *
 * Because the production gate (`lib/simulation/bracket.ts -> isBracketActive`)
 * requires sourceStatus === "verified" AND passing validation, the production
 * simulator now uses this OFFICIAL bracket path (no longer placeholder seeding).
 */
export const officialBracket: BracketDefinition = {
  sourceStatus: "verified",
  graph: officialKnockoutGraph,
  thirdPlaceAllocation: officialThirdPlaceAllocation,
  sources: [
    {
      url: "FWC26_regulations_EN.pdf (user-supplied official FIFA World Cup 26 regulations)",
      method:
        "Manual transcription via pdftotext: graph p.23-25 (Art. 12.6-12.11), Annexe C p.80-97 (Options 1-495)",
      retrievedAt: "2026-06-17",
    },
  ],
  notes:
    "Verified transcription from FWC26_regulations_EN.pdf. Graph M73-M104 and " +
    "all 495 Annexe C rows pass validateBracket; every Annexe C value lies within " +
    "the Art. 12.6 eligible-group set. User-confirmed 2026-06-17 -> production uses " +
    "the official bracket path.",
};
