import type { BracketDefinition } from "@/lib/types";
import { officialKnockoutGraph } from "./knockout-graph";
import { officialThirdPlaceAllocation } from "./third-place-allocation";

/**
 * OFFICIAL ROUND-OF-32 BRACKET - assembled from the transcribed knockout graph
 * and Annexe C third-place allocation.
 *
 * sourceStatus is "candidate": the graph (M73-M104) and all 495 Annexe C rows
 * were transcribed verbatim from the user-supplied official FIFA World Cup 26
 * regulations PDF (FWC26_regulations_EN.pdf) and pass `validateBracket`, but the
 * transcription has NOT yet been confirmed by the user. It only becomes
 * "verified" after the user explicitly confirms the transcription is correct.
 *
 * Because the production gate (`lib/simulation/bracket.ts -> isBracketActive`)
 * requires sourceStatus === "verified", the production simulator continues to use
 * placeholder strength-seeding while this is "candidate". Tests may validate the
 * official path against this candidate data directly (preview only).
 */
export const officialBracket: BracketDefinition = {
  sourceStatus: "candidate",
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
    "Candidate transcription from FWC26_regulations_EN.pdf. Graph M73-M104 and " +
    "all 495 Annexe C rows pass validateBracket; every Annexe C value lies within " +
    "the Art. 12.6 eligible-group set. Awaiting user confirmation before flipping " +
    "to verified. Production stays placeholder-seeded until then.",
};
