/**
 * Phase 1.28R - DYNAMIC provider knockout fixture identity bridge.
 * ----------------------------------------------------------------
 * Builds an IN-MEMORY `providerId -> canonical matchNumber` map for knockout rows by
 * joining the provider's `(stage, utcDate)` to our OFFICIAL knockout schedule's
 * `(round, kickoffUtc)` (`data/official/knockout-schedule.ts`). This is provider fixture
 * IDENTITY mapping only - the internal FIFA bracket engine (Article 13 + official graph)
 * stays the source of truth. football-data.org is used for fixture identity/status/scores
 * only; provider IDs stay adapter/provenance and are NEVER committed.
 *
 * Fail-closed (throws) on structural ambiguity: duplicate provider `(stage,utcDate)` or a
 * duplicate official `(round,kickoffUtc)`. Rows with no official match are left UNMAPPED -
 * `normalize` then applies the playability severity (playable -> block, scheduled ->
 * advisory). A separate `findKnockoutTeamConflicts` cross-checks resolved provider teams
 * against the internally derived bracket slot.
 */
import {
  officialKnockoutSchedule,
  type OfficialKnockoutScheduleRow,
} from "@/data/official/knockout-schedule";
import type { LiveBracketState, LiveMatchState } from "@/lib/live-state/types";
import type { FdMatchesResponse } from "./types";
import { resolveFdStage, resolveFdStatus } from "./mapping";

export interface KnockoutBridgeDiagnostics {
  providerKnockoutRows: number;
  mapped: number;
  unmatched: number;
  /** Unmatched rows that are active/finished/ambiguous (these will block in normalize). */
  unmatchedPlayable: number;
  unmatchedByStage: Record<string, number>;
}

export interface KnockoutBridgeResult {
  /** providerId -> canonical matchNumber. In-memory only; never persisted/exposed. */
  knockoutMatchIdMap: Record<string, number>;
  diagnostics: KnockoutBridgeDiagnostics;
}

function officialIndex(rows: readonly OfficialKnockoutScheduleRow[]): Map<string, number> {
  const idx = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.round}|${r.kickoffUtc}`;
    if (idx.has(key)) {
      throw new Error(`official knockout schedule has duplicate (round,kickoffUtc): ${key}`);
    }
    idx.set(key, r.matchNumber);
  }
  return idx;
}

/** Build the in-memory provider-knockout-id -> matchNumber map for a provider payload. */
export function buildKnockoutMatchIdMap(
  payload: FdMatchesResponse,
  schedule: readonly OfficialKnockoutScheduleRow[] = officialKnockoutSchedule,
): KnockoutBridgeResult {
  const idx = officialIndex(schedule);
  const map: Record<string, number> = {};
  const seenProviderKeys = new Set<string>();
  let providerKnockoutRows = 0;
  let mapped = 0;
  let unmatched = 0;
  let unmatchedPlayable = 0;
  const unmatchedByStage: Record<string, number> = {};

  for (const fd of payload.matches ?? []) {
    const stage = resolveFdStage(fd.stage);
    if (!stage || stage === "group") continue; // group stage handled by the normal mapper
    providerKnockoutRows += 1;
    const round = stage; // narrowed to KnockoutStage
    const utc = fd.utcDate;

    // Fail closed: a duplicate (stage,utcDate) makes identity ambiguous -> never guess.
    const provKey = `${round}|${utc}`;
    if (seenProviderKeys.has(provKey)) {
      throw new Error(`provider payload has a duplicate knockout (stage,utcDate): ${fd.stage}|${utc}`);
    }
    seenProviderKeys.add(provKey);

    const matchNumber = idx.get(`${round}|${utc}`);
    if (matchNumber == null) {
      unmatched += 1;
      unmatchedByStage[fd.stage] = (unmatchedByStage[fd.stage] ?? 0) + 1;
      const status = resolveFdStatus(fd.status);
      // playable/ambiguous unmatched -> normalize will BLOCK (knockout-mapping-unavailable)
      if (status === "in-progress" || status === "complete" || status === "unknown") {
        unmatchedPlayable += 1;
      }
      continue; // leave unmapped; normalize decides severity by playability
    }
    map[String(fd.id)] = matchNumber;
    mapped += 1;
  }

  return {
    knockoutMatchIdMap: map,
    diagnostics: { providerKnockoutRows, mapped, unmatched, unmatchedPlayable, unmatchedByStage },
  };
}

export interface KnockoutTeamConflict {
  matchNumber: number;
  providerTeams: [string, string];
  derivedTeams: [string, string];
}

/**
 * Cross-check: when BOTH the provider knockout match and the internally derived bracket
 * slot have resolved teams, they must agree (as an unordered pair). A mismatch means the
 * bridge mis-mapped or the provider disagrees with internal truth -> caller fails closed.
 * Slots not yet resolved internally are skipped (advisory).
 */
export function findKnockoutTeamConflicts(
  matches: readonly LiveMatchState[],
  bracket: LiveBracketState,
): KnockoutTeamConflict[] {
  const bySlot = new Map<number, { home: string | null; away: string | null }>();
  for (const b of bracket.matches) bySlot.set(b.matchNumber, { home: b.homeTeamId, away: b.awayTeamId });

  const conflicts: KnockoutTeamConflict[] = [];
  for (const m of matches) {
    if (m.stage === "group") continue;
    const n = Number(m.matchId.slice(1));
    const slot = bySlot.get(n);
    if (!slot || slot.home == null || slot.away == null) continue; // derived slot unresolved
    const provider = new Set([m.teamA, m.teamB]);
    const derived = new Set([slot.home, slot.away]);
    const same = provider.size === derived.size && [...provider].every((t) => derived.has(t));
    if (!same) {
      conflicts.push({ matchNumber: n, providerTeams: [m.teamA, m.teamB], derivedTeams: [slot.home, slot.away] });
    }
  }
  return conflicts;
}
