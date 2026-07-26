/**
 * Post-tournament retrospective (PR B) - scoreline accuracy helpers.
 * Synthetic fixtures only; no artifacts, no model, no I/O.
 */
import { describe, expect, it } from "vitest";
import { directionOf, evaluateScorelines, goalsBucket } from "@/lib/retrospective/scoreline-accuracy";
import type { MatchForecastLike } from "@/lib/retrospective/match-accuracy";
import type { ForecastResultsLedger, ResultLedgerRow } from "@/lib/model/forecast-results-ledger";

const koRow = (
  matchNumber: number,
  home: string,
  away: string,
  hg: number,
  ag: number,
  winner: string,
  pens?: [number, number],
): ResultLedgerRow =>
  ({
    matchNumber,
    stage: "roundOf32",
    homeTeamId: home,
    awayTeamId: away,
    homeGoals: hg,
    awayGoals: ag,
    status: "complete",
    winnerTeamId: winner,
    ...(pens ? { penaltiesHome: pens[0], penaltiesAway: pens[1] } : {}),
  }) as ResultLedgerRow;

const ledgerOf = (results: ResultLedgerRow[]): ForecastResultsLedger => ({
  schemaVersion: "1.0.0",
  ledgerId: "synthetic",
  asOf: "2026-07-19T00:00:00Z",
  sourcePolicy: "synthetic",
  notes: "synthetic fixture",
  results,
});

const fc = (matchNumber: number, home: string, away: string, hg: number, ag: number): MatchForecastLike => ({
  matchNumber,
  stage: "roundOf32",
  homeTeamId: home,
  awayTeamId: away,
  homeWin: 0.5,
  draw: 0.25,
  awayWin: 0.25,
  topScorelines: [{ homeGoals: hg, awayGoals: ag, probability: 0.15 }],
});

describe("goalsBucket", () => {
  it("splits totals into 0-1 / 2-3 / 4+", () => {
    expect(goalsBucket(0)).toBe("0-1");
    expect(goalsBucket(1)).toBe("0-1");
    expect(goalsBucket(2)).toBe("2-3");
    expect(goalsBucket(3)).toBe("2-3");
    expect(goalsBucket(4)).toBe("4+");
    expect(goalsBucket(9)).toBe("4+");
  });
});

describe("directionOf", () => {
  it("maps a score to home / draw / away", () => {
    expect(directionOf(2, 1)).toBe("home");
    expect(directionOf(1, 1)).toBe("draw");
    expect(directionOf(1, 2)).toBe("away");
  });
});

describe("evaluateScorelines", () => {
  it("scores an exact hit on every dimension", () => {
    const r = evaluateScorelines(
      ledgerOf([koRow(73, "x", "y", 2, 1, "x")]),
      [fc(73, "x", "y", 2, 1)],
      "archived-pre-match-forecast",
    );
    expect(r.exactHits).toBe(1);
    expect(r.goalDifferenceHits).toBe(1);
    expect(r.goalsBucketHits).toBe(1);
    expect(r.directionHits).toBe(1);
    expect(r.meanAbsoluteGoalError).toBe(0);
  });

  it("separates goal difference from an exact hit", () => {
    // Predicted 2-1, actual 3-2: same difference, wrong scoreline, right direction.
    const r = evaluateScorelines(
      ledgerOf([koRow(73, "x", "y", 3, 2, "x")]),
      [fc(73, "x", "y", 2, 1)],
      "archived-pre-match-forecast",
    );
    expect(r.exactHits).toBe(0);
    expect(r.goalDifferenceHits).toBe(1);
    expect(r.directionHits).toBe(1);
    expect(r.meanAbsoluteGoalError).toBe(2);
    expect(r.meanTotalGoalsError).toBe(2);
  });

  it("re-orients a forecast stored with the opposite home/away", () => {
    const flipped: MatchForecastLike[] = [fc(73, "y", "x", 1, 2)];
    const r = evaluateScorelines(ledgerOf([koRow(73, "x", "y", 2, 1, "x")]), flipped, "archived-pre-match-forecast");
    expect(r.rows[0]!.predictedHomeGoals).toBe(2);
    expect(r.rows[0]!.predictedAwayGoals).toBe(1);
    expect(r.exactHits).toBe(1);
  });

  it("reports coverage rather than silently scoring only what it has", () => {
    const r = evaluateScorelines(
      ledgerOf([koRow(73, "x", "y", 1, 0, "x"), koRow(74, "p", "q", 2, 0, "p")]),
      [fc(73, "x", "y", 1, 0)],
      "archived-pre-match-forecast",
    );
    expect(r.coverage.withForecast).toBe(1);
    expect(r.coverage.withoutForecast).toBe(1);
    expect(r.coverage.total).toBe(2);
    expect(r.coverage.missingMatchNumbers).toEqual([74]);
    // Rates are over what was actually scored, and coverage says how much that was.
    expect(r.exactHitRate).toBe(1);
  });

  it("treats a forecast without a scoreline distribution as missing", () => {
    const noScorelines: MatchForecastLike[] = [
      { matchNumber: 73, stage: "roundOf32", homeTeamId: "x", awayTeamId: "y", homeWin: 0.5, draw: 0.25, awayWin: 0.25 },
    ];
    const r = evaluateScorelines(ledgerOf([koRow(73, "x", "y", 1, 0, "x")]), noScorelines, "archived-pre-match-forecast");
    expect(r.coverage.withForecast).toBe(0);
    expect(r.coverage.missingMatchNumbers).toEqual([73]);
  });

  it("scores a shootout tie against its regulation score and flags it", () => {
    // 0-0 after extra time, settled 4-3 on penalties: the scoreline target is 0-0.
    const r = evaluateScorelines(
      ledgerOf([koRow(96, "x", "y", 0, 0, "x", [4, 3])]),
      [fc(96, "x", "y", 0, 0)],
      "archived-pre-match-forecast",
    );
    expect(r.rows[0]!.decidedOnPenalties).toBe(true);
    expect(r.exactHits).toBe(1);
    expect(r.rows[0]!.actualHomeGoals).toBe(0);
  });

  it("scopes to knockout or group rows on request", () => {
    const ledger = ledgerOf([
      koRow(73, "x", "y", 1, 0, "x"),
      { matchNumber: 1, stage: "group", group: "A", homeTeamId: "p", awayTeamId: "q", homeGoals: 1, awayGoals: 1, status: "complete" } as ResultLedgerRow,
    ]);
    const knockoutOnly = evaluateScorelines(ledger, [fc(73, "x", "y", 1, 0)], "archived-pre-match-forecast", "knockout");
    expect(knockoutOnly.coverage.total).toBe(1);
    const groupOnly = evaluateScorelines(ledger, [], "archived-pre-match-forecast", "group");
    expect(groupOnly.coverage.total).toBe(1);
    expect(groupOnly.coverage.withForecast).toBe(0);
  });

  it("ranks best predictions ahead of largest misses", () => {
    const ledger = ledgerOf([koRow(73, "x", "y", 1, 0, "x"), koRow(74, "p", "q", 5, 0, "p")]);
    const forecasts = [fc(73, "x", "y", 1, 0), fc(74, "p", "q", 0, 2)];
    const r = evaluateScorelines(ledger, forecasts, "archived-pre-match-forecast");
    expect(r.bestPredictions[0]!.matchNumber).toBe(73);
    expect(r.largestMisses[0]!.matchNumber).toBe(74);
  });
});
