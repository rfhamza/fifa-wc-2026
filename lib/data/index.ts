/**
 * Data access layer
 * -----------------
 * The ONLY module the rest of the app should import seed data from. It wraps
 * the static `/data` files and derives convenience structures (groups,
 * fixtures). When seed data is later replaced by a database or API, only this
 * file needs to change — consumers keep their imports.
 */
import type { Fixture, Group, GroupId, Team, Venue } from "@/lib/types";
import { teams, teamById } from "@/data/teams";
import { venues, venueById } from "@/data/venues";

export { teams, teamById, venues, venueById };

export const GROUP_IDS: GroupId[] = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L",
];

/** Build the 12 groups by partitioning teams on their `group` field. */
export const groups: Group[] = GROUP_IDS.map((id) => ({
  id,
  teamIds: teams.filter((t) => t.group === id).map((t) => t.id),
}));

export const groupById = new Map(groups.map((g) => [g.id, g]));

export function getTeam(id: string): Team {
  const team = teamById.get(id);
  if (!team) throw new Error(`Unknown team id: ${id}`);
  return team;
}

export function getVenue(id: string): Venue {
  const venue = venueById.get(id);
  if (!venue) throw new Error(`Unknown venue id: ${id}`);
  return venue;
}

export function getTeamsInGroup(groupId: GroupId): Team[] {
  return teams.filter((t) => t.group === groupId);
}

/**
 * Single round-robin pairing schedule for 4 indexed teams. Each of the three
 * matchdays plays two matches so every team meets every other once.
 */
const ROUND_ROBIN: { matchday: number; pairs: [number, number][] }[] = [
  { matchday: 1, pairs: [[0, 1], [2, 3]] },
  { matchday: 2, pairs: [[0, 2], [3, 1]] },
  { matchday: 3, pairs: [[0, 3], [1, 2]] },
];

/**
 * Deterministically generate the 72 group-stage fixtures (12 groups × 6).
 * Venue assignment is round-robin over the venue list — a clearly replaceable
 * placeholder for the real published schedule.
 */
export function buildGroupStageFixtures(): Fixture[] {
  const fixtures: Fixture[] = [];
  let venueCursor = 0;
  const baseDate = new Date("2026-06-11T00:00:00Z");

  for (const group of groups) {
    const ids = group.teamIds;
    if (ids.length !== 4) {
      throw new Error(`Group ${group.id} must have exactly 4 teams`);
    }
    for (const { matchday, pairs } of ROUND_ROBIN) {
      for (const [h, a] of pairs) {
        const venue = venues[venueCursor % venues.length]!;
        venueCursor += 1;
        // Space matchdays ~4 days apart; purely illustrative dates.
        const date = new Date(baseDate);
        date.setUTCDate(baseDate.getUTCDate() + (matchday - 1) * 4);
        fixtures.push({
          id: `${group.id}-md${matchday}-${ids[h]}-${ids[a]}`,
          matchday,
          group: group.id,
          homeTeamId: ids[h]!,
          awayTeamId: ids[a]!,
          venueId: venue.id,
          date: date.toISOString(),
        });
      }
    }
  }
  return fixtures;
}

/** Memoized fixture list (seed data is static, so build once). */
export const fixtures: Fixture[] = buildGroupStageFixtures();

export function getFixture(id: string): Fixture {
  const fixture = fixtures.find((f) => f.id === id);
  if (!fixture) throw new Error(`Unknown fixture id: ${id}`);
  return fixture;
}

export function getFixturesForGroup(groupId: GroupId): Fixture[] {
  return fixtures.filter((f) => f.group === groupId);
}

export function getFixturesForTeam(teamId: string): Fixture[] {
  return fixtures.filter(
    (f) => f.homeTeamId === teamId || f.awayTeamId === teamId,
  );
}
