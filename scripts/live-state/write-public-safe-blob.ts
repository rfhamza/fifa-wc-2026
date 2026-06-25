/**
 * Phase 1.28M - MANUAL-ONLY writer: sanitized PublicSafeLiveState -> PRIVATE Vercel Blob.
 * --------------------------------------------------------------------------------------
 * Manual maintainer/CI command (NEVER scheduled). Two modes:
 *
 *   npm run live:state:write-blob -- --source fixture          (default)
 *       Writes the committed manual/FIFA sanitized fixture (isProviderDerived=false).
 *       Proves storage mechanics with NO provider data.
 *
 *   npm run live:state:write-blob -- --source football-data
 *       Fetches matches-only, derives internal state, maps to PublicSafeLiveState, and
 *       writes ONLY the sanitized projection (isProviderDerived=true,
 *       publicSourcePolicy="provider-private-deferred"). Stays PRIVATE/deferred.
 *
 * Flags: --object-path <path> (default live-state.sanitized.json), --dry-run (validate +
 * gate, do NOT write), --allow-partial (provider mode: skip the 104-match assertion).
 *
 * Security / governance:
 *   - Raw football-data.org payloads are NEVER written to Blob (and, via dry-run fetch,
 *     never persisted to disk - they stay ephemeral in memory).
 *   - Tokens (`BLOB_READ_WRITE_TOKEN`, `FOOTBALL_DATA_TOKEN`) are read from env only and
 *     never logged or written.
 *   - Validation gates the write: provider mode blocks on fetch failure, unmapped/unknown
 *     teams, or validation warnings - bad data is never written.
 */
import { toPublicSafeLiveState, type PublicSafeLiveState } from "@/lib/live-state/public-safe";
import { isPublicSafeLiveState } from "@/lib/live-state/public-safe-source";
import {
  DEFAULT_BLOB_OBJECT_PATH,
  putPublicSafeLiveStateToBlob,
  type PublicSafeBlobStore,
} from "@/lib/live-state/public-safe-blob-store";
import committedFixture from "@/data/live/public-safe-sample.json";
import {
  runFetchLiveState,
  type FetchLike,
} from "@/scripts/football-data-org/live-state-fetch";

export type WriteSource = "fixture" | "football-data";

export interface WriteDeps {
  source: WriteSource;
  objectPath: string;
  dryRun: boolean;
  /** Provider mode: skip the full 104-match assertion (for partial/test payloads). */
  allowPartial?: boolean;
  /** Injected private Blob store (tests). Real CLI omits this -> token-backed store. */
  store?: PublicSafeBlobStore;
  blobToken?: string;
  providerToken?: string;
  fetchImpl?: FetchLike;
  now: () => string;
  log: (line: string) => void;
  /** Override the fixture source (tests). Defaults to the committed manual fixture. */
  loadFixtureState?: () => PublicSafeLiveState;
}

export interface WriteResult {
  exitCode: number;
  action: "wrote" | "dry-run" | "blocked";
  reason?: string;
  pathname?: string;
  isProviderDerived: boolean;
  matchCount: number;
}

const FOOTBALL_DATA_ATTRIBUTION = {
  sourceName: "football-data.org (provider-derived; private/deferred)",
  sourceUrl: "https://www.football-data.org/",
  text:
    "Provider-derived live state (football-data.org). Kept PRIVATE/deferred; standings " +
    "and bracket are derived internally (Article 13).",
} as const;

/** Build the sanitized projection for the chosen source (no I/O for fixture mode). */
async function buildSanitizedState(deps: WriteDeps): Promise<
  { ok: true; state: PublicSafeLiveState } | { ok: false; reason: string }
> {
  if (deps.source === "fixture") {
    const state = (deps.loadFixtureState ?? (() => committedFixture as unknown as PublicSafeLiveState))();
    if (!isPublicSafeLiveState(state)) return { ok: false, reason: "fixture-malformed" };
    return { ok: true, state };
  }

  // provider mode: fetch matches-only, derive in memory (dryRun -> no disk writes).
  if (!deps.providerToken) return { ok: false, reason: "missing-football-data-token" };
  if (!deps.fetchImpl) return { ok: false, reason: "missing-fetch-impl" };

  const res = await runFetchLiveState({
    token: deps.providerToken,
    fetchImpl: deps.fetchImpl,
    now: deps.now,
    // No disk persistence: dryRun + summaryOnly mean raw payloads stay in memory only.
    writeArtifact: () => {},
    log: deps.log,
    options: {
      standings: false, // provider standings stay comparison-only / disabled
      dryRun: true,
      summaryOnly: true,
      expectFullTournament: !deps.allowPartial,
      outDir: "artifacts/football-data-org",
    },
  });

  if (res.exitCode !== 0 || !res.state || !res.summary) {
    return { ok: false, reason: `fetch-failed:${res.error ?? "unknown"}` };
  }
  // Validation gates the write: block on unmapped/unknown teams or any validation warning.
  if (res.summary.unmappedCount > 0) return { ok: false, reason: "unmapped-or-unknown-teams" };
  if (res.summary.validationWarnings > 0) return { ok: false, reason: "validation-warnings" };
  if (res.summary.mappedCount <= 0) return { ok: false, reason: "no-mapped-matches" };

  const state = toPublicSafeLiveState(res.state, {
    attribution: FOOTBALL_DATA_ATTRIBUTION,
    isProviderDerived: true,
    publicSourcePolicy: "provider-private-deferred",
  });
  return { ok: true, state };
}

/** Run the writer with injected deps. Pure of process/exit; returns a structured result. */
export async function runWritePublicSafeBlob(deps: WriteDeps): Promise<WriteResult> {
  const built = await buildSanitizedState(deps);
  if (!built.ok) {
    deps.log(`BLOCKED: ${built.reason} - nothing written.`);
    return { exitCode: 1, action: "blocked", reason: built.reason, isProviderDerived: false, matchCount: 0 };
  }
  const { state } = built;
  const matchCount = state.matches.length;

  if (deps.dryRun) {
    deps.log(
      `DRY-RUN: would write ${deps.objectPath} ` +
        `(matches=${matchCount}, isProviderDerived=${state.isProviderDerived}, ` +
        `policy=${state.publicSourcePolicy}). No write performed.`,
    );
    return { exitCode: 0, action: "dry-run", pathname: deps.objectPath, isProviderDerived: state.isProviderDerived, matchCount };
  }

  if (!deps.store && !deps.blobToken) {
    deps.log("BLOCKED: BLOB_READ_WRITE_TOKEN is not set - no write attempted.");
    return { exitCode: 1, action: "blocked", reason: "missing-blob-token", isProviderDerived: state.isProviderDerived, matchCount };
  }

  try {
    const { pathname } = await putPublicSafeLiveStateToBlob(state, {
      store: deps.store,
      token: deps.blobToken,
      objectPath: deps.objectPath,
    });
    // Never print the private Blob URL - only the pathname.
    deps.log(`WROTE ${pathname} (matches=${matchCount}, isProviderDerived=${state.isProviderDerived}).`);
    return { exitCode: 0, action: "wrote", pathname, isProviderDerived: state.isProviderDerived, matchCount };
  } catch {
    deps.log("BLOCKED: blob write failed - last-known-good is preserved.");
    return { exitCode: 1, action: "blocked", reason: "blob-write-error", isProviderDerived: state.isProviderDerived, matchCount };
  }
}

export interface WriteCliOptions {
  source: WriteSource;
  objectPath: string;
  dryRun: boolean;
  allowPartial: boolean;
}

export function parseWriteArgs(argv: string[]): WriteCliOptions {
  const valueOf = (f: string): string | undefined => {
    const i = argv.indexOf(f);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  const source = valueOf("--source") === "football-data" ? "football-data" : "fixture";
  return {
    source,
    objectPath: valueOf("--object-path") ?? DEFAULT_BLOB_OBJECT_PATH,
    dryRun: argv.includes("--dry-run"),
    allowPartial: argv.includes("--allow-partial"),
  };
}
