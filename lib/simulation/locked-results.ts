/**
 * Locked group-stage results (Phase 1.29, PR-3A)
 * ----------------------------------------------
 * Pure resolver/validator that lets *completed* group-stage matches be locked
 * into the Monte Carlo simulation while every remaining fixture is still
 * simulated by the existing model. This is the smallest building block for
 * live-aware probability movement; it adds NO results ledger, snapshot
 * generation, deltas or UI.
 *
 * Identity is the canonical FIFA match number (M1..M72) - never a provider id.
 * Goals are supplied for the caller's `homeTeamId`/`awayTeamId`; the resolver
 * accepts either orientation (as long as the team set matches the fixture) and
 * re-orients the goals to the fixture's canonical home/away before returning.
 */
import type { Fixture } from "@/lib/types";

/** A completed group-stage result to lock into the simulation (provider-free). */
export interface LockedResult {
  /** Canonical FIFA match number, M1..M72 (group stage only in this PR). */
  matchNumber: number;
  homeTeamId: string;
  awayTeamId: string;
  /** Final goals for `homeTeamId` (non-negative integer). */
  homeGoals: number;
  /** Final goals for `awayTeamId` (non-negative integer). */
  awayGoals: number;
}

/** A locked score already oriented to a fixture's canonical home/away. */
export interface ResolvedLockedScore {
  home: number;
  away: number;
}

function validateGoals(value: number, field: string, matchNumber: number): void {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`lockedResult M${matchNumber}: ${field} is missing or not a number`);
  }
  if (!Number.isInteger(value)) {
    throw new Error(`lockedResult M${matchNumber}: ${field} must be an integer (got ${value})`);
  }
  if (value < 0) {
    throw new Error(`lockedResult M${matchNumber}: ${field} must be non-negative (got ${value})`);
  }
}

/**
 * Validate `locked` against the supplied group-stage fixtures and return a map
 * of `fixture.id -> { home, away }` (goals oriented to the fixture). Fails closed
 * (throws) on unknown/duplicate match numbers, team mismatches, or invalid goals.
 * Only group-stage fixtures with a `matchNumber` are lockable; knockout / non-group
 * match numbers do not resolve and are rejected.
 */
export function resolveLockedResults(
  locked: readonly LockedResult[],
  groupFixtures: readonly Fixture[],
): Map<string, ResolvedLockedScore> {
  const fixtureByMatchNumber = new Map<number, Fixture>();
  for (const f of groupFixtures) {
    if (typeof f.matchNumber === "number") fixtureByMatchNumber.set(f.matchNumber, f);
  }

  const resolved = new Map<string, ResolvedLockedScore>();
  const seen = new Set<number>();

  for (const lr of locked) {
    if (seen.has(lr.matchNumber)) {
      throw new Error(`lockedResult: duplicate matchNumber ${lr.matchNumber}`);
    }
    seen.add(lr.matchNumber);

    const fixture = fixtureByMatchNumber.get(lr.matchNumber);
    if (!fixture) {
      throw new Error(
        `lockedResult: unknown or non-group-stage matchNumber ${lr.matchNumber}`,
      );
    }

    const fixtureTeams = new Set([fixture.homeTeamId, fixture.awayTeamId]);
    if (
      lr.homeTeamId === lr.awayTeamId ||
      !fixtureTeams.has(lr.homeTeamId) ||
      !fixtureTeams.has(lr.awayTeamId)
    ) {
      throw new Error(
        `lockedResult M${lr.matchNumber}: teams {${lr.homeTeamId}, ${lr.awayTeamId}} do not match ` +
          `fixture {${fixture.homeTeamId}, ${fixture.awayTeamId}}`,
      );
    }

    validateGoals(lr.homeGoals, "homeGoals", lr.matchNumber);
    validateGoals(lr.awayGoals, "awayGoals", lr.matchNumber);

    // Re-orient goals to the fixture's canonical home/away.
    const aligned: ResolvedLockedScore =
      lr.homeTeamId === fixture.homeTeamId
        ? { home: lr.homeGoals, away: lr.awayGoals }
        : { home: lr.awayGoals, away: lr.homeGoals };

    resolved.set(fixture.id, aligned);
  }

  return resolved;
}
