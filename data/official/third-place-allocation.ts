import type { ThirdPlaceAllocationMap } from "@/lib/types";

/**
 * OFFICIAL ANNEXE C THIRD-PLACE ALLOCATION - TEMPLATE / PENDING SOURCE VERIFICATION.
 *
 * The explicit lookup table is the SOURCE OF TRUTH (no algorithmic
 * reconstruction). Each key is the eight selected best third-placed groups,
 * NORMALIZED (sorted, uppercase), e.g. "ABCDEFGH"; each value maps the eight
 * R32 third-place slots (T1..T8) to the group that fills them.
 *
 * There are C(12,8) = 495 combinations. The table is "complete" ONLY when all
 * 495 keys are present and `validateAllocation` passes. Until then the bracket
 * stays mock/candidate and the production simulator keeps placeholder seeding.
 *
 *   ATTEMPTED SOURCE (403):
 *     https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf
 *
 * Example row (illustrative shape only - DO NOT treat as official):
 *   "ABCDEFGH": { T1: "A", T2: "B", T3: "C", T4: "D", T5: "E", T6: "F", T7: "G", T8: "H" }
 */
export const officialThirdPlaceAllocation: ThirdPlaceAllocationMap = {
  // TODO: transcribe all 495 Annexe C rows from the official regulations.
};
