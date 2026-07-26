/**
 * Post-tournament retrospective (PR B) - actual-outcome derivation.
 * Synthetic mini-tournament fixtures; no artifacts, no model, no I/O.
 */
import { describe, expect, it } from "vitest";
import { deriveActualOutcomes, stageDepth, STAGE_LABELS } from "@/lib/retrospective/actual-outcomes";
import type { ForecastResultsLedger, ResultLedgerRow } from "@/lib/model/forecast-results-ledger";

/** Two groups of four, then a four-team knockout: R32 -> SF -> final, plus a third-place match. */
function miniLedger(): ForecastResultsLedger {
  const group = (
    matchNumber: number,
    g: string,
    home: string,
    away: string,
    hg: number,
    ag: number,
  ): ResultLedgerRow =>
    ({ matchNumber, stage: "group", group: g, homeTeamId: home, awayTeamId: away, homeGoals: hg, awayGoals: ag, status: "complete" }) as ResultLedgerRow;
  const ko = (
    matchNumber: number,
    stage: string,
    home: string,
    away: string,
    hg: number,
    ag: number,
    winner: string,
    pens?: [number, number],
  ): ResultLedgerRow =>
    ({
      matchNumber,
      stage,
      homeTeamId: home,
      awayTeamId: away,
      homeGoals: hg,
      awayGoals: ag,
      status: "complete",
      winnerTeamId: winner,
      ...(pens ? { penaltiesHome: pens[0], penaltiesAway: pens[1] } : {}),
    }) as ResultLedgerRow;

  return {
    schemaVersion: "1.0.0",
    ledgerId: "synthetic",
    asOf: "2026-07-19T00:00:00Z",
    sourcePolicy: "synthetic",
    notes: "synthetic fixture",
    results: [
      // Group A: a1 wins all, a2 second, a3 third, a4 last.
      group(1, "A", "a1", "a2", 2, 0),
      group(2, "A", "a3", "a4", 1, 0),
      group(3, "A", "a1", "a3", 1, 0),
      group(4, "A", "a2", "a4", 3, 0),
      group(5, "A", "a1", "a4", 4, 0),
      group(6, "A", "a2", "a3", 1, 0),
      // Group B: b1 wins all, b2 second, b3 third, b4 last.
      group(7, "B", "b1", "b2", 2, 0),
      group(8, "B", "b3", "b4", 1, 0),
      group(9, "B", "b1", "b3", 1, 0),
      group(10, "B", "b2", "b4", 3, 0),
      group(11, "B", "b1", "b4", 4, 0),
      group(12, "B", "b2", "b3", 1, 0),
      // Knockout: four qualifiers.
      ko(73, "roundOf32", "a1", "b2", 1, 0, "a1"),
      ko(74, "roundOf32", "b1", "a2", 0, 0, "b1", [4, 3]),
      ko(101, "semiFinal", "a1", "b1", 2, 1, "a1"),
      ko(103, "thirdPlace", "b2", "a2", 1, 0, "b2"),
      ko(104, "final", "a1", "b1", 1, 0, "a1"),
    ],
  };
}

const META = ["a1", "a2", "a3", "a4", "b1", "b2", "b3", "b4"].map((teamId, i) => ({
  teamId,
  fifaRanking: i + 1,
  conductScore: 0,
}));

describe("deriveActualOutcomes: group stage", () => {
  const out = deriveActualOutcomes(miniLedger(), META);

  it("derives both group tables with correct winners and runners-up", () => {
    expect(out.groups.map((g) => g.group)).toEqual(["A", "B"]);
    expect(out.groups[0]!.winner).toBe("a1");
    expect(out.groups[0]!.runnerUp).toBe("a2");
    expect(out.groups[1]!.winner).toBe("b1");
    expect(out.groups[1]!.runnerUp).toBe("b2");
  });

  it("collects group winners and top-two qualifiers", () => {
    expect(out.groupWinners).toEqual(["a1", "b1"]);
    expect(out.topTwoQualifiers.sort()).toEqual(["a1", "a2", "b1", "b2"]);
  });

  it("ranks third-placed teams and splits them by whether they advanced", () => {
    expect(out.thirdPlacedRanked.sort()).toEqual(["a3", "b3"]);
    // Neither third-placed team appears in the knockout rows, so neither qualified.
    expect(out.thirdPlaceQualifiers).toEqual([]);
    expect(out.thirdPlaceEliminated.sort()).toEqual(["a3", "b3"]);
  });

  it("derives qualifiers from actual knockout participation, not a provider flag", () => {
    expect(out.qualifiers).toEqual(["a1", "a2", "b1", "b2"]);
    expect(out.eliminatedInGroup).toEqual(["a3", "a4", "b3", "b4"]);
  });
});

describe("deriveActualOutcomes: knockout ladder", () => {
  const out = deriveActualOutcomes(miniLedger(), META);

  it("identifies the champion and runner-up from the final", () => {
    expect(out.champion).toBe("a1");
    expect(out.runnerUp).toBe("b1");
  });

  it("resolves a shootout winner from the recorded winner, not the level score", () => {
    expect(out.knockoutWinners.get(74)).toBe("b1");
  });

  it("treats the third-place match as a placement match, not a ladder rung", () => {
    expect(out.thirdPlaceMatchWinner).toBe("b2");
    // b2 lost in the round of 32; playing the third-place match must not promote it.
    expect(out.deepestStage.get("b2")).toBe("roundOf32");
  });

  it("assigns the deepest stage reached per team", () => {
    expect(out.deepestStage.get("a1")).toBe("champion");
    expect(out.deepestStage.get("b1")).toBe("final");
    expect(out.deepestStage.get("a2")).toBe("roundOf32");
    expect(out.deepestStage.get("a3")).toBe("groupStage");
  });

  it("exposes finalists and the stage-participation map", () => {
    expect(out.finalists.sort()).toEqual(["a1", "b1"]);
    expect(out.reachedByStage.get("roundOf32")!.sort()).toEqual(["a1", "a2", "b1", "b2"]);
  });

  it("throws when the ledger has no final", () => {
    const l = miniLedger();
    l.results = l.results.filter((r) => r.matchNumber !== 104);
    expect(() => deriveActualOutcomes(l, META)).toThrow(/no final/);
  });
});

describe("stage ladder", () => {
  it("orders stages from group stage to champion", () => {
    expect(stageDepth("groupStage")).toBe(0);
    expect(stageDepth("champion")).toBeGreaterThan(stageDepth("final"));
    expect(stageDepth("final")).toBeGreaterThan(stageDepth("semiFinal"));
  });

  it("exposes public-facing labels, never internal ids", () => {
    expect(STAGE_LABELS.roundOf16).toBe("Round of 16");
    expect(STAGE_LABELS.quarterFinal).toBe("Quarterfinal");
    expect(Object.values(STAGE_LABELS).join(" ")).not.toContain("roundOf");
  });
});
