/**
 * Phase 1.25B - Derivation: standings + bracket progression (pure, read-only reuse).
 * ---------------------------------------------------------------------------------
 * Standings and bracket progression are DERIVED from completed results, never
 * trusted as supplied. This module REUSES existing pure helpers READ-ONLY and does
 * not modify them:
 *   - `computeGroupStandings`, `rankThirdPlacedTeams`  (lib/simulation/standings)
 *   - `realiseOfficialBracket`                         (lib/simulation/bracket)
 *   - the official knockout graph                      (data/official/bracket)
 *
 * Unresolved slots stay unresolved; ties are flagged, never force-decided (no
 * drawing-of-lots). It imports NO model/prediction/simulator-engine code.
 */
import type {
  GroupId,
  QualifierSlot,
  ThirdPlaceAllocationMap,
  ThirdPlaceSlotId,
} from "@/lib/types";
import {
  computeGroupStandings,
  rankThirdPlacedTeams,
  type MatchResult,
} from "@/lib/simulation/standings";
import {
  realiseOfficialBracket,
  type GroupResult,
  type RealisedKnockout,
} from "@/lib/simulation/bracket";
import { normalizeCombinationKey, THIRD_SLOT_IDS, THIRDS_SELECTED } from "@/lib/simulation/bracket-validate";
import { officialBracket } from "@/data/official/bracket";
import type {
  LiveBracketMatch,
  LiveBracketState,
  LiveGroupStanding,
  LiveMatchState,
  LiveStateReference,
} from "./types";

/** Parse "M73" -> 73; returns NaN for non-conforming ids. */
function matchNumberOf(matchId: string): number {
  const m = /^M(\d+)$/.exec(matchId);
  return m ? Number(m[1]) : NaN;
}

/** A live match usable for derivation: validated (not invalid) + completed. */
function isUsableComplete(m: LiveMatchState): boolean {
  return m.freshnessStatus !== "invalid" && m.status === "complete";
}

/**
 * Derive group standings (Article 13, via the existing pure helper) from completed
 * group-stage results. Qualification is marked ONLY when safe without overclaiming:
 * once a group is complete, ranks 1-2 are `qualified`, rank 4 is `eliminated`, and
 * rank 3 stays `undecided` (best-third races resolve cross-group). Incomplete groups
 * are all `undecided`. No full clinch/elimination maths in this phase.
 */
export function deriveGroupStandings(
  reference: LiveStateReference,
  validMatches: LiveMatchState[],
): LiveGroupStanding[] {
  const byId = new Map(validMatches.map((m) => [m.matchId, m]));
  const out: LiveGroupStanding[] = [];

  for (const group of reference.groups) {
    const refMatches = reference.groupMatches.filter((g) => g.group === group.id);
    const results: MatchResult[] = [];
    for (const gm of refMatches) {
      const live = byId.get(gm.matchId);
      if (!live || !isUsableComplete(live)) continue;
      if (typeof live.goalsA !== "number" || typeof live.goalsB !== "number") continue;
      // Orient supplied teamA/teamB to the official home/away of the fixture.
      const aIsHome = live.teamA === gm.homeTeamId;
      results.push({
        homeTeamId: gm.homeTeamId,
        awayTeamId: gm.awayTeamId,
        homeGoals: aIsHome ? live.goalsA : live.goalsB,
        awayGoals: aIsHome ? live.goalsB : live.goalsA,
      });
    }

    const standings = computeGroupStandings(group.id, group.teamIds, results, reference.teamMeta);
    const groupComplete = refMatches.length > 0 && results.length === refMatches.length;
    for (const s of standings) {
      out.push({
        ...s,
        qualificationState: groupComplete
          ? s.rank <= 2
            ? "qualified"
            : s.rank === 4
              ? "eliminated"
              : "undecided"
          : "undecided",
        derivedFrom: "results",
      });
    }
  }
  return out;
}

/**
 * Best-third ranking across groups (read-only reuse of `rankThirdPlacedTeams`).
 * Returns the third-placed standings in qualification order; callers decide how
 * many qualify. Exposed for completeness/parity testing.
 */
export function rankLiveThirdPlaced(
  reference: LiveStateReference,
  standings: LiveGroupStanding[],
): LiveGroupStanding[] {
  const thirds = standings.filter((s) => s.rank === 3);
  const ranked = rankThirdPlacedTeams(thirds, reference.teamMeta);
  // Re-attach the qualification/derivedFrom fields preserved from the inputs.
  const byTeam = new Map(thirds.map((t) => [t.teamId, t]));
  return ranked.map((r) => byTeam.get(r.teamId) ?? { ...r, qualificationState: "undecided", derivedFrom: "results" });
}

/**
 * True only when EVERY group is fully complete (all rows present and every team has
 * played all its games). Mirrors `completedGroupResults` (ingest.ts) so third-place
 * finalisation and slot resolution gate on exactly the same notion of completeness.
 */
function allGroupsComplete(reference: LiveStateReference, standings: LiveGroupStanding[]): boolean {
  for (const group of reference.groups) {
    const rows = standings.filter((s) => s.group === group.id);
    if (rows.length !== group.teamIds.length) return false;
    if (!rows.every((r) => r.played === group.teamIds.length - 1)) return false;
  }
  return true;
}

/**
 * Finalise third-place qualification once the WHOLE group stage is complete: rank the
 * twelve third-placed teams (best-thirds via the pure Article-13 helper) and mark the
 * top `THIRDS_SELECTED` (8) `qualified` and the remaining four `eliminated`. While any
 * group is incomplete this is a NO-OP (returns the input unchanged), preserving the
 * cautious `undecided` state. Pure: returns a new array, never mutates.
 */
export function finaliseThirdPlace(
  reference: LiveStateReference,
  standings: LiveGroupStanding[],
): LiveGroupStanding[] {
  if (!allGroupsComplete(reference, standings)) return standings;
  const thirds = standings.filter((s) => s.rank === 3);
  const ranked = rankThirdPlacedTeams(thirds, reference.teamMeta);
  const qualified = new Set(ranked.slice(0, THIRDS_SELECTED).map((t) => t.teamId));
  return standings.map((s) =>
    s.rank === 3
      ? { ...s, qualificationState: qualified.has(s.teamId) ? "qualified" : "eliminated" }
      : s,
  );
}

/**
 * Resolve the eight R32 third-place slots (T1..T8) via the internal Annexe C table once
 * the whole group stage is complete. Reads the qualifying-thirds groups from the
 * FINALISED standings (so call `finaliseThirdPlace` first), normalises the combination
 * key, looks up the internal 495-row allocation, and maps each slot to that group's
 * third-placed team (from `groupResults`). FAIL-SAFE: returns an empty map (slots stay
 * unresolved) when the group stage is incomplete, the qualifying set is not exactly 8,
 * or the allocation key is absent - it never throws and never force-assigns. Pure.
 * `allocation` is injectable for testing the fail-safe; it defaults to the official map.
 */
export function resolveThirdPlaceSlots(
  reference: LiveStateReference,
  standings: LiveGroupStanding[],
  groupResults: Map<GroupId, GroupResult>,
  allocation: ThirdPlaceAllocationMap = officialBracket.thirdPlaceAllocation,
): Map<ThirdPlaceSlotId, string> {
  const out = new Map<ThirdPlaceSlotId, string>();
  if (!allGroupsComplete(reference, standings)) return out;
  const qualifyingGroups = standings
    .filter((s) => s.rank === 3 && s.qualificationState === "qualified")
    .map((s) => s.group);
  if (qualifyingGroups.length !== THIRDS_SELECTED) return out;
  const assign = allocation[normalizeCombinationKey(qualifyingGroups)];
  if (!assign) return out; // fail-safe: unknown combination -> leave slots unresolved
  for (const slot of THIRD_SLOT_IDS) {
    const group = assign[slot];
    const gr = group ? groupResults.get(group) : undefined;
    if (gr) out.set(slot, gr.third);
  }
  return out;
}

/** Winner of a completed knockout live match (explicit, by goals, or by penalties). */
function knockoutWinner(m: LiveMatchState): string | null {
  if (m.status !== "complete") return null;
  if (m.winner) return m.winner;
  if (typeof m.goalsA === "number" && typeof m.goalsB === "number") {
    if (m.goalsA > m.goalsB) return m.teamA;
    if (m.goalsB > m.goalsA) return m.teamB;
    if (m.penalties) return m.penalties.a > m.penalties.b ? m.teamA : m.teamB;
  }
  return null;
}

/**
 * Derive knockout bracket progression from completed knockout results, walking the
 * official graph in match-number order so later matches read earlier winners/losers.
 * Group-position slots resolve when `groupResults` is supplied; third-place slots
 * resolve when `thirdPlaceSlots` (the Annexe C allocation) is supplied. Anything
 * still undetermined stays null/unresolved (never force-decided).
 */
export function deriveBracketState(
  validMatches: LiveMatchState[],
  opts: {
    groupResults?: Map<GroupId, GroupResult>;
    /** Resolved Annexe C third-place slots (T1..T8 -> team id); empty until the group stage is complete. */
    thirdPlaceSlots?: Map<ThirdPlaceSlotId, string>;
  } = {},
): LiveBracketState {
  const completed = new Map<number, LiveMatchState>();
  for (const m of validMatches) {
    const n = matchNumberOf(m.matchId);
    if (Number.isFinite(n) && n >= 73 && isUsableComplete(m)) completed.set(n, m);
  }

  const winners = new Map<number, string>();
  const losers = new Map<number, string>();
  const unresolved: number[] = [];
  const unresolvedTies: string[] = [];
  const matches: LiveBracketMatch[] = [];

  const resolveSlot = (slot: QualifierSlot): string | null => {
    switch (slot.kind) {
      case "groupPosition": {
        const gr = opts.groupResults?.get(slot.group);
        if (!gr) return null;
        return slot.position === 1 ? gr.winner : gr.runnerUp;
      }
      case "thirdPlace":
        // Resolved via the internal Annexe C allocation once the group stage is
        // complete (see resolveThirdPlaceSlots); null while still undetermined.
        return opts.thirdPlaceSlots?.get(slot.slot) ?? null;
      case "matchWinner":
        return winners.get(slot.matchNumber) ?? null;
      case "matchLoser":
        return losers.get(slot.matchNumber) ?? null;
    }
  };

  const ordered = [...officialBracket.graph.matches].sort((a, b) => a.matchNumber - b.matchNumber);
  for (const def of ordered) {
    const live = completed.get(def.matchNumber);
    let home = resolveSlot(def.home);
    let away = resolveSlot(def.away);
    let winner: string | null = null;
    let status: LiveBracketMatch["status"] = "scheduled";

    if (live) {
      status = live.status;
      // The completed result names the participants even if slots weren't resolvable.
      home = home ?? live.teamA;
      away = away ?? live.teamB;
      winner = knockoutWinner(live);
      if (winner) {
        const loser = winner === live.teamA ? live.teamB : live.teamA;
        winners.set(def.matchNumber, winner);
        losers.set(def.matchNumber, loser);
      } else {
        unresolvedTies.push(`M${def.matchNumber}: completed but winner indeterminate`);
      }
    }

    const resolved = winner !== null;
    if (!resolved) unresolved.push(def.matchNumber);
    matches.push({
      matchNumber: def.matchNumber,
      stage: def.stage,
      homeTeamId: home,
      awayTeamId: away,
      winner,
      status,
      resolved,
    });
  }

  return { matches, unresolved, unresolvedTies, derivedFrom: "results" };
}

/**
 * Full-bracket realisation when the whole tournament is decided - a thin READ-ONLY
 * delegation to `realiseOfficialBracket` (official graph + Annexe C). `decideWinner`
 * is supplied by the caller (e.g. reading actual completed results). Not used for
 * partial live state; provided for the complete case + parity tests.
 */
export function realiseBracketFromResults(
  groupResults: Map<GroupId, GroupResult>,
  thirdGroups: GroupId[],
  decideWinner: (homeId: string, awayId: string) => string,
): RealisedKnockout {
  return realiseOfficialBracket({
    graph: officialBracket.graph,
    allocation: officialBracket.thirdPlaceAllocation,
    groupResults,
    thirdGroups,
    decideWinner,
  });
}
