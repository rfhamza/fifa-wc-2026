/**
 * Deterministic group-stage fixture generator (FIFA Article 12.4).
 *
 * Produces the 72 group matches (12 groups x 6) from groups + venues + teams.
 * Pairings follow the regulation position chart EXACTLY; the resulting schedule
 * is labelled `fixtureSource: "position-generated"` (official/candidate field) or
 * `"mock-generated"` (mock field) - dates, venues and ordering are illustrative
 * and must be presented as pending the official schedule (A3).
 *
 * Draw positions: a team's source-backed `drawPosition` is honoured when present
 * (currently only the three co-hosts). Remaining positions in a group are filled
 * by an INTERNAL placeholder ordering (listing order) so the six pairings can be
 * generated - this placeholder is never written back onto a Team.
 */
import type {
  DrawPosition,
  Fixture,
  FixtureSource,
  Group,
  Team,
  Venue,
} from "@/lib/types";

/**
 * Article 12.4 single round-robin by DRAW POSITION (home, away). Note MD3 is
 * `4 v 1` and `2 v 3` per regulation (the reigning home/away orientation).
 */
const POSITION_SCHEDULE: { matchday: number; pairs: [DrawPosition, DrawPosition][] }[] = [
  { matchday: 1, pairs: [[1, 2], [3, 4]] },
  { matchday: 2, pairs: [[1, 3], [4, 2]] },
  { matchday: 3, pairs: [[4, 1], [2, 3]] },
];

/**
 * Resolve a group's four draw positions to team ids. Teams with a source-backed
 * `drawPosition` are placed in that slot; the rest fill the remaining slots in
 * listing order (an internal placeholder, never persisted onto the Team).
 */
function resolvePositions(groupTeams: Team[]): Record<DrawPosition, string> {
  const slots: Partial<Record<DrawPosition, string>> = {};
  const unplaced: Team[] = [];
  for (const t of groupTeams) {
    if (t.drawPosition && !slots[t.drawPosition]) {
      slots[t.drawPosition] = t.id;
    } else {
      unplaced.push(t);
    }
  }
  for (const pos of [1, 2, 3, 4] as DrawPosition[]) {
    if (!slots[pos]) slots[pos] = unplaced.shift()?.id;
  }
  return slots as Record<DrawPosition, string>;
}

export function buildGroupStageFixtures(
  groups: Group[],
  venues: Venue[],
  teams: Team[],
  source: Extract<FixtureSource, "position-generated" | "mock-generated">,
): Fixture[] {
  if (venues.length === 0) throw new Error("Cannot generate fixtures without venues");
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const fixtures: Fixture[] = [];
  let venueCursor = 0;
  const baseDate = new Date("2026-06-11T00:00:00Z");

  for (const group of groups) {
    if (group.teamIds.length !== 4) {
      throw new Error(`Group ${group.id} must have exactly 4 teams`);
    }
    const groupTeams = group.teamIds.map((id) => {
      const t = teamById.get(id);
      if (!t) throw new Error(`Group ${group.id} references unknown team ${id}`);
      return t;
    });
    const posToTeam = resolvePositions(groupTeams);

    for (const { matchday, pairs } of POSITION_SCHEDULE) {
      for (const [homePos, awayPos] of pairs) {
        const homeId = posToTeam[homePos];
        const awayId = posToTeam[awayPos];
        const venue = venues[venueCursor % venues.length]!;
        venueCursor += 1;
        const date = new Date(baseDate);
        date.setUTCDate(baseDate.getUTCDate() + (matchday - 1) * 4);
        fixtures.push({
          id: `${group.id}-md${matchday}-${homeId}-${awayId}`,
          matchday,
          group: group.id,
          homeTeamId: homeId,
          awayTeamId: awayId,
          venueId: venue.id,
          date: date.toISOString(),
          source,
          homePosition: homePos,
          awayPosition: awayPos,
          status: "unknown",
        });
      }
    }
  }
  return fixtures;
}

/** The six Article 12.4 position pairings (home, away), flattened. For validation. */
export const ARTICLE_12_4_PAIRINGS: [DrawPosition, DrawPosition][] =
  POSITION_SCHEDULE.flatMap((md) => md.pairs);
