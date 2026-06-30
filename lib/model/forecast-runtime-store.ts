/**
 * Forecast runtime read store (Phase 1.30, PR-83E2) — SERVER-ONLY
 * --------------------------------------------------------------
 * Additive, server-side read helpers that future UX can consume. They compose
 * three existing layers WITHOUT changing any of them:
 *   - the private-Blob readers (`forecast-blob-store.ts`, never throw),
 *   - the public-safe converter/validators (`forecast-public-safe.ts`), and
 *   - the committed snapshot store + pure delta selectors (PR-82).
 *
 * The runtime "current" forecast prefers the rolling Blob object and falls back
 * to the committed chain tail; baseline-vs-current comparison/movers reuse the
 * PR-82 selectors verbatim; match lookups read the Blob match-forecasts object and
 * classify each entry by provenance. No new probability math, no new validation.
 *
 * SERVER-ONLY: do not import this from a client component. It is build-safe (it
 * does no fs/fetch itself and the real Blob SDK is dynamically imported deep inside
 * `forecast-blob-store`), but it is intended for server components / route handlers
 * / scripts only. Isolation tests assert no `"use client"` file imports it and that
 * it imports nothing from live-state/live-ingest/provider/football-data/simulation
 * or app/components.
 *
 * Reads NEVER throw for ordinary Blob problems (missing-blob-token / not-found /
 * invalid-shape / blob-read-error): they return null / a committed fallback / a
 * policy carrying a machine error code. No tokens, Blob URLs, or raw payloads are
 * ever returned.
 *
 * Deferred to a future PR (documented intentionally): a runtime snapshot timeline
 * (the committed `getSnapshotTimeline()` already covers milestone history; the Blob
 * current is a single rolling point) and a team-pair match lookup (matchNumber is
 * the canonical, unambiguous key).
 */
import {
  FORECAST_CURRENT_OBJECT_PATH,
  FORECAST_MATCHES_OBJECT_PATH,
  getPublicSafeForecastCurrentFromBlob,
  getPublicSafeMatchForecastsFromBlob,
  type ForecastBlobStore,
  type ForecastLoadError,
} from "@/lib/model/forecast-blob-store";
import {
  forecastCurrentToSnapshot,
  validateMatchForecasts,
  type PublicSafeMatchForecastEntry,
  type PublicSafeMatchForecasts,
} from "@/lib/model/forecast-public-safe";
import {
  compareForecastSnapshots,
  getBiggestForecastMovers,
  type BiggestMoversOptions,
  type CurrentSnapshotPolicy,
  type ForecastComparison,
  type ForecastMoversResult,
} from "@/lib/model/forecast-deltas";
import {
  getBaselineSnapshot,
  getCurrentForecastSnapshot,
  getCurrentSnapshotPolicy,
} from "@/lib/model/forecast-snapshot-store";
import type { ForecastSnapshot } from "@/lib/model/forecast-snapshots";

// --------------------------------------------------------------------------
// Committed-store seam (defaults to the real PR-82 store; injectable in tests)
// --------------------------------------------------------------------------

export interface RuntimeCommittedForecastStore {
  getBaselineSnapshot: () => ForecastSnapshot | null;
  getCurrentForecastSnapshot: () => ForecastSnapshot | null;
  getCurrentSnapshotPolicy: () => CurrentSnapshotPolicy;
}

const DEFAULT_COMMITTED_STORE: RuntimeCommittedForecastStore = {
  getBaselineSnapshot,
  getCurrentForecastSnapshot,
  getCurrentSnapshotPolicy,
};

// --------------------------------------------------------------------------
// Options + result types
// --------------------------------------------------------------------------

export interface RuntimeForecastOptions {
  /** Injected Blob store for the forecast-current object (tests / alt backends). */
  currentStore?: ForecastBlobStore;
  /** Injected Blob store for the forecast-matches object. */
  matchesStore?: ForecastBlobStore;
  /** Object path for forecast-current (defaults to the PR-83B constant). */
  currentObjectPath?: string;
  /** Object path for forecast-matches (defaults to the PR-83B constant). */
  matchesObjectPath?: string;
  /** `BLOB_READ_WRITE_TOKEN`; passed to the readers, never logged or returned. */
  token?: string;
  /** Injected committed store (defaults to the real PR-82 committed store). */
  committedStore?: RuntimeCommittedForecastStore;
  /**
   * Match-forecasts override:
   *   - undefined → read the forecast-matches Blob;
   *   - null      → treat as unavailable, do NOT read;
   *   - object    → validated via `validateMatchForecasts` before use (invalid ⇒
   *                 treated as unavailable, never thrown).
   */
  preloadedMatches?: PublicSafeMatchForecasts | null;
}

export type RuntimeForecastSource = "blob" | "committed-fallback" | "unavailable";

export type RuntimeForecastWarningCode =
  | "blob-current-unavailable"
  | "blob-current-invalid"
  | "committed-current-unavailable"
  | "baseline-unavailable"
  | "matches-unavailable";

export interface RuntimeForecastWarning {
  code: RuntimeForecastWarningCode;
  /** Operator-safe detail: machine codes only, never a token / URL / payload. */
  detail: string;
}

export interface RuntimeCurrentSnapshotPolicy {
  currentSource: RuntimeForecastSource;
  currentSnapshotId: string | null;
  baselineSnapshotId: string | null;
  blobError?: ForecastLoadError;
  /** PR-82 committed policy embedded verbatim (its type is NOT mutated). */
  committedPolicy: CurrentSnapshotPolicy;
  warnings: RuntimeForecastWarning[];
}

export type RuntimeMatchForecastStatus =
  | "current-pre-match"
  | "archived-pre-match"
  | "retrospective"
  | "missing"
  | "unavailable";

export interface RuntimeMatchForecastResult {
  matchNumber: number;
  /** false ⇒ the match-forecasts object was missing/unreadable/invalid. */
  matchesAvailable: boolean;
  entry: PublicSafeMatchForecastEntry | null;
  status: RuntimeMatchForecastStatus;
  isTruePreMatchForecast: boolean;
  isRetrospective: boolean;
}

// --------------------------------------------------------------------------
// Internal: resolve the runtime current snapshot (Blob → committed fallback)
// --------------------------------------------------------------------------

interface ResolvedRuntimeCurrent {
  snapshot: ForecastSnapshot | null;
  source: RuntimeForecastSource;
  snapshotId: string | null;
  blobError?: ForecastLoadError;
  warnings: RuntimeForecastWarning[];
}

async function resolveRuntimeCurrent(options: RuntimeForecastOptions): Promise<ResolvedRuntimeCurrent> {
  const committed = options.committedStore ?? DEFAULT_COMMITTED_STORE;
  const warnings: RuntimeForecastWarning[] = [];

  const blob = await getPublicSafeForecastCurrentFromBlob({
    store: options.currentStore,
    objectPath: options.currentObjectPath ?? FORECAST_CURRENT_OBJECT_PATH,
    token: options.token,
  });

  if (blob.ok && blob.value) {
    return {
      snapshot: forecastCurrentToSnapshot(blob.value),
      source: "blob",
      snapshotId: blob.value.snapshotId,
      warnings,
    };
  }

  const blobError = blob.error;
  warnings.push({
    code: blobError === "invalid-shape" ? "blob-current-invalid" : "blob-current-unavailable",
    detail: `forecast-current Blob unavailable (${blobError ?? "unknown"})`,
  });

  const committedCurrent = committed.getCurrentForecastSnapshot();
  if (committedCurrent) {
    return {
      snapshot: committedCurrent,
      source: "committed-fallback",
      snapshotId: committedCurrent.meta.snapshotId,
      blobError,
      warnings,
    };
  }

  warnings.push({
    code: "committed-current-unavailable",
    detail: "no committed current forecast snapshot available",
  });
  return { snapshot: null, source: "unavailable", snapshotId: null, blobError, warnings };
}

// --------------------------------------------------------------------------
// Runtime current forecast + policy
// --------------------------------------------------------------------------

/**
 * The current runtime tournament forecast: the rolling Blob current converted to a
 * `ForecastSnapshot`, else the committed chain tail, else null. Never throws.
 */
export async function getRuntimeCurrentForecastSnapshot(
  options: RuntimeForecastOptions = {},
): Promise<ForecastSnapshot | null> {
  return (await resolveRuntimeCurrent(options)).snapshot;
}

/**
 * Structured runtime current policy: which source was used, the resolved snapshot
 * id, the committed baseline id, any Blob error code, the embedded committed policy,
 * and warnings. Does NOT mutate the PR-82 committed policy/type.
 */
export async function getRuntimeCurrentSnapshotPolicy(
  options: RuntimeForecastOptions = {},
): Promise<RuntimeCurrentSnapshotPolicy> {
  const committed = options.committedStore ?? DEFAULT_COMMITTED_STORE;
  const committedPolicy = committed.getCurrentSnapshotPolicy();
  const resolved = await resolveRuntimeCurrent(options);

  const warnings = [...resolved.warnings];
  if (committedPolicy.baselineSnapshotId == null) {
    warnings.push({ code: "baseline-unavailable", detail: "no committed baseline snapshot available" });
  }

  const policy: RuntimeCurrentSnapshotPolicy = {
    currentSource: resolved.source,
    currentSnapshotId: resolved.snapshotId,
    baselineSnapshotId: committedPolicy.baselineSnapshotId,
    committedPolicy,
    warnings,
  };
  if (resolved.blobError !== undefined) policy.blobError = resolved.blobError;
  return policy;
}

// --------------------------------------------------------------------------
// Runtime baseline-vs-current comparison + movers
// --------------------------------------------------------------------------

/**
 * Comparison of the committed baseline vs the runtime current. Returns null when
 * either side is unavailable (source/warning detail lives in the runtime policy).
 */
export async function getRuntimeCurrentVsBaselineComparison(
  options: RuntimeForecastOptions = {},
): Promise<ForecastComparison | null> {
  const committed = options.committedStore ?? DEFAULT_COMMITTED_STORE;
  const baseline = committed.getBaselineSnapshot();
  const current = (await resolveRuntimeCurrent(options)).snapshot;
  if (!baseline || !current) return null;
  return compareForecastSnapshots(baseline, current);
}

function emptyMoversResult(moversOptions: BiggestMoversOptions): ForecastMoversResult {
  const stage = moversOptions.stage ?? "winner";
  const mode = moversOptions.mode ?? "signed";
  return mode === "absolute"
    ? { stage, mode, movers: [] }
    : { stage, mode, risers: [], fallers: [] };
}

/**
 * Biggest movers from the committed baseline to the runtime current. Returns an
 * empty result (with the requested/default stage + mode) when either side is
 * unavailable. PR-82 defaults preserved: stage "winner", mode "signed", topN 5,
 * includeZeroProbabilityTeams false.
 */
export async function getRuntimeCurrentVsBaselineMovers(
  options: { runtime?: RuntimeForecastOptions; movers?: BiggestMoversOptions } = {},
): Promise<ForecastMoversResult> {
  const runtime = options.runtime ?? {};
  const moversOptions = options.movers ?? {};
  const committed = runtime.committedStore ?? DEFAULT_COMMITTED_STORE;
  const baseline = committed.getBaselineSnapshot();
  const current = (await resolveRuntimeCurrent(runtime)).snapshot;
  if (!baseline || !current) return emptyMoversResult(moversOptions);
  return getBiggestForecastMovers(baseline, current, moversOptions);
}

// --------------------------------------------------------------------------
// Runtime match forecasts
// --------------------------------------------------------------------------

/**
 * The runtime match-forecasts object (Blob, or a validated `preloadedMatches`
 * override). Returns null when unavailable/missing/invalid. Never throws.
 */
export async function getRuntimeMatchForecasts(
  options: RuntimeForecastOptions = {},
): Promise<PublicSafeMatchForecasts | null> {
  if (options.preloadedMatches === null) return null; // explicit "unavailable"; do not read
  if (options.preloadedMatches !== undefined) {
    return validateMatchForecasts(options.preloadedMatches).length === 0 ? options.preloadedMatches : null;
  }
  const result = await getPublicSafeMatchForecastsFromBlob({
    store: options.matchesStore,
    objectPath: options.matchesObjectPath ?? FORECAST_MATCHES_OBJECT_PATH,
    token: options.token,
  });
  return result.ok && result.value ? result.value : null;
}

/**
 * Look up the forecast for a single match by matchNumber, classified strictly by
 * provenance. Distinguishes object-unavailable from entry-missing and never invents
 * a forecast for a completed match. A retrospective is NEVER a true pre-match
 * forecast. Never throws.
 */
export async function getRuntimeMatchForecast(
  matchNumber: number,
  options: RuntimeForecastOptions = {},
): Promise<RuntimeMatchForecastResult> {
  const matches = await getRuntimeMatchForecasts(options);
  if (!matches) {
    return {
      matchNumber,
      matchesAvailable: false,
      entry: null,
      status: "unavailable",
      isTruePreMatchForecast: false,
      isRetrospective: false,
    };
  }

  const entry = matches.matchForecasts.find((e) => e.matchNumber === matchNumber) ?? null;
  if (!entry) {
    return {
      matchNumber,
      matchesAvailable: true,
      entry: null,
      status: "missing",
      isTruePreMatchForecast: false,
      isRetrospective: false,
    };
  }

  const isRetrospective = entry.forecastProvenance === "retrospective-model-forecast";
  const status: RuntimeMatchForecastStatus =
    entry.forecastProvenance === "current-pre-match-forecast"
      ? "current-pre-match"
      : entry.forecastProvenance === "archived-pre-match-forecast"
        ? "archived-pre-match"
        : "retrospective";

  return {
    matchNumber,
    matchesAvailable: true,
    entry,
    status,
    isTruePreMatchForecast: !isRetrospective,
    isRetrospective,
  };
}
