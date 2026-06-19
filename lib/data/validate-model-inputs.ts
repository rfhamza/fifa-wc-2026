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
  ClimateSuitabilityRow,
  EloRatingRow,
  FifaRankingRow,
  ModelFeatureFamily,
  ModelInputSource,
  ModelInputValidationResult,
  StructuralEconomicRow,
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
  eloRatingSnapshot,
  ELO_RATING_SOURCE,
  ELO_NAME_TO_ID,
  structuralEconomicSnapshot,
  STRUCTURAL_ECONOMIC_SOURCE,
  STRUCTURAL_NAME_TO_ID,
  climateSuitabilitySnapshot,
  CLIMATE_SUITABILITY_SOURCE,
  CLIMATE_CODE_TO_ID,
} from "@/data/model-inputs";
import {
  PLACEHOLDER_CONTRIBUTION_CAP,
  TOTAL_PLACEHOLDER_CONTRIBUTION_CAP,
} from "@/lib/model/config";
import { computeClimateSuitability } from "@/lib/model/climate-suitability";

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
const RANGES: Record<
  keyof Omit<TeamModelInputs, "teamId" | "fifaRankingPoints" | "eloRank" | "gdpCurrentUsd">,
  [number, number]
> = {
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
    eloRating: "source-backed",
    structural: "candidate",
    squadQuality: "placeholder",
    recentForm: "placeholder",
    climateFamiliarity: "candidate",
  };
  for (const [family, status] of Object.entries(EXPECTED_STATUS)) {
    const actual = MODEL_INPUT_SOURCES[family as ModelFeatureFamily].status;
    if (actual !== status) errors.push(`family ${family} status changed unexpectedly: ${actual} (expected ${status})`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Phase 1.10 - validate the source-backed World Football Elo snapshot: exactly the
 * 48 teams, one row each, integer ranks in a sane range, finite + sane ratings, no
 * duplicate team ids, names mapped, source metadata present + source-backed, and
 * that NO other family status changed. Unlike FIFA ranks, Elo ranks MAY TIE (equal
 * ratings share a rank), so rank uniqueness is NOT asserted.
 */
export function validateEloSnapshot(
  snapshot: EloRatingRow[] = eloRatingSnapshot,
  teams: Team[] = officialTeams,
  source: ModelInputSource = ELO_RATING_SOURCE,
  nameMap: Record<string, string> = ELO_NAME_TO_ID,
): ModelInputValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const teamIds = new Set(teams.map((t) => t.id));

  if (snapshot.length !== EXPECTED_TEAMS) {
    errors.push(`expected ${EXPECTED_TEAMS} Elo rating rows, got ${snapshot.length}`);
  }

  const seenTeams = new Set<string>();
  for (const row of snapshot) {
    if (seenTeams.has(row.teamId)) errors.push(`duplicate Elo row for ${row.teamId}`);
    seenTeams.add(row.teamId);
    if (!teamIds.has(row.teamId)) errors.push(`Elo row team id not in official teams: ${row.teamId}`);

    if (!Number.isInteger(row.eloRank) || row.eloRank < 1 || row.eloRank > 250) {
      errors.push(`${row.teamId}: eloRank ${row.eloRank} not an integer in 1..250`);
    }
    if (!Number.isFinite(row.eloRating) || row.eloRating < 1000 || row.eloRating > 2500) {
      errors.push(`${row.teamId}: eloRating ${row.eloRating} not finite in 1000..2500`);
    }
    if (!row.eloNameRaw || nameMap[row.eloNameRaw] !== row.teamId) {
      errors.push(`${row.teamId}: eloNameRaw "${row.eloNameRaw}" does not map to this id`);
    }
  }

  // Every app team must have exactly one Elo row.
  for (const t of teams) {
    if (!seenTeams.has(t.id)) errors.push(`missing Elo rating row for team ${t.id}`);
  }

  // Elo ties are allowed: duplicate ranks are valid, but rating order should be
  // broadly consistent with rank (lower rank -> not-lower rating). Warn only.
  const byRank = [...snapshot].sort((a, b) => a.eloRank - b.eloRank);
  for (let i = 1; i < byRank.length; i++) {
    const cur = byRank[i];
    const prev = byRank[i - 1];
    if (cur && prev && cur.eloRating > prev.eloRating) {
      warnings.push(
        `Elo rating out of rank order: ${cur.teamId} (#${cur.eloRank}, ${cur.eloRating}) > ${prev.teamId} (#${prev.eloRank}, ${prev.eloRating})`,
      );
    }
  }

  // Source metadata present + honestly source-backed.
  if (source.status !== "source-backed") {
    errors.push(`Elo rating source status must be "source-backed", got "${source.status}"`);
  }
  for (const field of ["sourceName", "sourceFile", "sourceDate"] as const) {
    if (!source[field]) errors.push(`Elo rating source missing ${field}`);
  }
  if (MODEL_INPUT_SOURCES.eloRating.status !== "source-backed") {
    errors.push("eloRating family status must be source-backed");
  }

  // Honesty guard: no OTHER family silently changed status.
  const EXPECTED_STATUS: Partial<Record<ModelFeatureFamily, string>> = {
    fifaRanking: "source-backed",
    structural: "candidate",
    squadQuality: "placeholder",
    recentForm: "placeholder",
    climateFamiliarity: "candidate",
  };
  for (const [family, status] of Object.entries(EXPECTED_STATUS)) {
    const actual = MODEL_INPUT_SOURCES[family as ModelFeatureFamily].status;
    if (actual !== status) errors.push(`family ${family} status changed unexpectedly: ${actual} (expected ${status})`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Phase 1.12 / 1.12.1 - validate the structural/economic snapshot.
 *
 * MIXED `candidate` family: exactly the 48 teams, one row each; finite + positive
 * GDP / GDP-per-capita / population within the model-input ranges; per-indicator
 * years are integers in a sane window on every sourced row; a 3-letter WB code + a
 * mapped display name on every `source-backed` (World Bank) row; England + Scotland
 * are the ONLY `official-derived` rows (Phase 1.12.1: workbook values from ONS /
 * Scottish-Government + documented FX/bridge, no WB code, NOT parent-mapped to the
 * UK); ZERO plain-`manual` rows remain; source metadata present + family status
 * `candidate`; and NO other family silently changed status (Elo/FIFA still
 * source-backed, squad/form/climate still placeholder). Years that drift off the
 * common 2024 baseline produce a warning, not an error.
 */
const STRUCTURAL_YEAR_MIN = 2000;
const STRUCTURAL_YEAR_MAX = 2025;
const STRUCTURAL_BASELINE_YEAR = 2024;
const EXPECTED_DERIVED_STRUCTURAL = new Set(["england", "scotland"]);

export function validateStructuralSnapshot(
  snapshot: StructuralEconomicRow[] = structuralEconomicSnapshot,
  teams: Team[] = officialTeams,
  source: ModelInputSource = STRUCTURAL_ECONOMIC_SOURCE,
  nameMap: Record<string, string> = STRUCTURAL_NAME_TO_ID,
): ModelInputValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const teamIds = new Set(teams.map((t) => t.id));

  if (snapshot.length !== EXPECTED_TEAMS) {
    errors.push(`expected ${EXPECTED_TEAMS} structural rows, got ${snapshot.length}`);
  }

  const [gdpPcMin, gdpPcMax] = RANGES.gdpPerCapita;
  const [popMin, popMax] = RANGES.population;
  const seenTeams = new Set<string>();
  const derivedTeams = new Set<string>();
  const manualTeams = new Set<string>();

  for (const row of snapshot) {
    if (seenTeams.has(row.teamId)) errors.push(`duplicate structural row for ${row.teamId}`);
    seenTeams.add(row.teamId);
    if (!teamIds.has(row.teamId)) errors.push(`structural row team id not in official teams: ${row.teamId}`);

    if (
      row.mappingStatus !== "source-backed" &&
      row.mappingStatus !== "official-derived" &&
      row.mappingStatus !== "manual"
    ) {
      errors.push(`${row.teamId}: invalid mappingStatus "${row.mappingStatus}"`);
    }
    if (row.mappingStatus === "official-derived") derivedTeams.add(row.teamId);
    if (row.mappingStatus === "manual") manualTeams.add(row.teamId);

    // Numeric values: finite, positive, and within the model-input ranges.
    if (!Number.isFinite(row.gdpCurrentUsd) || row.gdpCurrentUsd <= 0) {
      errors.push(`${row.teamId}: gdpCurrentUsd ${row.gdpCurrentUsd} not finite positive`);
    }
    if (
      !Number.isFinite(row.gdpPerCapitaCurrentUsd) ||
      row.gdpPerCapitaCurrentUsd < gdpPcMin ||
      row.gdpPerCapitaCurrentUsd > gdpPcMax
    ) {
      errors.push(`${row.teamId}: gdpPerCapitaCurrentUsd ${row.gdpPerCapitaCurrentUsd} out of range [${gdpPcMin}, ${gdpPcMax}]`);
    }
    if (!Number.isFinite(row.population) || row.population < popMin || row.population > popMax) {
      errors.push(`${row.teamId}: population ${row.population} out of range [${popMin}, ${popMax}]`);
    }

    const years = [
      ["gdpYear", row.gdpYear],
      ["gdpPerCapitaYear", row.gdpPerCapitaYear],
      ["populationYear", row.populationYear],
    ] as const;

    // Sourced rows (World Bank or official-derived) must carry integer per-indicator
    // years in a sane window; off-baseline years warn (do not error).
    const requireSanitYears = () => {
      for (const [label, year] of years) {
        if (
          typeof year !== "number" ||
          !Number.isInteger(year) ||
          year < STRUCTURAL_YEAR_MIN ||
          year > STRUCTURAL_YEAR_MAX
        ) {
          errors.push(`${row.teamId}: ${label} ${String(year)} not an integer in ${STRUCTURAL_YEAR_MIN}..${STRUCTURAL_YEAR_MAX}`);
        } else if (year !== STRUCTURAL_BASELINE_YEAR) {
          warnings.push(`${row.teamId}: ${label} ${year} differs from baseline ${STRUCTURAL_BASELINE_YEAR}`);
        }
      }
    };

    if (row.mappingStatus === "source-backed") {
      // World Bank rows: 3-letter WB code, mapped name, integer per-indicator years.
      if (!/^[A-Z]{3}$/.test(row.worldBankCountryCode)) {
        errors.push(`${row.teamId}: worldBankCountryCode "${row.worldBankCountryCode}" not a 3-letter code`);
      }
      if (!row.countryNameRaw || nameMap[row.countryNameRaw] !== row.teamId) {
        errors.push(`${row.teamId}: countryNameRaw "${row.countryNameRaw}" does not map to this id`);
      }
      requireSanitYears();
    } else if (row.mappingStatus === "official-derived") {
      // Official-derived rows (England/Scotland): NO WB code (not a WB economy, not
      // parent-mapped to the UK), a display name, and integer per-indicator years.
      if (row.worldBankCountryCode !== "") {
        errors.push(`${row.teamId}: official-derived row must have empty worldBankCountryCode (not a World Bank economy)`);
      }
      if (!row.countryNameRaw) {
        errors.push(`${row.teamId}: official-derived row missing countryNameRaw`);
      }
      requireSanitYears();
    } else if (row.mappingStatus === "manual") {
      // Manual rows: no WB code, no per-indicator years. (None expected after 1.12.1.)
      if (row.worldBankCountryCode !== "") {
        errors.push(`${row.teamId}: manual row must have empty worldBankCountryCode`);
      }
      for (const [label, year] of years) {
        if (year !== null) errors.push(`${row.teamId}: manual ${label} must be null, got ${String(year)}`);
      }
    }
  }

  // Every app team must have exactly one structural row.
  for (const t of teams) {
    if (!seenTeams.has(t.id)) errors.push(`missing structural row for team ${t.id}`);
  }

  // England + Scotland are the ONLY official-derived rows (documented decision).
  for (const id of derivedTeams) {
    if (!EXPECTED_DERIVED_STRUCTURAL.has(id)) {
      errors.push(`unexpected official-derived structural row: ${id} (only England/Scotland may be official-derived)`);
    }
  }
  for (const id of EXPECTED_DERIVED_STRUCTURAL) {
    if (!derivedTeams.has(id)) errors.push(`expected ${id} to be an official-derived structural row`);
  }
  // ZERO plain-manual rows remain after Phase 1.12.1.
  for (const id of manualTeams) {
    errors.push(`unexpected manual structural row: ${id} (none should remain; use source-backed or official-derived)`);
  }

  // Source metadata present + honestly `candidate` (mixed WB source-backed + official-derived).
  if (source.status !== "candidate") {
    errors.push(`structural source status must be "candidate" (mixed), got "${source.status}"`);
  }
  for (const field of ["sourceName", "sourceUrl", "sourceDate"] as const) {
    if (!source[field]) errors.push(`structural source missing ${field}`);
  }
  if (MODEL_INPUT_SOURCES.structural.status !== "candidate") {
    errors.push("structural family status must be candidate");
  }

  // Honesty guard: no OTHER family silently changed status.
  const EXPECTED_STATUS: Partial<Record<ModelFeatureFamily, string>> = {
    eloRating: "source-backed",
    fifaRanking: "source-backed",
    squadQuality: "placeholder",
    recentForm: "placeholder",
    climateFamiliarity: "candidate",
  };
  for (const [family, status] of Object.entries(EXPECTED_STATUS)) {
    const actual = MODEL_INPUT_SOURCES[family as ModelFeatureFamily].status;
    if (actual !== status) errors.push(`family ${family} status changed unexpectedly: ${actual} (expected ${status})`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Phase 1.13 - validate the climate-suitability snapshot.
 *
 * MIXED `candidate` family: exactly the 48 teams, one row each; every row carries
 * length-12 finite monthly temperature (deg C) + precipitation (mm) arrays in sane
 * ranges, a baseline period of "1991-2020", and a derived suitability score in
 * [0,1]. 46 rows are `source-backed` (CCKP / ISO3 code maps to the team); England +
 * Scotland are the ONLY `official-derived` rows (Met Office; empty code, NOT mapped
 * to GBR); `unresolved` is allowed ONLY for explicitly documented missing
 * geographies (currently only Curacao if ever needed) and must score exactly 0.5.
 * Counts are conditional on how many rows are unresolved (U): official-derived === 2
 * and source-backed === 48 - 2 - U. Source metadata present + family status
 * `candidate`; and NO other family silently changed status.
 */
const EXPECTED_DERIVED_CLIMATE = new Set(["england", "scotland"]);
const ALLOWED_UNRESOLVED_CLIMATE = new Set(["curacao"]);
const CLIMATE_TEMP_MIN = -60;
const CLIMATE_TEMP_MAX = 60;
const CLIMATE_PRECIP_MIN = 0;
const CLIMATE_PRECIP_MAX = 2000;

export function validateClimateSnapshot(
  snapshot: ClimateSuitabilityRow[] = climateSuitabilitySnapshot,
  teams: Team[] = officialTeams,
  source: ModelInputSource = CLIMATE_SUITABILITY_SOURCE,
  codeMap: Record<string, string> = CLIMATE_CODE_TO_ID,
): ModelInputValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const teamIds = new Set(teams.map((t) => t.id));

  if (snapshot.length !== EXPECTED_TEAMS) {
    errors.push(`expected ${EXPECTED_TEAMS} climate rows, got ${snapshot.length}`);
  }

  const seenTeams = new Set<string>();
  const sourceBacked = new Set<string>();
  const derivedTeams = new Set<string>();
  const unresolvedTeams = new Set<string>();

  const checkArray = (id: string, label: string, arr: number[], min: number, max: number) => {
    if (!Array.isArray(arr) || arr.length !== 12) {
      errors.push(`${id}: ${label} must have 12 monthly values, got ${Array.isArray(arr) ? arr.length : typeof arr}`);
      return;
    }
    for (let m = 0; m < 12; m++) {
      const v = arr[m];
      if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) {
        errors.push(`${id}: ${label}[${m}] ${String(v)} out of range [${min}, ${max}]`);
      }
    }
  };

  for (const row of snapshot) {
    if (seenTeams.has(row.teamId)) errors.push(`duplicate climate row for ${row.teamId}`);
    seenTeams.add(row.teamId);
    if (!teamIds.has(row.teamId)) errors.push(`climate row team id not in official teams: ${row.teamId}`);

    if (
      row.dataStatus !== "source-backed" &&
      row.dataStatus !== "official-derived" &&
      row.dataStatus !== "unresolved"
    ) {
      errors.push(`${row.teamId}: invalid dataStatus "${row.dataStatus}"`);
    }
    if (row.baselinePeriod !== "1991-2020") {
      errors.push(`${row.teamId}: baselinePeriod must be "1991-2020", got "${row.baselinePeriod}"`);
    }

    checkArray(row.teamId, "monthlyTempC", row.monthlyTempC, CLIMATE_TEMP_MIN, CLIMATE_TEMP_MAX);
    checkArray(row.teamId, "monthlyPrecipMm", row.monthlyPrecipMm, CLIMATE_PRECIP_MIN, CLIMATE_PRECIP_MAX);

    // Derived suitability score must be bounded 0..1 on every row.
    const score = computeClimateSuitability(row);
    if (!Number.isFinite(score) || score < 0 || score > 1) {
      errors.push(`${row.teamId}: suitability score ${String(score)} out of [0,1]`);
    }

    if (row.dataStatus === "source-backed") {
      sourceBacked.add(row.teamId);
      if (!/^[A-Z]{3}$/.test(row.climateCode)) {
        errors.push(`${row.teamId}: climateCode "${row.climateCode}" not a 3-letter code`);
      } else if (codeMap[row.climateCode] !== row.teamId) {
        errors.push(`${row.teamId}: climateCode "${row.climateCode}" does not map to this id`);
      }
    } else if (row.dataStatus === "official-derived") {
      derivedTeams.add(row.teamId);
      if (row.climateCode !== "") {
        errors.push(`${row.teamId}: official-derived row must have empty climateCode (not CCKP/GBR)`);
      }
      if (!row.countryNameRaw) {
        errors.push(`${row.teamId}: official-derived row missing countryNameRaw`);
      }
    } else if (row.dataStatus === "unresolved") {
      unresolvedTeams.add(row.teamId);
      if (Math.abs(score - 0.5) > 1e-9) {
        errors.push(`${row.teamId}: unresolved row must score 0.5 (neutral), got ${score}`);
      }
    }
  }

  // Every app team must have exactly one climate row.
  for (const t of teams) {
    if (!seenTeams.has(t.id)) errors.push(`missing climate row for team ${t.id}`);
  }

  // England + Scotland are the ONLY official-derived rows (documented decision).
  for (const id of derivedTeams) {
    if (!EXPECTED_DERIVED_CLIMATE.has(id)) {
      errors.push(`unexpected official-derived climate row: ${id} (only England/Scotland may be)`);
    }
  }
  for (const id of EXPECTED_DERIVED_CLIMATE) {
    if (!derivedTeams.has(id)) errors.push(`expected ${id} to be an official-derived climate row`);
  }
  // Unresolved rows are allowed only for explicitly documented missing geographies.
  for (const id of unresolvedTeams) {
    if (!ALLOWED_UNRESOLVED_CLIMATE.has(id)) {
      errors.push(`unexpected unresolved climate row: ${id} (only documented missing geographies may be unresolved)`);
    }
  }

  // Conditional counts (no contradictory assumptions): 2 official-derived, U
  // unresolved, and source-backed === 48 - 2 - U.
  const U = unresolvedTeams.size;
  if (derivedTeams.size !== 2) {
    errors.push(`expected exactly 2 official-derived climate rows, got ${derivedTeams.size}`);
  }
  const expectedSourceBacked = EXPECTED_TEAMS - 2 - U;
  if (sourceBacked.size !== expectedSourceBacked) {
    errors.push(`expected ${expectedSourceBacked} source-backed climate rows (48 - 2 - ${U} unresolved), got ${sourceBacked.size}`);
  }

  // Source metadata present + honestly `candidate` (mixed source-backed + official-derived).
  if (source.status !== "candidate") {
    errors.push(`climate source status must be "candidate" (mixed), got "${source.status}"`);
  }
  for (const field of ["sourceName", "sourceUrl", "sourceDate"] as const) {
    if (!source[field]) errors.push(`climate source missing ${field}`);
  }
  if (MODEL_INPUT_SOURCES.climateFamiliarity.status !== "candidate") {
    errors.push("climateFamiliarity family status must be candidate");
  }

  // Honesty guard: no OTHER family silently changed status.
  const EXPECTED_STATUS: Partial<Record<ModelFeatureFamily, string>> = {
    eloRating: "source-backed",
    fifaRanking: "source-backed",
    structural: "candidate",
    squadQuality: "placeholder",
    recentForm: "placeholder",
  };
  for (const [family, status] of Object.entries(EXPECTED_STATUS)) {
    const actual = MODEL_INPUT_SOURCES[family as ModelFeatureFamily].status;
    if (actual !== status) errors.push(`family ${family} status changed unexpectedly: ${actual} (expected ${status})`);
  }

  return { valid: errors.length === 0, errors, warnings };
}
