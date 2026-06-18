/**
 * Dataset resolver.
 *
 * Chooses the best USABLE dataset by source priority (verified > candidate >
 * mock) and falls back when a higher-priority dataset is invalid, incomplete, or
 * unavailable (A2). Derives groups, and produces fixtures with tri-state
 * provenance (A3):
 *   - "official":           a supplied chronological schedule (positions resolved
 *                           to teams) that passes referential validation.
 *   - "position-generated": Article 12.4 pairings on the official/candidate field.
 *   - "mock-generated":     Article 12.4 pairings on the mock field.
 */
import type {
  Fixture,
  Group,
  GroupId,
  OfficialFixture,
  ResolvedDataset,
  SourceStatus,
  Team,
} from "@/lib/types";
import { mockDataset, type SourceDataset } from "@/data/mock";
import { officialDataset } from "@/data/official";
import { buildGroupStageFixtures } from "./fixtures";
import { validateDataset, validateFixtures } from "./validate";

export const GROUP_IDS: GroupId[] = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L",
];

const PRIORITY: Record<SourceStatus, number> = {
  verified: 3,
  candidate: 2,
  mock: 1,
};

function deriveGroups(teams: SourceDataset["teams"]): Group[] {
  return GROUP_IDS.map((id) => ({
    id,
    teamIds: teams.filter((t) => t.group === id).map((t) => t.id),
  }));
}

/**
 * Materialise a position-keyed official schedule into dated fixtures by resolving
 * each group's draw positions to team ids. Returns null when any referenced
 * position is not source-backed (so the resolver falls back to generation).
 */
function materialiseOfficialFixtures(
  schedule: OfficialFixture[],
  teams: Team[],
): Fixture[] | null {
  const posIndex = new Map<string, string>(); // `${group}${position}` -> teamId
  for (const t of teams) {
    if (t.drawPosition) posIndex.set(`${t.group}${t.drawPosition}`, t.id);
  }
  const fixtures: Fixture[] = [];
  for (const row of schedule) {
    const homeId = posIndex.get(`${row.group}${row.homePosition}`);
    const awayId = posIndex.get(`${row.group}${row.awayPosition}`);
    if (!homeId || !awayId) return null; // draw positions not fully known yet
    fixtures.push({
      id: `M${row.matchNumber}`,
      matchday: row.matchday,
      group: row.group,
      homeTeamId: homeId,
      awayTeamId: awayId,
      venueId: row.venueId,
      date: row.kickoff,
      kickoff: row.kickoff,
      matchNumber: row.matchNumber,
      homePosition: row.homePosition,
      awayPosition: row.awayPosition,
      status: row.status ?? "scheduled",
      source: "official",
      sourceRef: row.sourceRef,
    });
  }
  return fixtures;
}

/** Resolve the active dataset once. Pure and deterministic. */
export function resolveDataset(): ResolvedDataset {
  // Candidates highest-priority first; mock is always last and always valid.
  const candidates: SourceDataset[] = [officialDataset, mockDataset].sort(
    (a, b) => PRIORITY[b.sourceStatus] - PRIORITY[a.sourceStatus],
  );

  const chosen =
    candidates.find((ds) => validateDataset(ds).valid) ?? mockDataset;

  const groups = deriveGroups(chosen.teams);
  const teamIds = new Set(chosen.teams.map((t) => t.id));

  // Adopt an official schedule only if present, resolvable, AND referentially
  // valid. Otherwise position-generate (mock-generate for the mock field).
  let fixtures: Fixture[];
  let fixtureSource: ResolvedDataset["fixtureSource"];
  const official =
    chosen.officialFixtures && chosen.officialFixtures.length > 0
      ? materialiseOfficialFixtures(chosen.officialFixtures, chosen.teams)
      : null;

  if (official && validateFixtures(official, teamIds, chosen.venues).length === 0) {
    fixtures = official;
    fixtureSource = "official";
  } else {
    fixtureSource =
      chosen.sourceStatus === "mock" ? "mock-generated" : "position-generated";
    fixtures = buildGroupStageFixtures(
      groups,
      chosen.venues,
      chosen.teams,
      fixtureSource,
    );
  }

  return {
    sourceStatus: chosen.sourceStatus,
    fixtureSource,
    teams: chosen.teams,
    venues: chosen.venues,
    groups,
    fixtures,
    bracket: chosen.bracket,
  };
}
