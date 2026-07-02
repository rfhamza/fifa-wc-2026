/**
 * Phase 1.28C - LOCAL-ONLY football-data.org fetch + validation report (core logic).
 * ---------------------------------------------------------------------------------
 * This module holds the PURE, INJECTABLE orchestration for a maintainer-run local
 * fetch. It performs NO I/O on its own: the network client (`fetchImpl`), clock
 * (`now`), artifact writer (`writeArtifact`) and logger (`log`) are all injected, so
 * it is unit-tested with a mock fetch and never touches the real network on import.
 * The thin CLI runner (`run.ts`) wires the real Node deps.
 *
 * Security: the token is read ONLY from the environment by the runner and passed in
 * here as a value; it is sent solely in the `X-Auth-Token` request header and is
 * NEVER logged, returned, or written to any artifact. Treat the previously-pasted
 * token as exposed - regenerate before real use.
 *
 * Reuses the existing pure pipeline (no contract changes): normalize via
 * `normalizeFootballDataMatches`, validate/derive via `ingestLiveSnapshot`. Provider
 * standings stay COMPARISON-ONLY; canonical `matchNumber`/`M{n}` stays internal.
 */
import { normalizeFootballDataMatches, extractFootballDataStandings } from "@/lib/live-ingest/football-data-org/normalize";
import {
  augmentKnockoutMapByTeams,
  buildKnockoutMatchIdMap,
  findKnockoutTeamConflicts,
  type KnockoutTeamRecovery,
} from "@/lib/live-ingest/football-data-org/knockout-bridge";
import { resolveFdTeamId } from "@/lib/live-ingest/football-data-org/mapping";
import { buildOfficialReference, ingestLiveSnapshot } from "@/lib/live-state/ingest";
import type { LiveStateReference, LiveTournamentState } from "@/lib/live-state/types";
import type { NormalizationIssue } from "@/lib/live-ingest/types";
import type { FdMatch, FdMatchesResponse, FdStandingsResponse } from "@/lib/live-ingest/football-data-org/types";

export const FOOTBALL_DATA_BASE = "https://api.football-data.org/v4";
export const MATCHES_PATH = "/competitions/WC/matches?season=2026";
export const STANDINGS_PATH = "/competitions/WC/standings?season=2026";
/** Default output directory - MUST be git-ignored (see .gitignore). */
export const DEFAULT_OUT_DIR = "artifacts/football-data-org";

/* ---- injectable dependency seams ---- */

export interface FetchResponseLike {
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<FetchResponseLike>;

export interface FetchOptions {
  standings: boolean;
  dryRun: boolean;
  summaryOnly: boolean;
  /** Assert the full 104-match tournament feed (true for the real endpoint). */
  expectFullTournament: boolean;
  outDir: string;
}

export interface FetchDeps {
  token: string | undefined;
  fetchImpl: FetchLike;
  now: () => string;
  writeArtifact: (relPath: string, contents: string) => void;
  log: (line: string) => void;
  reference?: LiveStateReference;
  options: FetchOptions;
}

export interface ThrottleInfo {
  requestsAvailable: number | null;
  counterReset: string | null;
  apiVersion: string | null;
}

export interface FetchSummary {
  fetchedAt: string;
  endpoints: string[];
  httpStatuses: Record<string, number>;
  throttle: ThrottleInfo;
  competition: { code?: string; name?: string };
  resultSetCount: number | null;
  resultSetPlayed: number | null;
  matchesReceived: number;
  statusCounts: Record<string, number>;
  stageCounts: Record<string, number>;
  mappedCount: number;
  unresolvedKnockoutCount: number;
  unmappedCount: number;
  normalizationErrorCodes: Record<string, number>;
  /** Non-blocking knockout-shell advisories (future/scheduled shells), for transparency. */
  knockoutShellAdvisories: Record<string, number>;
  /** Phase 1.28R bridge: knockout provider rows mapped to canonical M{n} by official kickoff. */
  knockoutBridgeMapped: number;
  /** Bridge: knockout rows with no official (round,kickoffUtc) match that are playable
   * AND could not be recovered by team identity (these still block). */
  knockoutBridgeUnmatchedPlayable: number;
  /** Bridge: playable knockout rows the time-join missed but recovered by resolved-team
   * identity vs the derived bracket (kickoff drifted from the official schedule). */
  knockoutBridgeRecoveredByTeams: number;
  validationWarnings: number;
  derivedStandingsSource: "results";
  providerStandingsComparisonOnly: boolean;
  standingsFetched: boolean;
  standingsComparisonRows: number;
  standingsSkippedReason: string | null;
  freshnessOverall: string | null;
}

export interface RunResult {
  exitCode: number;
  summary?: FetchSummary;
  error?: string;
  /**
   * The internally derived `LiveTournamentState` (validated, Article-13 standings +
   * bracket). Returned IN MEMORY so callers (e.g. the sanitized-projection writer) can
   * map it without persisting raw provider payloads to disk. Set only on success.
   */
  state?: LiveTournamentState;
}

export const DEFAULT_OPTIONS: FetchOptions = {
  standings: true,
  dryRun: false,
  summaryOnly: false,
  expectFullTournament: true,
  outDir: DEFAULT_OUT_DIR,
};

/** Parse the maintainer CLI flags (simple, order-independent). */
export function parseArgs(argv: string[]): FetchOptions {
  const has = (f: string) => argv.includes(f);
  const valueOf = (f: string): string | undefined => {
    const i = argv.indexOf(f);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  return {
    standings: !has("--no-standings"),
    dryRun: has("--dry-run"),
    summaryOnly: has("--summary-only"),
    expectFullTournament: !has("--partial"),
    outDir: valueOf("--out") ?? DEFAULT_OUT_DIR,
  };
}

/** Extract only the throttle headers; account-identifying headers are dropped. */
export function readThrottle(res: FetchResponseLike): ThrottleInfo {
  const ra = res.headers.get("X-RequestsAvailable");
  return {
    requestsAvailable: ra == null || ra === "" ? null : Number(ra),
    counterReset: res.headers.get("X-RequestCounter-Reset"),
    apiVersion: res.headers.get("X-API-Version"),
    // NOTE: X-Authenticated-Client is intentionally NOT read/echoed (account identity).
  };
}

/** Provider-level counts computed in plain JS from the raw matches payload. */
export function summariseMatchesPayload(payload: FdMatchesResponse): {
  competition: { code?: string; name?: string };
  resultSetCount: number | null;
  resultSetPlayed: number | null;
  matchesReceived: number;
  statusCounts: Record<string, number>;
  stageCounts: Record<string, number>;
} {
  const statusCounts: Record<string, number> = {};
  const stageCounts: Record<string, number> = {};
  for (const m of payload.matches ?? []) {
    statusCounts[m.status] = (statusCounts[m.status] ?? 0) + 1;
    stageCounts[m.stage] = (stageCounts[m.stage] ?? 0) + 1;
  }
  return {
    competition: { code: payload.competition?.code, name: payload.competition?.name },
    resultSetCount: payload.resultSet?.count ?? null,
    resultSetPlayed: payload.resultSet?.played ?? null,
    matchesReceived: (payload.matches ?? []).length,
    statusCounts,
    stageCounts,
  };
}

// Codes that are genuine BLOCKERS (a real mapping risk that must stop a write).
// NOTE: `knockout-shell-unmapped` is deliberately NOT here - it is an advisory for
// scheduled/future knockout shells the app does not need (the bracket is derived
// internally), so it must never count toward `unmappedCount`.
const UNMAPPED_CODES = new Set([
  "unknown-team",
  "unmapped-match",
  "knockout-mapping-unavailable",
  "unknown-stage",
  "unknown-group",
]);

// Non-blocking knockout-shell advisories (future/scheduled shells, excluded from results).
const KNOCKOUT_ADVISORY_CODES = new Set([
  "unresolved-knockout",
  "partially-resolved-knockout",
  "knockout-shell-unmapped",
]);

function tallyCodes(codes: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of codes) out[c] = (out[c] ?? 0) + 1;
  return out;
}

/**
 * A concise, REDACTED one-line description of a blocking provider row (for maintainer/CI
 * logs). Includes only public, non-secret fields: the normalization code, the public
 * provider fixture id, stage/status/kickoff, and team names + the app id they resolve to
 * (or "unresolved"/"TBD"). Never prints tokens, the Blob URL, scores, or the raw payload.
 */
export function formatBlockerDiagnostic(issue: NormalizationIssue, fd?: FdMatch): string {
  if (!fd) return `code=${issue.code} providerId=${issue.providerId} (row not found in payload)`;
  const side = (t: FdMatch["homeTeam"]): string => {
    const name = t?.name ?? (t && t.id == null ? "TBD" : "?");
    const id = resolveFdTeamId(t) ?? "unresolved";
    return `"${name}"(${id})`;
  };
  return [
    `code=${issue.code}`,
    `providerId=${issue.providerId}`,
    `stage=${fd.stage}`,
    `status=${fd.status}`,
    `utcDate=${fd.utcDate}`,
    `home=${side(fd.homeTeam)}`,
    `away=${side(fd.awayTeam)}`,
  ].join(" ");
}

async function readJson(res: FetchResponseLike): Promise<unknown> {
  const raw = await res.text();
  return JSON.parse(raw) as unknown;
}

/** A short, human description for a non-OK HTTP status (no token/account data). */
function httpProblem(status: number, throttle: ThrottleInfo): string {
  if (status === 401 || status === 403) {
    return `auth/tier error (HTTP ${status}); check token or required plan tier`;
  }
  if (status === 429) {
    return `rate limited (HTTP 429); counter resets in ${throttle.counterReset ?? "?"}s`;
  }
  if (status >= 500) return `provider error (HTTP ${status})`;
  return `unexpected response (HTTP ${status})`;
}

/**
 * Run the local fetch + normalize + validate pipeline. Returns an exit code and a
 * redacted summary. NEVER logs/returns the token. Fails closed (non-zero) on any
 * auth/rate/parse/normalize/validate problem.
 */
export async function runFetchLiveState(deps: FetchDeps): Promise<RunResult> {
  const { token, fetchImpl, now, writeArtifact, log, options } = deps;
  const fetchedAt = now();
  const reference = deps.reference ?? buildOfficialReference();
  const persist = !options.dryRun && !options.summaryOnly;
  const writeIf = (name: string, contents: string) => {
    if (persist) writeArtifact(`${options.outDir}/${name}`, contents);
  };

  if (!token) {
    log("ERROR: FOOTBALL_DATA_TOKEN is not set in the environment. No fetch attempted.");
    return { exitCode: 1, error: "missing-token" };
  }

  const headers = { "X-Auth-Token": token };
  const matchesUrl = `${FOOTBALL_DATA_BASE}${MATCHES_PATH}`;

  // --- fetch matches ---
  let matchesRes: FetchResponseLike;
  try {
    matchesRes = await fetchImpl(matchesUrl, { headers });
  } catch {
    log("ERROR: network failure fetching matches.");
    return { exitCode: 1, error: "network-error" };
  }
  const throttle = readThrottle(matchesRes);
  const httpStatuses: Record<string, number> = { matches: matchesRes.status };

  if (!matchesRes.ok) {
    log(`ERROR: ${httpProblem(matchesRes.status, throttle)}`);
    return { exitCode: 1, error: `http-${matchesRes.status}` };
  }

  let matchesPayload: FdMatchesResponse;
  try {
    matchesPayload = (await readJson(matchesRes)) as FdMatchesResponse;
  } catch {
    log("ERROR: matches response was not valid JSON.");
    return { exitCode: 1, error: "invalid-json" };
  }
  writeIf("matches.raw.json", JSON.stringify(matchesPayload));

  const provider = summariseMatchesPayload(matchesPayload);

  // --- knockout fixture identity bridge (Phase 1.28R): provider (stage,utcDate) ->
  // official (round,kickoffUtc) -> canonical matchNumber. In-memory only; fails closed on
  // ambiguous (duplicate) keys. Provider IDs never leave this map (not logged/persisted). ---
  let knockoutBridge: ReturnType<typeof buildKnockoutMatchIdMap>;
  try {
    knockoutBridge = buildKnockoutMatchIdMap(matchesPayload);
  } catch (e) {
    log(`ERROR: knockout identity bridge failed: ${e instanceof Error ? e.message : "unknown"}`);
    return { exitCode: 1, error: "knockout-bridge-failed" };
  }

  const normalizeWith = (knockoutMatchIdMap: Record<string, number>) =>
    normalizeFootballDataMatches(matchesPayload, {
      reference,
      expectFullTournament: options.expectFullTournament,
      asOf: fetchedAt,
      knockoutMatchIdMap,
    });
  const deriveFrom = (n: ReturnType<typeof normalizeFootballDataMatches>) =>
    ingestLiveSnapshot(n.snapshot, reference, { generatedAt: fetchedAt, staleAfterSeconds: 24 * 60 * 60 });

  // --- normalize (fails closed on non-WC / count mismatch / schema drift) ---
  let knockoutMatchIdMap = knockoutBridge.knockoutMatchIdMap;
  let normalized: ReturnType<typeof normalizeFootballDataMatches>;
  try {
    normalized = normalizeWith(knockoutMatchIdMap);
  } catch (e) {
    log(`ERROR: normalization failed: ${e instanceof Error ? e.message : "unknown"}`);
    return { exitCode: 1, error: "normalize-failed" };
  }

  // --- validate + derive internally ---
  let state = deriveFrom(normalized);

  // Recovery pass (Phase 1.28S): a finished/active knockout the exact (round,kickoffUtc)
  // join missed - e.g. a kickoff rescheduled after the official PDF - can still be
  // identified by its RESOLVED team pair against the internally derived bracket. This keeps
  // a genuine result from spuriously hard-blocking the write, while a truly unidentifiable
  // completed result still fails closed (team pair matches no resolved slot -> stays unmapped).
  let recoveredByTeams: KnockoutTeamRecovery[] = [];
  if (knockoutBridge.diagnostics.unmatchedPlayable > 0) {
    const aug = augmentKnockoutMapByTeams(matchesPayload, knockoutMatchIdMap, state.bracket);
    if (aug.recovered.length > 0) {
      knockoutMatchIdMap = aug.knockoutMatchIdMap;
      recoveredByTeams = aug.recovered;
      for (const r of aug.recovered) {
        log(
          `RECOVERED knockout by team identity: providerId=${r.providerId} ${r.stage} -> M${r.matchNumber} ` +
            `[${r.teamA} v ${r.teamB}] (kickoff drifted from the official schedule; identified by participants).`,
        );
      }
      try {
        normalized = normalizeWith(knockoutMatchIdMap);
      } catch (e) {
        log(`ERROR: normalization failed after knockout team-identity recovery: ${e instanceof Error ? e.message : "unknown"}`);
        return { exitCode: 1, error: "normalize-failed" };
      }
      state = deriveFrom(normalized);
    }
  }

  // Cross-check: bridged knockout matches with resolved teams must agree with the
  // internally derived bracket slot. A conflict means a mis-map -> fail closed (no write).
  const knockoutConflicts = findKnockoutTeamConflicts(state.matches, state.bracket);
  if (knockoutConflicts.length > 0) {
    log(`ERROR: ${knockoutConflicts.length} knockout team conflict(s) vs internal bracket; failing closed.`);
    return { exitCode: 1, error: "knockout-team-conflict" };
  }

  writeIf("live-state.json", JSON.stringify(state));

  const errorCodes = normalized.errors.map((x) => x.code);

  // Per-blocker diagnostics (redacted): surface EXACTLY which provider row hard-blocks the
  // write so a scheduler failure is diagnosable from the logs alone - without leaking tokens,
  // the Blob URL, or the raw payload. Provider match ids are public fixture ids (not secrets)
  // and go to the console log only, never to persisted state/artifacts.
  const blockers = normalized.errors.filter((e) => UNMAPPED_CODES.has(e.code));
  if (blockers.length > 0) {
    const rowById = new Map((matchesPayload.matches ?? []).map((m) => [String(m.id), m]));
    log(`BLOCKING normalization issues: ${blockers.length} (write will be prevented)`);
    for (const b of blockers) log(`  - ${formatBlockerDiagnostic(b, rowById.get(b.providerId))}`);
  }

  // --- standings (comparison-only), gated by rate limit ---
  let standingsFetched = false;
  let standingsComparisonRows = 0;
  let standingsSkippedReason: string | null = null;
  if (options.standings) {
    if (throttle.requestsAvailable != null && throttle.requestsAvailable <= 1) {
      standingsSkippedReason = "rate-limit (X-RequestsAvailable<=1)";
    } else {
      const standingsUrl = `${FOOTBALL_DATA_BASE}${STANDINGS_PATH}`;
      try {
        const sRes = await fetchImpl(standingsUrl, { headers });
        httpStatuses.standings = sRes.status;
        if (sRes.ok) {
          const sPayload = (await readJson(sRes)) as FdStandingsResponse;
          writeIf("standings.raw.json", JSON.stringify(sPayload));
          // COMPARISON ONLY: extracted, never fed into derivation.
          standingsComparisonRows = extractFootballDataStandings(sPayload).length;
          standingsFetched = true;
        } else {
          standingsSkippedReason = `standings HTTP ${sRes.status}`;
        }
      } catch {
        standingsSkippedReason = "standings fetch/parse failed";
      }
    }
  } else {
    standingsSkippedReason = "disabled (--no-standings)";
  }

  const summary: FetchSummary = {
    fetchedAt,
    endpoints: options.standings && standingsFetched ? [matchesUrl, `${FOOTBALL_DATA_BASE}${STANDINGS_PATH}`] : [matchesUrl],
    httpStatuses,
    throttle,
    competition: provider.competition,
    resultSetCount: provider.resultSetCount,
    resultSetPlayed: provider.resultSetPlayed,
    matchesReceived: provider.matchesReceived,
    statusCounts: provider.statusCounts,
    stageCounts: provider.stageCounts,
    mappedCount: normalized.snapshot.matches.length,
    unresolvedKnockoutCount: errorCodes.filter((c) => c === "unresolved-knockout").length,
    unmappedCount: errorCodes.filter((c) => UNMAPPED_CODES.has(c)).length,
    normalizationErrorCodes: tallyCodes(errorCodes),
    knockoutShellAdvisories: tallyCodes(errorCodes.filter((c) => KNOCKOUT_ADVISORY_CODES.has(c))),
    knockoutBridgeMapped: knockoutBridge.diagnostics.mapped + recoveredByTeams.length,
    knockoutBridgeUnmatchedPlayable: knockoutBridge.diagnostics.unmatchedPlayable - recoveredByTeams.length,
    knockoutBridgeRecoveredByTeams: recoveredByTeams.length,
    validationWarnings: state.warnings.length,
    derivedStandingsSource: "results",
    providerStandingsComparisonOnly: true,
    standingsFetched,
    standingsComparisonRows,
    standingsSkippedReason,
    freshnessOverall: state.freshness.overall,
  };

  writeIf("summary.json", JSON.stringify(summary, null, 2));
  log(formatSummary(summary));
  return { exitCode: 0, summary, state };
}

/** Render a concise, redacted console summary (no token/account/raw payload). */
export function formatSummary(s: FetchSummary): string {
  const lines = [
    "football-data.org local fetch summary",
    `  fetchedAt:           ${s.fetchedAt}`,
    `  endpoints:           ${s.endpoints.length}`,
    `  httpStatuses:        ${JSON.stringify(s.httpStatuses)}`,
    `  X-RequestsAvailable: ${s.throttle.requestsAvailable ?? "n/a"}`,
    `  X-RequestCounter-Reset: ${s.throttle.counterReset ?? "n/a"}s`,
    `  X-API-Version:       ${s.throttle.apiVersion ?? "n/a"}`,
    `  competition:         ${s.competition.code ?? "?"} (${s.competition.name ?? "?"})`,
    `  resultSet.count:     ${s.resultSetCount ?? "n/a"}`,
    `  resultSet.played:    ${s.resultSetPlayed ?? "n/a"}`,
    `  matchesReceived:     ${s.matchesReceived}`,
    `  statusCounts:        ${JSON.stringify(s.statusCounts)}`,
    `  stageCounts:         ${JSON.stringify(s.stageCounts)}`,
    `  mapped -> M{n}:      ${s.mappedCount}`,
    `  knockout bridge mapped: ${s.knockoutBridgeMapped} (unmatched playable: ${s.knockoutBridgeUnmatchedPlayable}, recovered by teams: ${s.knockoutBridgeRecoveredByTeams})`,
    `  unmapped/unknown blockers: ${s.unmappedCount}`,
    `  knockout shell advisories: ${JSON.stringify(s.knockoutShellAdvisories)}`,
    `  normalization codes: ${JSON.stringify(s.normalizationErrorCodes)}`,
    `  validation warnings: ${s.validationWarnings}`,
    `  standings derived:   from ${s.derivedStandingsSource} (internal Article 13)`,
    `  provider standings:  comparison-only=${s.providerStandingsComparisonOnly}, fetched=${s.standingsFetched}, rows=${s.standingsComparisonRows}${s.standingsSkippedReason ? `, skipped: ${s.standingsSkippedReason}` : ""}`,
    `  freshness:           ${s.freshnessOverall ?? "n/a"}`,
  ];
  return lines.join("\n");
}
