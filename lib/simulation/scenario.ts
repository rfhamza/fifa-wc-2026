/**
 * Scenario simulator helpers
 * --------------------------
 * Lightweight "what-if" tooling. The default result for each fixture is the
 * model's single most-likely scoreline; the user can override any result and
 * recompute the group table. Pure functions only — the same code runs on the
 * server (to seed defaults) and in the client (to recompute live).
 *
 * Phase-one scope: group-stage standings + top-2 qualification. The shape is
 * deliberately ready for richer knockout re-simulation later.
 */
import type { Fixture, GroupId, MatchPrediction, TeamMeta } from "@/lib/types";
import { computeGroupStandings, type MatchResult } from "./standings";

export interface ScenarioFixtureResult extends MatchResult {
  fixtureId: string;
  /** True when the user manually overrode the model's default scoreline. */
  overridden: boolean;
}

/** The model's most-likely scoreline becomes the default result for a fixture. */
export function defaultResult(
  fixture: Fixture,
  prediction: MatchPrediction,
): ScenarioFixtureResult {
  const top = prediction.topScorelines[0];
  return {
    fixtureId: fixture.id,
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
    homeGoals: top?.homeGoals ?? 0,
    awayGoals: top?.awayGoals ?? 0,
    overridden: false,
  };
}

/** Recompute a group's standings from the current scenario results (Article 13). */
export function computeScenarioStandings(
  groupId: GroupId,
  teamIds: string[],
  results: ScenarioFixtureResult[],
  teamMeta: TeamMeta[] = [],
) {
  return computeGroupStandings(groupId, teamIds, results, teamMeta);
}
