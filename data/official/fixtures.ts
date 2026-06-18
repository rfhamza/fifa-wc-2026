import type { OfficialFixture } from "@/lib/types";

/**
 * OFFICIAL chronological group-stage schedule (FIFA Art. 16) - TEMPLATE.
 *
 * PROVENANCE (A3): shipped EMPTY. The published FIFA schedule (72 group matches
 * M1..M72 with dates, kickoffs, venues and match numbers) is not machine-
 * retrievable here, so no official schedule is asserted. Until an authoritative
 * source or user-supplied JSON populates this array, the resolver falls back to
 * Article 12.4 POSITION-GENERATED fixtures (`fixtureSource: "position-generated"`)
 * and the UI never claims an official chronological order.
 *
 * Rows are keyed by DRAW POSITION (not team id) so the schedule can be authored
 * independently of the Final Draw; the resolver maps positions -> teams using each
 * group's draw positions. Because that mapping needs all four positions per group,
 * an official schedule only resolves once every draw position is source-backed.
 *
 * TODO (go/no-go to flip to "official"): supply all 72 rows, then confirm
 * `validateOfficialFixtures` passes (valid refs, unique match numbers, pairings
 * consistent with the draw positions) and that the user has verified the source.
 *
 * Example row shape (do NOT uncomment until source-verified):
 *   { matchNumber: 1, group: "A", matchday: 1, homePosition: 1, awayPosition: 2,
 *     venueId: "azteca", kickoff: "2026-06-11T19:00:00-05:00", status: "scheduled",
 *     sourceRef: "FIFA match schedule" }
 */
export const officialFixtures: OfficialFixture[] = [];
