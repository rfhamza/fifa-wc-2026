/**
 * Official knockout bracket realiser + gate (Phase 1.2)
 * -----------------------------------------------------
 * Turns the official knockout graph + Annexe C allocation into a simulated
 * knockout run for one tournament iteration. The production simulator only uses
 * this path when `isBracketActive` is true (bracket marked "verified" AND fully
 * valid). Otherwise it keeps the placeholder strength-seeding in tournament.ts.
 *
 * The realiser is pure w.r.t. match outcomes: it takes a `decideWinner` callback
 * so it can reuse the model's knockout resolver without importing it.
 */
import type {
  BracketDefinition,
  GroupId,
  KnockoutGraph,
  QualifierSlot,
  ThirdPlaceAllocationMap,
} from "@/lib/types";
import { officialBracket } from "@/data/official/bracket";
import { normalizeCombinationKey, validateBracket } from "./bracket-validate";

/** True only when the bracket is explicitly marked source-verified. */
export function isBracketVerified(def: BracketDefinition = officialBracket): boolean {
  return def.sourceStatus === "verified";
}

/**
 * Production gate: the official path runs ONLY when the bracket is verified AND
 * structurally valid (16 R32 matches, valid propagation, all 495 Annexe C rows).
 * Any failure -> false -> placeholder seeding is used instead.
 */
export function isBracketActive(def: BracketDefinition = officialBracket): boolean {
  return isBracketVerified(def) && validateBracket(def).valid;
}

/** Per-group finishers needed to resolve group-position slots. */
export interface GroupResult {
  winner: string;
  runnerUp: string;
  third: string;
}

export interface RealiseInput {
  graph: KnockoutGraph;
  allocation: ThirdPlaceAllocationMap;
  /** Resolved finishers keyed by group letter. */
  groupResults: Map<GroupId, GroupResult>;
  /** The eight groups whose third-placed team qualified (order irrelevant). */
  thirdGroups: GroupId[];
  /** Decide a knockout winner between two team ids (e.g. model + RNG). */
  decideWinner: (homeId: string, awayId: string) => string;
}

/** Teams reaching each stage (cumulative semantics matching stage counts). */
export interface RealisedKnockout {
  /** All 32 teams that entered the Round of 32. */
  r32Entrants: string[];
  /** Won their R32 match (reached the Round of 16) - 16 teams. */
  roundOf16: string[];
  /** Reached the quarter-finals - 8 teams. */
  quarterFinal: string[];
  /** Reached the semi-finals - 4 teams. */
  semiFinal: string[];
  /** Reached the final - 2 teams. */
  finalists: string[];
  /** Champion - 1 team. */
  champion: string;
}

/**
 * Realise one knockout bracket from group results + Annexe C, evaluating matches
 * in ascending match number so later matches read earlier winners/losers.
 */
export function realiseOfficialBracket(input: RealiseInput): RealisedKnockout {
  const { graph, allocation, groupResults, thirdGroups, decideWinner } = input;

  const key = normalizeCombinationKey(thirdGroups);
  const slotAssign = allocation[key];
  if (!slotAssign) {
    throw new Error(`No Annexe C allocation for third-place combination "${key}"`);
  }

  const group = (g: GroupId): GroupResult => {
    const r = groupResults.get(g);
    if (!r) throw new Error(`Missing group result for ${g}`);
    return r;
  };

  const winners = new Map<number, string>();
  const losers = new Map<number, string>();

  const resolve = (slot: QualifierSlot): string => {
    switch (slot.kind) {
      case "groupPosition":
        return slot.position === 1 ? group(slot.group).winner : group(slot.group).runnerUp;
      case "thirdPlace": {
        const g = slotAssign[slot.slot];
        if (!g) throw new Error(`Annexe C "${key}" has no group for slot ${slot.slot}`);
        return group(g).third;
      }
      case "matchWinner": {
        const w = winners.get(slot.matchNumber);
        if (!w) throw new Error(`Winner of match ${slot.matchNumber} not yet decided`);
        return w;
      }
      case "matchLoser": {
        const l = losers.get(slot.matchNumber);
        if (!l) throw new Error(`Loser of match ${slot.matchNumber} not yet decided`);
        return l;
      }
    }
  };

  const ordered = [...graph.matches].sort((a, b) => a.matchNumber - b.matchNumber);
  const r32Entrants: string[] = [];
  const roundOf16: string[] = [];
  const quarterFinal: string[] = [];
  const semiFinal: string[] = [];
  const finalists: string[] = [];
  let champion = "";

  for (const m of ordered) {
    const homeId = resolve(m.home);
    const awayId = resolve(m.away);
    const winnerId = decideWinner(homeId, awayId);
    const loserId = winnerId === homeId ? awayId : homeId;
    winners.set(m.matchNumber, winnerId);
    losers.set(m.matchNumber, loserId);

    switch (m.stage) {
      case "roundOf32":
        r32Entrants.push(homeId, awayId);
        roundOf16.push(winnerId);
        break;
      case "roundOf16":
        quarterFinal.push(winnerId);
        break;
      case "quarterFinal":
        semiFinal.push(winnerId);
        break;
      case "semiFinal":
        finalists.push(winnerId);
        break;
      case "final":
        champion = winnerId;
        break;
      case "thirdPlace":
        // Simulated for graph completeness; intentionally NOT aggregated.
        break;
    }
  }

  // Safety: every R32 slot must resolve to a distinct team.
  if (new Set(r32Entrants).size !== r32Entrants.length) {
    throw new Error("Official bracket resolved a duplicate team into the Round of 32");
  }

  return { r32Entrants, roundOf16, quarterFinal, semiFinal, finalists, champion };
}
