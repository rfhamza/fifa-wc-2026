/**
 * Data access layer
 * -----------------
 * The ONLY module the rest of the app imports data from. It resolves the active
 * dataset once (official/candidate -> mock fallback) and exposes the same stable
 * surface the app already used (teams, venues, groups, fixtures, getters), plus
 * provenance (`sourceStatus`, `fixtureSource`, `bracket`) for UI/docs labelling.
 */
import type {
  BracketDefinition,
  Fixture,
  FixtureSource,
  Group,
  GroupId,
  SourceStatus,
  Team,
  TeamMeta,
  Venue,
} from "@/lib/types";
import { resolveDataset, GROUP_IDS } from "./source";

const dataset = resolveDataset();

export const teams: Team[] = dataset.teams;
export const venues: Venue[] = dataset.venues;
export const groups: Group[] = dataset.groups;
export const fixtures: Fixture[] = dataset.fixtures;
export const bracket: BracketDefinition = dataset.bracket;

/** Provenance of the active dataset and fixtures (A2/A3). */
export const sourceStatus: SourceStatus = dataset.sourceStatus;
export const fixtureSource: FixtureSource = dataset.fixtureSource;

export { GROUP_IDS };

export const teamById = new Map(teams.map((t) => [t.id, t]));
export const venueById = new Map(venues.map((v) => [v.id, v]));
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

/** Per-team metadata for the Article 13 tiebreakers (conduct is a 0 placeholder). */
export function getTeamMeta(): TeamMeta[] {
  return teams.map((t) => ({
    teamId: t.id,
    fifaRanking: t.fifaRanking,
    conductScore: 0,
  }));
}

// Phase 1.28R: official knockout-stage schedule (M73-M104 kickoff timing).
export {
  officialKnockoutSchedule,
  validateKnockoutSchedule,
  etDaylightToUtc,
  type OfficialKnockoutScheduleRow,
} from "@/data/official/knockout-schedule";
