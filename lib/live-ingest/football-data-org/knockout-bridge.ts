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
import type { KnockoutStage } from "@/lib/types";
import type { LiveBracketState, LiveMatchState } from "@/lib/live-state/types";
import type { FdMatchesResponse } from "./types";
import { resolveFdStage, resolveFdStatus, resolveFdTeamId } from "./mapping";

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

/** A knockout row recovered by RESOLVED-TEAM identity when the exact time-join missed it. */
export interface KnockoutTeamRecovery {
  /** Provider-native match id (provenance only; kept in-memory/log-only, never persisted). */
  providerId: string;
  matchNumber: number;
  stage: KnockoutStage;
  teamA: string;
  teamB: string;
}

export interface KnockoutMapAugmentation {
  /** `existingMap` plus any recovered `providerId -> matchNumber` entries (a NEW object). */
  knockoutMatchIdMap: Record<string, number>;
  recovered: KnockoutTeamRecovery[];
}

/** Result-risk = a played/active/ambiguous status (mirrors normalize's blocking predicate). */
const isResultRiskStatus = (status: string): boolean =>
  status === "in-progress" || status === "complete" || status === "unknown";

const teamPairKey = (stage: string, a: string, b: string): string =>
  `${stage}|${[a, b].sort().join("~")}`;

/**
 * Recover knockout rows the exact `(round,kickoffUtc)` join missed, by RESOLVED-TEAM
 * identity against the internally derived bracket.
 *
 * Motivation: a genuine finished/active knockout whose provider `utcDate` drifted from the
 * transcribed official `kickoffUtc` (e.g. FIFA moved a kickoff after the schedule PDF) would
 * otherwise be an unmappable result and HARD-BLOCK the write - even though its participants
 * unambiguously identify the official slot. Teams are the canonical identity (the same basis
 * as `findKnockoutTeamConflicts`), so this never weakens safety:
 *   - only result-risk rows (in-progress/complete/unknown) are recovered; scheduled shells
 *     stay advisories and never need a mapping;
 *   - BOTH provider sides must resolve to app team ids;
 *   - the `(stage, unordered pair)` must match EXACTLY ONE resolved bracket slot that is not
 *     already a mapping target (ambiguity, or an already-taken target, leaves it unmapped).
 * A row whose teams match no resolved slot stays unmapped and still fails closed in
 * `normalize` (a real, unidentifiable completed result MUST block). Pure; no I/O.
 */
export function augmentKnockoutMapByTeams(
  payload: FdMatchesResponse,
  existingMap: Record<string, number>,
  bracket: LiveBracketState,
): KnockoutMapAugmentation {
  // Index resolved bracket slots by (stage, unordered team pair) -> matchNumber. Skip slots
  // that are unresolved (either side null) or already a time-join target. A duplicate pair
  // key (should never happen in single-elimination) is marked ambiguous and never used.
  const takenTargets = new Set<number>(Object.values(existingMap));
  const slotByPair = new Map<string, number>();
  const ambiguousPairs = new Set<string>();
  for (const b of bracket.matches) {
    if (b.homeTeamId == null || b.awayTeamId == null) continue;
    if (takenTargets.has(b.matchNumber)) continue;
    const key = teamPairKey(b.stage, b.homeTeamId, b.awayTeamId);
    if (slotByPair.has(key)) ambiguousPairs.add(key);
    else slotByPair.set(key, b.matchNumber);
  }

  const knockoutMatchIdMap = { ...existingMap };
  const recovered: KnockoutTeamRecovery[] = [];
  const usedTargets = new Set<number>(takenTargets);

  for (const fd of payload.matches ?? []) {
    const stage = resolveFdStage(fd.stage);
    if (!stage || stage === "group") continue;
    const pid = String(fd.id);
    if (knockoutMatchIdMap[pid] != null) continue; // already mapped by the time-join
    if (!isResultRiskStatus(resolveFdStatus(fd.status))) continue; // scheduled shells never need this
    const teamA = resolveFdTeamId(fd.homeTeam);
    const teamB = resolveFdTeamId(fd.awayTeam);
    if (!teamA || !teamB) continue; // unidentifiable participants -> cannot recover (still blocks)
    const key = teamPairKey(stage, teamA, teamB);
    if (ambiguousPairs.has(key)) continue;
    const matchNumber = slotByPair.get(key);
    if (matchNumber == null || usedTargets.has(matchNumber)) continue;
    knockoutMatchIdMap[pid] = matchNumber;
    usedTargets.add(matchNumber);
    recovered.push({ providerId: pid, matchNumber, stage: stage as KnockoutStage, teamA, teamB });
  }

  return { knockoutMatchIdMap, recovered };
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
