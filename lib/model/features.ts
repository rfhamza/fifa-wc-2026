/**
 * Feature engineering
 * -------------------
 * Converts a raw `Team` into a normalized `TeamFeatureSet` the model consumes.
 * Keeping this separate means data-source changes (e.g. a new ratings feed)
 * only touch how features are built, never the prediction math.
 */
import type { Team, TeamFeatureSet, Confederation } from "@/lib/types";

/** Co-host nations receive the host advantage signal. */
const HOST_TEAM_IDS = new Set(["usa", "canada", "mexico"]);

/** Confederations considered "regional" to the North American host region. */
const REGIONAL_CONFEDERATIONS = new Set<Confederation>(["CONCACAF"]);

export function buildFeatureSet(team: Team): TeamFeatureSet {
  return {
    teamId: team.id,
    elo: team.elo,
    fifaRanking: team.fifaRanking,
    squadQuality: team.squadQuality,
    recentForm: team.recentForm,
    climateFamiliarity: team.climateFamiliarity,
    sameNationalityManager: team.sameNationalityManager,
    isHost: HOST_TEAM_IDS.has(team.id),
    isRegional:
      REGIONAL_CONFEDERATIONS.has(team.confederation) &&
      !HOST_TEAM_IDS.has(team.id),
  };
}
