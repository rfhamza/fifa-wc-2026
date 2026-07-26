/**
 * Post-tournament retrospective (PR B) - stage accuracy helpers.
 * Synthetic fixtures only; no artifacts, no model, no I/O.
 */
import { describe, expect, it } from "vitest";
import {
  REACH_STAGE_LABELS,
  UNEXPECTED_EXIT_MIN,
  UPSET_QUALIFIER_MAX,
  buildGroupAccuracy,
  buildStageAccuracy,
  buildTeamSurprise,
  buildThirdPlaceAccuracy,
  qualifyProbability,
  reachedStage,
} from "@/lib/retrospective/stage-accuracy";
import type { ActualOutcomes } from "@/lib/retrospective/actual-outcomes";
import type { ForecastSnapshot, ForecastTeamProbabilities } from "@/lib/model/forecast-snapshots";

/** Four teams: t1 strongest through t4 weakest. */
function team(
  teamId: string,
  rank: number,
  p: Partial<ForecastTeamProbabilities>,
): ForecastTeamProbabilities {
  return {
    teamId,
    rank,
    winner: 0,
    final: 0,
    semiFinal: 0,
    quarterFinal: 0,
    roundOf16: 0,
    roundOf32: 0,
    qualifyTop2: 0,
    qualifyThird: 0,
    ...p,
  };
}

const snapshot: ForecastSnapshot = {
  meta: {
    schemaVersion: "1.0.0",
    snapshotId: "synthetic",
    snapshotType: "baseline",
    asOf: "2026-06-11T00:00:00Z",
    generatedAt: "2026-06-11T00:00:00Z",
    weightsSummary: {},
    modelConfigHash: "x",
    dataVersion: "x",
    fixtureVersion: "x",
    liveStateSource: "none",
    liveStateAsOf: null,
    completedMatchesLocked: 0,
    simulationIterations: 1,
    seed: 1,
    notes: "",
  } as ForecastSnapshot["meta"],
  teams: [
    team("t1", 1, { winner: 0.5, final: 0.7, semiFinal: 0.8, quarterFinal: 0.9, roundOf16: 0.95, roundOf32: 1, qualifyTop2: 0.95, qualifyThird: 0.04 }),
    team("t2", 2, { winner: 0.3, final: 0.5, semiFinal: 0.6, quarterFinal: 0.7, roundOf16: 0.8, roundOf32: 0.9, qualifyTop2: 0.8, qualifyThird: 0.1 }),
    team("t3", 3, { winner: 0.15, final: 0.3, semiFinal: 0.4, quarterFinal: 0.5, roundOf16: 0.6, roundOf32: 0.7, qualifyTop2: 0.5, qualifyThird: 0.2 }),
    team("t4", 4, { winner: 0.05, final: 0.1, semiFinal: 0.2, quarterFinal: 0.3, roundOf16: 0.4, roundOf32: 0.5, qualifyTop2: 0.1, qualifyThird: 0.15 }),
  ],
};

/** t4 wins it all - the maximum possible upset for this snapshot. */
const actual: ActualOutcomes = {
  groups: [
    {
      group: "A" as ActualOutcomes["groups"][number]["group"],
      table: [
        { teamId: "t4" },
        { teamId: "t1" },
        { teamId: "t3" },
        { teamId: "t2" },
      ] as ActualOutcomes["groups"][number]["table"],
      winner: "t4",
      runnerUp: "t1",
      thirdPlaced: "t3",
      fourthPlaced: "t2",
      topTwo: ["t4", "t1"],
    },
  ],
  groupWinners: ["t4"],
  topTwoQualifiers: ["t4", "t1"],
  thirdPlacedRanked: ["t3"],
  thirdPlaceQualifiers: ["t3"],
  thirdPlaceEliminated: [],
  qualifiers: ["t1", "t3", "t4"],
  eliminatedInGroup: ["t2"],
  deepestStage: new Map([
    ["t1", "final"],
    ["t2", "groupStage"],
    ["t3", "roundOf32"],
    ["t4", "champion"],
  ]),
  reachedByStage: new Map([
    ["roundOf32", ["t1", "t3", "t4"]],
    ["roundOf16", ["t1", "t4"]],
    ["quarterFinal", ["t1", "t4"]],
    ["semiFinal", ["t1", "t4"]],
    ["final", ["t1", "t4"]],
  ]),
  knockoutWinners: new Map(),
  quarterFinalists: ["t1", "t4"],
  semiFinalists: ["t1", "t4"],
  finalists: ["t1", "t4"],
  champion: "t4",
  runnerUp: "t1",
  thirdPlaceMatchWinner: null,
} as ActualOutcomes;

describe("reachedStage", () => {
  it("treats a deeper run as having reached every shallower stage", () => {
    expect(reachedStage(actual, "t4", "roundOf32")).toBe(true);
    expect(reachedStage(actual, "t4", "winner")).toBe(true);
    expect(reachedStage(actual, "t1", "final")).toBe(true);
    expect(reachedStage(actual, "t1", "winner")).toBe(false);
    expect(reachedStage(actual, "t2", "roundOf32")).toBe(false);
  });
});

describe("buildStageAccuracy", () => {
  const rows = buildStageAccuracy(snapshot, actual);

  it("uses a predicted set sized to the slots that actually existed", () => {
    const r32 = rows.find((r) => r.stage === "roundOf32")!;
    expect(r32.actualCount).toBe(3);
    expect(r32.predictedTopN.length).toBe(3);
    expect(r32.actualTeams).toEqual(["t1", "t3", "t4"]);
  });

  it("counts hits and surfaces the high-probability misses", () => {
    const r32 = rows.find((r) => r.stage === "roundOf32")!;
    // Model's top three by roundOf32 are t1, t2, t3 - t2 did not qualify.
    expect(r32.hits.sort()).toEqual(["t1", "t3"]);
    expect(r32.highProbabilityMisses.map((m) => m.teamId)).toEqual(["t2"]);
    expect(r32.lowProbabilityOverperformers.map((m) => m.teamId)).toEqual(["t4"]);
  });

  it("emits one binary observation per team for calibration", () => {
    for (const r of rows) expect(r.observations.length).toBe(4);
    const title = rows.find((r) => r.stage === "winner")!;
    expect(title.observations.filter((o) => o.occurred).map((o) => o.label)).toEqual(["t4"]);
  });

  it("uses public stage labels", () => {
    expect(REACH_STAGE_LABELS.winner).toBe("Title chance");
    expect(REACH_STAGE_LABELS.roundOf16).toBe("Reach round of 16");
    expect(rows.map((r) => r.label)).not.toContain("win %");
  });
});

describe("buildTeamSurprise", () => {
  const rows = buildTeamSurprise(snapshot, actual);

  it("ranks the biggest overperformer first and the biggest shortfall last", () => {
    expect(rows[0]!.teamId).toBe("t4");
    expect(rows[rows.length - 1]!.teamId).toBe("t2");
    expect(rows[0]!.surprise).toBeGreaterThan(0);
    expect(rows[rows.length - 1]!.surprise).toBeLessThan(0);
  });

  it("computes expected depth as the sum of reach-stage probabilities", () => {
    const t1 = rows.find((r) => r.teamId === "t1")!;
    // 1 + 0.95 + 0.9 + 0.8 + 0.7 + 0.5
    expect(t1.expectedDepth).toBeCloseTo(4.85, 9);
    expect(t1.actualDepth).toBe(5); // reached the final
    expect(t1.surprise).toBeCloseTo(0.15, 9);
  });

  it("carries the baseline title rank for narrative use", () => {
    expect(rows.find((r) => r.teamId === "t1")!.baselineTitleRank).toBe(1);
    expect(rows.find((r) => r.teamId === "t4")!.baselineTitleRank).toBe(4);
  });
});

describe("buildThirdPlaceAccuracy", () => {
  const acc = buildThirdPlaceAccuracy(snapshot, actual);

  it("scores the unconditional qualifyThird across the whole field", () => {
    // Four teams in this fixture, so four observations - NOT just the one that finished third.
    expect(acc.observationCount).toBe(4);
    expect(acc.observations.length).toBe(4);
    expect(acc.observations.map((o) => o.label)).toEqual(["t1", "t2", "t3", "t4"]);
  });

  it("uses each team's own qualifyThird as the forecast probability", () => {
    const t3 = acc.observations.find((o) => o.label === "t3")!;
    expect(t3.probability).toBeCloseTo(0.2, 9);
    const t1 = acc.observations.find((o) => o.label === "t1")!;
    expect(t1.probability).toBeCloseTo(0.04, 9);
  });

  it("counts only teams that finished third AND advanced as positives", () => {
    expect(acc.positives).toBe(1);
    expect(acc.observations.filter((o) => o.occurred).map((o) => o.label)).toEqual(["t3"]);
    // t4 won the group and the tournament; it never counts toward the third-place route.
    expect(acc.observations.find((o) => o.label === "t4")!.occurred).toBe(false);
  });

  it("keeps the actual third-placed teams as descriptive context with their Annexe C rank", () => {
    expect(acc.descriptive.length).toBe(1);
    expect(acc.descriptive[0]).toMatchObject({
      teamId: "t3",
      group: "A",
      annexeCRank: 1,
      advanced: true,
    });
    expect(acc.descriptive[0]!.qualifyThird).toBeCloseTo(0.2, 9);
  });

  it("does not restrict scoring to the descriptive subset", () => {
    // The whole point of the fix: descriptive rows are far fewer than scored observations.
    expect(acc.descriptive.length).toBeLessThan(acc.observationCount);
  });
});

describe("buildGroupAccuracy", () => {
  const rows = buildGroupAccuracy(snapshot, actual);

  it("picks the model's top two by qualifyTop2 and scores them against reality", () => {
    const g = rows[0]!;
    expect(g.modelTopTwo).toEqual(["t1", "t2"]);
    expect(g.actualTopTwo).toEqual(["t4", "t1"]);
    expect(g.correctTopTwoCount).toBe(1);
    expect(g.exactTopTwoSet).toBe(false);
  });

  it("scores the group-winner pick separately from the top-two set", () => {
    const g = rows[0]!;
    expect(g.modelGroupWinner).toBe("t1");
    expect(g.actualGroupWinner).toBe("t4");
    expect(g.groupWinnerCorrect).toBe(false);
  });

  it("labels upset qualifiers and unexpected exits by the fixed thresholds", () => {
    const g = rows[0]!;
    // t4 qualified on 0.25 combined (< 0.35); t2 exited on 0.90 combined (>= 0.65).
    expect(qualifyProbability(snapshot.teams[3]!)).toBeCloseTo(0.25, 9);
    expect(qualifyProbability(snapshot.teams[1]!)).toBeCloseTo(0.9, 9);
    expect(g.upsetQualifiers).toEqual(["t4"]);
    expect(g.unexpectedExits).toEqual(["t2"]);
  });

  it("exposes the thresholds it used as pinned constants", () => {
    expect(UPSET_QUALIFIER_MAX).toBe(0.35);
    expect(UNEXPECTED_EXIT_MIN).toBe(0.65);
  });
});
