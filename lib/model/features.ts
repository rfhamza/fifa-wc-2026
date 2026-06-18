/**
 * Feature engineering
 * -------------------
 * Converts a raw `Team` into a normalized `TeamFeatureSet` the model consumes.
 * Keeping this separate means data-source changes (e.g. a new ratings feed)
 * only touch how features are built, never the prediction math.
 */
import type { Team, TeamFeatureSet, Confederation } from "@/lib/types";
import { clamp } from "@/lib/utils";
import { getModelInputsForTeam } from "@/data/model-inputs";

/** Return `value` if it is a finite number, else the `fallback`. */
function finite(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

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

/**
 * Build the model's feature set. Strength VALUES come from the versioned
 * model-input layer (`data/model-inputs/`, Phase 1.7) - not directly off `Team` -
 * so a future source-backed snapshot can replace them without touching model
 * logic. `Team` is used only for identity/context (id, confederation, host,
 * manager). Each numeric input falls back to the `Team` value if the snapshot is
 * missing it (e.g. the mock fallback dataset), and to a finite guard to avoid NaN.
 */
export function buildFeatureSet(team: Team): TeamFeatureSet {
  const mi = getModelInputsForTeam(team.id);
  const elo = finite(mi?.eloRating, team.elo);
  const fifaRanking = finite(mi?.fifaRanking, team.fifaRanking);
  const squadQuality = finite(mi?.squadQuality, team.squadQuality);
  const recentForm = finite(mi?.recentForm, team.recentForm);
  const climateFamiliarity = finite(mi?.climateFamiliarity, team.climateFamiliarity);
  const gdpPerCapita = finite(mi?.gdpPerCapita, team.gdpPerCapita);
  const population = finite(mi?.population, team.population);

  return {
    teamId: team.id,
    elo,
    fifaRanking,
    squadQuality,
    recentForm,
    climateFamiliarity,
    sameNationalityManager: team.sameNationalityManager,
    gdpPerCapita,
    population,
    structuralDepth: structuralDepthScore(gdpPerCapita, population),
    isHost: HOST_TEAM_IDS.has(team.id),
    isRegional:
      REGIONAL_CONFEDERATIONS.has(team.confederation) &&
      !HOST_TEAM_IDS.has(team.id),
  };
}
