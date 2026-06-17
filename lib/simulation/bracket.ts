/**
 * Official knockout bracket (A4) — scaffolding + guard.
 *
 * The fixed Round-of-32 slot skeleton (M73–M88), downstream propagation, and the
 * Annexe C third-place allocation come from the official FIFA regulations PDF.
 * That PDF (and the fifa.com bracket page) returned HTTP 403 to our fetch agent,
 * so the mapping is NOT source-verified. Until `data/official/bracket.ts` is
 * populated and its `sourceStatus` flipped to "verified", the simulator falls
 * back to deterministic strength-seeding (`seedBracket` in ./tournament.ts) and
 * the official-bracket tests are skipped.
 */
import type { BracketSpec } from "@/lib/types";
import { officialBracket } from "@/data/official/bracket";

/** True only when an official, source-verified bracket mapping is available. */
export function isBracketVerified(bracket: BracketSpec = officialBracket): boolean {
  return bracket.sourceStatus === "verified" && bracket.matches.length > 0;
}

/**
 * Build the R32 first-round pairings from the verified official mapping.
 * Returns null when no verified mapping exists (caller uses placeholder seeding).
 *
 * TODO(source-verified): given resolved group winners/runners-up and the eight
 * best thirds (with their source groups), realise BracketSlots into concrete
 * team ids per M73–M88 and propagate winners through R16/QF/SF/final.
 */
export function buildOfficialR32Order(): null {
  if (!isBracketVerified()) return null;
  throw new Error(
    "Official bracket is marked verified but the realiser is not implemented yet.",
  );
}
