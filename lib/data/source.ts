/**
 * Dataset resolver.
 *
 * Chooses the best USABLE dataset by source priority (verified > candidate >
 * mock) and falls back when a higher-priority dataset is invalid, incomplete, or
 * unavailable (A2). Derives groups, and either adopts an official fixture
 * schedule (fixtureSource "official") or generates one (fixtureSource
 * "generated", A3).
 */
import type {
  Fixture,
  Group,
  GroupId,
  ResolvedDataset,
  SourceStatus,
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

  // Adopt an official schedule only if present AND referentially valid.
  let fixtures: Fixture[];
  let fixtureSource: ResolvedDataset["fixtureSource"];
  if (
    chosen.officialFixtures &&
    validateFixtures(chosen.officialFixtures, teamIds, chosen.venues).length === 0
  ) {
    fixtures = chosen.officialFixtures;
    fixtureSource = "official";
  } else {
    fixtures = buildGroupStageFixtures(groups, chosen.venues);
    fixtureSource = "generated";
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
