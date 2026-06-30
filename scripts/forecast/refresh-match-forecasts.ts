/**
 * Match-forecast current/archive orchestrator (Phase 1.30, PR-83D)
 * ----------------------------------------------------------------
 * Pure, deps-injected orchestration: a loaded public-safe live-state projection +
 * injected read/write seams -> resolve forecastable fixtures (group + RESOLVED
 * knockout) -> merge with the existing forecast-matches archive (preserve archived
 * history; archive current entries on completion; optionally create retrospective
 * entries) -> idempotent write/dry-run DECISION. No fs / argv / env / Blob /
 * `Date.now()` here (the CLI does all I/O and supplies `generatedAt`). Uses the
 * existing `predictMatch`-based `buildMatchForecast` only — no Monte Carlo, no
 * model/simulation change.
 */
import { fixtures, getTeam, teamById } from "@/lib/data";
import {
  buildMatchForecast,
  stageForMatchNumber,
  type MatchForecastStage,
} from "@/lib/model/match-forecast";
import {
  buildPublicSafeMatchForecasts,
  toPublicSafeMatchForecastEntry,
  type ForecastAttribution,
  type ForecastPublicSourcePolicy,
  type MatchForecastStatus,
  type PublicSafeMatchForecastEntry,
  type PublicSafeMatchForecasts,
} from "@/lib/model/forecast-public-safe";
import type { ForecastLoadResult } from "@/lib/model/forecast-blob-store";

export const GROUP_STAGE_MAX_MATCH = 72;

// --- minimal live-state input (satisfied by the full PublicSafeLiveState) -----

export interface LiveMatchInput {
  matchNumber: number;
  stage: string;
  status: string;
  teamA: string;
  teamB: string;
  goalsA?: number;
  goalsB?: number;
  winner?: string;
}
export interface LiveBracketInput {
  matchNumber: number;
  round: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  winner: string | null;
  resolution: string;
}
export interface MatchForecastLiveStateInput {
  asOf?: string;
  generatedAt?: string;
  publicSourcePolicy?: string;
  matches: LiveMatchInput[];
  bracket: LiveBracketInput[];
}

// --- result / options --------------------------------------------------------

export type MatchRefreshDecision = "wrote" | "would-write" | "skipped" | "blocked";

export type MatchRefreshReason =
  | "new-match-forecasts"
  | "matches-completed-archived"
  | "source-results-changed"
  | "participant-changed"
  | "retrospective-created"
  | "no-meaningful-change"
  | "no-existing-matches"
  | "existing-archive-unreadable"
  | "source-unavailable"
  | "file-write-not-allowed"
  | "write-failed"
  | "forced";

export interface MatchRefreshSource {
  ok: boolean;
  state?: MatchForecastLiveStateInput;
  objectPath: string | null;
  liveStateGeneratedAt: string | null;
  error?: string;
}

export interface MatchRefreshOptions {
  asOf?: string;
  attribution: ForecastAttribution;
  sourcePolicy?: ForecastPublicSourcePolicy;
  dryRun: boolean;
  force: boolean;
  writeAllowed: boolean;
  includeRetrospective: boolean;
  forceRebuild: boolean;
}

export interface MatchRefreshInput {
  source: MatchRefreshSource;
  generatedAt: string;
  matchesObjectPath: string;
  forecastCurrentObjectPath: string;
  /** Resolved by the CLI from the forecast-current Blob (snapshotId) or null. */
  sourceSnapshotId: string | null;
  readExistingMatchForecasts: () => Promise<ForecastLoadResult<PublicSafeMatchForecasts>>;
  writeMatchForecasts: (m: PublicSafeMatchForecasts) => Promise<{ pathname: string }>;
  options: MatchRefreshOptions;
}

export interface MatchRefreshResult {
  decision: MatchRefreshDecision;
  reason: MatchRefreshReason;
  generated: boolean;
  skipped: boolean;
  wouldWrite: boolean;
  wrote: boolean;
  sourceLiveStateObjectPath: string | null;
  matchesObjectPath: string;
  forecastCurrentObjectPath: string;
  sourceSnapshotId: string | null;
  matchForecastsFingerprint: string | null;
  previousMatchForecastsFingerprint: string | null;
  totalResolvedFixtures: number;
  totalForecastEntries: number;
  createdCurrent: number;
  preservedCurrent: number;
  archivedCompleted: number;
  preservedArchived: number;
  retrospectiveCreated: number;
  missingPreMatchArchive: number;
  unresolvedKnockoutSkipped: number;
  participantChanged: number;
  participantConflict: number;
  orphanCurrentDropped: number;
  exitCode: number;
  matchForecasts: PublicSafeMatchForecasts | null;
}

// --- fixture resolution ------------------------------------------------------

export interface ForecastableFixture {
  matchNumber: number;
  stage: MatchForecastStage;
  homeTeamId: string;
  awayTeamId: string;
  complete: boolean;
  liveStatus: string;
}

/** Resolve forecastable fixtures: group M1-72 + RESOLVED knockout (both participants known). */
export function resolveForecastableFixtures(state: MatchForecastLiveStateInput): {
  fixtures: ForecastableFixture[];
  unresolvedKnockoutSkipped: number;
} {
  const matchByNumber = new Map(state.matches.map((m) => [m.matchNumber, m]));
  const out: ForecastableFixture[] = [];

  for (const f of fixtures) {
    if (typeof f.matchNumber !== "number" || f.matchNumber > GROUP_STAGE_MAX_MATCH) continue;
    if (stageForMatchNumber(f.matchNumber) !== "group") continue;
    if (!teamById.has(f.homeTeamId) || !teamById.has(f.awayTeamId)) continue;
    const lm = matchByNumber.get(f.matchNumber);
    out.push({
      matchNumber: f.matchNumber,
      stage: "group",
      homeTeamId: f.homeTeamId,
      awayTeamId: f.awayTeamId,
      complete: lm?.status === "complete",
      liveStatus: lm?.status ?? "unknown",
    });
  }

  let unresolvedKnockoutSkipped = 0;
  for (const b of state.bracket) {
    if (b.resolution !== "resolved" || b.homeTeamId == null || b.awayTeamId == null) {
      unresolvedKnockoutSkipped += 1;
      continue;
    }
    const stage = stageForMatchNumber(b.matchNumber);
    if (!stage || stage === "group") continue;
    if (!teamById.has(b.homeTeamId) || !teamById.has(b.awayTeamId)) continue;
    const lm = matchByNumber.get(b.matchNumber);
    out.push({
      matchNumber: b.matchNumber,
      stage,
      homeTeamId: b.homeTeamId,
      awayTeamId: b.awayTeamId,
      complete: lm?.status === "complete",
      liveStatus: lm?.status ?? "unknown",
    });
  }

  out.sort((a, b) => a.matchNumber - b.matchNumber);
  return { fixtures: out, unresolvedKnockoutSkipped };
}

function currentStatusOf(fx: ForecastableFixture): MatchForecastStatus {
  if (fx.liveStatus === "in-progress") return "in-progress";
  return fx.stage === "group" ? "scheduled" : "resolved";
}

// --- fingerprint -------------------------------------------------------------

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Deterministic content fingerprint over MEANINGFUL entry fields (excludes
 * generatedAt / forecastAsOf / sourceSnapshotId / notes / topScorelines so a
 * churn-only re-run does not force a write).
 */
export function computeMatchForecastsFingerprint(
  entries: readonly PublicSafeMatchForecastEntry[],
): string {
  const rows = [...entries]
    .sort((a, b) => a.matchNumber - b.matchNumber)
    .map((e) =>
      [
        e.matchNumber,
        e.stage,
        e.status,
        e.homeTeamId,
        e.awayTeamId,
        e.archived,
        e.capturedBeforeCompletion,
        e.forecastProvenance,
        e.homeWin,
        e.draw,
        e.awayWin,
        e.expectedHomeGoals,
        e.expectedAwayGoals,
        e.homeAdvance ?? "",
        e.awayAdvance ?? "",
        e.advancementBasis ?? "",
      ].join(":"),
    );
  return `mff-${fnv1a(rows.join("|"))}`;
}

// --- orchestrator ------------------------------------------------------------

function blockedResult(
  reason: MatchRefreshReason,
  input: MatchRefreshInput,
): MatchRefreshResult {
  return {
    decision: "blocked",
    reason,
    generated: false,
    skipped: false,
    wouldWrite: false,
    wrote: false,
    sourceLiveStateObjectPath: input.source.objectPath,
    matchesObjectPath: input.matchesObjectPath,
    forecastCurrentObjectPath: input.forecastCurrentObjectPath,
    sourceSnapshotId: input.sourceSnapshotId,
    matchForecastsFingerprint: null,
    previousMatchForecastsFingerprint: null,
    totalResolvedFixtures: 0,
    totalForecastEntries: 0,
    createdCurrent: 0,
    preservedCurrent: 0,
    archivedCompleted: 0,
    preservedArchived: 0,
    retrospectiveCreated: 0,
    missingPreMatchArchive: 0,
    unresolvedKnockoutSkipped: 0,
    participantChanged: 0,
    participantConflict: 0,
    orphanCurrentDropped: 0,
    exitCode: 1,
    matchForecasts: null,
  };
}

export async function runRefreshMatchForecasts(input: MatchRefreshInput): Promise<MatchRefreshResult> {
  const { source, options } = input;
  if (!source.ok || !source.state) return blockedResult("source-unavailable", input);

  // --- existing archive ---
  const existing = await input.readExistingMatchForecasts();
  let existingEntries: PublicSafeMatchForecastEntry[];
  let existingPresent: boolean;
  if (existing.ok && existing.value) {
    existingEntries = existing.value.matchForecasts;
    existingPresent = true;
  } else if (existing.error === "not-found" || existing.error === "missing-blob-token") {
    // Genuinely-absent object, or no read access (e.g. local/dry-run) -> start empty.
    existingEntries = [];
    existingPresent = false;
  } else if (options.forceRebuild) {
    // Malformed/unreadable (invalid-shape / blob-read-error) rebuilt on explicit request.
    existingEntries = [];
    existingPresent = false;
  } else {
    return blockedResult("existing-archive-unreadable", input);
  }

  const { fixtures: forecastable, unresolvedKnockoutSkipped } = resolveForecastableFixtures(source.state);
  const forecastableByNumber = new Map(forecastable.map((f) => [f.matchNumber, f]));
  const existingByNumber = new Map(existingEntries.map((e) => [e.matchNumber, e]));

  const forecastAsOf = options.asOf ?? source.state.asOf ?? input.generatedAt;
  const buildEntry = (
    fx: ForecastableFixture,
    meta: {
      status: MatchForecastStatus;
      provenance: PublicSafeMatchForecastEntry["forecastProvenance"];
      capturedBeforeCompletion: boolean;
      archived: boolean;
    },
  ): PublicSafeMatchForecastEntry => {
    const forecast = buildMatchForecast({
      matchNumber: fx.matchNumber,
      stage: fx.stage,
      home: getTeam(fx.homeTeamId),
      away: getTeam(fx.awayTeamId),
    });
    return toPublicSafeMatchForecastEntry(forecast, {
      status: meta.status,
      forecastAsOf,
      generatedAt: input.generatedAt,
      provenance: meta.provenance,
      capturedBeforeCompletion: meta.capturedBeforeCompletion,
      archived: meta.archived,
      ...(input.sourceSnapshotId != null ? { sourceSnapshotId: input.sourceSnapshotId } : {}),
    });
  };

  const result: PublicSafeMatchForecastEntry[] = [];
  let createdCurrent = 0;
  let preservedCurrent = 0;
  let archivedCompleted = 0;
  let preservedArchived = 0;
  let retrospectiveCreated = 0;
  let missingPreMatchArchive = 0;
  let participantChanged = 0;
  let participantConflict = 0;
  let orphanCurrentDropped = 0;

  // Step A: preserve all existing ARCHIVED entries byte-for-byte (immutable history).
  for (const e of existingEntries) {
    if (e.archived === true) {
      result.push(e);
      preservedArchived += 1;
    }
  }

  // Step B: process each forecastable fixture.
  for (const fx of forecastable) {
    const existingE = existingByNumber.get(fx.matchNumber);
    const participantsMatch =
      !!existingE && existingE.homeTeamId === fx.homeTeamId && existingE.awayTeamId === fx.awayTeamId;

    if (existingE && existingE.archived) {
      if (!participantsMatch) participantConflict += 1; // never overwrite archived history
      continue;
    }

    if (fx.complete) {
      if (existingE && !existingE.archived && participantsMatch && existingE.capturedBeforeCompletion) {
        result.push({
          ...existingE,
          archived: true,
          status: "complete",
          forecastProvenance: "archived-pre-match-forecast",
        });
        archivedCompleted += 1;
      } else {
        if (existingE && !participantsMatch) participantChanged += 1;
        missingPreMatchArchive += 1;
        if (options.includeRetrospective) {
          result.push(
            buildEntry(fx, {
              status: "complete",
              provenance: "retrospective-model-forecast",
              capturedBeforeCompletion: false,
              archived: true,
            }),
          );
          retrospectiveCreated += 1;
        }
      }
    } else if (existingE && !existingE.archived) {
      if (participantsMatch && !options.force) {
        result.push(existingE);
        preservedCurrent += 1;
      } else {
        if (!participantsMatch) participantChanged += 1;
        result.push(
          buildEntry(fx, {
            status: currentStatusOf(fx),
            provenance: "current-pre-match-forecast",
            capturedBeforeCompletion: true,
            archived: false,
          }),
        );
        createdCurrent += 1;
      }
    } else {
      result.push(
        buildEntry(fx, {
          status: currentStatusOf(fx),
          provenance: "current-pre-match-forecast",
          capturedBeforeCompletion: true,
          archived: false,
        }),
      );
      createdCurrent += 1;
    }
  }

  // Step C: drop orphan UNARCHIVED current entries no longer forecastable.
  for (const e of existingEntries) {
    if (e.archived !== true && !forecastableByNumber.has(e.matchNumber)) {
      orphanCurrentDropped += 1;
    }
  }

  result.sort((a, b) => a.matchNumber - b.matchNumber);

  const previousFingerprint = existingPresent ? computeMatchForecastsFingerprint(existingEntries) : null;
  const newFingerprint = computeMatchForecastsFingerprint(result);

  const counters = {
    sourceLiveStateObjectPath: source.objectPath,
    matchesObjectPath: input.matchesObjectPath,
    forecastCurrentObjectPath: input.forecastCurrentObjectPath,
    sourceSnapshotId: input.sourceSnapshotId,
    matchForecastsFingerprint: newFingerprint,
    previousMatchForecastsFingerprint: previousFingerprint,
    totalResolvedFixtures: forecastable.length,
    totalForecastEntries: result.length,
    createdCurrent,
    preservedCurrent,
    archivedCompleted,
    preservedArchived,
    retrospectiveCreated,
    missingPreMatchArchive,
    unresolvedKnockoutSkipped,
    participantChanged,
    participantConflict,
    orphanCurrentDropped,
  };

  const changed = previousFingerprint !== newFingerprint;
  if (!changed && !options.force) {
    return {
      decision: "skipped",
      reason: "no-meaningful-change",
      generated: false,
      skipped: true,
      wouldWrite: false,
      wrote: false,
      ...counters,
      exitCode: 0,
      matchForecasts: null,
    };
  }

  let reason: MatchRefreshReason;
  if (!changed) reason = "forced";
  else if (!existingPresent && result.length > 0) reason = "no-existing-matches";
  else if (participantChanged > 0) reason = "participant-changed";
  else if (archivedCompleted > 0) reason = "matches-completed-archived";
  else if (retrospectiveCreated > 0) reason = "retrospective-created";
  else if (createdCurrent > 0) reason = "new-match-forecasts";
  else reason = "source-results-changed";

  const built = buildPublicSafeMatchForecasts(result, {
    generatedAt: input.generatedAt,
    sourceLiveStateAsOf: source.state.asOf ?? null,
    sourceLiveStateGeneratedAt: source.liveStateGeneratedAt,
    sourceLiveStateObjectPath: source.objectPath,
    publicSourcePolicy: options.sourcePolicy ?? "provider-public-delayed",
    attribution: options.attribution,
  });

  if (options.dryRun) {
    return {
      decision: "would-write",
      reason,
      generated: true,
      skipped: false,
      wouldWrite: true,
      wrote: false,
      ...counters,
      exitCode: 0,
      matchForecasts: built,
    };
  }

  if (!options.writeAllowed) {
    return {
      decision: "blocked",
      reason: "file-write-not-allowed",
      generated: true,
      skipped: false,
      wouldWrite: false,
      wrote: false,
      ...counters,
      exitCode: 1,
      matchForecasts: built,
    };
  }

  try {
    await input.writeMatchForecasts(built);
  } catch {
    return {
      decision: "blocked",
      reason: "write-failed",
      generated: true,
      skipped: false,
      wouldWrite: false,
      wrote: false,
      ...counters,
      exitCode: 1,
      matchForecasts: built,
    };
  }

  return {
    decision: "wrote",
    reason,
    generated: true,
    skipped: false,
    wouldWrite: false,
    wrote: true,
    ...counters,
    exitCode: 0,
    matchForecasts: built,
  };
}
