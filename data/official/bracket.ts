import type { BracketSpec } from "@/lib/types";

/**
 * OFFICIAL ROUND-OF-32 BRACKET (A4) — TEMPLATE / PENDING SOURCE VERIFICATION.
 *
 * The fixed R32 slot skeleton (matches M73–M88) and the Annexe C third-place
 * allocation table live in the official FIFA regulations PDF. We attempted to
 * fetch/parse it but the FIFA digitalHub and fifa.com bracket pages returned
 * HTTP 403 to our fetch agent, so we CANNOT source-verify the mapping.
 *
 *   ATTEMPTED SOURCES (403):
 *     - https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf
 *     - https://www.fifa.com/.../articles/knockout-stage-match-schedule-bracket
 *
 * Per the agreed fallback, this ships as a typed template with sourceStatus
 * "mock". While not "verified", the simulator uses the deterministic placeholder
 * seeding in lib/simulation/bracket.ts and bracket tests are guarded/skipped.
 *
 * TO COMPLETE: populate `matches` with M73..M104 (R32→final) and
 * `thirdPlaceAllocation` from the regulations, then set sourceStatus = "verified".
 */
export const officialBracket: BracketSpec = {
  sourceStatus: "mock",
  matches: [], // TODO: M73–M88 (R32) + downstream propagation, once source-verified
  thirdPlaceAllocation: undefined, // TODO: Annexe C table, once parsed confidently
  notes:
    "Pending source verification — FIFA regulations PDF returned 403. Simulator uses placeholder strength-seeding until populated.",
};
