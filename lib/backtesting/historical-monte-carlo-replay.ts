/**
 * Phase 1.21F - PRIMARY-ONLY Monte Carlo historical tournament replay (backtesting layer).
 * ---------------------------------------------------------------------------------------
 * Simulates each PRIMARY historical World Cup (2010 / 2014 / 2018 / 2022) many times from
 * FROZEN pre-tournament inputs and reports, descriptively, the model's tournament outcome
 * distribution (per-team stage-reach probabilities) versus the ACTUAL outcome. This is the
 * third distinct backtesting view (see docs/BACKTESTING_TOURNAMENT_REPLAY_PLAN.md):
 *   1. match-level diagnostics (consolidate.ts / loto.ts / stretch) - 90' W/D/L scoring,
 *   2. deterministic reconstruction (tournament-reconstruction.ts) - structure recovery,
 *   3. Monte Carlo replay (THIS FILE) - outcome distributions from model probabilities.
 *
 * GOVERNANCE (hard rules):
 *  - SUPPLEMENTARY, DESCRIPTIVE, and APPROXIMATE only. It is NOT the headline benchmark,
 *    NOT calibration evidence, NOT a tuning/model-selection mechanism, NOT a LOTO basis,
 *    and NOT a production probability. Calibration remains NO-GO.
 *  - PRIMARY-ONLY: it hardcodes `primaryDiagnosticPacks` (2010/2014/2018/2022). It does NOT
 *    accept arbitrary packs, does NOT include 1998/2002/2006, does NOT compute an all-seven
 *    replay, does NOT compute LOTO, and emits NO "best variant" / recommended weights /
 *    calibration advice / blended headline / better-vs-worse verdict.
 *  - ISOLATION: it lives in the backtesting layer and reuses only import-safe pieces
 *    (`@/lib/simulation/rng`, `@/lib/simulation/standings`, `@/lib/model/prediction-core`,
 *    `./model-variants`, `./feature-adapter`, `./historical-cohorts`). It deliberately does
 *    NOT import `@/lib/simulation/tournament` (48-team / 2026-specific; pulls in forbidden
 *    production-facing modules), so the knockout / lambda helpers are reimplemented locally.
 *
 * APPROXIMATIONS (documented, not exact):
 *  - Group tiebreakers reuse the production Article-13 standings helper as a deterministic
 *    APPROXIMATION; historical regulations are not claimed to be reproduced exactly.
 *  - Knockout advancement uses an approximate draw-breaker (Poisson 90' goals; ties resolved
 *    by an xG-share coin flip). There is NO exact extra-time scoreline or historical
 *    penalty-shootout model.
 */
import type { GroupId, TeamFeatureSet, TeamMeta } from "@/lib/types";
import { createRng, samplePoisson, type Rng } from "@/lib/simulation/rng";
import { computeGroupStandings, type MatchResult } from "@/lib/simulation/standings";
import {
  computeDrivers,
  expectedGoalsFromAdvantage,
  type FeatureStatusResolver,
} from "@/lib/model/prediction-core";
import type { ModelWeights } from "@/lib/model/config";
import { BASELINE_LADDER, variantWeights, type ModelVariant } from "./model-variants";
import { buildHistoricalFeatures } from "./feature-adapter";
import { primaryDiagnosticPacks, PRIMARY_DIAGNOSTIC_YEARS } from "./historical-cohorts";
import type { HistoricalSourcePack } from "./types";

/** Human-readable label making the supplementary, approximate, non-headline nature explicit. */
export const PRIMARY_REPLAY_DIAGNOSTIC_LABEL =
  "Primary historical replay (Monte Carlo) - supplementary and approximate; not headline, not calibration evidence, not LOTO";

/** Governance flags pinned on every replay result (all false except `supplementaryOnly`). */
export const PRIMARY_REPLAY_GOVERNANCE_FLAGS = {
  /** Replay is supplementary context only. */
  supplementaryOnly: true,
  /** Must never be treated as the headline benchmark. */
  headlineEligible: false,
  /** Must never be used as calibration evidence. */
  calibrationEligible: false,
  /** Must never be used as (or extended into) a LOTO basis. */
  lotoEligible: false,
  /** Must never be used to tune / select weights. */
  tuningEligible: false,
  /** Must never feed production probabilities. */
  productionEligible: false,
} as const;

export type PrimaryReplayGovernanceFlags = typeof PRIMARY_REPLAY_GOVERNANCE_FLAGS;

/** Default Monte Carlo iteration count for ad-hoc runs (tests pin a much lower count). */
export const DEFAULT_REPLAY_ITERATIONS = 20000;
/** Fixed default base seed for deterministic reproducibility. */
export const DEFAULT_REPLAY_SEED = 0x1f2e3d4c;

/**
 * Source-backed per-year knockout bracket trees for the four primary tournaments. R16 slot
 * pairings use "X1" (group X winner) / "X2" (group X runner-up). `quarterFinalFeeds` /
 * `semiFinalFeeds` reference winner indices of the previous round. Every tree is verified in
 * `tests/backtesting-historical-monte-carlo-replay.test.ts` by feeding the ACTUAL qualifiers
 * and checking the resulting R16/QF/SF/final matchups against the actual historical rows.
 *
 * Provenance: 2010 / 2014 from each pack's `identity.bracket.description` (explicit match-number
 * feed M49..M64); 2018 / 2022 from each pack's `identity.bracket.roundOf16` array (in array
 * order) with the standard adjacent binary feed - both confirmed against the actual rows.
 */
export interface BracketTree {
  /** 8 R16 slot pairings, in bracket order. */
  readonly roundOf16: readonly (readonly [string, string])[];
  /** 4 quarter-finals; each = winners of these two R16 indices. */
  readonly quarterFinalFeeds: readonly (readonly [number, number])[];
  /** 2 semi-finals; each = winners of these two QF indices. */
  readonly semiFinalFeeds: readonly (readonly [number, number])[];
}

export const PRIMARY_REPLAY_BRACKET_TREES: Readonly<Record<number, BracketTree>> = {
  2010: {
    roundOf16: [["A1", "B2"], ["C1", "D2"], ["D1", "C2"], ["B1", "A2"], ["E1", "F2"], ["G1", "H2"], ["F1", "E2"], ["H1", "G2"]],
    quarterFinalFeeds: [[4, 5], [0, 1], [3, 2], [6, 7]],
    semiFinalFeeds: [[0, 1], [2, 3]],
  },
  2014: {
    roundOf16: [["A1", "B2"], ["C1", "D2"], ["B1", "A2"], ["D1", "C2"], ["E1", "F2"], ["G1", "H2"], ["F1", "E2"], ["H1", "G2"]],
    quarterFinalFeeds: [[4, 5], [0, 1], [6, 7], [2, 3]],
    semiFinalFeeds: [[0, 1], [2, 3]],
  },
  2018: {
    roundOf16: [["A1", "B2"], ["C1", "D2"], ["E1", "F2"], ["G1", "H2"], ["B1", "A2"], ["D1", "C2"], ["F1", "E2"], ["H1", "G2"]],
    quarterFinalFeeds: [[0, 1], [2, 3], [4, 5], [6, 7]],
    semiFinalFeeds: [[0, 1], [2, 3]],
  },
  2022: {
    roundOf16: [["A1", "B2"], ["C1", "D2"], ["E1", "F2"], ["G1", "H2"], ["B1", "A2"], ["D1", "C2"], ["F1", "E2"], ["H1", "G2"]],
    quarterFinalFeeds: [[0, 1], [2, 3], [4, 5], [6, 7]],
    semiFinalFeeds: [[0, 1], [2, 3]],
  },
};

/** Per-team probabilities of reaching each knockout stage (descriptive). */
export interface ReplayStageProbabilities {
  teamId: string;
  /** Reached the Round of 16 (i.e. qualified from the group). */
  reachR16: number;
  reachQF: number;
  reachSF: number;
  reachFinal: number;
  /** Won the tournament. */
  win: number;
}

/** Replay output for a single ladder variant within one tournament. */
export interface VariantReplay {
  variantId: string;
  variantLabel: string;
  /** Per-team stage-reach probabilities (sorted by win prob desc, then team id). */
  perTeam: ReplayStageProbabilities[];
  /** Simulated win probability of the ACTUAL champion. */
  actualChampionWinProbability: number;
  /** 1-based rank of the actual champion among all teams by simulated win probability. */
  actualChampionRank: number;
  /** Simulated final-reach probability of each ACTUAL finalist. */
  actualFinalists: { teamId: string; reachFinalProbability: number }[];
}

/** Replay output for a single primary tournament across all ladder variants. */
export interface PerTournamentReplay {
  tournamentYear: number;
  /** Actual champion (from the pack's final `winner`). */
  actualChampion: string;
  /** Actual finalists (the final's two teams). */
  actualFinalists: string[];
  byVariant: Record<string, VariantReplay>;
  /** Documented approximations applied to this tournament's replay. */
  assumptions: string[];
  warnings: string[];
}

/** Top-level primary-only Monte Carlo replay diagnostics. */
export interface PrimaryHistoricalReplayDiagnostics {
  /** Label signalling the supplementary, approximate, non-headline nature of this view. */
  cohortLabel: string;
  /** Exactly [2010, 2014, 2018, 2022]. */
  years: number[];
  /** Exactly 4. */
  tournamentCount: number;
  /** Monte Carlo iterations per (tournament, variant). */
  iterations: number;
  /** Base seed used (deterministic reproducibility). */
  seed: number;
  /** Per-tournament replay (ascending by year). */
  perTournament: PerTournamentReplay[];
  /** Pinned governance flags (see PRIMARY_REPLAY_GOVERNANCE_FLAGS). */
  governance: PrimaryReplayGovernanceFlags;
}

export interface PrimaryReplayOptions {
  iterations?: number;
  seed?: number;
  ladder?: ModelVariant[];
}

// ---- local helpers (reimplemented from the import-safe core; NOT from tournament.ts) ----

/** Historical replay injects no provenance status (mirrors the evaluator's resolver). */
const NEUTRAL_RESOLVER: FeatureStatusResolver = () => undefined;

interface MatchupLambdas {
  home: number;
  away: number;
}

/** Net rating advantage of A over B from the model drivers. */
function netAdvantage(a: TeamFeatureSet, b: TeamFeatureSet, weights: ModelWeights): number {
  return computeDrivers(a, b, weights, NEUTRAL_RESOLVER).reduce((s, d) => s + d.contribution, 0);
}

function matchupLambdas(a: TeamFeatureSet, b: TeamFeatureSet, weights: ModelWeights): MatchupLambdas {
  return expectedGoalsFromAdvantage(netAdvantage(a, b, weights));
}

/**
 * Simulate a single knockout match (APPROXIMATE): Poisson 90' goals; higher score advances;
 * on a tie, an xG-share coin flip decides. No exact extra-time scoreline or penalty model.
 */
function knockoutWinner(
  aId: string,
  bId: string,
  feat: Map<string, TeamFeatureSet>,
  rng: Rng,
  weights: ModelWeights,
): string {
  const l = matchupLambdas(feat.get(aId)!, feat.get(bId)!, weights);
  const aGoals = samplePoisson(rng, l.home);
  const bGoals = samplePoisson(rng, l.away);
  if (aGoals > bGoals) return aId;
  if (bGoals > aGoals) return bId;
  const pA = l.home / (l.home + l.away);
  return rng.next() < pA ? aId : bId;
}

/** Deterministically derive a uint32 sub-seed for one (year, variant) run from the base seed. */
function subSeed(base: number, year: number, variantIndex: number): number {
  let h = base >>> 0;
  h = Math.imul(h ^ year, 2654435761) >>> 0;
  h = Math.imul(h ^ (variantIndex + 1), 40503) >>> 0;
  return h >>> 0;
}

/** All 6 round-robin pairings (index pairs) for a group of four, in fixed order. */
const GROUP4_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3],
];

interface StageCounts {
  reachR16: number;
  reachQF: number;
  reachSF: number;
  reachFinal: number;
  win: number;
}

function blankCounts(): StageCounts {
  return { reachR16: 0, reachQF: 0, reachSF: 0, reachFinal: 0, win: 0 };
}

/**
 * Run the Monte Carlo replay for ONE tournament and ONE variant. Returns per-team stage
 * counts over `iterations` deterministic iterations seeded from `seed`.
 */
function replayOne(
  pack: HistoricalSourcePack,
  feat: Map<string, TeamFeatureSet>,
  meta: TeamMeta[],
  weights: ModelWeights,
  iterations: number,
  seed: number,
): Map<string, StageCounts> {
  const tree = PRIMARY_REPLAY_BRACKET_TREES[pack.identity.tournamentYear];
  if (!tree) throw new Error(`no bracket tree for ${pack.identity.tournamentYear}`);
  const groupEntries = Object.entries(pack.identity.groups);
  const counts = new Map<string, StageCounts>(
    pack.identity.teamIds.map((id) => [id, blankCounts()]),
  );
  const rng = createRng(seed);

  for (let iter = 0; iter < iterations; iter += 1) {
    // 1. Group stage: 8 groups of 4, all 6 round-robin pairings each.
    const slotTeam: Record<string, string> = {};
    for (const [gid, teamIds] of groupEntries) {
      const results: MatchResult[] = GROUP4_PAIRS.map(([i, j]) => {
        const x = teamIds[i]!;
        const y = teamIds[j]!;
        const l = matchupLambdas(feat.get(x)!, feat.get(y)!, weights);
        return {
          homeTeamId: x,
          awayTeamId: y,
          homeGoals: samplePoisson(rng, l.home),
          awayGoals: samplePoisson(rng, l.away),
        };
      });
      const standings = computeGroupStandings(gid as GroupId, teamIds, results, meta);
      slotTeam[`${gid}1`] = standings[0]!.teamId;
      slotTeam[`${gid}2`] = standings[1]!.teamId;
    }

    // 2. Knockout: R16 -> QF -> SF -> final via the source-backed bracket tree.
    const r16Winners: string[] = [];
    for (const [a, b] of tree.roundOf16) {
      const t1 = slotTeam[a]!;
      const t2 = slotTeam[b]!;
      counts.get(t1)!.reachR16 += 1;
      counts.get(t2)!.reachR16 += 1;
      r16Winners.push(knockoutWinner(t1, t2, feat, rng, weights));
    }
    const qfWinners: string[] = [];
    for (const [i, j] of tree.quarterFinalFeeds) {
      const t1 = r16Winners[i]!;
      const t2 = r16Winners[j]!;
      counts.get(t1)!.reachQF += 1;
      counts.get(t2)!.reachQF += 1;
      qfWinners.push(knockoutWinner(t1, t2, feat, rng, weights));
    }
    const sfWinners: string[] = [];
    for (const [i, j] of tree.semiFinalFeeds) {
      const t1 = qfWinners[i]!;
      const t2 = qfWinners[j]!;
      counts.get(t1)!.reachSF += 1;
      counts.get(t2)!.reachSF += 1;
      sfWinners.push(knockoutWinner(t1, t2, feat, rng, weights));
    }
    const f1 = sfWinners[0]!;
    const f2 = sfWinners[1]!;
    counts.get(f1)!.reachFinal += 1;
    counts.get(f2)!.reachFinal += 1;
    counts.get(knockoutWinner(f1, f2, feat, rng, weights))!.win += 1;
  }

  return counts;
}

/** Actual champion + finalists from a pack's final row (source-backed `winner`). */
function actualOutcome(pack: HistoricalSourcePack): { champion: string; finalists: string[] } {
  const final = pack.results.find((m) => m.stage === "final");
  if (!final) throw new Error(`no final row for ${pack.identity.tournamentYear}`);
  const finalists = [final.teamA, final.teamB];
  const champion = final.winner ?? "";
  return { champion, finalists };
}

/**
 * Compute the PRIMARY-ONLY Monte Carlo historical replay over WC 2010/2014/2018/2022.
 * Consumes EXACTLY `primaryDiagnosticPacks` (no arbitrary packs, no stretch, no all-seven,
 * no LOTO). Supplementary, descriptive, and approximate - see governance notes above.
 */
export function computePrimaryHistoricalReplay(
  opts: PrimaryReplayOptions = {},
): PrimaryHistoricalReplayDiagnostics {
  const iterations = opts.iterations ?? DEFAULT_REPLAY_ITERATIONS;
  const seed = opts.seed ?? DEFAULT_REPLAY_SEED;
  const ladder = opts.ladder ?? BASELINE_LADDER;

  const perTournament: PerTournamentReplay[] = primaryDiagnosticPacks.map((pack) => {
    const year = pack.identity.tournamentYear;
    const feat = buildHistoricalFeatures(pack);
    const meta: TeamMeta[] = pack.fifa.map((f) => ({
      teamId: f.teamId,
      fifaRanking: f.rank,
      conductScore: 0,
    }));
    const { champion, finalists } = actualOutcome(pack);

    const byVariant: Record<string, VariantReplay> = {};
    ladder.forEach((variant, variantIndex) => {
      const counts = replayOne(
        pack,
        feat,
        meta,
        variantWeights(variant),
        iterations,
        subSeed(seed, year, variantIndex),
      );
      const perTeam: ReplayStageProbabilities[] = [...counts.entries()]
        .map(([teamId, c]) => ({
          teamId,
          reachR16: c.reachR16 / iterations,
          reachQF: c.reachQF / iterations,
          reachSF: c.reachSF / iterations,
          reachFinal: c.reachFinal / iterations,
          win: c.win / iterations,
        }))
        .sort((a, b) => b.win - a.win || a.teamId.localeCompare(b.teamId));

      const championRow = perTeam.find((t) => t.teamId === champion);
      const actualChampionRank = perTeam.findIndex((t) => t.teamId === champion) + 1;

      byVariant[variant.id] = {
        variantId: variant.id,
        variantLabel: variant.label,
        perTeam,
        actualChampionWinProbability: championRow ? championRow.win : 0,
        actualChampionRank,
        actualFinalists: finalists.map((teamId) => ({
          teamId,
          reachFinalProbability: perTeam.find((t) => t.teamId === teamId)?.reachFinal ?? 0,
        })),
      };
    });

    return {
      tournamentYear: year,
      actualChampion: champion,
      actualFinalists: finalists,
      byVariant,
      assumptions: [
        "Group tiebreakers reuse the production Article-13 standings helper as a deterministic approximation; exact historical regulations are not claimed.",
        "Knockout advancement is approximate: Poisson 90' goals with an xG-share coin-flip draw-breaker; no exact extra-time scoreline or penalty-shootout model.",
        "Knockout bracket tree is source-backed and verified against the actual historical knockout rows.",
      ],
      warnings: [],
    };
  });

  return {
    cohortLabel: PRIMARY_REPLAY_DIAGNOSTIC_LABEL,
    years: [...PRIMARY_DIAGNOSTIC_YEARS],
    tournamentCount: perTournament.length,
    iterations,
    seed,
    perTournament,
    governance: PRIMARY_REPLAY_GOVERNANCE_FLAGS,
  };
}
