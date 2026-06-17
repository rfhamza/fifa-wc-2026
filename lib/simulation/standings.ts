/**
 * Group standings — FIFA World Cup 2026 Article 13 tiebreakers (A1).
 *
 * Ranking order for teams level on points:
 *   1. Points (all group matches)
 *   2. Head-to-head points (among the tied teams only)
 *   3. Head-to-head goal difference
 *   4. Head-to-head goals scored
 *   5. Reapply 2–4 to any teams STILL tied (recursive, on the smaller subset)
 *   6. Goal difference in all group matches
 *   7. Goals scored in all group matches
 *   8. Conduct/fair-play score (placeholder = 0 for all teams)
 *   9. FIFA ranking (lower number wins) — deterministic final fallback
 *
 * Drawing of lots is intentionally NOT modelled; the FIFA-ranking fallback keeps
 * results deterministic. The third-placed-team ranking is SEPARATE (no
 * head-to-head) — see `rankThirdPlacedTeams`.
 */
import type { GroupId, GroupStanding, TeamMeta } from "@/lib/types";

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
  teamMeta: TeamMeta[] = [],
): GroupStanding[] {
  const metaById = new Map(teamMeta.map((m) => [m.teamId, m]));
  const table = new Map<string, GroupStanding>();
  for (const teamId of teamIds) {
    table.set(teamId, blankStanding(teamId, groupId));
  }

  for (const r of results) {
    applyResult(table, r);
  }

  const standings = [...table.values()];
  for (const s of standings) s.goalDifference = s.goalsFor - s.goalsAgainst;

  // Rank: sort by points desc, split into equal-points blocks, resolve each.
  const byPoints = [...standings].sort((a, b) => b.points - a.points);
  const ordered: GroupStanding[] = [];
  for (const block of partitionAdjacent(byPoints, (a, b) => a.points === b.points)) {
    ordered.push(...resolveBlock(block, results, metaById));
  }
  ordered.forEach((s, i) => {
    s.rank = i + 1;
  });
  return ordered;
}

/** Resolve a block of teams that are level on overall points (Article 13 §2–9). */
function resolveBlock(
  block: GroupStanding[],
  allResults: MatchResult[],
  metaById: Map<string, TeamMeta>,
): GroupStanding[] {
  if (block.length === 1) return block;

  // Head-to-head mini-table among exactly the teams in this block.
  const ids = new Set(block.map((s) => s.teamId));
  const h2h = headToHead(block, allResults, ids);

  // Order by H2H points → GD → GF, then handle still-tied sub-blocks.
  const byH2H = [...block].sort((a, b) => compareH2H(h2h, a.teamId, b.teamId));
  const out: GroupStanding[] = [];
  for (const sub of partitionAdjacent(
    byH2H,
    (a, b) => h2hKey(h2h, a.teamId) === h2hKey(h2h, b.teamId),
  )) {
    if (sub.length === 1) {
      out.push(sub[0]!);
    } else if (sub.length < block.length) {
      // Reapply head-to-head to the remaining tied subset (recursive).
      out.push(...resolveBlock(sub, allResults, metaById));
    } else {
      // No separation by head-to-head → fall through to all-group criteria.
      out.push(...fallbackSort(sub, metaById));
    }
  }
  return out;
}

interface H2HRecord {
  points: number;
  goalDifference: number;
  goalsFor: number;
}

/** Build a head-to-head record per team using only matches among `ids`. */
function headToHead(
  block: GroupStanding[],
  results: MatchResult[],
  ids: Set<string>,
): Map<string, H2HRecord> {
  const rec = new Map<string, H2HRecord>(
    block.map((s) => [s.teamId, { points: 0, goalDifference: 0, goalsFor: 0 }]),
  );
  for (const r of results) {
    if (!ids.has(r.homeTeamId) || !ids.has(r.awayTeamId)) continue;
    const home = rec.get(r.homeTeamId)!;
    const away = rec.get(r.awayTeamId)!;
    home.goalsFor += r.homeGoals;
    away.goalsFor += r.awayGoals;
    home.goalDifference += r.homeGoals - r.awayGoals;
    away.goalDifference += r.awayGoals - r.homeGoals;
    if (r.homeGoals > r.awayGoals) home.points += WIN_POINTS;
    else if (r.homeGoals < r.awayGoals) away.points += WIN_POINTS;
    else {
      home.points += DRAW_POINTS;
      away.points += DRAW_POINTS;
    }
  }
  return rec;
}

function compareH2H(
  h2h: Map<string, H2HRecord>,
  a: string,
  b: string,
): number {
  const ra = h2h.get(a)!;
  const rb = h2h.get(b)!;
  if (rb.points !== ra.points) return rb.points - ra.points;
  if (rb.goalDifference !== ra.goalDifference)
    return rb.goalDifference - ra.goalDifference;
  return rb.goalsFor - ra.goalsFor;
}

/** Stable key identifying teams tied on all three head-to-head criteria. */
function h2hKey(h2h: Map<string, H2HRecord>, teamId: string): string {
  const r = h2h.get(teamId)!;
  return `${r.points}|${r.goalDifference}|${r.goalsFor}`;
}

/** Fall-through ordering: all-group GD → GF → conduct → FIFA ranking. */
function fallbackSort(
  teams: GroupStanding[],
  metaById: Map<string, TeamMeta>,
): GroupStanding[] {
  return [...teams].sort((a, b) => {
    if (b.goalDifference !== a.goalDifference)
      return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    const ma = metaById.get(a.teamId);
    const mb = metaById.get(b.teamId);
    const ca = ma?.conductScore ?? 0;
    const cb = mb?.conductScore ?? 0;
    if (ca !== cb) return ca - cb; // lower conduct score = better
    const ra = ma?.fifaRanking ?? Number.MAX_SAFE_INTEGER;
    const rb = mb?.fifaRanking ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb; // lower ranking number = better
    return a.teamId.localeCompare(b.teamId); // last-resort determinism
  });
}

/**
 * Rank third-placed teams across groups to pick the best ones. SEPARATE from the
 * group tiebreaker: uses points → all-group GD → all-group GF → conduct → FIFA
 * ranking (NO head-to-head, since these teams did not play each other).
 */
export function rankThirdPlacedTeams(
  thirds: GroupStanding[],
  teamMeta: TeamMeta[] = [],
): GroupStanding[] {
  const metaById = new Map(teamMeta.map((m) => [m.teamId, m]));
  return [...thirds].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference)
      return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    const ca = metaById.get(a.teamId)?.conductScore ?? 0;
    const cb = metaById.get(b.teamId)?.conductScore ?? 0;
    if (ca !== cb) return ca - cb;
    const ra = metaById.get(a.teamId)?.fifaRanking ?? Number.MAX_SAFE_INTEGER;
    const rb = metaById.get(b.teamId)?.fifaRanking ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return a.teamId.localeCompare(b.teamId);
  });
}

// ---- helpers ----

function blankStanding(teamId: string, groupId: GroupId): GroupStanding {
  return {
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
  };
}

function applyResult(
  table: Map<string, GroupStanding>,
  r: MatchResult,
): void {
  const home = table.get(r.homeTeamId);
  const away = table.get(r.awayTeamId);
  if (!home || !away) return; // ignore results outside this group

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

/**
 * Partition a PRE-SORTED array into runs of adjacent equal items, preserving the
 * given order (does not re-sort — callers sort first by the active criterion).
 */
function partitionAdjacent<T>(items: T[], equal: (a: T, b: T) => boolean): T[][] {
  const blocks: T[][] = [];
  for (const item of items) {
    const last = blocks[blocks.length - 1];
    if (last && equal(last[0]!, item)) last.push(item);
    else blocks.push([item]);
  }
  return blocks;
}
