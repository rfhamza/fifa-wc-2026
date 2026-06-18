import type { SourceDataset } from "@/data/mock";
import { officialTeams } from "./teams";
import { officialVenues } from "./venues";
import { officialFixtures } from "./fixtures";
import { officialBracket } from "./bracket";

/**
 * OFFICIAL (CANDIDATE) dataset. Team identities + groups are cross-verified from
 * credible sources (sourceStatus "candidate", with placeholder model features);
 * the chronological fixture schedule is now the ACTIVE official FIFA schedule
 * (v17, 10 Apr 2026, subject to change) with all 48 verified draw positions, so
 * the resolver serves `fixtureSource: "official"` (Phase 1.6 Step B). The bracket
 * is a pending template. See ./teams.ts, ./fixtures.ts and ./bracket.ts.
 */
export const officialDataset: SourceDataset = {
  sourceStatus: "candidate",
  teams: officialTeams,
  venues: officialVenues,
  // Active official schedule -> resolver materialises fixtures (fixtureSource "official").
  officialFixtures,
  bracket: officialBracket,
};
