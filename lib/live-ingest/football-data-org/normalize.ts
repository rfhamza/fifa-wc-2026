/**
 * Phase 1.28A - football-data.org -> RawLiveSnapshot normalizer (pure).
 * --------------------------------------------------------------------
 * Converts a football-data.org WC matches payload into the EXISTING internal
 * `RawLiveSnapshot` contract. PURE: no network, no env, no secrets, no time/RNG.
 *
 * Invariants:
 *   - Canonical key is the official `matchNumber` (`matchId = "M{n}"`), resolved
 *     against the app's official fixtures by (group + unordered team pair) for the
 *     group stage, and via an injected provider-id -> matchNumber map for knockouts.
 *   - Provider match `id` is PROVENANCE ONLY (never the key).
 *   - Provider standings are COMPARISON ONLY (separate extractor; never ingested).
 *   - Unknown/ambiguous/unresolved rows FAIL CLOSED (excluded + recorded in errors).
 *   - No event-level fields (goals/bookings/substitutions/crests) are ever read out.
 */
import { buildOfficialReference } from "@/lib/live-state/ingest";
import type {
  LiveIngestionSource,
  LiveStateReference,
  RawLiveMatch,
} from "@/lib/live-state/types";
import type {
  NormalizationIssue,
  NormalizedResult,
  ProviderProvenanceRow,
  ProviderStandingRow,
} from "@/lib/live-ingest/types";
import { parseGroupId, resolveVenueId } from "@/lib/live-ingest/mapping";
import { resolveFdStage, resolveFdStatus, resolveFdTeamId } from "./mapping";
import type { FdMatchesResponse, FdStandingsResponse } from "./types";

const SOURCE_ID = "football-data-org";
const SOURCE_NAME = "football-data.org";

export interface FdNormalizeOptions {
  /** Official reference; defaults to `buildOfficialReference()`. */
  reference?: LiveStateReference;
  /** Assert a complete-tournament payload (resultSet.count === 104). */
  expectFullTournament?: boolean;
  /** Provider match id (as string) -> official matchNumber, for resolved knockouts. */
  knockoutMatchIdMap?: Record<string, number>;
  /** ISO "as of" of the snapshot. */
  asOf?: string;
  /** ISO source last-updated; defaults to the latest match `lastUpdated`, then asOf. */
  lastUpdatedAt?: string;
}

const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const pairKey = (group: string, a: string, b: string): string =>
  `${group}|${[a, b].sort().join("~")}`;

/** Build a (group + unordered app team pair) -> "M{n}" index from official fixtures. */
function buildGroupPairIndex(reference: LiveStateReference): Map<string, string> {
  const idx = new Map<string, string>();
  for (const gm of reference.groupMatches) {
    idx.set(pairKey(gm.group, gm.homeTeamId, gm.awayTeamId), gm.matchId);
  }
  return idx;
}

/**
 * Normalize a football-data.org matches payload into a `RawLiveSnapshot` (+ provenance,
 * comparison placeholder, and per-row exclusion errors).
 */
export function normalizeFootballDataMatches(
  payload: FdMatchesResponse,
  opts: FdNormalizeOptions = {},
): NormalizedResult {
  const code = payload.competition?.code;
  if (code && code !== "WC") {
    throw new Error(`football-data.org payload is not the World Cup (competition.code="${code}").`);
  }
  if (opts.expectFullTournament) {
    const count = payload.resultSet?.count;
    if (count !== 104 || payload.matches.length !== 104) {
      throw new Error(
        `Expected a complete 104-match tournament payload (resultSet.count=${String(count)}, matches=${payload.matches.length}).`,
      );
    }
  }

  const reference = opts.reference ?? buildOfficialReference();
  const pairIndex = buildGroupPairIndex(reference);

  const errors: NormalizationIssue[] = [];
  const matches: RawLiveMatch[] = [];
  const provenance: ProviderProvenanceRow[] = [];
  let latestUpdated: string | undefined;

  for (const fd of payload.matches) {
    const pid = String(fd.id);
    const issue = (codeStr: string, message: string) =>
      errors.push({ providerId: pid, code: codeStr, message });

    if (typeof fd.lastUpdated === "string" && (!latestUpdated || fd.lastUpdated > latestUpdated)) {
      latestUpdated = fd.lastUpdated;
    }

    const stage = resolveFdStage(fd.stage);
    if (!stage) {
      issue("unknown-stage", `Unrecognised stage "${fd.stage}".`);
      continue;
    }
    const status = resolveFdStatus(fd.status);
    const knockout = stage !== "group";

    // Knockout fixtures whose participants are not yet determined are excluded as
    // SHELLS, never as "unknown team". football-data.org leaves an undetermined side
    // as a null-id team (`{ id: null, name: null, ... }`), so a null provider id is
    // the reliable "this slot is still a TBD placeholder" signal:
    //   - both sides undetermined  -> unresolved-knockout (as before)
    //   - exactly one side undetermined -> partially-resolved-knockout (new)
    // A side that DOES carry a real provider id but whose NAME we cannot map is a
    // genuine unknown-team and still fails closed below (alias gap, not a TBD slot).
    const homeUnresolved = !fd.homeTeam || fd.homeTeam.id == null;
    const awayUnresolved = !fd.awayTeam || fd.awayTeam.id == null;
    if (knockout && (homeUnresolved || awayUnresolved)) {
      if (homeUnresolved && awayUnresolved) {
        issue("unresolved-knockout", `Knockout ${pid} has both teams undetermined; excluded from live results.`);
      } else {
        issue("partially-resolved-knockout", `Knockout ${pid} has one undetermined side (TBD placeholder); excluded until both teams are known.`);
      }
      continue;
    }

    const teamA = resolveFdTeamId(fd.homeTeam);
    if (!teamA) {
      issue("unknown-team", `Unmappable home team "${fd.homeTeam?.name ?? ""}".`);
      continue;
    }
    const teamB = resolveFdTeamId(fd.awayTeam);
    if (!teamB) {
      issue("unknown-team", `Unmappable away team "${fd.awayTeam?.name ?? ""}".`);
      continue;
    }

    let group: ReturnType<typeof parseGroupId> | undefined;
    if (stage === "group") {
      const g = parseGroupId(fd.group ?? "");
      if (!g) {
        issue("unknown-group", `Unrecognised group "${fd.group ?? ""}".`);
        continue;
      }
      group = g;
    }

    // Resolve canonical matchId.
    let matchId: string | null = null;
    if (stage === "group") {
      matchId = pairIndex.get(pairKey(group as string, teamA, teamB)) ?? null;
      if (!matchId) {
        issue("unmapped-match", `No official group fixture for ${group} ${teamA} v ${teamB}.`);
        continue;
      }
    } else {
      const mapped = opts.knockoutMatchIdMap?.[pid];
      if (mapped == null) {
        // Both knockout sides are resolved + mappable here (TBD/unknown sides were handled
        // above), but there is no provider-id -> matchNumber mapping. Severity depends on
        // whether excluding this row would drop a REAL result:
        //   - active / finished / ambiguous status (in-progress | complete | unknown) ->
        //     BLOCKING `knockout-mapping-unavailable` (never silently drop a live/finished
        //     knockout result we cannot map). Covers provider LIVE/IN_PLAY/PAUSED/FINISHED;
        //     `unknown` is treated as a result-risk conservatively.
        //   - scheduled / postponed / cancelled (not yet a played result) -> ADVISORY
        //     `knockout-shell-unmapped`. The bracket is derived internally, so nothing real
        //     is lost; these future shells must NOT block group-stage provider writes.
        const isResultRisk =
          status === "in-progress" || status === "complete" || status === "unknown";
        if (isResultRisk) {
          issue("knockout-mapping-unavailable", `Active/finished knockout ${pid} (status "${status}") has no matchNumber mapping; cannot safely record result.`);
        } else {
          issue("knockout-shell-unmapped", `Scheduled knockout shell ${pid} (status "${status}") resolved but not yet mapped; advisory - bracket is derived internally.`);
        }
        continue;
      }
      matchId = `M${mapped}`;
    }

    const playable = status === "complete" || status === "in-progress";
    const match: RawLiveMatch = {
      matchId,
      stage,
      ...(group ? { group } : {}),
      teamA,
      teamB,
      status,
      kickoff: fd.utcDate,
      lastUpdatedAt: fd.lastUpdated,
    };

    // Scores only for playable statuses with present full-time numbers.
    if (playable && isNum(fd.score?.fullTime?.home) && isNum(fd.score?.fullTime?.away)) {
      match.goalsA = fd.score!.fullTime!.home as number;
      match.goalsB = fd.score!.fullTime!.away as number;
    }

    // Winner/penalties are knockout-only.
    if (knockout && status === "complete") {
      const w = fd.score?.winner;
      if (w === "HOME_TEAM") match.winner = teamA;
      else if (w === "AWAY_TEAM") match.winner = teamB;
      const pen = fd.score?.penalties;
      if (pen && isNum(pen.home) && isNum(pen.away)) match.penalties = { a: pen.home, b: pen.away };
    }

    matches.push(match);
    provenance.push({
      matchNumber: Number(matchId.slice(1)),
      matchId,
      providerId: pid,
      providerRound: fd.stage,
      homeCode: fd.homeTeam?.tla ?? undefined,
      awayCode: fd.awayTeam?.tla ?? undefined,
      venueRaw: fd.venue ?? undefined,
      providerVenueId: fd.venue ? resolveVenueId(fd.venue) : null,
    });
  }

  const lastUpdatedAt = opts.lastUpdatedAt ?? latestUpdated ?? opts.asOf;
  if (!lastUpdatedAt) {
    throw new Error("Cannot determine source lastUpdatedAt: supply opts.lastUpdatedAt or opts.asOf.");
  }
  const asOf = opts.asOf ?? lastUpdatedAt;

  const source: LiveIngestionSource = {
    sourceId: SOURCE_ID,
    sourceType: "api",
    sourceName: SOURCE_NAME,
    lastUpdatedAt,
    reliability: "medium",
  };

  return {
    snapshot: { sourceVersion: asOf, source, asOf, matches },
    provenance: { sourceId: SOURCE_ID, retrievedAt: lastUpdatedAt, asOf, matches: provenance },
    comparison: {
      standings: [],
      bracket: [],
      note: "Provider standings/bracket are comparison-only; the app derives both from results.",
    },
    errors,
  };
}

/**
 * Extract football-data.org standings as COMPARISON-ONLY rows. The WC standings
 * endpoint returns one overall 48-team table (`group: null`, `type: "TOTAL"`), which
 * is NOT per-group Article 13 - never feed this into app-derived standings.
 */
export function extractFootballDataStandings(payload: FdStandingsResponse): ProviderStandingRow[] {
  const total = payload.standings.find((b) => b.type === "TOTAL") ?? payload.standings[0];
  if (!total) return [];
  return total.table.map((row) => ({
    group: "OVERALL", // provider table is overall, not per-group (comparison-only)
    position: row.position,
    teamName: row.team.name ?? "",
    played: row.playedGames,
    points: row.points,
  }));
}
