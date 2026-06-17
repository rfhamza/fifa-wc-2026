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
 * NOTE - PLACEHOLDER: the mapping of qualifiers onto bracket positions is a
 *   documented, balanced seeding - NOT the official 2026 position chart. The
 *   official path (lib/simulation/bracket.ts) is used only when verified; until
 *   then `seedBracket` / qualifier ordering is the fallback. See
 *   docs/MODEL_METHOD.md -> "Bracket: official structure + placeholder fallback".
 */
import type {
  BracketDefinition,
  GroupId,
  GroupStanding,
  SimulationSnapshot,
  TeamFeatureSet,
  TeamMeta,
  TournamentStageProbability,
} from "@/lib/types";
import { round } from "@/lib/utils";
import { SIMULATION_CONFIG } from "@/lib/model/config";
import { buildFeatureSet } from "@/lib/model/features";
import { computeDrivers, expectedGoalsFromAdvantage } from "@/lib/model/predict";
import { createRng, samplePoisson, type Rng } from "./rng";
import {
  computeGroupStandings,
  rankThirdPlacedTeams,
  type MatchResult,
} from "./standings";
import { bracket as officialBracketDefinition, fixtures, groups, teams as allTeams } from "@/lib/data";
import {
  isBracketActive,
  realiseOfficialBracket,
  type GroupResult,
} from "./bracket";

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
  /**
   * Override the bracket definition (used by tests to inject a verified
   * synthetic bracket). Defaults to the resolved dataset bracket, which in
   * production is the placeholder-seeded `mock` template.
   */
  bracket?: BracketDefinition;
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

  // Per-team metadata for Article 13 tiebreakers (conduct is a 0 placeholder).
  const teamMeta: TeamMeta[] = allTeams.map((t) => ({
    teamId: t.id,
    fifaRanking: t.fifaRanking,
    conductScore: 0,
  }));

  // Official bracket is used ONLY when verified AND structurally valid; otherwise
  // the simulator keeps the placeholder strength-seeding (production default).
  const bracketDef = options.bracket ?? officialBracketDefinition;
  const activeBracket = isBracketActive(bracketDef) ? bracketDef : null;

  for (let i = 0; i < iterations; i++) {
    simulateOneTournament(prepared, feat, rng, counts, standingSums, teamMeta, activeBracket);
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
  teamMeta: TeamMeta[],
  activeBracket: BracketDefinition | null,
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

  // 2. Standings + collect qualifiers (and per-group finishers for the bracket).
  const winnersAndRunners: GroupStanding[] = [];
  const thirdPlaced: GroupStanding[] = [];
  const groupResults = new Map<GroupId, GroupResult>();

  for (const group of groups) {
    const standings = computeGroupStandings(
      group.id,
      group.teamIds,
      resultsByGroup.get(group.id) ?? [],
      teamMeta,
    );
    groupResults.set(group.id, {
      winner: standings[0]!.teamId,
      runnerUp: standings[1]!.teamId,
      third: standings[2]!.teamId,
    });
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

  // 3. Best third-placed teams advance (official all-group criteria, NOT H2H).
  const qualifyingThirds = rankThirdPlacedTeams(thirdPlaced, teamMeta).slice(
    0,
    QUALIFYING_THIRDS,
  );
  for (const s of qualifyingThirds) {
    counts.get(s.teamId)!.qualifyThird += 1;
  }

  // 4. Knockout stage: official bracket when active, else placeholder seeding.
  if (activeBracket) {
    runOfficialKnockout(activeBracket, groupResults, qualifyingThirds, feat, rng, counts);
  } else {
    runPlaceholderKnockout(winnersAndRunners, qualifyingThirds, feat, rng, counts);
  }
}

const STAGE_KEYS: (keyof StageCounts)[] = [
  "roundOf32",
  "roundOf16",
  "quarterFinal",
  "semiFinal",
  "final",
  "winner",
];

/** Placeholder knockout: strength-seeded balanced bracket (production default). */
function runPlaceholderKnockout(
  winnersAndRunners: GroupStanding[],
  qualifyingThirds: GroupStanding[],
  feat: (id: string) => TeamFeatureSet,
  rng: Rng,
  counts: Map<string, StageCounts>,
): void {
  const qualifiers = [...winnersAndRunners, ...qualifyingThirds].sort(byStrength);
  const order = seedBracket(32); // bracket positions (1-indexed seeds)
  let alive: string[] = order.map((seedNo) => qualifiers[seedNo - 1]!.teamId);

  for (const id of alive) counts.get(id)!.roundOf32 += 1;

  let stageIdx = 1; // next stage reached by winners is roundOf16
  while (alive.length > 1) {
    const next: string[] = [];
    for (let m = 0; m < alive.length; m += 2) {
      next.push(knockoutWinner(alive[m]!, alive[m + 1]!, feat, rng));
    }
    const stageKey = STAGE_KEYS[stageIdx]!;
    for (const id of next) counts.get(id)![stageKey] += 1;
    alive = next;
    stageIdx += 1;
  }
}

/** Official knockout: realise the source-verified bracket + Annexe C allocation. */
function runOfficialKnockout(
  bracketDef: BracketDefinition,
  groupResults: Map<GroupId, GroupResult>,
  qualifyingThirds: GroupStanding[],
  feat: (id: string) => TeamFeatureSet,
  rng: Rng,
  counts: Map<string, StageCounts>,
): void {
  const realised = realiseOfficialBracket({
    graph: bracketDef.graph,
    allocation: bracketDef.thirdPlaceAllocation,
    groupResults,
    thirdGroups: qualifyingThirds.map((s) => s.group),
    decideWinner: (a, b) => knockoutWinner(a, b, feat, rng),
  });
  for (const id of realised.r32Entrants) counts.get(id)!.roundOf32 += 1;
  for (const id of realised.roundOf16) counts.get(id)!.roundOf16 += 1;
  for (const id of realised.quarterFinal) counts.get(id)!.quarterFinal += 1;
  for (const id of realised.semiFinal) counts.get(id)!.semiFinal += 1;
  for (const id of realised.finalists) counts.get(id)!.final += 1;
  counts.get(realised.champion)!.winner += 1;
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
