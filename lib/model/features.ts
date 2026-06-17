/**
 * Feature engineering
 * -------------------
 * Converts a raw `Team` into a normalized `TeamFeatureSet` the model consumes.
 * Keeping this separate means data-source changes (e.g. a new ratings feed)
 * only touch how features are built, never the prediction math.
 */
import type { Team, TeamFeatureSet, Confederation } from "@/lib/types";
import { clamp } from "@/lib/utils";

/** Co-host nations receive the host advantage signal. */
const HOST_TEAM_IDS = new Set(["usa", "canada", "mexico"]);

/** Confederations considered "regional" to the North American host region. */
const REGIONAL_CONFEDERATIONS = new Set<Confederation>(["CONCACAF"]);

// Reference bounds for log-scaling the economic indicators into 0..1.
const LOG_GDP_MIN = Math.log10(500); // ~poorest national economies
const LOG_GDP_MAX = Math.log10(120000); // ~richest
const LOG_POP_MIN = Math.log10(100_000); // micro-states
const LOG_POP_MAX = Math.log10(350_000_000); // largest competitors

/**
 * Experimental structural/economic prior in 0..1, blending log-scaled GDP per
 * capita (footballing infrastructure proxy) and log-scaled population (talent
 * pool proxy). Deliberately a WEAK signal — see config weight + MODEL_METHOD.
 */
export function structuralDepthScore(
  gdpPerCapita: number,
  population: number,
): number {
  const gdpScore = clamp(
    (Math.log10(Math.max(1, gdpPerCapita)) - LOG_GDP_MIN) /
      (LOG_GDP_MAX - LOG_GDP_MIN),
    0,
    1,
  );
  const popScore = clamp(
    (Math.log10(Math.max(1, population)) - LOG_POP_MIN) /
      (LOG_POP_MAX - LOG_POP_MIN),
    0,
    1,
  );
  return clamp(0.6 * gdpScore + 0.4 * popScore, 0, 1);
}

export function buildFeatureSet(team: Team): TeamFeatureSet {
  return {
    teamId: team.id,
    elo: team.elo,
    fifaRanking: team.fifaRanking,
    squadQuality: team.squadQuality,
    recentForm: team.recentForm,
    climateFamiliarity: team.climateFamiliarity,
    sameNationalityManager: team.sameNationalityManager,
    gdpPerCapita: team.gdpPerCapita,
    population: team.population,
    structuralDepth: structuralDepthScore(team.gdpPerCapita, team.population),
    isHost: HOST_TEAM_IDS.has(team.id),
    isRegional:
      REGIONAL_CONFEDERATIONS.has(team.confederation) &&
      !HOST_TEAM_IDS.has(team.id),
  };
}
