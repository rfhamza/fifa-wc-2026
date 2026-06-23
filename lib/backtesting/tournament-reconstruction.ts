/**
 * Phase 1.21B - deterministic historical tournament RECONSTRUCTION (backtesting layer).
 * -----------------------------------------------------------------------------------
 * Pure, deterministic, DESCRIPTIVE validation that a historical source pack supports
 * tournament-level structure: it recomputes group standings from the actual group
 * results, reconstructs the knockout progression from the actual knockout results,
 * derives winners (regulation / extra-time / penalties), reconciles each group's
 * computed top-two against the ACTUAL Round-of-16 participants, and verifies the
 * champion where derivable. It flags ambiguity instead of forcing uncertain decisions.
 *
 * THIS IS NOT REPLAY. It computes NO model probabilities, NO Monte Carlo, NO champion
 * probabilities, NO calibration, and NO LOTO. It reuses the 2026 simulator NOT AT ALL
 * (no Annexe-C, no official bracket, no Article-13 assumption). It is part of the
 * ISOLATED backtesting layer and is never imported by the production 2026 app.
 *
 * HISTORICAL CAVEATS (documented, not silently resolved):
 *  - Exact historical group tie-resolution rules are NOT encoded in the packs and are
 *    NOT assumed to equal the 2026 Article-13 order. Group standings use only basic
 *    keys (points -> goal difference -> goals for); where the top-two boundary is not
 *    decided by those keys, `tiebreakerAmbiguous` is set and the qualifiers are taken
 *    from the actual Round-of-16 participants (which ARE in the data).
 *  - Snapshots store the 90-MINUTE score only. An extra-time win WITHOUT a shootout is
 *    resolved by which team advances to the next round (present in the data). For a LEAF
 *    match with no next round (the final, or a third-place match) decided in extra time
 *    without penalties, the winner is NOT encoded in the pack: it is reported as
 *    `null` / `method: "undetermined"` with an explicit assumption (e.g. the 2010 and
 *    2014 finals). Nothing is fabricated.
 */
import type { HistoricalSourcePack, HistoricalMatchResult, MatchStage } from "./types";

const KNOCKOUT_ORDER: MatchStage[] = [
  "round-of-16",
  "quarter-final",
  "semi-final",
  "third-place",
  "final",
];
/** The single-elimination advancement chain (third-place is a branch, not in it). */
const ADVANCEMENT_CHAIN: MatchStage[] = ["round-of-16", "quarter-final", "semi-final", "final"];

export interface StandingsRow {
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** 1-based rank by basic ordering (points -> GD -> GF); ties flagged separately. */
  computedRank: number;
  /** Whether this team appears among the actual Round-of-16 participants. */
  qualified: boolean;
}

export interface GroupReconstruction {
  group: string;
  standings: StandingsRow[];
  /** Top two by basic ordering (points -> GD -> GF), ids in rank order. */
  computedTopTwo: string[];
  /** The teams in this group that actually reached the Round of 16 (from the data). */
  actualQualifiers: string[];
  /** Computed top-two set equals the actual qualifiers set. */
  qualifiersReconciled: boolean;
  /** The top-two boundary was not decided by basic keys (a historical tiebreaker applied). */
  tiebreakerAmbiguous: boolean;
}

export type KnockoutMethod = "regulation" | "extra-time" | "penalties" | "undetermined";

export interface KnockoutMatchReconstruction {
  matchId: string;
  stage: MatchStage;
  teamA: string;
  teamB: string;
  /** Derived winner, or null when not encoded in the pack (ET leaf without penalties). */
  winner: string | null;
  method: KnockoutMethod;
}

export interface KnockoutRoundReconstruction {
  stage: MatchStage;
  matches: KnockoutMatchReconstruction[];
  winners: (string | null)[];
}

export type ReconstructionStatus = "clean" | "clean-with-assumptions" | "mismatch";

export interface HistoricalTournamentReconstruction {
  tournamentYear: number;
  groupsReconstructed: GroupReconstruction[];
  knockoutProgression: KnockoutRoundReconstruction[];
  /** Derived champion (final winner), or null when the final was an ET leaf w/o penalties. */
  actualChampion: string | null;
  championDerivable: boolean;
  finalKnownCheck: {
    matchId: string;
    teamA: string;
    teamB: string;
    winner: string | null;
    method: KnockoutMethod;
  } | null;
  assumptions: string[];
  warnings: string[];
  reconstructionStatus: ReconstructionStatus;
}

/** 3 points per win, 1 per draw, from the 90-minute result. */
const pointsFor = (isTeamA: boolean, r: HistoricalMatchResult["resultAt90"]): number => {
  if (r === "D") return 1;
  if (isTeamA) return r === "A" ? 3 : 0;
  return r === "B" ? 3 : 0;
};

/** Basic ordering comparator: points -> goal difference -> goals for (desc). No H2H. */
const basicCmp = (a: StandingsRow, b: StandingsRow): number =>
  b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor;

/** True when x and y are equal on every basic key (points, GD, GF). */
const basicTie = (x: StandingsRow, y: StandingsRow): boolean =>
  x.points === y.points && x.goalDifference === y.goalDifference && x.goalsFor === y.goalsFor;

/**
 * Deterministically reconstruct a historical tournament's structure from actual
 * results. Pure + descriptive: no probabilities, no Monte Carlo, no calibration.
 */
export function reconstructHistoricalTournament(
  pack: HistoricalSourcePack,
): HistoricalTournamentReconstruction {
  const assumptions: string[] = [];
  const warnings: string[] = [];
  const { identity, results } = pack;

  // --- knockout participant sets per stage (used for ET-without-penalty resolution) ---
  const stageParticipants: Record<string, Set<string>> = {};
  for (const stage of KNOCKOUT_ORDER) stageParticipants[stage] = new Set<string>();
  for (const m of results) {
    if (m.stage !== "group") {
      stageParticipants[m.stage]?.add(m.teamA);
      stageParticipants[m.stage]?.add(m.teamB);
    }
  }
  const r16Participants = stageParticipants["round-of-16"] ?? new Set<string>();

  // --- groups: recompute standings from the actual group-stage results -----------------
  const groupsReconstructed: GroupReconstruction[] = [];
  for (const group of Object.keys(identity.groups)) {
    const members = identity.groups[group] ?? [];
    const rows = new Map<string, StandingsRow>();
    for (const teamId of members) {
      rows.set(teamId, {
        teamId, played: 0, wins: 0, draws: 0, losses: 0,
        goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
        computedRank: 0, qualified: r16Participants.has(teamId),
      });
    }
    const groupMatches = results.filter((m) => m.stage === "group" && m.group === group);
    if (groupMatches.length !== 6) {
      warnings.push(`group ${group}: expected 6 group matches, found ${groupMatches.length}`);
    }
    for (const m of groupMatches) {
      const a = rows.get(m.teamA);
      const b = rows.get(m.teamB);
      if (!a || !b) { warnings.push(`group ${group}: match ${m.matchId} references a non-group team`); continue; }
      a.played++; b.played++;
      a.goalsFor += m.goalsA; a.goalsAgainst += m.goalsB;
      b.goalsFor += m.goalsB; b.goalsAgainst += m.goalsA;
      a.points += pointsFor(true, m.resultAt90);
      b.points += pointsFor(false, m.resultAt90);
      if (m.resultAt90 === "D") { a.draws++; b.draws++; }
      else if (m.resultAt90 === "A") { a.wins++; b.losses++; }
      else { b.wins++; a.losses++; }
    }
    for (const row of rows.values()) row.goalDifference = row.goalsFor - row.goalsAgainst;

    const standings = [...rows.values()].sort(
      (x, y) => basicCmp(x, y) || x.teamId.localeCompare(y.teamId),
    );
    standings.forEach((row, i) => { row.computedRank = i + 1; });

    if (members.length !== 4) warnings.push(`group ${group}: expected 4 teams, found ${members.length}`);
    for (const row of standings) {
      if (row.played !== 3) warnings.push(`group ${group}: ${row.teamId} played ${row.played} group matches (expected 3)`);
    }

    const computedTopTwo = standings.slice(0, 2).map((r) => r.teamId);
    const actualQualifiers = members.filter((t) => r16Participants.has(t));
    // Ambiguous if the 2nd/3rd boundary is a basic-key tie (a historical tiebreaker decided it).
    const tiebreakerAmbiguous =
      standings.length >= 3 ? basicTie(standings[1]!, standings[2]!) : false;
    const qualifiersReconciled =
      actualQualifiers.length === 2 &&
      new Set(computedTopTwo).size === 2 &&
      computedTopTwo.every((t) => actualQualifiers.includes(t));

    if (actualQualifiers.length !== 2) {
      warnings.push(`group ${group}: expected 2 actual Round-of-16 qualifiers, found ${actualQualifiers.length}`);
    } else if (!qualifiersReconciled) {
      // Computed top-two differs from who actually advanced -> a historical tiebreaker applied.
      assumptions.push(
        `group ${group}: computed top-two [${computedTopTwo.join(", ")}] differs from actual ` +
        `qualifiers [${actualQualifiers.join(", ")}]; resolved to actual qualifiers (historical ` +
        `tiebreaker not encoded in pack).`,
      );
    } else if (tiebreakerAmbiguous) {
      assumptions.push(
        `group ${group}: 2nd/3rd separated by a historical tiebreaker beyond points/GD/GF; ` +
        `actual qualifiers confirmed from Round-of-16 participants.`,
      );
    }

    groupsReconstructed.push({
      group, standings, computedTopTwo, actualQualifiers, qualifiersReconciled, tiebreakerAmbiguous,
    });
  }

  // --- knockout progression: derive winners round by round -----------------------------
  const deriveWinner = (
    m: HistoricalMatchResult,
    nextParticipants: Set<string> | null,
  ): { winner: string | null; method: KnockoutMethod } => {
    if (m.resultAt90 === "A") return { winner: m.teamA, method: "regulation" };
    if (m.resultAt90 === "B") return { winner: m.teamB, method: "regulation" };
    // 90-minute draw.
    if (m.penalties) {
      return m.penalties.a > m.penalties.b
        ? { winner: m.teamA, method: "penalties" }
        : { winner: m.teamB, method: "penalties" };
    }
    if (m.afterExtraTime) {
      // Extra-time win without a shootout: winner = the team that advances (if a next round exists).
      if (nextParticipants) {
        const aIn = nextParticipants.has(m.teamA);
        const bIn = nextParticipants.has(m.teamB);
        if (aIn && !bIn) return { winner: m.teamA, method: "extra-time" };
        if (bIn && !aIn) return { winner: m.teamB, method: "extra-time" };
      }
      return { winner: null, method: "undetermined" };
    }
    return { winner: null, method: "undetermined" };
  };

  const knockoutProgression: KnockoutRoundReconstruction[] = [];
  for (const stage of KNOCKOUT_ORDER) {
    const stageMatches = results.filter((m) => m.stage === stage);
    if (stageMatches.length === 0) continue;
    // Next stage in the advancement chain (for ET-without-penalty resolution).
    const chainIdx = ADVANCEMENT_CHAIN.indexOf(stage);
    const nextStage = chainIdx >= 0 ? ADVANCEMENT_CHAIN[chainIdx + 1] : undefined;
    const nextParticipants = nextStage ? stageParticipants[nextStage] ?? null : null;

    const matches: KnockoutMatchReconstruction[] = stageMatches.map((m) => {
      const { winner, method } = deriveWinner(m, nextParticipants);
      if (winner === null) {
        if (stage === "final" || stage === "third-place") {
          assumptions.push(
            `${stage} ${m.matchId} (${m.teamA} v ${m.teamB}) decided in extra time without a ` +
            `shootout; the winner is not encoded in the 90-minute-only pack.`,
          );
        } else {
          warnings.push(`${stage} ${m.matchId}: winner could not be derived from results.`);
        }
      }
      return { matchId: m.matchId, stage: m.stage, teamA: m.teamA, teamB: m.teamB, winner, method };
    });
    knockoutProgression.push({ stage, matches, winners: matches.map((m) => m.winner) });
  }

  // --- champion (final winner) + final known check ------------------------------------
  const finalRound = knockoutProgression.find((r) => r.stage === "final");
  const finalMatch = finalRound?.matches[0] ?? null;
  const actualChampion = finalMatch?.winner ?? null;
  const championDerivable = actualChampion !== null;
  const finalKnownCheck = finalMatch
    ? {
        matchId: finalMatch.matchId, teamA: finalMatch.teamA, teamB: finalMatch.teamB,
        winner: finalMatch.winner, method: finalMatch.method,
      }
    : null;
  if (!finalMatch) warnings.push("no final match found in the pack");
  else if (!championDerivable) {
    assumptions.push(
      `champion not encoded: the final (${finalMatch.teamA} v ${finalMatch.teamB}) was decided in ` +
      `extra time without a shootout; finalists are recorded but the winner is not in the pack.`,
    );
  }

  const reconstructionStatus: ReconstructionStatus =
    warnings.length > 0 ? "mismatch" : assumptions.length > 0 ? "clean-with-assumptions" : "clean";

  return {
    tournamentYear: identity.tournamentYear,
    groupsReconstructed,
    knockoutProgression,
    actualChampion,
    championDerivable,
    finalKnownCheck,
    assumptions,
    warnings,
    reconstructionStatus,
  };
}
