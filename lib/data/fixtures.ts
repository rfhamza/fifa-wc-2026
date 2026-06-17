/**
 * Deterministic group-stage fixture generator.
 *
 * Produces the 72 group matches (12 groups × 6) from groups + venues. This is
 * used to build a `fixtureSource: "generated"` schedule when no official FIFA
 * schedule is available — the pairings/dates/venues are illustrative and must be
 * labelled as simulated/pending official verification (A3).
 */
import type { Fixture, Group, Venue } from "@/lib/types";

/** Single round-robin pairing schedule for 4 indexed teams. */
const ROUND_ROBIN: { matchday: number; pairs: [number, number][] }[] = [
  { matchday: 1, pairs: [[0, 1], [2, 3]] },
  { matchday: 2, pairs: [[0, 2], [3, 1]] },
  { matchday: 3, pairs: [[0, 3], [1, 2]] },
];

export function buildGroupStageFixtures(
  groups: Group[],
  venues: Venue[],
): Fixture[] {
  if (venues.length === 0) throw new Error("Cannot generate fixtures without venues");
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
