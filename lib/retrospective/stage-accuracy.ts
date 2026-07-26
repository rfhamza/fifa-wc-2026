/**
 * Post-tournament retrospective (PR B) - stage / reach-stage accuracy.
 * --------------------------------------------------------------------
 * Joins forecast snapshot probabilities (baseline or any public checkpoint) with the
 * actual outcomes derived in `actual-outcomes.ts`, producing the per-stage hit sets,
 * over/underperformer rankings and the binary observations the calibration tables consume.
 *
 * PURE: no I/O, no simulation, no model call.
 */
import type { ForecastSnapshot, ForecastTeamProbabilities } from "@/lib/model/forecast-snapshots";
import type { BinaryObservation } from "@/lib/retrospective/calibration";
import { STAGE_LABELS, stageDepth, type ActualOutcomes, type ReachedStage } from "@/lib/retrospective/actual-outcomes";

/** Snapshot probability keys that correspond to "reached at least this stage". */
export type ReachStageKey = "roundOf32" | "roundOf16" | "quarterFinal" | "semiFinal" | "final" | "winner";

/** Public-facing label for each reach-stage metric. Never "win %" / "final %". */
export const REACH_STAGE_LABELS: Readonly<Record<ReachStageKey, string>> = {
  roundOf32: "Reach round of 32",
  roundOf16: "Reach round of 16",
  quarterFinal: "Reach quarterfinal",
  semiFinal: "Reach semifinal",
  final: "Reach final",
  winner: "Title chance",
};

/** The reach-stage metric maps onto this rung of the actual-outcome ladder. */
const REACH_TO_LADDER: Readonly<Record<ReachStageKey, ReachedStage>> = {
  roundOf32: "roundOf32",
  roundOf16: "roundOf16",
  quarterFinal: "quarterFinal",
  semiFinal: "semiFinal",
  final: "final",
  winner: "champion",
};

export const REACH_STAGE_ORDER: readonly ReachStageKey[] = [
  "roundOf32",
  "roundOf16",
  "quarterFinal",
  "semiFinal",
  "final",
  "winner",
];

export interface StageAccuracyRow {
  stage: ReachStageKey;
  label: string;
  /** How many teams actually reached this stage (the slot count). */
  actualCount: number;
  /** Teams that actually reached it. */
  actualTeams: string[];
  /** The model's top-N by this probability, N = actualCount. */
  predictedTopN: string[];
  /** Intersection of the two. */
  hits: string[];
  hitCount: number;
  hitRate: number;
  /** Predicted top-N teams that did not reach the stage, worst-first by probability. */
  highProbabilityMisses: { teamId: string; probability: number }[];
  /** Teams that reached it from outside the predicted set, lowest probability first. */
  lowProbabilityOverperformers: { teamId: string; probability: number }[];
  /** One binary observation per team, for calibration. */
  observations: BinaryObservation[];
  brierInputCount: number;
}

const probOf = (t: ForecastTeamProbabilities, key: ReachStageKey): number => t[key];

/** Did this team actually reach (at least) the rung the reach-stage metric refers to? */
export function reachedStage(actual: ActualOutcomes, teamId: string, stage: ReachStageKey): boolean {
  const target = REACH_TO_LADDER[stage];
  const deepest = actual.deepestStage.get(teamId) ?? "groupStage";
  return stageDepth(deepest) >= stageDepth(target);
}

/**
 * Per-stage accuracy for one snapshot. "Predicted set" is deliberately the top-N by
 * probability where N is the number of slots that actually existed - a deterministic rule
 * that avoids treating a probability as a deterministic claim.
 */
export function buildStageAccuracy(snapshot: ForecastSnapshot, actual: ActualOutcomes): StageAccuracyRow[] {
  return REACH_STAGE_ORDER.map((stage) => {
    const actualTeams = snapshot.teams
      .map((t) => t.teamId)
      .filter((teamId) => reachedStage(actual, teamId, stage))
      .sort();
    const actualCount = actualTeams.length;
    const ranked = [...snapshot.teams].sort((a, b) => probOf(b, stage) - probOf(a, stage) || a.teamId.localeCompare(b.teamId));
    const predictedTopN = ranked.slice(0, actualCount).map((t) => t.teamId);
    const actualSet = new Set(actualTeams);
    const predictedSet = new Set(predictedTopN);
    const hits = predictedTopN.filter((t) => actualSet.has(t)).sort();

    const byId = new Map(snapshot.teams.map((t) => [t.teamId, t]));
    const highProbabilityMisses = predictedTopN
      .filter((t) => !actualSet.has(t))
      .map((teamId) => ({ teamId, probability: probOf(byId.get(teamId)!, stage) }))
      .sort((a, b) => b.probability - a.probability);
    const lowProbabilityOverperformers = actualTeams
      .filter((t) => !predictedSet.has(t))
      .map((teamId) => ({ teamId, probability: probOf(byId.get(teamId)!, stage) }))
      .sort((a, b) => a.probability - b.probability);

    const observations: BinaryObservation[] = snapshot.teams.map((t) => ({
      probability: probOf(t, stage),
      occurred: actualSet.has(t.teamId),
      label: t.teamId,
    }));

    return {
      stage,
      label: REACH_STAGE_LABELS[stage],
      actualCount,
      actualTeams,
      predictedTopN,
      hits,
      hitCount: hits.length,
      hitRate: actualCount ? hits.length / actualCount : 0,
      highProbabilityMisses,
      lowProbabilityOverperformers,
      observations,
      brierInputCount: observations.length,
    };
  });
}

export interface TeamSurpriseRow {
  teamId: string;
  actualStage: ReachedStage;
  actualStageLabel: string;
  actualDepth: number;
  /** Sum of reach-stage probabilities = expected number of rungs cleared. */
  expectedDepth: number;
  /** actualDepth - expectedDepth. Positive = outperformed the forecast. */
  surprise: number;
  baselineTitleProbability: number;
  baselineTitleRank: number;
  /** The probability the model gave to the stage this team actually reached. */
  probabilityOfStageReached: number | null;
}

/**
 * Rank every team by how far its actual run diverged from the forecast. Expected depth is
 * the sum of the five knockout reach probabilities plus the title probability, i.e. the
 * expected number of ladder rungs cleared - a natural continuous counterpart to the
 * discrete rung a team actually reached.
 */
export function buildTeamSurprise(snapshot: ForecastSnapshot, actual: ActualOutcomes): TeamSurpriseRow[] {
  const rankByTitle = [...snapshot.teams].sort((a, b) => b.winner - a.winner || a.teamId.localeCompare(b.teamId));
  const titleRank = new Map(rankByTitle.map((t, i) => [t.teamId, i + 1]));

  return snapshot.teams
    .map((t) => {
      const actualStage = actual.deepestStage.get(t.teamId) ?? "groupStage";
      const actualDepth = stageDepth(actualStage);
      const expectedDepth = REACH_STAGE_ORDER.reduce((sum, k) => sum + probOf(t, k), 0);
      const reachedKey = REACH_STAGE_ORDER.find((k) => REACH_TO_LADDER[k] === actualStage) ?? null;
      return {
        teamId: t.teamId,
        actualStage,
        actualStageLabel: STAGE_LABELS[actualStage],
        actualDepth,
        expectedDepth,
        surprise: actualDepth - expectedDepth,
        baselineTitleProbability: t.winner,
        baselineTitleRank: titleRank.get(t.teamId)!,
        probabilityOfStageReached: reachedKey ? probOf(t, reachedKey) : null,
      };
    })
    .sort((a, b) => b.surprise - a.surprise || a.teamId.localeCompare(b.teamId));
}

export interface GroupStageAccuracy {
  group: string;
  modelTopTwo: string[];
  actualTopTwo: string[];
  correctTopTwoCount: number;
  exactTopTwoSet: boolean;
  modelGroupWinner: string;
  actualGroupWinner: string;
  groupWinnerCorrect: boolean;
  actualThirdPlaced: string;
  thirdPlaceQualified: boolean;
  upsetQualifiers: string[];
  unexpectedExits: string[];
}

/** Thresholds for the derived qualification labels (pinned constants, not tuned). */
export const UPSET_QUALIFIER_MAX = 0.35;
export const UNEXPECTED_EXIT_MIN = 0.65;
export const LIKELY_QUALIFIER_MIN = 0.5;

/** Combined probability of reaching the Round of 32 via either route. */
export const qualifyProbability = (t: ForecastTeamProbabilities): number => t.qualifyTop2 + t.qualifyThird;

export function buildGroupAccuracy(snapshot: ForecastSnapshot, actual: ActualOutcomes): GroupStageAccuracy[] {
  const byId = new Map(snapshot.teams.map((t) => [t.teamId, t]));
  const qualifierSet = new Set(actual.qualifiers);
  const thirdQualifierSet = new Set(actual.thirdPlaceQualifiers);

  return actual.groups.map((g) => {
    const teamIds = g.table.map((s) => s.teamId);
    const rankedTop2 = [...teamIds].sort(
      (a, b) => byId.get(b)!.qualifyTop2 - byId.get(a)!.qualifyTop2 || a.localeCompare(b),
    );
    const modelTopTwo = rankedTop2.slice(0, 2);
    const correct = modelTopTwo.filter((t) => g.topTwo.includes(t));
    return {
      group: g.group,
      modelTopTwo,
      actualTopTwo: g.topTwo,
      correctTopTwoCount: correct.length,
      exactTopTwoSet: correct.length === 2,
      modelGroupWinner: modelTopTwo[0]!,
      actualGroupWinner: g.winner,
      groupWinnerCorrect: modelTopTwo[0] === g.winner,
      actualThirdPlaced: g.thirdPlaced,
      thirdPlaceQualified: thirdQualifierSet.has(g.thirdPlaced),
      upsetQualifiers: teamIds
        .filter((t) => qualifierSet.has(t) && qualifyProbability(byId.get(t)!) < UPSET_QUALIFIER_MAX)
        .sort(),
      unexpectedExits: teamIds
        .filter((t) => !qualifierSet.has(t) && qualifyProbability(byId.get(t)!) >= UNEXPECTED_EXIT_MIN)
        .sort(),
    };
  });
}
