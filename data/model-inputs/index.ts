import type {
  ModelFeatureFamily,
  ModelInputStatus,
  TeamModelInputs,
} from "@/lib/types";
import { MODEL_INPUT_SOURCES } from "./sources";
import { modelInputSnapshot } from "./team-inputs";
import { fifaRankingSnapshot } from "./snapshots/fifa-ranking-2026-06-11";
import { eloRatingSnapshot } from "./snapshots/elo-rating-2026-06-11";
import { structuralEconomicSnapshot } from "./snapshots/structural-economic-2024";
import { climateSuitabilitySnapshot } from "./snapshots/climate-suitability-1991-2020";

/**
 * Phase 1.7 - assembled MODEL-INPUT LAYER.
 *
 * The model consumes strength values from here (via lib/model/features.ts) rather
 * than reading them off `Team` directly, so a future source-backed snapshot can
 * be dropped in without changing model logic. Provenance + status per feature
 * family live in ./sources.ts; placeholder families are weight-capped in
 * lib/model/config.ts + lib/model/predict.ts.
 */
const SNAPSHOT_BY_TEAM = new Map(modelInputSnapshot.map((m) => [m.teamId, m]));

/** Look up a team's model inputs (undefined if not in the snapshot). */
export function getModelInputsForTeam(teamId: string): TeamModelInputs | undefined {
  return SNAPSHOT_BY_TEAM.get(teamId);
}

/** Provenance status for a feature family. */
export function getFeatureStatus(family: ModelFeatureFamily): ModelInputStatus {
  return MODEL_INPUT_SOURCES[family].status;
}

const FIFA_BY_TEAM = new Map(fifaRankingSnapshot.map((r) => [r.teamId, r]));
const ELO_BY_TEAM = new Map(eloRatingSnapshot.map((r) => [r.teamId, r]));
const STRUCTURAL_BY_TEAM = new Map(structuralEconomicSnapshot.map((r) => [r.teamId, r]));
const CLIMATE_BY_TEAM = new Map(climateSuitabilitySnapshot.map((r) => [r.teamId, r]));

/** Source-backed FIFA ranking row for a team (Phase 1.8), if present. */
export function getFifaRanking(teamId: string) {
  return FIFA_BY_TEAM.get(teamId);
}

/** Source-backed Elo rating row for a team (Phase 1.10), if present. */
export function getEloRating(teamId: string) {
  return ELO_BY_TEAM.get(teamId);
}

/** Structural/economic row for a team (Phase 1.12; World Bank WDI or official-derived), if present. */
export function getStructuralEconomic(teamId: string) {
  return STRUCTURAL_BY_TEAM.get(teamId);
}

/** Climate-suitability row for a team (Phase 1.13; CCKP or Met Office), if present. */
export function getClimateSuitability(teamId: string) {
  return CLIMATE_BY_TEAM.get(teamId);
}

export { MODEL_INPUT_SOURCES } from "./sources";
export { modelInputSnapshot, MODEL_INPUTS_VERSION } from "./team-inputs";
export {
  fifaRankingSnapshot,
  FIFA_RANKING_SOURCE,
  FIFA_NAME_TO_ID,
} from "./snapshots/fifa-ranking-2026-06-11";
export {
  eloRatingSnapshot,
  ELO_RATING_SOURCE,
  ELO_NAME_TO_ID,
} from "./snapshots/elo-rating-2026-06-11";
export {
  structuralEconomicSnapshot,
  STRUCTURAL_ECONOMIC_SOURCE,
  STRUCTURAL_NAME_TO_ID,
} from "./snapshots/structural-economic-2024";
export {
  climateSuitabilitySnapshot,
  CLIMATE_SUITABILITY_SOURCE,
  CLIMATE_CODE_TO_ID,
} from "./snapshots/climate-suitability-1991-2020";
