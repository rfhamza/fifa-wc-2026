import type { SourceDataset } from "@/data/mock";
import { officialTeams } from "./teams";
import { officialVenues } from "./venues";
import { officialFixtures } from "./fixtures";
import { officialBracket } from "./bracket";

/**
 * OFFICIAL (CANDIDATE) dataset. Team identities + groups are cross-verified from
 * credible sources (sourceStatus "candidate"); the chronological fixture schedule
 * is an empty template (so the resolver position-generates fixtures per Article
 * 12.4); the bracket is a pending template. See ./teams.ts, ./fixtures.ts and
 * ./bracket.ts for provenance details.
 */
export const officialDataset: SourceDataset = {
  sourceStatus: "candidate",
  teams: officialTeams,
  venues: officialVenues,
  // Empty template -> resolver position-generates fixtures (Article 12.4).
  officialFixtures,
  bracket: officialBracket,
};
