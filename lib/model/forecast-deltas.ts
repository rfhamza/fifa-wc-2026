/**
 * Forecast delta selectors + current-snapshot policy (Phase 1.30, PR-82)
 * ----------------------------------------------------------------------
 * A PURE, side-effect-free contract for *forecast probability movement* over the
 * committed forecast snapshots. This is forecast **probability** state (model
 * output over time), NOT live tournament state (scores/standings/bracket). It is
 * the data layer the later UX revamp consumes; it ships no UI.
 *
 * Purity contract (enforced by tests): this module has NO fs, NO process.env, NO
 * fetch, NO live-state / provider / Blob imports, NO simulation rerun, and NO
 * team-registry import. Every function takes already-loaded `ForecastSnapshot`
 * objects (or a `ForecastManifest`) and returns plain data. The file-reading and
 * any name enrichment live in the server-only `forecast-snapshot-store.ts`.
 *
 * Movement language: probability **points** (pp), never "percent change" — a
 * probability moving 27.9% -> 25.4% is "-2.5 pp", not "-9%". Raw 0..1 values are
 * preserved; UI is responsible for formatting (`pct` / `signedPct` in lib/utils).
 *
 * Terminology: a stage probability of 0 is reported as `isZeroProbabilityForStage`
 * (a Monte Carlo snapshot can show 0 because a team won 0 of N simulations, which
 * is NOT the same as being structurally eliminated). `isStructurallyEliminatedForStage`
 * is reserved (always null here) until a true structural source (e.g. joined live
 * tournament state) backs it.
 */
import { round } from "@/lib/utils";
import {
  FORECAST_PROBABILITY_KEYS,
  type ForecastManifest,
  type ForecastManifestEntry,
  type ForecastProbabilityKey,
  type ForecastSnapshot,
  type ForecastSnapshotType,
  type ForecastTeamProbabilities,
} from "@/lib/model/forecast-snapshots";

// --------------------------------------------------------------------------
// Stage keys
// --------------------------------------------------------------------------

/** A stage probability key (the 8 per-team metrics carried in a snapshot). */
export type ForecastStageKey = ForecastProbabilityKey;

/**
 * Canonical reachability order: group qualification first, then knockout rounds
 * toward the title. Drives charts, tables and stable iteration.
 */
export const FORECAST_STAGE_ORDER: readonly ForecastStageKey[] = [
  "qualifyTop2",
  "qualifyThird",
  "roundOf32",
  "roundOf16",
  "quarterFinal",
  "semiFinal",
  "final",
  "winner",
] as const;

/** True when the team's probability for `stage` is exactly 0 in the snapshot. */
export function isZeroProbabilityForStage(
  team: ForecastTeamProbabilities,
  stage: ForecastStageKey,
): boolean {
  return team[stage] === 0;
}

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

/** Lightweight, UI-friendly summary of a single snapshot. */
export interface ForecastSnapshotSummary {
  snapshotId: string;
  snapshotType: ForecastSnapshotType;
  asOf: string;
  generatedAt: string;
  label: string;
  completedMatchesLocked: number;
  isBaseline: boolean;
  previousSnapshotId: string | null;
}

/** A snapshot summary positioned within the ordered timeline. */
export interface ForecastSnapshotTimelineEntry extends ForecastSnapshotSummary {
  index: number;
  isCurrent: boolean;
}

/** Per-stage movement between two snapshots for one team. */
export interface StageDelta {
  stage: ForecastStageKey;
  /** Raw probabilities in [0,1]. */
  fromProbability: number;
  toProbability: number;
  /** `toProbability - fromProbability` in [-1,1] (probability units). */
  delta: number;
  /** `delta * 100` — probability POINTS (product language). */
  deltaPercentagePoints: number;
  /** `|delta|` in probability units. */
  absoluteDelta: number;
  /** True when `toProbability === 0` (snapshot-zero, NOT proven elimination). */
  isZeroProbabilityForStage: boolean;
  /** Set only when zero; documents why the flag is set. */
  zeroProbabilityBasis?: "snapshot-probability-zero";
  /**
   * Reserved for a future true-elimination source (e.g. joined live state).
   * Always `null` in this pure layer — never inferred from probability zero.
   */
  isStructurallyEliminatedForStage: boolean | null;
}

/** All-stage movement between two snapshots for one team. */
export interface TeamForecastDelta {
  teamId: string;
  /** Optional display name; not populated by this pure layer (see store). */
  teamName?: string;
  fromSnapshotId: string;
  toSnapshotId: string;
  fromAsOf: string;
  toAsOf: string;
  fromCompletedMatchesLocked: number;
  toCompletedMatchesLocked: number;
  /** Rank by winner probability (1 = best); null when absent from that side. */
  fromRank: number | null;
  toRank: number | null;
  /** `toRank - fromRank`; NEGATIVE = moved up toward #1. Null if either absent. */
  rankDelta: number | null;
  stages: Record<ForecastStageKey, StageDelta>;
  presentInFrom: boolean;
  presentInTo: boolean;
}

/** A flattened single-stage mover row (one stage in focus). */
export interface ForecastMover {
  teamId: string;
  teamName?: string;
  stage: ForecastStageKey;
  fromSnapshotId: string;
  toSnapshotId: string;
  fromProbability: number;
  toProbability: number;
  delta: number;
  deltaPercentagePoints: number;
  absoluteDelta: number;
  fromRank: number | null;
  toRank: number | null;
  rankDelta: number | null;
  isZeroProbabilityForStage: boolean;
  zeroProbabilityBasis?: "snapshot-probability-zero";
  isStructurallyEliminatedForStage: boolean | null;
}

export type ForecastMoversMode = "signed" | "absolute";

/** Options for `getBiggestForecastMovers` (all optional; defaults documented). */
export interface BiggestMoversOptions {
  /** Stage to rank by. Default `"winner"`. */
  stage?: ForecastStageKey;
  /** `"signed"` (default) returns risers+fallers; `"absolute"` returns one list. */
  mode?: ForecastMoversMode;
  /** Rows per list. Default `5`. */
  topN?: number;
  /** Include teams whose `toProbability === 0` for the stage. Default `false`. */
  includeZeroProbabilityTeams?: boolean;
  /** Drop teams whose `fromProbability` is below this (raw 0..1). Default `0`. */
  minFromProbability?: number;
  /** Drop teams whose `absoluteDelta` is below this (raw 0..1). Default `0`. */
  minAbsDelta?: number;
}

/** Result of `getBiggestForecastMovers`. Shape depends on `mode`. */
export interface ForecastMoversResult {
  stage: ForecastStageKey;
  mode: ForecastMoversMode;
  /** Present when `mode === "signed"`. */
  risers?: ForecastMover[];
  fallers?: ForecastMover[];
  /** Present when `mode === "absolute"`. */
  movers?: ForecastMover[];
}

/** One point in a team's probability history. */
export interface TeamForecastTrajectory {
  teamId: string;
  teamName?: string;
  points: Array<{
    snapshotId: string;
    asOf: string;
    completedMatchesLocked: number;
    rank: number | null;
    stages: Record<ForecastStageKey, number>;
  }>;
}

/** One stage's value for every team across the snapshot timeline. */
export interface StageForecastTrajectory {
  stage: ForecastStageKey;
  teams: Array<{
    teamId: string;
    teamName?: string;
    series: Array<{ snapshotId: string; asOf: string; value: number }>;
  }>;
}

/** Full pairwise comparison of two snapshots. */
export interface ForecastComparison {
  from: ForecastSnapshotSummary;
  to: ForecastSnapshotSummary;
  teamDeltas: TeamForecastDelta[];
}

// --------------------------------------------------------------------------
// Current-snapshot policy (manifest-only resolution)
// --------------------------------------------------------------------------

export type ForecastManifestWarningCode =
  | "missing-baseline"
  | "duplicate-baseline"
  | "broken-previous-snapshot-chain"
  | "current-not-highest-completed-matches"
  | "duplicate-current-candidate"
  | "missing-snapshot-file"
  | "malformed-snapshot"
  | "fallback-used";

export interface ForecastManifestWarning {
  code: ForecastManifestWarningCode;
  detail: string;
}

export type SnapshotSelectionMode =
  | "chain"
  | "highest-completed-matches"
  | "latest-asOf"
  | "baseline-fallback"
  | "unavailable";

export interface CurrentSnapshotPolicy {
  baselineSnapshotId: string | null;
  currentSnapshotId: string | null;
  selectionMode: SnapshotSelectionMode;
  chainIds: string[];
  isValidChain: boolean;
  available: boolean;
  warnings: ForecastManifestWarning[];
}

function byAsOfThenOrder(
  a: ForecastManifestEntry,
  b: ForecastManifestEntry,
  order: Map<string, number>,
): number {
  if (a.asOf !== b.asOf) return a.asOf < b.asOf ? -1 : 1;
  return (order.get(a.snapshotId) ?? 0) - (order.get(b.snapshotId) ?? 0);
}

/**
 * Resolve baseline + current from a manifest using the `previousSnapshotId`
 * chain as canonical, degrading conservatively with machine-readable warnings.
 * Pure and never throws. (The store augments this with file-load warnings.)
 */
export function resolveManifestChain(
  manifest: ForecastManifest,
): CurrentSnapshotPolicy {
  const warnings: ForecastManifestWarning[] = [];
  const entries = manifest.snapshots ?? [];

  if (entries.length === 0) {
    warnings.push({ code: "missing-baseline", detail: "manifest has no snapshots" });
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

  const order = new Map(entries.map((e, i) => [e.snapshotId, i]));
  const byId = new Map(entries.map((e) => [e.snapshotId, e]));

  // --- baseline selection ---
  const baselines = entries.filter((e) => e.isBaseline);
  let baselineId: string | null;
  if (baselines.length === 1) {
    baselineId = baselines[0]?.snapshotId ?? null;
  } else if (baselines.length === 0) {
    warnings.push({
      code: "missing-baseline",
      detail: "no entry has isBaseline:true; using earliest by asOf",
    });
    baselineId =
      [...entries].sort((a, b) => byAsOfThenOrder(a, b, order))[0]?.snapshotId ?? null;
  } else {
    warnings.push({
      code: "duplicate-baseline",
      detail: `multiple isBaseline:true entries (${baselines.map((b) => b.snapshotId).join(", ")}); using earliest by asOf`,
    });
    baselineId =
      [...baselines].sort((a, b) => byAsOfThenOrder(a, b, order))[0]?.snapshotId ?? null;
  }

  // --- chain integrity: every previousSnapshotId must resolve ---
  let chainBroken = false;
  for (const e of entries) {
    if (e.previousSnapshotId !== null && !byId.has(e.previousSnapshotId)) {
      chainBroken = true;
      warnings.push({
        code: "broken-previous-snapshot-chain",
        detail: `${e.snapshotId} -> missing previous ${e.previousSnapshotId}`,
      });
    }
  }

  // --- walk forward from baseline via child pointers ---
  const childOf = new Map<string, ForecastManifestEntry[]>();
  for (const e of entries) {
    if (e.previousSnapshotId !== null) {
      const list = childOf.get(e.previousSnapshotId) ?? [];
      list.push(e);
      childOf.set(e.previousSnapshotId, list);
    }
  }

  const chainIds: string[] = [];
  const seen = new Set<string>();
  let cursor: string | null = baselineId;
  while (cursor && byId.has(cursor) && !seen.has(cursor)) {
    chainIds.push(cursor);
    seen.add(cursor);
    const kids: ForecastManifestEntry[] = childOf.get(cursor) ?? [];
    if (kids.length > 1) {
      warnings.push({
        code: "duplicate-current-candidate",
        detail: `${cursor} has multiple successors (${kids.map((k) => k.snapshotId).join(", ")}); following highest completedMatchesLocked`,
      });
      chainBroken = true;
    }
    const next = [...kids].sort(
      (a, b) =>
        b.completedMatchesLocked - a.completedMatchesLocked ||
        byAsOfThenOrder(b, a, order),
    )[0];
    cursor = next ? next.snapshotId : null;
  }

  // entries not reachable from baseline => broken/orphaned chain
  if (chainIds.length !== entries.length) {
    chainBroken = true;
    const orphans = entries
      .filter((e) => !seen.has(e.snapshotId))
      .map((e) => e.snapshotId);
    warnings.push({
      code: "broken-previous-snapshot-chain",
      detail: `entries unreachable from baseline: ${orphans.join(", ")}`,
    });
  }

  // --- current selection ---
  let currentId: string | null;
  let selectionMode: SnapshotSelectionMode;
  const highestLocked = [...entries].sort(
    (a, b) =>
      b.completedMatchesLocked - a.completedMatchesLocked ||
      byAsOfThenOrder(b, a, order),
  )[0];

  const tailId = chainIds[chainIds.length - 1] ?? null;
  if (!chainBroken && tailId) {
    currentId = tailId;
    selectionMode = "chain";
    // validate the chain tail has the highest completedMatchesLocked
    const tail = byId.get(tailId);
    const maxLocked = Math.max(...entries.map((e) => e.completedMatchesLocked));
    if (tail && tail.completedMatchesLocked < maxLocked) {
      warnings.push({
        code: "current-not-highest-completed-matches",
        detail: `chain tail ${tailId} (locked=${tail.completedMatchesLocked}) is below max locked=${maxLocked}`,
      });
    }
  } else if (highestLocked) {
    currentId = highestLocked.snapshotId;
    selectionMode = "highest-completed-matches";
    warnings.push({
      code: "fallback-used",
      detail: `chain unusable; selected highest completedMatchesLocked ${currentId}`,
    });
  } else {
    currentId = baselineId;
    selectionMode = "baseline-fallback";
    warnings.push({
      code: "fallback-used",
      detail: "chain unusable and no locked entries; falling back to baseline",
    });
  }

  return {
    baselineSnapshotId: baselineId,
    currentSnapshotId: currentId,
    selectionMode,
    chainIds,
    isValidChain: warnings.length === 0,
    available: baselineId !== null && currentId !== null,
    warnings,
  };
}

/**
 * Strict manifest validator for tests / build-time. Returns recoverable chain
 * `warnings` plus hard `errors` (e.g. duplicate snapshotId). Pure; never throws.
 */
export function validateForecastSnapshotManifest(manifest: ForecastManifest): {
  ok: boolean;
  warnings: ForecastManifestWarning[];
  errors: string[];
} {
  const errors: string[] = [];
  const entries = manifest.snapshots ?? [];

  const ids = entries.map((e) => e.snapshotId);
  const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupIds.length > 0) {
    errors.push(`duplicate snapshotId(s): ${[...new Set(dupIds)].join(", ")}`);
  }
  if (entries.length === 0) errors.push("manifest has no snapshots");

  const policy = resolveManifestChain(manifest);
  return { ok: errors.length === 0, warnings: policy.warnings, errors };
}

// --------------------------------------------------------------------------
// Summaries / timeline
// --------------------------------------------------------------------------

/**
 * Build a summary from a snapshot, preferring the manifest entry for
 * `label`/`isBaseline`/`previousSnapshotId` (the snapshot body does not carry
 * those), falling back to snapshot-derived values.
 */
export function summariseSnapshot(
  snapshot: ForecastSnapshot,
  manifestEntry?: ForecastManifestEntry,
): ForecastSnapshotSummary {
  const m = snapshot.meta;
  return {
    snapshotId: m.snapshotId,
    snapshotType: m.snapshotType,
    asOf: m.asOf,
    generatedAt: m.generatedAt,
    label: manifestEntry?.label ?? m.notes ?? "",
    completedMatchesLocked: m.completedMatchesLocked,
    isBaseline: manifestEntry?.isBaseline ?? m.snapshotType === "baseline",
    previousSnapshotId: manifestEntry?.previousSnapshotId ?? null,
  };
}

// --------------------------------------------------------------------------
// Deltas
// --------------------------------------------------------------------------

function buildStageDelta(
  stage: ForecastStageKey,
  fromProbability: number,
  toProbability: number,
): StageDelta {
  const delta = round(toProbability - fromProbability, 6);
  const isZero = toProbability === 0;
  return {
    stage,
    fromProbability,
    toProbability,
    delta,
    deltaPercentagePoints: round(delta * 100, 4),
    absoluteDelta: Math.abs(delta),
    isZeroProbabilityForStage: isZero,
    ...(isZero ? { zeroProbabilityBasis: "snapshot-probability-zero" as const } : {}),
    isStructurallyEliminatedForStage: null,
  };
}

function teamMap(
  snapshot: ForecastSnapshot,
): Map<string, ForecastTeamProbabilities> {
  return new Map(snapshot.teams.map((t) => [t.teamId, t]));
}

/**
 * Compute all-stage movement for one team between two snapshots. Returns null
 * only when the team is absent from BOTH snapshots. A team present on one side
 * is reported with `presentInFrom`/`presentInTo` and the missing side treated as
 * probability 0 / rank null.
 */
export function getTeamForecastDelta(
  teamId: string,
  from: ForecastSnapshot,
  to: ForecastSnapshot,
): TeamForecastDelta | null {
  const fromTeam = teamMap(from).get(teamId);
  const toTeam = teamMap(to).get(teamId);
  if (!fromTeam && !toTeam) return null;

  const stages = {} as Record<ForecastStageKey, StageDelta>;
  for (const stage of FORECAST_STAGE_ORDER) {
    stages[stage] = buildStageDelta(
      stage,
      fromTeam ? fromTeam[stage] : 0,
      toTeam ? toTeam[stage] : 0,
    );
  }

  const fromRank = fromTeam ? fromTeam.rank : null;
  const toRank = toTeam ? toTeam.rank : null;
  const rankDelta =
    fromRank !== null && toRank !== null ? toRank - fromRank : null;

  return {
    teamId,
    fromSnapshotId: from.meta.snapshotId,
    toSnapshotId: to.meta.snapshotId,
    fromAsOf: from.meta.asOf,
    toAsOf: to.meta.asOf,
    fromCompletedMatchesLocked: from.meta.completedMatchesLocked,
    toCompletedMatchesLocked: to.meta.completedMatchesLocked,
    fromRank,
    toRank,
    rankDelta,
    stages,
    presentInFrom: Boolean(fromTeam),
    presentInTo: Boolean(toTeam),
  };
}

/** All-team deltas, sorted by `toRank` (nulls last) then `teamId`. */
export function getAllTeamForecastDeltas(
  from: ForecastSnapshot,
  to: ForecastSnapshot,
): TeamForecastDelta[] {
  const ids = new Set<string>([
    ...from.teams.map((t) => t.teamId),
    ...to.teams.map((t) => t.teamId),
  ]);
  const deltas: TeamForecastDelta[] = [];
  for (const id of ids) {
    const d = getTeamForecastDelta(id, from, to);
    if (d) deltas.push(d);
  }
  deltas.sort((a, b) => {
    const ar = a.toRank ?? Number.POSITIVE_INFINITY;
    const br = b.toRank ?? Number.POSITIVE_INFINITY;
    return ar - br || a.teamId.localeCompare(b.teamId);
  });
  return deltas;
}

/** Full pairwise comparison of two snapshots. */
export function compareForecastSnapshots(
  from: ForecastSnapshot,
  to: ForecastSnapshot,
  fromEntry?: ForecastManifestEntry,
  toEntry?: ForecastManifestEntry,
): ForecastComparison {
  return {
    from: summariseSnapshot(from, fromEntry),
    to: summariseSnapshot(to, toEntry),
    teamDeltas: getAllTeamForecastDeltas(from, to),
  };
}

// --------------------------------------------------------------------------
// Biggest movers
// --------------------------------------------------------------------------

function moverFromDelta(
  td: TeamForecastDelta,
  stage: ForecastStageKey,
): ForecastMover {
  const sd = td.stages[stage];
  return {
    teamId: td.teamId,
    teamName: td.teamName,
    stage,
    fromSnapshotId: td.fromSnapshotId,
    toSnapshotId: td.toSnapshotId,
    fromProbability: sd.fromProbability,
    toProbability: sd.toProbability,
    delta: sd.delta,
    deltaPercentagePoints: sd.deltaPercentagePoints,
    absoluteDelta: sd.absoluteDelta,
    fromRank: td.fromRank,
    toRank: td.toRank,
    rankDelta: td.rankDelta,
    isZeroProbabilityForStage: sd.isZeroProbabilityForStage,
    ...(sd.zeroProbabilityBasis ? { zeroProbabilityBasis: sd.zeroProbabilityBasis } : {}),
    isStructurallyEliminatedForStage: sd.isStructurallyEliminatedForStage,
  };
}

/**
 * Biggest probability-point movers between two snapshots.
 * Defaults: stage="winner", mode="signed", topN=5, exclude zero-probability teams.
 * `signed` -> { risers (delta desc), fallers (delta asc) }; `absolute` -> { movers }.
 */
export function getBiggestForecastMovers(
  from: ForecastSnapshot,
  to: ForecastSnapshot,
  options: BiggestMoversOptions = {},
): ForecastMoversResult {
  const stage = options.stage ?? "winner";
  const mode = options.mode ?? "signed";
  const topN = options.topN ?? 5;
  const includeZero = options.includeZeroProbabilityTeams ?? false;
  const minFrom = options.minFromProbability ?? 0;
  const minAbs = options.minAbsDelta ?? 0;

  let movers = getAllTeamForecastDeltas(from, to)
    .filter((td) => td.presentInTo)
    .map((td) => moverFromDelta(td, stage))
    .filter((m) => m.fromProbability >= minFrom)
    .filter((m) => m.absoluteDelta >= minAbs);

  if (!includeZero) {
    movers = movers.filter((m) => !m.isZeroProbabilityForStage);
  }

  if (mode === "absolute") {
    const sorted = [...movers].sort(
      (a, b) => b.absoluteDelta - a.absoluteDelta || a.teamId.localeCompare(b.teamId),
    );
    return { stage, mode, movers: sorted.slice(0, topN) };
  }

  const risers = movers
    .filter((m) => m.delta > 0)
    .sort((a, b) => b.delta - a.delta || a.teamId.localeCompare(b.teamId))
    .slice(0, topN);
  const fallers = movers
    .filter((m) => m.delta < 0)
    .sort((a, b) => a.delta - b.delta || a.teamId.localeCompare(b.teamId))
    .slice(0, topN);
  return { stage, mode, risers, fallers };
}

// --------------------------------------------------------------------------
// Trajectories
// --------------------------------------------------------------------------

/**
 * A team's probability history across an ordered snapshot list (baseline ->
 * current). Snapshots where the team is absent contribute a point with rank null
 * and all-zero stages (so the timeline stays aligned).
 */
export function buildTeamForecastTrajectory(
  teamId: string,
  orderedSnapshots: ForecastSnapshot[],
): TeamForecastTrajectory {
  const points = orderedSnapshots.map((snap) => {
    const team = snap.teams.find((t) => t.teamId === teamId);
    const stages = {} as Record<ForecastStageKey, number>;
    for (const stage of FORECAST_STAGE_ORDER) {
      stages[stage] = team ? team[stage] : 0;
    }
    return {
      snapshotId: snap.meta.snapshotId,
      asOf: snap.meta.asOf,
      completedMatchesLocked: snap.meta.completedMatchesLocked,
      rank: team ? team.rank : null,
      stages,
    };
  });
  return { teamId, points };
}

/**
 * One stage's value for every team across an ordered snapshot list. Teams are
 * sorted by their value in the last snapshot (desc) then teamId, for stable
 * chart ordering.
 */
export function buildStageForecastTrajectory(
  stage: ForecastStageKey,
  orderedSnapshots: ForecastSnapshot[],
): StageForecastTrajectory {
  const ids = new Set<string>();
  for (const snap of orderedSnapshots) {
    for (const t of snap.teams) ids.add(t.teamId);
  }

  const teams = [...ids].map((teamId) => ({
    teamId,
    series: orderedSnapshots.map((snap) => {
      const team = snap.teams.find((t) => t.teamId === teamId);
      return {
        snapshotId: snap.meta.snapshotId,
        asOf: snap.meta.asOf,
        value: team ? team[stage] : 0,
      };
    }),
  }));

  const lastValue = (teamId: string): number => {
    for (let i = orderedSnapshots.length - 1; i >= 0; i--) {
      const snap = orderedSnapshots[i];
      if (!snap) continue;
      const team = snap.teams.find((t) => t.teamId === teamId);
      if (team) return team[stage];
    }
    return 0;
  };
  teams.sort(
    (a, b) => lastValue(b.teamId) - lastValue(a.teamId) || a.teamId.localeCompare(b.teamId),
  );

  return { stage, teams };
}

// Re-export the probability keys for convenience (some callers want both).
export { FORECAST_PROBABILITY_KEYS };
