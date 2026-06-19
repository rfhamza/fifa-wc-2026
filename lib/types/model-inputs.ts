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
  recentForm: number;
  squadQuality: number;
  climateFamiliarity: number;
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
