/**
 * Phase 1.25B - Live ingestion ORCHESTRATOR.
 * -----------------------------------------
 * Builds the official static reference from the existing data layer and assembles a
 * validated `LiveTournamentState` (validate -> derive standings/bracket -> freshness).
 *
 * This is the only live-state module that reads `lib/data` / `data/official` (so the
 * validator/deriver stay pure and synthetic-fixture testable). It performs NO API
 * calls, NO scraping, and NO probability refresh - manual snapshots only.
 */
import type { GroupId } from "@/lib/types";
import { fixtures, groups, teams, getTeamMeta } from "@/lib/data";
import { officialBracket } from "@/data/official/bracket";
import type { GroupResult } from "@/lib/simulation/bracket";
import { THIRDS_SELECTED } from "@/lib/simulation/bracket-validate";
import { validateLiveSnapshot } from "./validate";
import {
  deriveBracketState,
  deriveGroupStandings,
  finaliseThirdPlace,
  resolveThirdPlaceSlots,
} from "./derive";
import type {
  LiveDataFreshness,
  LiveFreshnessStatus,
  LiveGroupStanding,
  LiveStateReference,
  LiveTournamentState,
  RawLiveSnapshot,
} from "./types";

/** Default freshness window (24h) - a manual daily snapshot is the first source. */
const DEFAULT_STALE_AFTER_SECONDS = 24 * 60 * 60;

/** Build the official static reference (resolved fixtures + bracket + teams). */
export function buildOfficialReference(): LiveStateReference {
  const groupMatches = fixtures
    .filter((f) => typeof f.matchNumber === "number" && f.matchNumber >= 1 && f.matchNumber <= 72)
    .map((f) => ({
      matchId: `M${f.matchNumber}`,
      matchNumber: f.matchNumber as number,
      group: f.group,
      homeTeamId: f.homeTeamId,
      awayTeamId: f.awayTeamId,
    }));

  const knockoutMatches = officialBracket.graph.matches.map((m) => ({
    matchId: `M${m.matchNumber}`,
    matchNumber: m.matchNumber,
    stage: m.stage,
  }));

  return {
    groupMatches,
    knockoutMatches,
    validTeamIds: teams.map((t) => t.id),
    groups: groups.map((g) => ({ id: g.id, teamIds: g.teamIds })),
    teamMeta: getTeamMeta(),
  };
}

export interface IngestOptions {
  /** Deterministic assembly timestamp; defaults to now. */
  generatedAt?: string;
  /** Freshness window in seconds; defaults to 24h. */
  staleAfterSeconds?: number;
  /** Explicit fallback marker (serving a prior snapshot). NEVER silent. */
  fallback?: { reason: string };
}

const ORDER: LiveFreshnessStatus[] = ["fresh", "stale", "fallback", "missing", "invalid"];
function worst(a: LiveFreshnessStatus, b: LiveFreshnessStatus): LiveFreshnessStatus {
  return ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;
}

/** Group winner/runner-up/third for groups that are fully complete (else omitted). */
function completedGroupResults(
  reference: LiveStateReference,
  standings: LiveGroupStanding[],
): Map<GroupId, GroupResult> {
  const out = new Map<GroupId, GroupResult>();
  for (const group of reference.groups) {
    const rows = standings.filter((s) => s.group === group.id).sort((a, b) => a.rank - b.rank);
    if (rows.length !== group.teamIds.length) continue;
    const complete = rows.every((r) => r.played === group.teamIds.length - 1);
    if (!complete) continue;
    out.set(group.id, { winner: rows[0]!.teamId, runnerUp: rows[1]!.teamId, third: rows[2]!.teamId });
  }
  return out;
}

/**
 * Ingest a manual live snapshot into a validated `LiveTournamentState`.
 * @param snapshot   manual-snapshot-style input
 * @param reference  official reference (defaults to `buildOfficialReference()`)
 */
export function ingestLiveSnapshot(
  snapshot: RawLiveSnapshot,
  reference: LiveStateReference = buildOfficialReference(),
  opts: IngestOptions = {},
): LiveTournamentState {
  const asOf = snapshot.asOf ?? snapshot.source.lastUpdatedAt;
  const staleAfterSeconds = opts.staleAfterSeconds ?? DEFAULT_STALE_AFTER_SECONDS;
  const generatedAt = opts.generatedAt ?? new Date().toISOString();

  const validation = validateLiveSnapshot(snapshot, reference, { asOf, staleAfterSeconds });
  // Derive standings, then finalise third-place qualification across groups (no-op until
  // every group is complete), then resolve the Annexe C third-place slots and feed both
  // the group winners/runners-up AND the third-place slots into the bracket derivation.
  const groupStandings = finaliseThirdPlace(reference, deriveGroupStandings(reference, validation.matches));
  const groupResults = completedGroupResults(reference, groupStandings);
  const thirdPlaceSlots = resolveThirdPlaceSlots(reference, groupStandings, groupResults);
  const bracket = deriveBracketState(validation.matches, { groupResults, thirdPlaceSlots });

  // ---- Freshness (never silent: fallback always carries a reason) ----
  let matchesStat: LiveFreshnessStatus = snapshot.matches.length === 0 ? "missing" : "fresh";
  for (const m of validation.matches) matchesStat = worst(matchesStat, m.freshnessStatus);

  const usedComplete = validation.matches.filter(
    (m) => m.freshnessStatus !== "invalid" && m.status === "complete",
  );
  let derivedStat: LiveFreshnessStatus = usedComplete.length === 0 ? "missing" : "fresh";
  for (const m of usedComplete) derivedStat = worst(derivedStat, m.freshnessStatus);

  const warnings = validation.warnings.map((w) => `${w.code}: ${w.message}`);
  // Fail-safe surfacing: if the whole group stage is complete but the Annexe C
  // third-place slots could not be fully resolved (e.g. an unexpected allocation gap),
  // surface a warning rather than silently leaving the bracket partially populated.
  if (groupResults.size === reference.groups.length && thirdPlaceSlots.size < THIRDS_SELECTED) {
    warnings.push(
      "third-place-allocation-unresolved: group stage complete but Annexe C third-place slots were not fully resolved",
    );
  }
  let sections = { matches: matchesStat, standings: derivedStat, bracket: derivedStat };
  let fallbackReason: string | undefined;
  if (opts.fallback) {
    sections = { matches: "fallback", standings: "fallback", bracket: "fallback" };
    fallbackReason = opts.fallback.reason;
    warnings.push(`fallback: ${opts.fallback.reason}`);
  }
  const overall = worst(worst(sections.matches, sections.standings), sections.bracket);

  const freshness: LiveDataFreshness = {
    asOf,
    generatedAt,
    sourceLastUpdatedAt: snapshot.source.lastUpdatedAt,
    overall,
    sections,
    fallbackReason,
    warnings,
  };

  return {
    sourceVersion: snapshot.sourceVersion ?? "unknown",
    generatedAt,
    asOf,
    matches: validation.matches,
    groupStandings,
    bracket,
    warnings,
    freshness,
  };
}
