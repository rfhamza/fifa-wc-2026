import type { TeamFeatureSet } from "@/lib/types";

/**
 * Synthetic feature pairs for the Phase 1.18C-4 prediction-core parity golden
 * tests. Each pair isolates a driver / cap path so any behavioural drift in the
 * extracted core surfaces. Values are intentionally extreme where a cap is being
 * exercised. These are NOT real teams — fields are set directly.
 */
const base = (over: Partial<TeamFeatureSet>): TeamFeatureSet => ({
  teamId: "x",
  elo: 1500,
  fifaRanking: 50,
  squadQuality: 50,
  recentForm: 50,
  climateFamiliarity: 50,
  sameNationalityManager: false,
  gdpPerCapita: 10000,
  population: 10_000_000,
  structuralDepth: 0.5,
  isHost: false,
  isRegional: false,
  tournamentContext: 0,
  ...over,
});

export const SYNTHETIC_PAIRS: Record<string, [TeamFeatureSet, TeamFeatureSet]> = {
  balanced: [base({ teamId: "a" }), base({ teamId: "b" })],
  neutralZero: [
    base({ teamId: "a", structuralDepth: 0 }),
    base({ teamId: "b", structuralDepth: 0 }),
  ],
  largeEloGapPos: [base({ teamId: "a", elo: 2100 }), base({ teamId: "b", elo: 1400 })],
  largeEloGapNeg: [base({ teamId: "a", elo: 1400 }), base({ teamId: "b", elo: 2100 })],
  fifaRankCap: [
    base({ teamId: "a", fifaRanking: 1 }),
    base({ teamId: "b", fifaRanking: 211 }),
  ],
  hostOnly: [base({ teamId: "a", isHost: true }), base({ teamId: "b" })],
  regionalOnly: [base({ teamId: "a", isRegional: true }), base({ teamId: "b" })],
  placeholderSingleCap: [
    base({ teamId: "a", squadQuality: 100 }),
    base({ teamId: "b", squadQuality: 0 }),
  ],
  pooledPlaceholderCap: [
    base({ teamId: "a", squadQuality: 100, recentForm: 100 }),
    base({ teamId: "b", squadQuality: 0, recentForm: 0 }),
  ],
  climateCap: [
    base({ teamId: "a", climateFamiliarity: 100 }),
    base({ teamId: "b", climateFamiliarity: 0 }),
  ],
  tournamentContextCap: [
    base({ teamId: "a", tournamentContext: 1 }),
    base({ teamId: "b", tournamentContext: -1 }),
  ],
  manager: [
    base({ teamId: "a", sameNationalityManager: true }),
    base({ teamId: "b", sameNationalityManager: false }),
  ],
  structural: [
    base({ teamId: "a", structuralDepth: 1 }),
    base({ teamId: "b", structuralDepth: 0 }),
  ],
  mixedPosNeg: [
    base({ teamId: "a", elo: 1600, squadQuality: 30, recentForm: 70, isHost: true }),
    base({ teamId: "b", elo: 1550, squadQuality: 80, recentForm: 40, isRegional: true }),
  ],
};
