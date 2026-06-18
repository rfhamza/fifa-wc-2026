import type { BracketDefinition, SourceStatus, Team, Venue } from "@/lib/types";
import { teams } from "./teams";
import { venues } from "./venues";

/** A candidate source dataset before resolution (fixtures are derived later). */
export interface SourceDataset {
  sourceStatus: SourceStatus;
  teams: Team[];
  venues: Venue[];
  /**
   * Official chronological schedule (position-keyed) - present only when a
   * published FIFA schedule is available. Resolves to dated fixtures via draw
   * positions; otherwise the resolver position-generates fixtures (A3).
   */
  officialFixtures?: import("@/lib/types").OfficialFixture[];
  bracket: BracketDefinition;
}

const mockBracket: BracketDefinition = {
  sourceStatus: "mock",
  graph: { matches: [] },
  thirdPlaceAllocation: {},
  sources: [],
  notes: "Mock fallback - placeholder strength-seeded bracket.",
};

/** Original hand-authored placeholder dataset (the guaranteed fallback). */
export const mockDataset: SourceDataset = {
  sourceStatus: "mock",
  teams,
  venues,
  bracket: mockBracket,
};
