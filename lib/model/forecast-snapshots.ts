/**
 * Forecast snapshot foundation (Phase 1.29, PR-1)
 * ----------------------------------------------
 * Deterministic, public-safe artifact layer for *forecast outputs over time*.
 * This is NOT live-ingestion storage: a snapshot contains only model-facing
 * probabilities + auditable metadata, never provider data, tokens or raw
 * live-state.
 *
 * PR-1 scope: types/schema, manifest shape, validators, a loader, and a pure
 * baseline builder. It does NOT introduce `lockedResults`, a results ledger,
 * deltas, or any committed snapshot artifact (those are later PRs). The builder
 * wraps the existing deterministic `SimulationSnapshot` rather than inventing a
 * parallel engine, and takes `generatedAt` as an explicit input so generation
 * is fully reproducible (the simulator's wall-clock `generatedAt` is discarded
 * here — see `buildBaselineForecastSnapshot`).
 *
 * Determinism note: `runTournamentSimulation` is deterministic for a given
 * (seed, iterations) pair except for its wall-clock `generatedAt`. We therefore
 * accept `generatedAt` as a caller-supplied value so committed artifacts and
 * tests are byte-stable. (Chosen over mutating the simulator, which is a
 * non-goal for this PR.)
 */
import { fixtures, teams } from "@/lib/data";
import { MODEL_WEIGHTS, SIMULATION_CONFIG } from "@/lib/model/config";
import { runTournamentSimulation } from "@/lib/simulation/tournament";

export const FORECAST_SNAPSHOT_SCHEMA_VERSION = "1.0.0";

/** Number of teams in the tournament (sanity invariant for every snapshot). */
export const FORECAST_SNAPSHOT_TEAM_COUNT = 48;

/** Probability metrics carried per team in a snapshot (all in [0,1]). */
export const FORECAST_PROBABILITY_KEYS = [
  "winner",
  "final",
  "semiFinal",
  "quarterFinal",
  "roundOf16",
  "roundOf32",
  "qualifyTop2",
  "qualifyThird",
] as const;
export type ForecastProbabilityKey = (typeof FORECAST_PROBABILITY_KEYS)[number];

export type ForecastSnapshotType =
  | "baseline"
  | "post-match"
  | "post-matchday"
  | "manual";

export const FORECAST_SNAPSHOT_TYPES: readonly ForecastSnapshotType[] = [
  "baseline",
  "post-match",
  "post-matchday",
  "manual",
] as const;

/** Auditable provenance for a snapshot — public-safe only (no secrets). */
export interface ForecastSnapshotMeta {
  schemaVersion: string;
  snapshotId: string;
  snapshotType: ForecastSnapshotType;
  /** ISO date/time the tournament state this snapshot represents is "as of". */
  asOf: string;
  /** ISO timestamp the artifact was generated (caller-supplied; deterministic). */
  generatedAt: string;
  /** The model weights in force when generated (public, no secrets). */
  weightsSummary: Record<string, number>;
  /** Stable hash of `weightsSummary` for quick drift detection. */
  modelConfigHash: string;
  /** Stable version tag for the team dataset. */
  dataVersion: string;
  /** Stable version tag for the fixture schedule. */
  fixtureVersion: string;
  /** Source of completed-result locking; null for a pure pre-tournament baseline. */
  liveStateSource: string | null;
  /** "As of" time of the live-state used for locking, if any. */
  liveStateAsOf: string | null;
  /** Completed matches locked into the simulation (0 for a baseline). */
  completedMatchesLocked: number;
  simulationIterations: number;
  seed: number;
  notes: string;
}

/** Per-team forecast probabilities (all metrics in [0,1]). */
export interface ForecastTeamProbabilities {
  teamId: string;
  /** 1-based rank by winner probability (descending). */
  rank: number;
  winner: number;
  final: number;
  semiFinal: number;
  quarterFinal: number;
  roundOf16: number;
  roundOf32: number;
  qualifyTop2: number;
  qualifyThird: number;
}

/** A committed (or in-memory) forecast snapshot artifact. */
export interface ForecastSnapshot {
  meta: ForecastSnapshotMeta;
  teams: ForecastTeamProbabilities[];
}

/** One row in the snapshot manifest (the index of committed snapshots). */
export interface ForecastManifestEntry {
  snapshotId: string;
  file: string;
  snapshotType: ForecastSnapshotType;
  asOf: string;
  label: string;
  completedMatchesLocked: number;
  isBaseline: boolean;
  previousSnapshotId: string | null;
  notes: string;
}

/** The manifest indexing committed snapshots (empty until PR-2+). */
export interface ForecastManifest {
  schemaVersion: string;
  snapshots: ForecastManifestEntry[];
}

/**
 * Substrings that must never appear in a serialized snapshot/manifest — guards
 * against leaking provider/private data. Mirrors the live-compare leak tests.
 */
export const FORBIDDEN_SNAPSHOT_SUBSTRINGS = [
  "providerId",
  "providerMatchId",
  "providerTeamId",
  "x-auth-token",
  "authorization",
  "football_data_token",
  "blob_read_write_token",
  "vercel-storage",
  "blob.vercel-storage",
  "crest",
  "odds",
  "referee",
] as const;

/** Deterministic, dependency-free FNV-1a 32-bit hash (stable across runtimes). */
function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Stable version tag for the team dataset (changes when team data changes). */
export function computeDataVersion(): string {
  const basis = teams
    .map((t) => `${t.id}:${t.elo}:${t.fifaRanking}:${t.group}`)
    .sort()
    .join("|");
  return `td-${stableHash(basis)}`;
}

/** Stable version tag for the fixture schedule (changes when fixtures change). */
export function computeFixtureVersion(): string {
  const basis = fixtures
    .map((f) => `${f.id}:${f.homeTeamId}:${f.awayTeamId}:${f.group}`)
    .sort()
    .join("|");
  return `fx-${stableHash(basis)}`;
}

/** Stable hash of the model weights summary. */
export function computeModelConfigHash(weightsSummary: Record<string, number>): string {
  const basis = Object.keys(weightsSummary)
    .sort()
    .map((k) => `${k}=${weightsSummary[k]}`)
    .join(";");
  return `mw-${stableHash(basis)}`;
}

export interface BuildBaselineOptions {
  /** Required for deterministic output (committed artifacts + tests). */
  generatedAt: string;
  /** ISO date the baseline represents. Defaults to the model cutoff. */
  asOf?: string;
  /** Explicit snapshot id. Defaults to `baseline-<asOf-date>.pre-tournament`. */
  snapshotId?: string;
  seed?: number;
  iterations?: number;
  notes?: string;
}

/** Default "as of" date for the pre-tournament baseline (model cutoff). */
export const BASELINE_AS_OF = "2026-06-11";

/**
 * Build a deterministic pre-tournament baseline forecast snapshot. Wraps
 * `runTournamentSimulation` (no completed-result locking) and replaces the
 * simulator's wall-clock timestamp with the caller-supplied `generatedAt`.
 */
export function buildBaselineForecastSnapshot(
  options: BuildBaselineOptions,
): ForecastSnapshot {
  const seed = options.seed ?? SIMULATION_CONFIG.defaultSeed;
  const iterations = options.iterations ?? SIMULATION_CONFIG.defaultIterations;
  const asOf = options.asOf ?? BASELINE_AS_OF;
  const snapshotId =
    options.snapshotId ?? `baseline-${asOf}.pre-tournament`;

  const sim = runTournamentSimulation({ seed, iterations });

  const weightsSummary: Record<string, number> = { ...MODEL_WEIGHTS };

  const meta: ForecastSnapshotMeta = {
    schemaVersion: FORECAST_SNAPSHOT_SCHEMA_VERSION,
    snapshotId,
    snapshotType: "baseline",
    asOf,
    generatedAt: options.generatedAt,
    weightsSummary,
    modelConfigHash: computeModelConfigHash(weightsSummary),
    dataVersion: computeDataVersion(),
    fixtureVersion: computeFixtureVersion(),
    liveStateSource: null,
    liveStateAsOf: null,
    completedMatchesLocked: 0,
    simulationIterations: iterations,
    seed,
    notes: options.notes ?? "Pre-tournament baseline; no completed results locked.",
  };

  const ranked = [...sim.stageProbabilities].sort((a, b) => b.winner - a.winner);
  const snapshotTeams: ForecastTeamProbabilities[] = ranked.map((p, i) => ({
    teamId: p.teamId,
    rank: i + 1,
    winner: p.winner,
    final: p.final,
    semiFinal: p.semiFinal,
    quarterFinal: p.quarterFinal,
    roundOf16: p.roundOf16,
    roundOf32: p.roundOf32,
    qualifyTop2: p.qualifyTop2,
    qualifyThird: p.qualifyThird,
  }));

  return { meta, teams: snapshotTeams };
}

/** An empty, schema-valid manifest (used to seed `manifest.json`). */
export function emptyForecastManifest(): ForecastManifest {
  return { schemaVersion: FORECAST_SNAPSHOT_SCHEMA_VERSION, snapshots: [] };
}

// ---------------------------------------------------------------------------
// Validation / loading
// ---------------------------------------------------------------------------

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function isProbability(v: unknown): v is number {
  return isFiniteNumber(v) && v >= 0 && v <= 1;
}
function isString(v: unknown): v is string {
  return typeof v === "string";
}

/** Validate a forecast snapshot. Returns a list of human-readable errors ([] = valid). */
export function validateForecastSnapshot(value: unknown): string[] {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) {
    return ["snapshot is not an object"];
  }
  const snap = value as Partial<ForecastSnapshot>;
  const meta = snap.meta;
  if (typeof meta !== "object" || meta === null) {
    errors.push("meta is missing or not an object");
  } else {
    const m = meta as Partial<ForecastSnapshotMeta>;
    if (m.schemaVersion !== FORECAST_SNAPSHOT_SCHEMA_VERSION)
      errors.push(`meta.schemaVersion must be ${FORECAST_SNAPSHOT_SCHEMA_VERSION}`);
    if (!isString(m.snapshotId) || m.snapshotId.length === 0)
      errors.push("meta.snapshotId must be a non-empty string");
    if (!m.snapshotType || !FORECAST_SNAPSHOT_TYPES.includes(m.snapshotType))
      errors.push("meta.snapshotType is invalid");
    for (const k of ["asOf", "generatedAt", "dataVersion", "fixtureVersion", "modelConfigHash", "notes"] as const) {
      if (!isString(m[k])) errors.push(`meta.${k} must be a string`);
    }
    if (m.liveStateSource !== null && !isString(m.liveStateSource))
      errors.push("meta.liveStateSource must be a string or null");
    if (m.liveStateAsOf !== null && !isString(m.liveStateAsOf))
      errors.push("meta.liveStateAsOf must be a string or null");
    if (!isFiniteNumber(m.completedMatchesLocked) || m.completedMatchesLocked! < 0)
      errors.push("meta.completedMatchesLocked must be a non-negative number");
    if (!isFiniteNumber(m.simulationIterations) || m.simulationIterations! <= 0)
      errors.push("meta.simulationIterations must be a positive number");
    if (!isFiniteNumber(m.seed)) errors.push("meta.seed must be a number");
    if (typeof m.weightsSummary !== "object" || m.weightsSummary === null)
      errors.push("meta.weightsSummary must be an object");
  }

  const teamRows = snap.teams;
  if (!Array.isArray(teamRows)) {
    errors.push("teams must be an array");
  } else {
    if (teamRows.length !== FORECAST_SNAPSHOT_TEAM_COUNT)
      errors.push(`teams must have ${FORECAST_SNAPSHOT_TEAM_COUNT} entries (got ${teamRows.length})`);
    const seen = new Set<string>();
    teamRows.forEach((t, i) => {
      if (typeof t !== "object" || t === null) {
        errors.push(`teams[${i}] is not an object`);
        return;
      }
      const row = t as Partial<ForecastTeamProbabilities>;
      if (!isString(row.teamId) || row.teamId.length === 0)
        errors.push(`teams[${i}].teamId must be a non-empty string`);
      else if (seen.has(row.teamId)) errors.push(`teams[${i}].teamId duplicated: ${row.teamId}`);
      else seen.add(row.teamId);
      if (!isFiniteNumber(row.rank) || row.rank! < 1)
        errors.push(`teams[${i}].rank must be a positive number`);
      for (const key of FORECAST_PROBABILITY_KEYS) {
        if (!isProbability(row[key]))
          errors.push(`teams[${i}].${key} must be a number in [0,1]`);
      }
    });
  }
  return errors;
}

/** Validate a forecast manifest. Returns a list of errors ([] = valid). */
export function validateForecastManifest(value: unknown): string[] {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) return ["manifest is not an object"];
  const man = value as Partial<ForecastManifest>;
  if (man.schemaVersion !== FORECAST_SNAPSHOT_SCHEMA_VERSION)
    errors.push(`schemaVersion must be ${FORECAST_SNAPSHOT_SCHEMA_VERSION}`);
  if (!Array.isArray(man.snapshots)) {
    errors.push("snapshots must be an array");
    return errors;
  }
  man.snapshots.forEach((e, i) => {
    if (typeof e !== "object" || e === null) {
      errors.push(`snapshots[${i}] is not an object`);
      return;
    }
    const entry = e as Partial<ForecastManifestEntry>;
    for (const k of ["snapshotId", "file", "asOf", "label", "notes"] as const) {
      if (!isString(entry[k])) errors.push(`snapshots[${i}].${k} must be a string`);
    }
    if (!entry.snapshotType || !FORECAST_SNAPSHOT_TYPES.includes(entry.snapshotType))
      errors.push(`snapshots[${i}].snapshotType is invalid`);
    if (typeof entry.isBaseline !== "boolean")
      errors.push(`snapshots[${i}].isBaseline must be a boolean`);
    if (!isFiniteNumber(entry.completedMatchesLocked) || entry.completedMatchesLocked! < 0)
      errors.push(`snapshots[${i}].completedMatchesLocked must be a non-negative number`);
    if (entry.previousSnapshotId !== null && !isString(entry.previousSnapshotId))
      errors.push(`snapshots[${i}].previousSnapshotId must be a string or null`);
  });
  return errors;
}

/** Parse + validate a snapshot from JSON text or an object. Throws on invalid input. */
export function loadForecastSnapshot(raw: string | unknown): ForecastSnapshot {
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  const errors = validateForecastSnapshot(value);
  if (errors.length > 0) {
    throw new Error(`Invalid forecast snapshot:\n- ${errors.join("\n- ")}`);
  }
  return value as ForecastSnapshot;
}

/** Parse + validate a manifest from JSON text or an object. Throws on invalid input. */
export function loadForecastManifest(raw: string | unknown): ForecastManifest {
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  const errors = validateForecastManifest(value);
  if (errors.length > 0) {
    throw new Error(`Invalid forecast manifest:\n- ${errors.join("\n- ")}`);
  }
  return value as ForecastManifest;
}

/** Forbidden substrings found in a serialized payload (case-insensitive). [] = clean. */
export function findForbiddenSubstrings(serialized: string): string[] {
  const haystack = serialized.toLowerCase();
  return FORBIDDEN_SNAPSHOT_SUBSTRINGS.filter((s) => haystack.includes(s.toLowerCase()));
}

/** Throw if a snapshot/manifest serializes to anything containing forbidden data. */
export function assertNoForbiddenData(value: unknown): void {
  const hits = findForbiddenSubstrings(JSON.stringify(value));
  if (hits.length > 0) {
    throw new Error(`Forecast artifact contains forbidden data: ${hits.join(", ")}`);
  }
}
