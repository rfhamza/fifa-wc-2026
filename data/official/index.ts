import type { SourceDataset } from "@/data/mock";
import { officialTeams } from "./teams";
import { officialVenues } from "./venues";
import { officialBracket } from "./bracket";

/**
 * OFFICIAL (CANDIDATE) dataset. Team identities + groups are cross-verified from
 * credible sources (sourceStatus "candidate"); no official fixture schedule is
 * available (so the resolver will generate fixtures); the bracket is a pending
 * template. See ./teams.ts and ./bracket.ts for provenance details.
 */
export const officialDataset: SourceDataset = {
  sourceStatus: "candidate",
  teams: officialTeams,
  venues: officialVenues,
  // officialFixtures intentionally omitted → resolver falls back to generated.
  bracket: officialBracket,
};
