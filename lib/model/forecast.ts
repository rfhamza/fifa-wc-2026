/**
 * Forecast aggregation layer
 * --------------------------
 * The read API the UI talks to. It runs the (deterministic) Monte Carlo
 * simulation once, memoizes the snapshot for the process, and exposes tidy
 * selectors for predictions, stage probabilities, standings and movers. UI
 * components never call the simulator or model directly — they call here.
 */
import type {
  Fixture,
  GroupId,
  GroupStanding,
  MatchPrediction,
  ProbabilityDelta,
  SimulationSnapshot,
  TournamentStageProbability,
} from "@/lib/types";
import {
  fixtures,
  getTeam,
  getFixturesForGroup,
  groups,
} from "@/lib/data";
import { predictMatch } from "./predict";
import { runTournamentSimulation } from "@/lib/simulation/tournament";

let cachedSnapshot: SimulationSnapshot | null = null;

/** Memoized simulation snapshot (computed once per server process). */
export function getSnapshot(): SimulationSnapshot {
  if (!cachedSnapshot) {
    cachedSnapshot = runTournamentSimulation();
  }
  return cachedSnapshot;
}

const stageProbabilityIndex = (): Map<string, TournamentStageProbability> =>
  new Map(getSnapshot().stageProbabilities.map((p) => [p.teamId, p]));

let cachedStageIndex: Map<string, TournamentStageProbability> | null = null;
function stageIndex() {
  if (!cachedStageIndex) cachedStageIndex = stageProbabilityIndex();
  return cachedStageIndex;
}

export function getStageProbability(
  teamId: string,
): TournamentStageProbability | undefined {
  return stageIndex().get(teamId);
}

/** Teams ranked by tournament-winner probability (descending). */
export function getWinnerRanking(): TournamentStageProbability[] {
  return [...getSnapshot().stageProbabilities].sort(
    (a, b) => b.winner - a.winner,
  );
}

/** Prediction for a single fixture. */
export function predictFixture(fixture: Fixture): MatchPrediction {
  const prediction = predictMatch(
    getTeam(fixture.homeTeamId),
    getTeam(fixture.awayTeamId),
  );
  return { ...prediction, fixtureId: fixture.id };
}

/** Predictions for every group-stage fixture, in schedule order. */
export function getAllFixturePredictions(): {
  fixture: Fixture;
  prediction: MatchPrediction;
}[] {
  return fixtures.map((fixture) => ({
    fixture,
    prediction: predictFixture(fixture),
  }));
}

export function getExpectedStandingsForGroup(
  groupId: GroupId,
): GroupStanding[] {
  return getSnapshot()
    .expectedStandings.filter((s) => s.group === groupId)
    .sort((a, b) => a.rank - b.rank);
}

export function getFixturePredictionsForGroup(groupId: GroupId) {
  return getFixturesForGroup(groupId).map((fixture) => ({
    fixture,
    prediction: predictFixture(fixture),
  }));
}

export { groups };

/**
 * "Top movers": teams whose winner probability most exceeds a naive baseline
 * (uniform-ish prior across qualifiers). In phase one this surfaces standout
 * favourites; later it can diff two real snapshots over time.
 */
export function getTopMovers(metric: keyof Omit<TournamentStageProbability, "teamId"> = "winner", limit = 5): ProbabilityDelta[] {
  const probs = getSnapshot().stageProbabilities;
  // Baseline = mean probability across all teams for the metric.
  const baseline =
    probs.reduce((s, p) => s + p[metric], 0) / Math.max(1, probs.length);
  return probs
    .map((p) => ({
      teamId: p.teamId,
      metric,
      previous: baseline,
      current: p[metric],
      delta: p[metric] - baseline,
    }))
    .sort((a, b) => b.delta - a.delta)
    .slice(0, limit);
}
