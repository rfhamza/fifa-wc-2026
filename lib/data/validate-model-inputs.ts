/**
 * Phase 1.7 - model-input layer validation.
 *
 * Verification-only: asserts the model-input snapshot covers all 48 teams with
 * finite, in-range values, that every feature family has explicit provenance +
 * status, and that placeholder families are weight-capped (so they cannot
 * silently drive probabilities). Mirrors the `{ valid, errors, warnings }` shape
 * used elsewhere (lib/data/validate.ts).
 */
import type {
  ModelFeatureFamily,
  ModelInputSource,
  ModelInputValidationResult,
  Team,
  TeamModelInputs,
} from "@/lib/types";
import { officialTeams } from "@/data/official/teams";
import { MODEL_INPUT_SOURCES, modelInputSnapshot } from "@/data/model-inputs";
import {
  PLACEHOLDER_CONTRIBUTION_CAP,
  TOTAL_PLACEHOLDER_CONTRIBUTION_CAP,
} from "@/lib/model/config";

const EXPECTED_TEAMS = 48;

const ALL_FAMILIES: ModelFeatureFamily[] = [
  "eloRating",
  "fifaRanking",
  "structural",
  "squadQuality",
  "recentForm",
  "climateFamiliarity",
  "hostAdvantage",
  "regionalAdvantage",
  "managerCohesion",
];

/** Sane numeric bounds per input (range checks, not exactness). */
const RANGES: Record<keyof Omit<TeamModelInputs, "teamId">, [number, number]> = {
  eloRating: [1000, 2200],
  fifaRanking: [1, 211],
  gdpPerCapita: [1, 500_000],
  population: [1, 2_000_000_000],
  recentForm: [0, 100],
  squadQuality: [0, 100],
  climateFamiliarity: [0, 100],
};

export function validateModelInputs(
  snapshot: TeamModelInputs[] = modelInputSnapshot,
  teams: Team[] = officialTeams,
  sources: Record<ModelFeatureFamily, ModelInputSource> = MODEL_INPUT_SOURCES,
): ModelInputValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Coverage: exactly the 48 official teams, no id mismatch, no duplicates.
  const teamIds = new Set(teams.map((t) => t.id));
  if (snapshot.length !== EXPECTED_TEAMS) {
    errors.push(`expected ${EXPECTED_TEAMS} model-input rows, got ${snapshot.length}`);
  }
  const seen = new Set<string>();
  for (const row of snapshot) {
    if (seen.has(row.teamId)) errors.push(`duplicate model-input row: ${row.teamId}`);
    seen.add(row.teamId);
    if (!teamIds.has(row.teamId)) errors.push(`model-input team id not in official teams: ${row.teamId}`);

    for (const key of Object.keys(RANGES) as (keyof typeof RANGES)[]) {
      const value = row[key];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        errors.push(`${row.teamId}.${key}: non-finite value (${String(value)})`);
        continue;
      }
      const [min, max] = RANGES[key];
      if (value < min || value > max) {
        errors.push(`${row.teamId}.${key}: ${value} out of range [${min}, ${max}]`);
      }
    }
  }
  for (const t of teams) {
    if (!seen.has(t.id)) errors.push(`missing model-input row for team ${t.id}`);
  }

  // FIFA ranking uniqueness -> warning (avoid forcing team-number edits).
  const ranks = new Map<number, string[]>();
  for (const row of snapshot) {
    const list = ranks.get(row.fifaRanking) ?? [];
    list.push(row.teamId);
    ranks.set(row.fifaRanking, list);
  }
  for (const [rank, ids] of ranks) {
    if (ids.length > 1) warnings.push(`fifaRanking ${rank} shared by ${ids.join(", ")}`);
  }

  // Every family has explicit provenance + status + sourceName.
  for (const family of ALL_FAMILIES) {
    const src = sources[family];
    if (!src) {
      errors.push(`missing source registry entry for family ${family}`);
      continue;
    }
    if (!src.status) errors.push(`family ${family}: missing status`);
    if (!src.sourceName) errors.push(`family ${family}: missing sourceName`);
    // Honesty: no source-backed/verified claim without a citation.
    if ((src.status === "source-backed" || src.status === "verified") && !src.sourceName) {
      errors.push(`family ${family}: ${src.status} requires source metadata`);
    }
  }

  // Placeholder families MUST be weight-capped (cannot silently dominate).
  if (!(PLACEHOLDER_CONTRIBUTION_CAP > 0) || !Number.isFinite(PLACEHOLDER_CONTRIBUTION_CAP)) {
    errors.push("PLACEHOLDER_CONTRIBUTION_CAP must be a positive number");
  }
  if (
    !(TOTAL_PLACEHOLDER_CONTRIBUTION_CAP > 0) ||
    TOTAL_PLACEHOLDER_CONTRIBUTION_CAP < PLACEHOLDER_CONTRIBUTION_CAP
  ) {
    errors.push("TOTAL_PLACEHOLDER_CONTRIBUTION_CAP must be >= PLACEHOLDER_CONTRIBUTION_CAP");
  }

  return { valid: errors.length === 0, errors, warnings };
}
