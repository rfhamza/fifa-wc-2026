/**
 * Phase 1.7 - Model-input provenance + status types.
 * --------------------------------------------------
 * A small, standalone type module (no imports) describing the versioned
 * model-input layer in `data/model-inputs/`. Kept separate from the core domain
 * types so the model-input contract can evolve (and be re-exported from
 * `lib/types/index.ts`) without churn.
 *
 * Honesty rule: a family's `status` must reflect how its values were actually
 * obtained. Nothing is `source-backed`/`verified` unless an authoritative source
 * snapshot/file is supplied and validated.
 */

/** Provenance status for a model-input feature family (honest, explicit). */
export type ModelInputStatus =
  | "verified" // official source or user-approved authoritative data
  | "source-backed" // transcribed from a supplied, cited public snapshot
  | "candidate" // derived from cross-verified identity/structure
  | "manual" // hand-authored directional estimate (no source yet)
  | "placeholder"; // filler; must not silently drive high-weight calculations

/** The model-input feature families the prediction engine consumes. */
export type ModelFeatureFamily =
  | "eloRating"
  | "fifaRanking"
  | "structural"
  | "squadQuality"
  | "recentForm"
  | "climateFamiliarity"
  | "hostAdvantage"
  | "regionalAdvantage"
  | "managerCohesion";

/** Provenance for one model-input feature family. */
export interface ModelInputSource {
  family: ModelFeatureFamily;
  /** Human label shown in methodology/UI. */
  label: string;
  sourceName: string;
  sourceUrl?: string;
  /** Supplied source file name (binary not committed), when applicable. */
  sourceFile?: string;
  /** Publication date of the source snapshot (ISO), when applicable. */
  sourceDate?: string;
  /** When the snapshot was captured/transcribed (ISO), when applicable. */
  retrievedAt?: string;
  status: ModelInputStatus;
  notes?: string;
}

/**
 * The per-team model-input snapshot consumed by the model. Identity/tournament
 * context (name, group, confederation, host, manager) stays on `Team`; this
 * carries only the numeric strength inputs, versioned and replaceable by a
 * future source-backed snapshot without changing model logic.
 */
export interface TeamModelInputs {
  teamId: string;
  eloRating: number;
  /** Elo global rank (source-backed snapshot; carried for explainability). May tie. */
  eloRank?: number;
  fifaRanking: number;
  /** FIFA ranking points (source-backed snapshot; carried for explainability). */
  fifaRankingPoints?: number;
  gdpPerCapita: number;
  population: number;
  /** GDP (current US$), source-backed for WB-mapped teams; carried for explainability. */
  gdpCurrentUsd?: number;
  recentForm: number;
  squadQuality: number;
  climateFamiliarity: number;
}

/**
 * One row of the structural/economic snapshot (Phase 1.12 / 1.12.1). World Bank
 * World Development Indicators for the 46 sovereign WB economies (mappingStatus
 * `source-backed`); England + Scotland have no separate WB economy, so their rows
 * are `official-derived` (Phase 1.12.1) from a user-supplied model-ready workbook
 * built on ONS / Scottish-Government official statistics + documented FX/bridge
 * assumptions - they are NOT direct WB observations and are NOT parent-mapped to
 * the United Kingdom. Indicator years are stored PER indicator (null only on a
 * plain-`manual` row, of which there are none after 1.12.1) so a row never implies
 * a single shared data year.
 */
export interface StructuralEconomicRow {
  teamId: string;
  /** Economy display name (e.g. "Korea, Rep." for WB rows; "England"/"Scotland" for official-derived rows). */
  countryNameRaw: string;
  /** World Bank / ISO3 economy code (e.g. "DEU"); empty string on non-WB rows. */
  worldBankCountryCode: string;
  /** GDP, current US$ (NY.GDP.MKTP.CD / workbook US$ values converted to full USD). */
  gdpCurrentUsd: number;
  /** GDP per capita, current US$ (NY.GDP.PCAP.CD / workbook). */
  gdpPerCapitaCurrentUsd: number;
  /** Population, total (SP.POP.TOTL / workbook). */
  population: number;
  /** Year of the GDP value (null only on a plain-manual row). */
  gdpYear: number | null;
  /** Year of the GDP-per-capita value (null only on a plain-manual row). */
  gdpPerCapitaYear: number | null;
  /** Year of the population value (null only on a plain-manual row). */
  populationYear: number | null;
  /**
   * Row-level mapping/provenance status:
   * - `source-backed`   = direct World Bank WDI row (the 46 economies);
   * - `official-derived`= England/Scotland workbook values from ONS / Scottish-
   *   Government official stats + documented FX/bridge assumptions (not direct WB);
   * - `manual`          = no defensible source trail (none after Phase 1.12.1).
   */
  mappingStatus: "source-backed" | "official-derived" | "manual";
}

/** One row of a transcribed World Football Elo ratings snapshot (Phase 1.10). */
export interface EloRatingRow {
  teamId: string;
  /** Source display name as printed (e.g. "Czech Republic", "Dem. Rep. of Congo"). */
  eloNameRaw: string;
  /** Global Elo rank (may tie across teams with equal ratings). */
  eloRank: number;
  eloRating: number;
}

/** One row of a transcribed FIFA ranking snapshot (Phase 1.8). */
export interface FifaRankingRow {
  teamId: string;
  /** FIFA display name as printed in the source (e.g. "Korea Republic"). */
  fifaNameRaw: string;
  fifaRank: number;
  fifaPoints: number;
}

/** Result of validating the model-input layer (mirrors lib/data/validate.ts). */
export interface ModelInputValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
