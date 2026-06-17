/**
 * Group standings
 * ---------------
 * Pure function that turns a set of played match results into a ranked group
 * table. Tiebreakers follow FIFA order: points → goal difference → goals
 * scored → (deterministic fallback) head-to-head-agnostic team id, so results
 * are stable and testable.
 */
import type { GroupId, GroupStanding } from "@/lib/types";

export interface MatchResult {
  homeTeamId: string;
  awayTeamId: string;
  homeGoals: number;
  awayGoals: number;
}

const WIN_POINTS = 3;
const DRAW_POINTS = 1;

export function computeGroupStandings(
  groupId: GroupId,
  teamIds: string[],
  results: MatchResult[],
): GroupStanding[] {
  const table = new Map<string, GroupStanding>();
  for (const teamId of teamIds) {
    table.set(teamId, {
      teamId,
      group: groupId,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      rank: 0,
    });
  }

  for (const r of results) {
    const home = table.get(r.homeTeamId);
    const away = table.get(r.awayTeamId);
    if (!home || !away) continue; // ignore results outside this group

    home.played += 1;
    away.played += 1;
    home.goalsFor += r.homeGoals;
    home.goalsAgainst += r.awayGoals;
    away.goalsFor += r.awayGoals;
    away.goalsAgainst += r.homeGoals;

    if (r.homeGoals > r.awayGoals) {
      home.won += 1;
      away.lost += 1;
      home.points += WIN_POINTS;
    } else if (r.homeGoals < r.awayGoals) {
      away.won += 1;
      home.lost += 1;
      away.points += WIN_POINTS;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += DRAW_POINTS;
      away.points += DRAW_POINTS;
    }
  }

  const standings = [...table.values()];
  for (const s of standings) {
    s.goalDifference = s.goalsFor - s.goalsAgainst;
  }

  standings.sort(compareStandings);
  standings.forEach((s, i) => {
    s.rank = i + 1;
  });
  return standings;
}

/** FIFA-style comparator (descending strength). */
export function compareStandings(a: GroupStanding, b: GroupStanding): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDifference !== a.goalDifference)
    return b.goalDifference - a.goalDifference;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  return a.teamId.localeCompare(b.teamId); // deterministic fallback
}
