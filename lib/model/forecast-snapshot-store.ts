/**
 * Forecast snapshot store (Phase 1.30, PR-82) — SERVER-ONLY
 * --------------------------------------------------------
 * Resolves the committed forecast snapshots into baseline / current / timeline
 * and feeds the pure selectors in `forecast-deltas.ts`. This is the only forecast
 * module that touches the committed artifact files.
 *
 * SERVER-ONLY: do not import this from a client component. It is build-safe in any
 * environment because it reads snapshots via **static JSON imports** (no fs, no
 * process.env, no fetch) — but it is intended for server components / route
 * handlers / scripts only. An isolation test asserts no `"use client"` file
 * imports it.
 *
 * Fail-safe: never throws in a render path. A malformed manifest, a missing
 * snapshot file, or a malformed snapshot degrades to a `CurrentSnapshotPolicy`
 * carrying machine-readable warning codes; selectors return empty/null.
 *
 * `teamName` enrichment is intentionally NOT done here (kept out to avoid coupling
 * to the team registry); the optional `teamName` fields stay undefined and the UI
 * resolves display names via its existing `getTeam` path.
 */
import {
  loadForecastManifest,
  loadForecastSnapshot,
  type ForecastManifest,
  type ForecastManifestEntry,
  type ForecastSnapshot,
} from "@/lib/model/forecast-snapshots";
import {
  buildStageForecastTrajectory,
  buildTeamForecastTrajectory,
  getBiggestForecastMovers,
  resolveManifestChain,
  summariseSnapshot,
  type BiggestMoversOptions,
  type CurrentSnapshotPolicy,
  type ForecastManifestWarning,
  type ForecastMoversResult,
  type ForecastSnapshotTimelineEntry,
  type ForecastStageKey,
  type StageForecastTrajectory,
  type TeamForecastTrajectory,
} from "@/lib/model/forecast-deltas";

// Static JSON imports of the committed artifacts (build-safe, no fs).
import manifestJson from "@/data/forecast/snapshots/manifest.json";
import baselineSnapshot from "@/data/forecast/snapshots/baseline-2026-06-11.pre-tournament.json";
import snapshot054 from "@/data/forecast/snapshots/snapshot-2026-06-25-after-match-054.json";
import snapshot072 from "@/data/forecast/snapshots/snapshot-2026-06-29-after-match-072.json";
import snapshot073 from "@/data/forecast/snapshots/snapshot-2026-06-29-after-match-073.json";

/** filename -> raw snapshot JSON. Keyed by the manifest entry `file`. */
export type SnapshotRegistry = Map<string, unknown>;

/** The committed registry. New committed snapshots must be added here (a test enforces it). */
export const COMMITTED_SNAPSHOT_REGISTRY: SnapshotRegistry = new Map<string, unknown>([
  ["baseline-2026-06-11.pre-tournament.json", baselineSnapshot],
  ["snapshot-2026-06-25-after-match-054.json", snapshot054],
  ["snapshot-2026-06-29-after-match-072.json", snapshot072],
  ["snapshot-2026-06-29-after-match-073.json", snapshot073],
]);

/** Resolved, validated forecast data (the unit the public getters delegate to). */
export interface LoadedForecastData {
  manifest: ForecastManifest | null;
  policy: CurrentSnapshotPolicy;
  /** snapshotId -> successfully loaded snapshot. */
  byId: Map<string, ForecastSnapshot>;
  /** snapshotId -> manifest entry. */
  entryById: Map<string, ForecastManifestEntry>;
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message.split("\n")[0] ?? e.message : String(e);
}

function unavailablePolicy(warnings: ForecastManifestWarning[]): CurrentSnapshotPolicy {
  return {
    baselineSnapshotId: null,
    currentSnapshotId: null,
    selectionMode: "unavailable",
    chainIds: [],
    isValidChain: false,
    available: false,
    warnings,
  };
}

/**
 * Resolve forecast data from a raw manifest + an injected snapshot registry.
 * Pure with respect to the injected inputs (no fs); never throws. Exposed so the
 * file-load fail-safe (`missing-snapshot-file` / `malformed-snapshot`) is testable
 * with crafted inputs.
 */
export function loadForecastData(
  manifestRaw: unknown,
  registry: SnapshotRegistry,
): LoadedForecastData {
  let manifest: ForecastManifest;
  try {
    manifest = loadForecastManifest(manifestRaw);
  } catch (e) {
    return {
      manifest: null,
      policy: unavailablePolicy([
        { code: "malformed-snapshot", detail: `manifest: ${errMessage(e)}` },
      ]),
      byId: new Map(),
      entryById: new Map(),
    };
  }

  const base = resolveManifestChain(manifest);
  const warnings: ForecastManifestWarning[] = [...base.warnings];
  const entryById = new Map(manifest.snapshots.map((e) => [e.snapshotId, e]));
  const byId = new Map<string, ForecastSnapshot>();

  for (const entry of manifest.snapshots) {
    const raw = registry.get(entry.file);
    if (raw === undefined) {
      warnings.push({
        code: "missing-snapshot-file",
        detail: `${entry.snapshotId} -> ${entry.file}`,
      });
      continue;
    }
    try {
      byId.set(entry.snapshotId, loadForecastSnapshot(raw));
    } catch (e) {
      warnings.push({
        code: "malformed-snapshot",
        detail: `${entry.snapshotId}: ${errMessage(e)}`,
      });
    }
  }

  const baselineLoaded = base.baselineSnapshotId
    ? byId.get(base.baselineSnapshotId)
    : undefined;
  const currentLoaded = base.currentSnapshotId
    ? byId.get(base.currentSnapshotId)
    : undefined;

  const policy: CurrentSnapshotPolicy = {
    ...base,
    warnings,
    isValidChain: warnings.length === 0,
    available: Boolean(baselineLoaded && currentLoaded),
  };

  return { manifest, policy, byId, entryById };
}

// --- memoized committed data (one resolve per server process) ---
let cached: LoadedForecastData | null = null;

function data(): LoadedForecastData {
  if (!cached) {
    cached = loadForecastData(manifestJson, COMMITTED_SNAPSHOT_REGISTRY);
  }
  return cached;
}

/** Test-only: clear the memoized resolve (no effect in production callers). */
export function __resetForecastSnapshotStoreCache(): void {
  cached = null;
}

// --------------------------------------------------------------------------
// Public getters
// --------------------------------------------------------------------------

export function getForecastSnapshotManifest(): ForecastManifest | null {
  return data().manifest;
}

export function getCurrentSnapshotPolicy(): CurrentSnapshotPolicy {
  return data().policy;
}

export function getBaselineSnapshot(): ForecastSnapshot | null {
  const { policy, byId } = data();
  return policy.baselineSnapshotId ? byId.get(policy.baselineSnapshotId) ?? null : null;
}

export function getCurrentForecastSnapshot(): ForecastSnapshot | null {
  const { policy, byId } = data();
  return policy.currentSnapshotId ? byId.get(policy.currentSnapshotId) ?? null : null;
}

/** Loaded snapshots in chain order (baseline -> current). */
export function listForecastSnapshots(): ForecastSnapshot[] {
  const { policy, byId } = data();
  const ids = policy.chainIds.length > 0 ? policy.chainIds : [...byId.keys()];
  return ids.map((id) => byId.get(id)).filter((s): s is ForecastSnapshot => Boolean(s));
}

export function getSnapshotTimeline(): ForecastSnapshotTimelineEntry[] {
  const { policy, byId, entryById } = data();
  const ids = policy.chainIds.length > 0 ? policy.chainIds : [...byId.keys()];
  const entries: ForecastSnapshotTimelineEntry[] = [];
  let index = 0;
  for (const id of ids) {
    const snap = byId.get(id);
    if (!snap) continue;
    entries.push({
      ...summariseSnapshot(snap, entryById.get(id)),
      index,
      isCurrent: id === policy.currentSnapshotId,
    });
    index += 1;
  }
  return entries;
}

export function getTeamForecastTrajectory(teamId: string): TeamForecastTrajectory {
  return buildTeamForecastTrajectory(teamId, listForecastSnapshots());
}

export function getStageForecastTrajectory(
  stage: ForecastStageKey,
): StageForecastTrajectory {
  return buildStageForecastTrajectory(stage, listForecastSnapshots());
}

/** Headline UX selector: biggest movers from baseline -> current. */
export function getCurrentVsBaselineMovers(
  options: BiggestMoversOptions = {},
): ForecastMoversResult {
  const baseline = getBaselineSnapshot();
  const current = getCurrentForecastSnapshot();
  const stage = options.stage ?? "winner";
  const mode = options.mode ?? "signed";
  if (!baseline || !current) {
    return mode === "absolute"
      ? { stage, mode, movers: [] }
      : { stage, mode, risers: [], fallers: [] };
  }
  return getBiggestForecastMovers(baseline, current, options);
}
