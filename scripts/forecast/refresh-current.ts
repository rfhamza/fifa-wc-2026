/**
 * Rolling current-forecast orchestrator (Phase 1.30, PR-83C)
 * ----------------------------------------------------------
 * Pure, deps-injected orchestration: a loaded public-safe live-state projection +
 * injected read/write seams -> derived supported-results ledger -> live-aware
 * forecast snapshot -> PR-83B `PublicSafeForecastCurrent` -> an idempotent
 * write/dry-run DECISION. No fs / argv / env / Blob / `Date.now()` here (the CLI
 * runner does all I/O and supplies `generatedAt`). State + path drive the refresh
 * only — no model/simulation change.
 */
import {
  deriveLedgerFromPublicSafeState,
  ledgerToKnockoutLockedResults,
  ledgerToLockedResults,
  type ForecastResultsLedger,
  type PublicSafeStateInput,
} from "@/lib/model/forecast-results-ledger";
import { buildLiveAwareForecastSnapshot } from "@/lib/model/forecast-snapshots";
import {
  toPublicSafeForecastCurrent,
  type ForecastAttribution,
  type ForecastPublicSourcePolicy,
  type PublicSafeForecastCurrent,
} from "@/lib/model/forecast-public-safe";
import type { ForecastLoadResult } from "@/lib/model/forecast-blob-store";

export type RefreshDecision = "wrote" | "would-write" | "skipped" | "blocked";

export type RefreshReason =
  | "no-newer-completed-supported-match"
  | "source-results-changed"
  | "newer-completed-supported-match"
  | "no-existing-current"
  | "existing-unreadable"
  | "forced"
  | "source-unavailable"
  | "ledger-derivation-failed"
  | "file-write-not-allowed"
  | "write-failed";

/** The loaded source projection (the CLI does file/blob I/O; this stays pure). */
export interface RefreshSource {
  ok: boolean;
  state?: PublicSafeStateInput;
  /** The exact object path / file read (recorded for traceability). */
  objectPath: string | null;
  /** The live-state `generatedAt`, copied onto the current for traceability. */
  liveStateGeneratedAt: string | null;
  /** Machine error code when `ok` is false (e.g. a blob read error). */
  error?: string;
}

export interface RefreshOptions {
  asOf?: string;
  seed?: number;
  iterations?: number;
  sourcePolicy?: ForecastPublicSourcePolicy;
  attribution: ForecastAttribution;
  dryRun: boolean;
  force: boolean;
  /** Whether a real (non-dry-run) write is permitted (file-source safety gate). */
  writeAllowed: boolean;
}

export interface RefreshInput {
  source: RefreshSource;
  generatedAt: string;
  forecastObjectPath: string;
  previousSnapshotIdFallback: string | null;
  readExistingCurrent: () => Promise<ForecastLoadResult<PublicSafeForecastCurrent>>;
  writeCurrent: (current: PublicSafeForecastCurrent) => Promise<{ pathname: string }>;
  options: RefreshOptions;
}

export interface RefreshResult {
  decision: RefreshDecision;
  generated: boolean;
  skipped: boolean;
  wouldWrite: boolean;
  wrote: boolean;
  reason: RefreshReason;
  previousLatestCompletedSupportedMatchNumber: number | null;
  newLatestCompletedSupportedMatchNumber: number | null;
  previousCompletedMatchesLocked: number | null;
  newCompletedMatchesLocked: number | null;
  previousSourceResultsFingerprint: string | null;
  newSourceResultsFingerprint: string | null;
  sourceLiveStateObjectPath: string | null;
  forecastObjectPath: string;
  snapshotId: string | null;
  exitCode: number;
  /** The generated current (in-memory) when one was built; for callers/tests. */
  current: PublicSafeForecastCurrent | null;
}

/** Deterministic, dependency-free FNV-1a 32-bit hash. */
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Deterministic, public-safe fingerprint over the locked supported results.
 * Detects a data CORRECTION (fixed score / penalty winner / winner change) that
 * leaves the completed-match counts unchanged. No provider ids, payloads, URLs,
 * tokens or timestamps.
 */
export function computeSourceResultsFingerprint(ledger: ForecastResultsLedger): string {
  const rows = [...ledger.results]
    .sort((a, b) => a.matchNumber - b.matchNumber)
    .map((r) => {
      const winner = "winnerTeamId" in r ? r.winnerTeamId : "";
      const penH = "penaltiesHome" in r && r.penaltiesHome !== undefined ? r.penaltiesHome : "";
      const penA = "penaltiesAway" in r && r.penaltiesAway !== undefined ? r.penaltiesAway : "";
      return `${r.matchNumber}:${r.stage}:${r.homeTeamId}:${r.awayTeamId}:${r.homeGoals}-${r.awayGoals}:${winner}:${penH}-${penA}`;
    });
  return `srf-${fnv1a(rows.join("|"))}`;
}

/** Deterministic rolling-current snapshot id (stable for the same latest match). */
export function currentSnapshotId(asOfDate: string, latest: number): string {
  return `current-${asOfDate}-after-match-${String(latest).padStart(3, "0")}`;
}

function blocked(
  reason: RefreshReason,
  base: Pick<RefreshResult, "sourceLiveStateObjectPath" | "forecastObjectPath">,
): RefreshResult {
  return {
    decision: "blocked",
    generated: false,
    skipped: false,
    wouldWrite: false,
    wrote: false,
    reason,
    previousLatestCompletedSupportedMatchNumber: null,
    newLatestCompletedSupportedMatchNumber: null,
    previousCompletedMatchesLocked: null,
    newCompletedMatchesLocked: null,
    previousSourceResultsFingerprint: null,
    newSourceResultsFingerprint: null,
    sourceLiveStateObjectPath: base.sourceLiveStateObjectPath,
    forecastObjectPath: base.forecastObjectPath,
    snapshotId: null,
    exitCode: 1,
    current: null,
  };
}

/**
 * Orchestrate a rolling current-forecast refresh. Never throws; returns a
 * structured `RefreshResult`. Idempotency keys on
 * (latestCompletedSupportedMatchNumber, completedMatchesLocked, sourceResultsFingerprint).
 */
export async function runRefreshCurrentForecast(input: RefreshInput): Promise<RefreshResult> {
  const { source, options, forecastObjectPath } = input;
  const base = { sourceLiveStateObjectPath: source.objectPath, forecastObjectPath };

  if (!source.ok || !source.state) {
    return blocked("source-unavailable", base);
  }

  // --- derive ledger (state + path) ---
  let ledger: ForecastResultsLedger;
  try {
    ledger = deriveLedgerFromPublicSafeState(source.state, {
      asOf: options.asOf,
      sourcePolicy: options.sourcePolicy,
      sourceObjectPath: source.objectPath ?? undefined,
    });
  } catch {
    return blocked("ledger-derivation-failed", base);
  }

  const lockedResults = ledgerToLockedResults(ledger);
  const lockedKnockoutResults = ledgerToKnockoutLockedResults(ledger);
  const matchNumbers = [
    ...lockedResults.map((r) => r.matchNumber),
    ...lockedKnockoutResults.map((r) => r.matchNumber),
  ];
  const newLatest = matchNumbers.length ? Math.max(...matchNumbers) : 0;
  const newCompleted = lockedResults.length + lockedKnockoutResults.length;
  const newFingerprint = computeSourceResultsFingerprint(ledger);

  // --- existing current (idempotency + previous id) ---
  const existing = await input.readExistingCurrent();
  const prev = existing.ok && existing.value ? existing.value : null;
  const prevLatest = prev?.latestCompletedSupportedMatchNumber ?? null;
  const prevCompleted = prev?.completedMatchesLocked ?? null;
  const prevFingerprint = prev?.sourceResultsFingerprint ?? null;
  const previousSnapshotId = prev ? prev.snapshotId : input.previousSnapshotIdFallback;

  // --- decide ---
  let writeReason: RefreshReason;
  if (options.force) {
    writeReason = "forced";
  } else if (!prev) {
    writeReason = existing.error === "not-found" ? "no-existing-current" : "existing-unreadable";
  } else if (newLatest > (prevLatest ?? -1) || newCompleted > (prevCompleted ?? -1)) {
    writeReason = "newer-completed-supported-match";
  } else if (newFingerprint !== prevFingerprint) {
    writeReason = "source-results-changed";
  } else {
    // fully unchanged -> skip
    return {
      decision: "skipped",
      generated: false,
      skipped: true,
      wouldWrite: false,
      wrote: false,
      reason: "no-newer-completed-supported-match",
      previousLatestCompletedSupportedMatchNumber: prevLatest,
      newLatestCompletedSupportedMatchNumber: newLatest,
      previousCompletedMatchesLocked: prevCompleted,
      newCompletedMatchesLocked: newCompleted,
      previousSourceResultsFingerprint: prevFingerprint,
      newSourceResultsFingerprint: newFingerprint,
      sourceLiveStateObjectPath: source.objectPath,
      forecastObjectPath,
      snapshotId: null,
      exitCode: 0,
      current: null,
    };
  }

  // --- build the current (needed for would-write + wrote) ---
  const asOf = options.asOf ?? ledger.asOf;
  const asOfDate = asOf.slice(0, 10);
  const snapshotId = currentSnapshotId(asOfDate, newLatest);
  const snapshot = buildLiveAwareForecastSnapshot({
    generatedAt: input.generatedAt,
    lockedResults,
    lockedKnockoutResults,
    snapshotType: "post-match",
    asOf,
    snapshotId,
    seed: options.seed,
    iterations: options.iterations,
    liveStateSource: ledger.sourcePolicy,
    liveStateAsOf: ledger.asOf,
    providerCompletedMatchesTotal: ledger.providerCompletedMatchesTotal,
    sourceObjectPath: ledger.sourceObjectPath ?? source.objectPath ?? undefined,
    latestCompletedSupportedMatchNumber: newLatest,
  });
  const current = toPublicSafeForecastCurrent(snapshot, {
    publicSourcePolicy: options.sourcePolicy ?? "provider-public-delayed",
    attribution: options.attribution,
    sourceLiveStateGeneratedAt: source.liveStateGeneratedAt,
    previousSnapshotId,
    sourceResultsFingerprint: newFingerprint,
  });

  const counters = {
    previousLatestCompletedSupportedMatchNumber: prevLatest,
    newLatestCompletedSupportedMatchNumber: newLatest,
    previousCompletedMatchesLocked: prevCompleted,
    newCompletedMatchesLocked: newCompleted,
    previousSourceResultsFingerprint: prevFingerprint,
    newSourceResultsFingerprint: newFingerprint,
    sourceLiveStateObjectPath: source.objectPath,
    forecastObjectPath,
    snapshotId,
  };

  // --- dry-run / write-safety gate / write ---
  if (options.dryRun) {
    return {
      decision: "would-write",
      generated: true,
      skipped: false,
      wouldWrite: true,
      wrote: false,
      reason: writeReason,
      ...counters,
      exitCode: 0,
      current,
    };
  }

  if (!options.writeAllowed) {
    return {
      decision: "blocked",
      generated: true,
      skipped: false,
      wouldWrite: false,
      wrote: false,
      reason: "file-write-not-allowed",
      ...counters,
      exitCode: 1,
      current,
    };
  }

  try {
    await input.writeCurrent(current);
  } catch {
    return {
      decision: "blocked",
      generated: true,
      skipped: false,
      wouldWrite: false,
      wrote: false,
      reason: "write-failed",
      ...counters,
      exitCode: 1,
      current,
    };
  }

  return {
    decision: "wrote",
    generated: true,
    skipped: false,
    wouldWrite: false,
    wrote: true,
    reason: writeReason,
    ...counters,
    exitCode: 0,
    current,
  };
}
