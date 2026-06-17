import type { BracketDefinition, SourceStatus, Team, Venue } from "@/lib/types";
import { teams } from "./teams";
import { venues } from "./venues";

/** A candidate source dataset before resolution (fixtures are derived later). */
export interface SourceDataset {
  sourceStatus: SourceStatus;
  teams: Team[];
  venues: Venue[];
  /** Present only when an official published schedule is available. */
  officialFixtures?: import("@/lib/types").Fixture[];
  bracket: BracketDefinition;
}

const mockBracket: BracketDefinition = {
  sourceStatus: "mock",
  graph: { matches: [] },
  thirdPlaceAllocation: {},
  sources: [],
  notes: "Mock fallback — placeholder strength-seeded bracket.",
};

/** Original hand-authored placeholder dataset (the guaranteed fallback). */
export const mockDataset: SourceDataset = {
  sourceStatus: "mock",
  teams,
  venues,
  bracket: mockBracket,
};
