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
  FifaRankingRow,
  ModelFeatureFamily,
  ModelInputSource,
  ModelInputValidationResult,
  Team,
  TeamModelInputs,
} from "@/lib/types";
import { officialTeams } from "@/data/official/teams";
import {
  MODEL_INPUT_SOURCES,
  modelInputSnapshot,
  fifaRankingSnapshot,
  FIFA_RANKING_SOURCE,
  FIFA_NAME_TO_ID,
} from "@/data/model-inputs";
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

/** Sane numeric bounds per REQUIRED input (range checks, not exactness). */
const RANGES: Record<keyof Omit<TeamModelInputs, "teamId" | "fifaRankingPoints">, [number, number]> = {
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

/**
 * Phase 1.8 - validate the source-backed FIFA ranking snapshot: exactly the 48
 * teams, one row each, integer ranks 1..210, finite positive points, no
 * duplicate ids/ranks, names mapped, source metadata present + source-backed,
 * and that NO other family status changed.
 */
export function validateFifaRankingSnapshot(
  snapshot: FifaRankingRow[] = fifaRankingSnapshot,
  teams: Team[] = officialTeams,
  source: ModelInputSource = FIFA_RANKING_SOURCE,
  nameMap: Record<string, string> = FIFA_NAME_TO_ID,
): ModelInputValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const teamIds = new Set(teams.map((t) => t.id));

  if (snapshot.length !== EXPECTED_TEAMS) {
    errors.push(`expected ${EXPECTED_TEAMS} FIFA ranking rows, got ${snapshot.length}`);
  }

  const seenTeams = new Set<string>();
  const seenRanks = new Map<number, string[]>();
  for (const row of snapshot) {
    if (seenTeams.has(row.teamId)) errors.push(`duplicate FIFA row for ${row.teamId}`);
    seenTeams.add(row.teamId);
    if (!teamIds.has(row.teamId)) errors.push(`FIFA row team id not in official teams: ${row.teamId}`);

    if (!Number.isInteger(row.fifaRank) || row.fifaRank < 1 || row.fifaRank > 210) {
      errors.push(`${row.teamId}: fifaRank ${row.fifaRank} not an integer in 1..210`);
    }
    if (!Number.isFinite(row.fifaPoints) || row.fifaPoints <= 0) {
      errors.push(`${row.teamId}: fifaPoints ${row.fifaPoints} not finite positive`);
    }
    if (!row.fifaNameRaw || nameMap[row.fifaNameRaw] !== row.teamId) {
      errors.push(`${row.teamId}: fifaNameRaw "${row.fifaNameRaw}" does not map to this id`);
    }
    const list = seenRanks.get(row.fifaRank) ?? [];
    list.push(row.teamId);
    seenRanks.set(row.fifaRank, list);
  }

  // Every app team must have exactly one FIFA row.
  for (const t of teams) {
    if (!seenTeams.has(t.id)) errors.push(`missing FIFA ranking row for team ${t.id}`);
  }

  // No duplicate ranks among the 48-team subset (global ranks are unique).
  for (const [rank, ids] of seenRanks) {
    if (ids.length > 1) errors.push(`duplicate FIFA rank ${rank}: ${ids.join(", ")}`);
  }

  // Source metadata present + honestly source-backed.
  if (source.status !== "source-backed") {
    errors.push(`FIFA ranking source status must be "source-backed", got "${source.status}"`);
  }
  for (const field of ["sourceName", "sourceFile", "sourceDate"] as const) {
    if (!source[field]) errors.push(`FIFA ranking source missing ${field}`);
  }
  if (MODEL_INPUT_SOURCES.fifaRanking.status !== "source-backed") {
    errors.push("fifaRanking family status must be source-backed");
  }

  // Honesty guard: no OTHER family silently changed status.
  const EXPECTED_STATUS: Partial<Record<ModelFeatureFamily, string>> = {
    eloRating: "manual",
    structural: "manual",
    squadQuality: "placeholder",
    recentForm: "placeholder",
    climateFamiliarity: "placeholder",
  };
  for (const [family, status] of Object.entries(EXPECTED_STATUS)) {
    const actual = MODEL_INPUT_SOURCES[family as ModelFeatureFamily].status;
    if (actual !== status) errors.push(`family ${family} status changed unexpectedly: ${actual} (expected ${status})`);
  }

  return { valid: errors.length === 0, errors, warnings };
}
