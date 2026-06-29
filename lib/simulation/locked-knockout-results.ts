/**
 * Locked knockout results (Phase 1.29, PR-3E)
 * -------------------------------------------
 * Pure resolver/validator that lets *completed* knockout matches (M73..M104) be
 * locked into the Monte Carlo simulation: the recorded winner is forced, the
 * loser is eliminated, and the official bracket graph propagates the winner into
 * downstream rounds automatically. Every remaining (unresolved) knockout match is
 * still simulated by the existing model. This is a tournament-state refresh, NOT
 * a team-strength re-rating - no weight/formula/feature change.
 *
 * Identity is the canonical FIFA match number (M73..M104) - never a provider id.
 * Knockout matches are NOT in `fixtures` (group-only), so locks key by match
 * number and are threaded separately from `LockedResult` (group locks).
 *
 * Validation is graph-aware and fails closed:
 *  - every locked matchNumber exists in the official knockout graph with the
 *    declared stage;
 *  - `winnerTeamId` is one of the two declared participants;
 *  - no duplicate match numbers;
 *  - ANCESTOR-CLOSURE: for a locked match, every `matchWinner`/`matchLoser`
 *    feeder slot must itself be locked, so the participant set of every locked
 *    match is deterministic. This is what makes non-contiguous completions safe
 *    (siblings, e.g. M76 before M74, are fine; only DAG ancestors must precede).
 *
 * This module imports only types + the official knockout graph type; it performs
 * NO live-state import and reads NO provider data.
 */
import type { KnockoutGraph, KnockoutMatchDefinition, KnockoutStage, QualifierSlot } from "@/lib/types";

/** A completed knockout result to lock into the simulation (provider-free). */
export interface KnockoutLockedResult {
  /** Canonical FIFA match number, M73..M104. */
  matchNumber: number;
  /** The knockout stage this match belongs to (cross-checked against the graph). */
  stage: KnockoutStage;
  /** The two participants in the provider's orientation (order is informational). */
  homeTeamId: string;
  awayTeamId: string;
  /** The winner; must equal `homeTeamId` or `awayTeamId`. */
  winnerTeamId: string;
}

/** A resolved knockout lock the simulator forces at the graph match's call site. */
export interface ResolvedKnockoutLock {
  homeTeamId: string;
  awayTeamId: string;
  winnerTeamId: string;
}

/** Feeder match numbers a slot depends on (knockout ancestors only). */
function feederMatchNumber(slot: QualifierSlot): number | null {
  if (slot.kind === "matchWinner" || slot.kind === "matchLoser") return slot.matchNumber;
  return null;
}

/**
 * Validate `locked` against the official knockout `graph` and return a map of
 * `matchNumber -> { homeTeamId, awayTeamId, winnerTeamId }`. Fails closed (throws)
 * on unknown/duplicate match numbers, stage mismatches, a winner that is not a
 * declared participant, or an unmet ancestor (a knockout feeder that is not also
 * locked). Empty input yields an empty map (the baseline code path).
 */
export function resolveKnockoutLockedResults(
  locked: readonly KnockoutLockedResult[],
  graph: KnockoutGraph,
): Map<number, ResolvedKnockoutLock> {
  const graphByMatchNumber = new Map<number, KnockoutMatchDefinition>();
  for (const m of graph.matches) graphByMatchNumber.set(m.matchNumber, m);

  const lockedSet = new Set<number>();
  for (const lr of locked) lockedSet.add(lr.matchNumber);

  const resolved = new Map<number, ResolvedKnockoutLock>();
  const seen = new Set<number>();

  for (const lr of locked) {
    if (seen.has(lr.matchNumber)) {
      throw new Error(`knockoutLockedResult: duplicate matchNumber ${lr.matchNumber}`);
    }
    seen.add(lr.matchNumber);

    const node = graphByMatchNumber.get(lr.matchNumber);
    if (!node) {
      throw new Error(
        `knockoutLockedResult: matchNumber ${lr.matchNumber} is not in the official knockout graph`,
      );
    }
    if (node.stage !== lr.stage) {
      throw new Error(
        `knockoutLockedResult M${lr.matchNumber}: stage "${lr.stage}" does not match graph stage "${node.stage}"`,
      );
    }

    if (lr.homeTeamId === lr.awayTeamId) {
      throw new Error(`knockoutLockedResult M${lr.matchNumber}: homeTeamId and awayTeamId are identical`);
    }
    if (lr.winnerTeamId !== lr.homeTeamId && lr.winnerTeamId !== lr.awayTeamId) {
      throw new Error(
        `knockoutLockedResult M${lr.matchNumber}: winnerTeamId "${lr.winnerTeamId}" is not one of ` +
          `{${lr.homeTeamId}, ${lr.awayTeamId}}`,
      );
    }

    // Ancestor-closure: any knockout feeder this match depends on must be locked
    // too, so the participant set of this match is deterministic in every
    // iteration (group-position / third-place feeders resolve from group locks).
    for (const slot of [node.home, node.away]) {
      const feeder = feederMatchNumber(slot);
      if (feeder !== null && !lockedSet.has(feeder)) {
        throw new Error(
          `knockoutLockedResult M${lr.matchNumber}: depends on match ${feeder} (${slot.kind}), ` +
            `which must also be locked (ancestor-closure)`,
        );
      }
    }

    resolved.set(lr.matchNumber, {
      homeTeamId: lr.homeTeamId,
      awayTeamId: lr.awayTeamId,
      winnerTeamId: lr.winnerTeamId,
    });
  }

  return resolved;
}
