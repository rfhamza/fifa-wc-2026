import type {
  ModelFeatureFamily,
  ModelInputStatus,
  TeamModelInputs,
} from "@/lib/types";
import { MODEL_INPUT_SOURCES } from "./sources";
import { modelInputSnapshot } from "./team-inputs";

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

export { MODEL_INPUT_SOURCES } from "./sources";
export { modelInputSnapshot, MODEL_INPUTS_VERSION } from "./team-inputs";
