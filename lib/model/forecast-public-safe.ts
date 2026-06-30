/**
 * Public-safe forecast contracts (Phase 1.30, PR-83B) — PURE
 * ----------------------------------------------------------
 * Output shapes + validators + leak guards for the two forecast Blob objects the
 * later refresh pipeline (PR-83C/D) will write and the app will read:
 *   - the rolling CURRENT tournament forecast (team probabilities), and
 *   - the MATCH forecasts (current + archived per-fixture forecasts).
 *
 * Contracts only — no generation, no Blob I/O (that is `forecast-blob-store.ts`),
 * no workflow, no UI. PURE: no fs / env / fetch / live-state / provider / Blob /
 * simulation imports (only forecast TYPES + the forecast leak guard + utils).
 *
 * Compatibility: `PublicSafeForecastCurrent` is structurally aligned to
 * `ForecastSnapshot` and trivially convertible via `forecastCurrentToSnapshot`
 * (so PR-82 `compareForecastSnapshots(baseline, current)` works) WITHOUT changing
 * the shared `ForecastSnapshotType` union.
 */
import type { ScorelineProbability } from "@/lib/types";
import {
  FORBIDDEN_SNAPSHOT_SUBSTRINGS,
  FORECAST_PROBABILITY_KEYS,
  FORECAST_SNAPSHOT_SCHEMA_VERSION,
  FORECAST_SNAPSHOT_TEAM_COUNT,
  type ForecastSnapshot,
  type ForecastTeamProbabilities,
} from "@/lib/model/forecast-snapshots";
import type {
  AdvancementBasis,
  MatchForecast,
  MatchForecastProvenance,
  MatchForecastStage,
} from "@/lib/model/match-forecast";

export const FORECAST_PUBLIC_SAFE_SCHEMA_VERSION = "1.0.0";

/** Tolerance for probability-sum checks (the model emits rounded probabilities). */
export const FORECAST_PROB_SUM_TOLERANCE = 0.01;

/** Note prefix stamped onto a snapshot converted from a rolling-current Blob. */
export const FORECAST_CURRENT_CONVERSION_NOTE =
  "Converted from rolling forecast-current Blob object.";

// --------------------------------------------------------------------------
// Shared public-safe vocabulary (mirrored locally to avoid live-state coupling)
// --------------------------------------------------------------------------

export type ForecastPublicSourcePolicy =
  | "manual-snapshot"
  | "provider-private-deferred"
  | "provider-public-delayed";

export const FORECAST_PUBLIC_SOURCE_POLICIES: readonly ForecastPublicSourcePolicy[] = [
  "manual-snapshot",
  "provider-private-deferred",
  "provider-public-delayed",
];

export interface ForecastAttribution {
  sourceName: string;
  sourceUrl?: string;
  text: string;
}

export type MatchForecastStatus =
  | "scheduled"
  | "resolved"
  | "in-progress"
  | "complete";

export const MATCH_FORECAST_STATUSES: readonly MatchForecastStatus[] = [
  "scheduled",
  "resolved",
  "in-progress",
  "complete",
];

// --------------------------------------------------------------------------
// Leak guard (superset of the snapshot guard, drift-protected by a test)
// --------------------------------------------------------------------------

export const FORECAST_FORBIDDEN_SUBSTRINGS = [
  ...FORBIDDEN_SNAPSHOT_SUBSTRINGS,
  "lineup",
  "events",
  "x-authenticated-client",
] as const;

/** Forbidden substrings found in a serialized payload (case-insensitive). [] = clean. */
export function findForecastForbiddenSubstrings(serialized: string): string[] {
  const haystack = serialized.toLowerCase();
  return FORECAST_FORBIDDEN_SUBSTRINGS.filter((s) => haystack.includes(s.toLowerCase()));
}

/** Throw if a forecast object serializes to anything containing forbidden data. */
export function assertForecastPublicSafe(value: unknown): void {
  const hits = findForecastForbiddenSubstrings(JSON.stringify(value));
  if (hits.length > 0) {
    throw new Error(`Forecast object contains forbidden data: ${hits.join(", ")}`);
  }
}

// --------------------------------------------------------------------------
// forecast-current contract
// --------------------------------------------------------------------------

export interface PublicSafeForecastCurrent {
  schemaVersion: string;
  snapshotId: string;
  snapshotType: "current";
  asOf: string;
  generatedAt: string;
  // live-state provenance (the input that produced this current)
  sourceLiveStateAsOf: string | null;
  sourceLiveStateGeneratedAt: string | null;
  sourceLiveStateObjectPath: string | null;
  completedMatchesLocked: number;
  latestCompletedSupportedMatchNumber?: number;
  providerCompletedMatchesTotal?: number;
  // model provenance (mirrors ForecastSnapshotMeta)
  simulationIterations: number;
  seed: number;
  modelConfigHash: string;
  dataVersion: string;
  fixtureVersion: string;
  weightsSummary: Record<string, number>;
  previousSnapshotId: string | null;
  publicSourcePolicy: ForecastPublicSourcePolicy;
  attribution: ForecastAttribution;
  teams: ForecastTeamProbabilities[];
  notes: string;
  /**
   * Deterministic, public-safe fingerprint of the locked supported-results that
   * produced this forecast. Lets the refresh detect a data CORRECTION (e.g. a
   * fixed score/penalty winner) that does not change the completed-match counts.
   * Optional/additive (older objects may omit it).
   */
  sourceResultsFingerprint?: string;
}

export interface ToForecastCurrentOptions {
  publicSourcePolicy: ForecastPublicSourcePolicy;
  attribution: ForecastAttribution;
  sourceLiveStateGeneratedAt?: string | null;
  previousSnapshotId?: string | null;
  sourceResultsFingerprint?: string;
}

/** Project a generated `ForecastSnapshot` into the public-safe current shape. */
export function toPublicSafeForecastCurrent(
  snapshot: ForecastSnapshot,
  opts: ToForecastCurrentOptions,
): PublicSafeForecastCurrent {
  const m = snapshot.meta;
  const current: PublicSafeForecastCurrent = {
    schemaVersion: FORECAST_PUBLIC_SAFE_SCHEMA_VERSION,
    snapshotId: m.snapshotId,
    snapshotType: "current",
    asOf: m.asOf,
    generatedAt: m.generatedAt,
    sourceLiveStateAsOf: m.liveStateAsOf,
    sourceLiveStateGeneratedAt: opts.sourceLiveStateGeneratedAt ?? null,
    sourceLiveStateObjectPath: m.sourceObjectPath ?? null,
    completedMatchesLocked: m.completedMatchesLocked,
    simulationIterations: m.simulationIterations,
    seed: m.seed,
    modelConfigHash: m.modelConfigHash,
    dataVersion: m.dataVersion,
    fixtureVersion: m.fixtureVersion,
    weightsSummary: { ...m.weightsSummary },
    previousSnapshotId: opts.previousSnapshotId ?? null,
    publicSourcePolicy: opts.publicSourcePolicy,
    attribution: opts.attribution,
    teams: snapshot.teams.map((t) => ({ ...t })),
    notes: m.notes,
  };
  if (m.latestCompletedSupportedMatchNumber !== undefined) {
    current.latestCompletedSupportedMatchNumber = m.latestCompletedSupportedMatchNumber;
  }
  if (m.providerCompletedMatchesTotal !== undefined) {
    current.providerCompletedMatchesTotal = m.providerCompletedMatchesTotal;
  }
  if (opts.sourceResultsFingerprint !== undefined) {
    current.sourceResultsFingerprint = opts.sourceResultsFingerprint;
  }
  return current;
}

/**
 * Convert a public-safe current back to a strict `ForecastSnapshot` for PR-82
 * selectors. `snapshotType` maps to "post-match" (its honest underlying nature,
 * since "current" is outside the shared union); the rolling-current provenance is
 * preserved in `meta.notes`.
 */
export function forecastCurrentToSnapshot(
  current: PublicSafeForecastCurrent,
): ForecastSnapshot {
  const notes = `${FORECAST_CURRENT_CONVERSION_NOTE} ${current.notes}`.trim();
  const meta: ForecastSnapshot["meta"] = {
    schemaVersion: FORECAST_SNAPSHOT_SCHEMA_VERSION,
    snapshotId: current.snapshotId,
    snapshotType: "post-match",
    asOf: current.asOf,
    generatedAt: current.generatedAt,
    weightsSummary: { ...current.weightsSummary },
    modelConfigHash: current.modelConfigHash,
    dataVersion: current.dataVersion,
    fixtureVersion: current.fixtureVersion,
    liveStateSource: current.publicSourcePolicy,
    liveStateAsOf: current.sourceLiveStateAsOf,
    completedMatchesLocked: current.completedMatchesLocked,
    simulationIterations: current.simulationIterations,
    seed: current.seed,
    notes,
  };
  if (current.latestCompletedSupportedMatchNumber !== undefined) {
    meta.latestCompletedSupportedMatchNumber = current.latestCompletedSupportedMatchNumber;
  }
  if (current.providerCompletedMatchesTotal !== undefined) {
    meta.providerCompletedMatchesTotal = current.providerCompletedMatchesTotal;
  }
  if (current.sourceLiveStateObjectPath) {
    meta.sourceObjectPath = current.sourceLiveStateObjectPath;
  }
  return { meta, teams: current.teams.map((t) => ({ ...t })) };
}

// --------------------------------------------------------------------------
// match-forecasts contract
// --------------------------------------------------------------------------

export interface PublicSafeMatchForecastEntry {
  matchNumber: number;
  stage: MatchForecastStage;
  status: MatchForecastStatus;
  homeTeamId: string;
  awayTeamId: string;
  forecastAsOf: string;
  generatedAt: string;
  sourceSnapshotId?: string;
  forecastProvenance: MatchForecastProvenance;
  capturedBeforeCompletion: boolean;
  archived: boolean;
  // flattened 90-minute forecast
  homeWin: number;
  draw: number;
  awayWin: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  topScorelines: ScorelineProbability[];
  // flattened advancement (knockout only)
  homeAdvance?: number;
  awayAdvance?: number;
  advancementBasis?: AdvancementBasis;
  notes?: string;
}

export interface PublicSafeMatchForecasts {
  schemaVersion: string;
  generatedAt: string;
  sourceLiveStateAsOf: string | null;
  sourceLiveStateGeneratedAt: string | null;
  sourceLiveStateObjectPath: string | null;
  publicSourcePolicy: ForecastPublicSourcePolicy;
  attribution: ForecastAttribution;
  matchForecasts: PublicSafeMatchForecastEntry[];
}

export interface MatchForecastEntryMeta {
  status: MatchForecastStatus;
  forecastAsOf: string;
  generatedAt: string;
  provenance: MatchForecastProvenance;
  capturedBeforeCompletion: boolean;
  archived: boolean;
  sourceSnapshotId?: string;
  notes?: string;
}

/** Flatten a PR-83A `MatchForecast` + archive metadata into a public-safe entry. */
export function toPublicSafeMatchForecastEntry(
  forecast: MatchForecast,
  meta: MatchForecastEntryMeta,
): PublicSafeMatchForecastEntry {
  const entry: PublicSafeMatchForecastEntry = {
    matchNumber: forecast.matchNumber,
    stage: forecast.stage,
    status: meta.status,
    homeTeamId: forecast.homeTeamId,
    awayTeamId: forecast.awayTeamId,
    forecastAsOf: meta.forecastAsOf,
    generatedAt: meta.generatedAt,
    forecastProvenance: meta.provenance,
    capturedBeforeCompletion: meta.capturedBeforeCompletion,
    archived: meta.archived,
    homeWin: forecast.homeWin,
    draw: forecast.draw,
    awayWin: forecast.awayWin,
    expectedHomeGoals: forecast.expectedHomeGoals,
    expectedAwayGoals: forecast.expectedAwayGoals,
    topScorelines: forecast.topScorelines.map((s) => ({ ...s })),
  };
  if (meta.sourceSnapshotId !== undefined) entry.sourceSnapshotId = meta.sourceSnapshotId;
  if (meta.notes !== undefined) entry.notes = meta.notes;
  if (forecast.advancement) {
    entry.homeAdvance = forecast.advancement.homeAdvance;
    entry.awayAdvance = forecast.advancement.awayAdvance;
    entry.advancementBasis = forecast.advancement.advancementBasis;
  }
  return entry;
}

export interface BuildMatchForecastsOptions {
  generatedAt: string;
  sourceLiveStateAsOf?: string | null;
  sourceLiveStateGeneratedAt?: string | null;
  sourceLiveStateObjectPath?: string | null;
  publicSourcePolicy: ForecastPublicSourcePolicy;
  attribution: ForecastAttribution;
}

export function buildPublicSafeMatchForecasts(
  entries: PublicSafeMatchForecastEntry[],
  opts: BuildMatchForecastsOptions,
): PublicSafeMatchForecasts {
  return {
    schemaVersion: FORECAST_PUBLIC_SAFE_SCHEMA_VERSION,
    generatedAt: opts.generatedAt,
    sourceLiveStateAsOf: opts.sourceLiveStateAsOf ?? null,
    sourceLiveStateGeneratedAt: opts.sourceLiveStateGeneratedAt ?? null,
    sourceLiveStateObjectPath: opts.sourceLiveStateObjectPath ?? null,
    publicSourcePolicy: opts.publicSourcePolicy,
    attribution: opts.attribution,
    matchForecasts: entries.map((e) => ({ ...e })),
  };
}

// --------------------------------------------------------------------------
// Validators
// --------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function isProb(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
}
function isPolicy(v: unknown): v is ForecastPublicSourcePolicy {
  return typeof v === "string" && (FORECAST_PUBLIC_SOURCE_POLICIES as readonly string[]).includes(v);
}
function validateAttribution(a: unknown, errors: string[]): void {
  if (!isObject(a)) {
    errors.push("attribution must be an object");
    return;
  }
  if (typeof a.sourceName !== "string" || a.sourceName.length === 0) {
    errors.push("attribution.sourceName must be a non-empty string");
  }
  if (typeof a.text !== "string") errors.push("attribution.text must be a string");
  if (a.sourceUrl !== undefined && typeof a.sourceUrl !== "string") {
    errors.push("attribution.sourceUrl must be a string when present");
  }
}

/** Validate a public-safe forecast-current object. [] = valid. */
export function validateForecastCurrent(value: unknown): string[] {
  const errors: string[] = [];
  if (!isObject(value)) return ["forecast-current must be an object"];

  if (value.schemaVersion !== FORECAST_PUBLIC_SAFE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be "${FORECAST_PUBLIC_SAFE_SCHEMA_VERSION}"`);
  }
  if (typeof value.snapshotId !== "string" || value.snapshotId.length === 0) {
    errors.push("snapshotId must be a non-empty string");
  }
  if (value.snapshotType !== "current") errors.push('snapshotType must be "current"');
  for (const key of ["asOf", "generatedAt", "modelConfigHash", "dataVersion", "fixtureVersion", "notes"]) {
    if (typeof value[key] !== "string") errors.push(`${key} must be a string`);
  }
  for (const key of ["sourceLiveStateAsOf", "sourceLiveStateGeneratedAt", "sourceLiveStateObjectPath", "previousSnapshotId"]) {
    const v = value[key];
    if (v !== null && typeof v !== "string") errors.push(`${key} must be a string or null`);
  }
  if (typeof value.completedMatchesLocked !== "number" || value.completedMatchesLocked < 0) {
    errors.push("completedMatchesLocked must be a non-negative number");
  }
  if (typeof value.simulationIterations !== "number" || value.simulationIterations <= 0) {
    errors.push("simulationIterations must be a positive number");
  }
  if (typeof value.seed !== "number" || !Number.isFinite(value.seed)) {
    errors.push("seed must be a finite number");
  }
  if (
    value.sourceResultsFingerprint !== undefined &&
    (typeof value.sourceResultsFingerprint !== "string" || value.sourceResultsFingerprint.length === 0)
  ) {
    errors.push("sourceResultsFingerprint must be a non-empty string when present");
  }
  for (const key of ["latestCompletedSupportedMatchNumber", "providerCompletedMatchesTotal"]) {
    const v = value[key];
    if (v !== undefined && (typeof v !== "number" || v < 0)) {
      errors.push(`${key} must be a non-negative number when present`);
    }
  }
  if (!isObject(value.weightsSummary)) errors.push("weightsSummary must be an object");
  if (!isPolicy(value.publicSourcePolicy)) {
    errors.push(`publicSourcePolicy must be one of ${FORECAST_PUBLIC_SOURCE_POLICIES.join(", ")}`);
  }
  validateAttribution(value.attribution, errors);

  if (!Array.isArray(value.teams) || value.teams.length !== FORECAST_SNAPSHOT_TEAM_COUNT) {
    errors.push(`teams must be an array of ${FORECAST_SNAPSHOT_TEAM_COUNT}`);
  } else {
    value.teams.forEach((t, i) => {
      if (!isObject(t)) {
        errors.push(`teams[${i}] must be an object`);
        return;
      }
      if (typeof t.teamId !== "string" || t.teamId.length === 0) {
        errors.push(`teams[${i}].teamId must be a non-empty string`);
      }
      if (typeof t.rank !== "number" || t.rank < 1) errors.push(`teams[${i}].rank must be >= 1`);
      for (const key of FORECAST_PROBABILITY_KEYS) {
        if (!isProb(t[key])) errors.push(`teams[${i}].${key} must be a probability in [0,1]`);
      }
    });
  }

  if (findForecastForbiddenSubstrings(JSON.stringify(value)).length > 0) {
    errors.push("forecast-current contains forbidden/private substrings");
  }
  return errors;
}

/** Validate one match-forecast entry, enforcing stage/advancement + hindsight rules. */
export function validateMatchForecastEntry(value: unknown, index = 0): string[] {
  const errors: string[] = [];
  const at = (msg: string) => `matchForecasts[${index}].${msg}`;
  if (!isObject(value)) return [at("entry must be an object")];

  if (typeof value.matchNumber !== "number" || value.matchNumber < 1) {
    errors.push(at("matchNumber must be a positive number"));
  }
  if (typeof value.stage !== "string") errors.push(at("stage must be a string"));
  if (!(MATCH_FORECAST_STATUSES as readonly string[]).includes(value.status as string)) {
    errors.push(at(`status must be one of ${MATCH_FORECAST_STATUSES.join(", ")}`));
  }
  for (const key of ["homeTeamId", "awayTeamId", "forecastAsOf", "generatedAt"]) {
    if (typeof value[key] !== "string") errors.push(at(`${key} must be a string`));
  }
  if (value.sourceSnapshotId !== undefined && typeof value.sourceSnapshotId !== "string") {
    errors.push(at("sourceSnapshotId must be a string when present"));
  }
  if (value.notes !== undefined && typeof value.notes !== "string") {
    errors.push(at("notes must be a string when present"));
  }
  for (const key of ["homeWin", "draw", "awayWin"]) {
    if (!isProb(value[key])) errors.push(at(`${key} must be a probability in [0,1]`));
  }
  for (const key of ["expectedHomeGoals", "expectedAwayGoals"]) {
    if (typeof value[key] !== "number" || (value[key] as number) < 0) {
      errors.push(at(`${key} must be a non-negative number`));
    }
  }
  if (!Array.isArray(value.topScorelines)) errors.push(at("topScorelines must be an array"));
  if (typeof value.archived !== "boolean") errors.push(at("archived must be a boolean"));
  if (typeof value.capturedBeforeCompletion !== "boolean") {
    errors.push(at("capturedBeforeCompletion must be a boolean"));
  }

  // W/D/L sum within rounding tolerance
  if (isProb(value.homeWin) && isProb(value.draw) && isProb(value.awayWin)) {
    const sum = (value.homeWin as number) + (value.draw as number) + (value.awayWin as number);
    if (Math.abs(sum - 1) > FORECAST_PROB_SUM_TOLERANCE) {
      errors.push(at(`homeWin+draw+awayWin must be ~1 (got ${sum.toFixed(4)})`));
    }
  }

  // stage vs advancement rule
  const isGroup = value.stage === "group";
  const hasAdvFields =
    value.homeAdvance !== undefined ||
    value.awayAdvance !== undefined ||
    value.advancementBasis !== undefined;
  if (isGroup) {
    if (hasAdvFields) {
      errors.push(at("group entries must NOT include homeAdvance/awayAdvance/advancementBasis"));
    }
  } else {
    if (!isProb(value.homeAdvance) || !isProb(value.awayAdvance)) {
      errors.push(at("knockout entries must include homeAdvance/awayAdvance probabilities"));
    } else {
      const advSum = (value.homeAdvance as number) + (value.awayAdvance as number);
      if (Math.abs(advSum - 1) > FORECAST_PROB_SUM_TOLERANCE) {
        errors.push(at(`homeAdvance+awayAdvance must be ~1 (got ${advSum.toFixed(4)})`));
      }
    }
    if (typeof value.advancementBasis !== "string") {
      errors.push(at("knockout entries must include advancementBasis"));
    }
  }

  // hindsight / provenance rule
  const provenance = value.forecastProvenance;
  if (provenance !== "archived-pre-match-forecast" && provenance !== "retrospective-model-forecast") {
    errors.push(at("forecastProvenance must be archived-pre-match-forecast or retrospective-model-forecast"));
  }
  if (provenance === "archived-pre-match-forecast" && value.capturedBeforeCompletion !== true) {
    errors.push(at("archived-pre-match-forecast requires capturedBeforeCompletion=true"));
  }
  if (value.archived === true && value.capturedBeforeCompletion === false && provenance !== "retrospective-model-forecast") {
    errors.push(at("an archived forecast not captured before completion must be retrospective-model-forecast"));
  }
  return errors;
}

/** Validate a public-safe match-forecasts object. [] = valid. */
export function validateMatchForecasts(value: unknown): string[] {
  const errors: string[] = [];
  if (!isObject(value)) return ["match-forecasts must be an object"];

  if (value.schemaVersion !== FORECAST_PUBLIC_SAFE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be "${FORECAST_PUBLIC_SAFE_SCHEMA_VERSION}"`);
  }
  if (typeof value.generatedAt !== "string") errors.push("generatedAt must be a string");
  for (const key of ["sourceLiveStateAsOf", "sourceLiveStateGeneratedAt", "sourceLiveStateObjectPath"]) {
    const v = value[key];
    if (v !== null && typeof v !== "string") errors.push(`${key} must be a string or null`);
  }
  if (!isPolicy(value.publicSourcePolicy)) {
    errors.push(`publicSourcePolicy must be one of ${FORECAST_PUBLIC_SOURCE_POLICIES.join(", ")}`);
  }
  validateAttribution(value.attribution, errors);

  if (!Array.isArray(value.matchForecasts)) {
    errors.push("matchForecasts must be an array");
  } else {
    value.matchForecasts.forEach((e, i) => errors.push(...validateMatchForecastEntry(e, i)));
  }

  if (findForecastForbiddenSubstrings(JSON.stringify(value)).length > 0) {
    errors.push("match-forecasts contains forbidden/private substrings");
  }
  return errors;
}

// --------------------------------------------------------------------------
// Loaders (writer path: throw on invalid) + guards (reader path: never throw)
// --------------------------------------------------------------------------

export function loadForecastCurrent(raw: string | unknown): PublicSafeForecastCurrent {
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  const errors = validateForecastCurrent(value);
  if (errors.length > 0) {
    throw new Error(`Invalid forecast-current:\n- ${errors.join("\n- ")}`);
  }
  return value as PublicSafeForecastCurrent;
}

export function loadMatchForecasts(raw: string | unknown): PublicSafeMatchForecasts {
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  const errors = validateMatchForecasts(value);
  if (errors.length > 0) {
    throw new Error(`Invalid match-forecasts:\n- ${errors.join("\n- ")}`);
  }
  return value as PublicSafeMatchForecasts;
}

export function isPublicSafeForecastCurrent(value: unknown): value is PublicSafeForecastCurrent {
  return validateForecastCurrent(value).length === 0;
}

export function isPublicSafeMatchForecasts(value: unknown): value is PublicSafeMatchForecasts {
  return validateMatchForecasts(value).length === 0;
}
