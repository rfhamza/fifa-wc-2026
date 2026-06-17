import type { KnockoutGraph } from "@/lib/types";

/**
 * OFFICIAL KNOCKOUT GRAPH (M73-M104) - TEMPLATE / PENDING SOURCE VERIFICATION.
 *
 * The fixed Round-of-32 skeleton (M73-M88) and the downstream
 * R16 / QF / SF / 3rd-place / final propagation come from the official FIFA
 * World Cup 2026 regulations PDF. WebFetch to that PDF (and the fifa.com bracket
 * page) returns HTTP 403, so this cannot be source-verified yet.
 *
 *   ATTEMPTED SOURCE (403):
 *     https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf
 *
 * TO COMPLETE (status -> "candidate" once transcribed, "verified" once the user
 * confirms the source is authoritative):
 *   - 16 R32 matches M73-M88, each with two QualifierSlots:
 *       { kind: "groupPosition", group, position }  // 1X or 2X
 *       { kind: "thirdPlace", slot: "T1".."T8", eligibleGroups }  // Annexe C
 *   - R16 (M89-M96), QF (M97-M100), SF (M101-M102) using
 *       { kind: "matchWinner", matchNumber }
 *   - 3rd place (M103): both slots { kind: "matchLoser", matchNumber } of the SFs
 *   - Final (M104): both slots { kind: "matchWinner", matchNumber } of the SFs
 *
 * Match numbers above are the conventional 2026 layout and MUST be confirmed
 * against the official source before flipping the bracket to "verified".
 */
export const officialKnockoutGraph: KnockoutGraph = {
  matches: [], // TODO: transcribe M73-M104 from the official regulations
};
