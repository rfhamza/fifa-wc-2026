/**
 * Monte Carlo tournament simulator
 * --------------------------------
 * Simulates the full 2026 tournament thousands of times from seed data and
 * aggregates how often each team reaches each stage.
 *
 * Pipeline per iteration:
 *   1. Sample every group-stage match (Poisson goals from model lambdas).
 *   2. Build group standings.
 *   3. Qualify top-2 of each group + the best 8 third-placed teams (32 total).
 *   4. Seed those 32 into a bracket and simulate single-elimination knockouts.
 *
 * ⚠️  PLACEHOLDER: the mapping of qualifiers onto bracket positions is a
 *     documented, balanced seeding — NOT the official 2026 position chart.
 *     Replace `seedBracket` / qualifier ordering when the real bracket lands.
 *     See docs/MODEL_METHOD.md → "Bracket builder".
 */
import type {
  GroupId,
  GroupStanding,
  SimulationSnapshot,
  TeamFeatureSet,
  TournamentStageProbability,
} from "@/lib/types";
import { round } from "@/lib/utils";
import { SIMULATION_CONFIG } from "@/lib/model/config";
import { buildFeatureSet } from "@/lib/model/features";
import { computeDrivers, expectedGoalsFromAdvantage } from "@/lib/model/predict";
import { createRng, samplePoisson, type Rng } from "./rng";
import { computeGroupStandings, type MatchResult } from "./standings";
import { fixtures, groups, teams as allTeams } from "@/lib/data";

const QUALIFYING_THIRDS = 8; // best third-placed teams that advance

interface MatchupLambdas {
  home: number;
  away: number;
}

interface PreparedFixture {
  group: GroupId;
  homeTeamId: string;
  awayTeamId: string;
  lambdas: MatchupLambdas;
}

/** Net Elo advantage of A over B from the model drivers (no allocation-heavy explanation). */
function netAdvantage(a: TeamFeatureSet, b: TeamFeatureSet): number {
  return computeDrivers(a, b).reduce((s, d) => s + d.contribution, 0);
}

function matchupLambdas(a: TeamFeatureSet, b: TeamFeatureSet): MatchupLambdas {
  return expectedGoalsFromAdvantage(netAdvantage(a, b));
}

/** Standard single-elimination bracket seed order (1-indexed) for power-of-two n. */
export function seedBracket(n: number): number[] {
  let arr = [1, 2];
  while (arr.length < n) {
    const m = arr.length * 2 + 1;
    const next: number[] = [];
    for (const s of arr) {
      next.push(s);
      next.push(m - s);
    }
    arr = next;
  }
  return arr;
}

interface StageCounts {
  qualifyTop2: number;
  qualifyThird: number;
  roundOf32: number;
  roundOf16: number;
  quarterFinal: number;
  semiFinal: number;
  final: number;
  winner: number;
}

function emptyCounts(): StageCounts {
  return {
    qualifyTop2: 0,
    qualifyThird: 0,
    roundOf32: 0,
    roundOf16: 0,
    quarterFinal: 0,
    semiFinal: 0,
    final: 0,
    winner: 0,
  };
}

interface StandingAccumulator {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  group: GroupId;
}

export interface SimulationOptions {
  iterations?: number;
  seed?: number;
}

/**
 * Run the full Monte Carlo simulation and return an aggregated snapshot.
 * Deterministic for a given (iterations, seed) pair.
 */
export function runTournamentSimulation(
  options: SimulationOptions = {},
): SimulationSnapshot {
  const iterations = options.iterations ?? SIMULATION_CONFIG.defaultIterations;
  const seed = options.seed ?? SIMULATION_CONFIG.defaultSeed;
  const rng = createRng(seed);

  // ---- Precompute (done once, reused every iteration) ----
  const featureSets = new Map<string, TeamFeatureSet>(
    allTeams.map((t) => [t.id, buildFeatureSet(t)]),
  );
  const feat = (id: string) => featureSets.get(id)!;

  const prepared: PreparedFixture[] = fixtures.map((f) => ({
    group: f.group,
    homeTeamId: f.homeTeamId,
    awayTeamId: f.awayTeamId,
    lambdas: matchupLambdas(feat(f.homeTeamId), feat(f.awayTeamId)),
  }));

  const counts = new Map<string, StageCounts>(
    allTeams.map((t) => [t.id, emptyCounts()]),
  );
  const standingSums = new Map<string, StandingAccumulator>(
    allTeams.map((t) => [
      t.id,
      {
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
        group: t.group,
      },
    ]),
  );

  for (let i = 0; i < iterations; i++) {
    simulateOneTournament(prepared, feat, rng, counts, standingSums);
  }

  return {
    iterations,
    seed,
    stageProbabilities: buildStageProbabilities(counts, iterations),
    expectedStandings: buildExpectedStandings(standingSums, iterations),
    generatedAt: new Date().toISOString(),
  };
}

function simulateOneTournament(
  prepared: PreparedFixture[],
  feat: (id: string) => TeamFeatureSet,
  rng: Rng,
  counts: Map<string, StageCounts>,
  standingSums: Map<string, StandingAccumulator>,
): void {
  // 1. Simulate group matches.
  const resultsByGroup = new Map<GroupId, MatchResult[]>();
  for (const pf of prepared) {
    const homeGoals = samplePoisson(rng, pf.lambdas.home);
    const awayGoals = samplePoisson(rng, pf.lambdas.away);
    const list = resultsByGroup.get(pf.group) ?? [];
    list.push({
      homeTeamId: pf.homeTeamId,
      awayTeamId: pf.awayTeamId,
      homeGoals,
      awayGoals,
    });
    resultsByGroup.set(pf.group, list);
  }

  // 2. Standings + collect qualifiers.
  const winnersAndRunners: GroupStanding[] = [];
  const thirdPlaced: GroupStanding[] = [];

  for (const group of groups) {
    const standings = computeGroupStandings(
      group.id,
      group.teamIds,
      resultsByGroup.get(group.id) ?? [],
    );
    for (const s of standings) {
      const acc = standingSums.get(s.teamId)!;
      acc.played += s.played;
      acc.won += s.won;
      acc.drawn += s.drawn;
      acc.lost += s.lost;
      acc.goalsFor += s.goalsFor;
      acc.goalsAgainst += s.goalsAgainst;
      acc.points += s.points;

      if (s.rank <= 2) {
        counts.get(s.teamId)!.qualifyTop2 += 1;
        winnersAndRunners.push(s);
      } else if (s.rank === 3) {
        thirdPlaced.push(s);
      }
    }
  }

  // 3. Best third-placed teams advance.
  thirdPlaced.sort(byStrength);
  const qualifyingThirds = thirdPlaced.slice(0, QUALIFYING_THIRDS);
  for (const s of qualifyingThirds) {
    counts.get(s.teamId)!.qualifyThird += 1;
  }

  // 4. Seed the 32 qualifiers and run the knockout bracket.
  const qualifiers = [...winnersAndRunners, ...qualifyingThirds].sort(
    byStrength,
  );
  const order = seedBracket(32); // bracket positions (1-indexed seeds)
  let alive: string[] = order.map((seedNo) => qualifiers[seedNo - 1]!.teamId);

  const stageKeys: (keyof StageCounts)[] = [
    "roundOf32",
    "roundOf16",
    "quarterFinal",
    "semiFinal",
    "final",
    "winner",
  ];

  // Everyone alive entered the Round of 32.
  for (const id of alive) counts.get(id)!.roundOf32 += 1;

  let stageIdx = 1; // next stage reached by winners is roundOf16
  while (alive.length > 1) {
    const next: string[] = [];
    for (let m = 0; m < alive.length; m += 2) {
      const a = alive[m]!;
      const b = alive[m + 1]!;
      next.push(knockoutWinner(a, b, feat, rng));
    }
    const stageKey = stageKeys[stageIdx]!;
    for (const id of next) counts.get(id)![stageKey] += 1;
    alive = next;
    stageIdx += 1;
  }
}

/** Simulate a single knockout match; ties resolved by a strength-weighted shootout. */
function knockoutWinner(
  aId: string,
  bId: string,
  feat: (id: string) => TeamFeatureSet,
  rng: Rng,
): string {
  const lambdas = matchupLambdas(feat(aId), feat(bId));
  const aGoals = samplePoisson(rng, lambdas.home);
  const bGoals = samplePoisson(rng, lambdas.away);
  if (aGoals > bGoals) return aId;
  if (bGoals > aGoals) return bId;
  // Penalty shootout: stronger expected-goals side slightly favoured.
  const pA = lambdas.home / (lambdas.home + lambdas.away);
  return rng.next() < pA ? aId : bId;
}

const byStrength = (a: GroupStanding, b: GroupStanding): number => {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDifference !== a.goalDifference)
    return b.goalDifference - a.goalDifference;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  return a.teamId.localeCompare(b.teamId);
};

function buildStageProbabilities(
  counts: Map<string, StageCounts>,
  iterations: number,
): TournamentStageProbability[] {
  return [...counts.entries()].map(([teamId, c]) => ({
    teamId,
    qualifyTop2: round(c.qualifyTop2 / iterations, 4),
    qualifyThird: round(c.qualifyThird / iterations, 4),
    roundOf32: round(c.roundOf32 / iterations, 4),
    roundOf16: round(c.roundOf16 / iterations, 4),
    quarterFinal: round(c.quarterFinal / iterations, 4),
    semiFinal: round(c.semiFinal / iterations, 4),
    final: round(c.final / iterations, 4),
    winner: round(c.winner / iterations, 4),
  }));
}

function buildExpectedStandings(
  sums: Map<string, StandingAccumulator>,
  iterations: number,
): GroupStanding[] {
  const standings: GroupStanding[] = [...sums.entries()].map(
    ([teamId, acc]) => {
      const goalsFor = acc.goalsFor / iterations;
      const goalsAgainst = acc.goalsAgainst / iterations;
      return {
        teamId,
        group: acc.group,
        played: round(acc.played / iterations, 1),
        won: round(acc.won / iterations, 2),
        drawn: round(acc.drawn / iterations, 2),
        lost: round(acc.lost / iterations, 2),
        goalsFor: round(goalsFor, 2),
        goalsAgainst: round(goalsAgainst, 2),
        goalDifference: round(goalsFor - goalsAgainst, 2),
        points: round(acc.points / iterations, 2),
        rank: 0,
      };
    },
  );

  // Rank within each group by average points.
  const byGroup = new Map<GroupId, GroupStanding[]>();
  for (const s of standings) {
    const list = byGroup.get(s.group) ?? [];
    list.push(s);
    byGroup.set(s.group, list);
  }
  for (const list of byGroup.values()) {
    list.sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference);
    list.forEach((s, i) => {
      s.rank = i + 1;
    });
  }
  return standings;
}
