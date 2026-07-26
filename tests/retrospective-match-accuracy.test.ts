/**
 * Post-tournament retrospective (PR B) - match-level accuracy helpers.
 * Synthetic fixtures only; no artifacts, no model, no I/O.
 */
import { describe, expect, it } from "vitest";
import {
  evaluateGroupMatches,
  evaluateKnockoutAdvancement,
  normalizeTriple,
  outcomeOf,
  type MatchForecastLike,
} from "@/lib/retrospective/match-accuracy";
import type { ForecastResultsLedger, ResultLedgerRow } from "@/lib/model/forecast-results-ledger";

const groupRow = (matchNumber: number, home: string, away: string, hg: number, ag: number): ResultLedgerRow =>
  ({ matchNumber, stage: "group", group: "A", homeTeamId: home, awayTeamId: away, homeGoals: hg, awayGoals: ag, status: "complete" }) as ResultLedgerRow;

const koRow = (
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

const ledgerOf = (results: ResultLedgerRow[]): ForecastResultsLedger => ({
  schemaVersion: "1.0.0",
  ledgerId: "synthetic",
  asOf: "2026-07-19T00:00:00Z",
  sourcePolicy: "synthetic",
  notes: "synthetic fixture",
  results,
});

describe("outcomeOf", () => {
  it("maps a score to a home-perspective W/D/L class", () => {
    expect(outcomeOf(2, 0)).toBe("A");
    expect(outcomeOf(1, 1)).toBe("D");
    expect(outcomeOf(0, 2)).toBe("B");
  });
});

describe("normalizeTriple", () => {
  it("renormalises a 4dp-rounded triple to an exact unit sum", () => {
    const p = normalizeTriple({ pA: 0.8014, pD: 0.1501, pB: 0.0486 });
    expect(p.pA + p.pD + p.pB).toBeCloseTo(1, 12);
    // Proportions are preserved.
    expect(p.pA / p.pB).toBeCloseTo(0.8014 / 0.0486, 9);
  });

  it("refuses to renormalise a genuinely malformed triple rather than masking it", () => {
    expect(() => normalizeTriple({ pA: 0.5, pD: 0.5, pB: 0.5 })).toThrow(/malformed/);
    expect(() => normalizeTriple({ pA: Number.NaN, pD: 0, pB: 0 })).toThrow(/malformed/);
  });
});

describe("evaluateGroupMatches", () => {
  const ledger = ledgerOf([groupRow(1, "x", "y", 2, 0), groupRow(2, "x", "z", 0, 1)]);
  const forecasts: MatchForecastLike[] = [
    { matchNumber: 1, stage: "group", homeTeamId: "x", awayTeamId: "y", homeWin: 0.7, draw: 0.2, awayWin: 0.1 },
    { matchNumber: 2, stage: "group", homeTeamId: "x", awayTeamId: "z", homeWin: 0.6, draw: 0.25, awayWin: 0.15 },
  ];

  it("scores 90-minute W/D/L and records the provenance it was given", () => {
    const r = evaluateGroupMatches(ledger, forecasts, "retrospective-model-forecast");
    expect(r.provenance).toBe("retrospective-model-forecast");
    expect(r.metrics.n).toBe(2);
    expect(r.metrics.accuracy).toBeCloseTo(0.5, 12); // M1 called right, M2 wrong
  });

  it("reports missing coverage instead of silently scoring a subset", () => {
    const r = evaluateGroupMatches(ledger, [forecasts[0]!], "retrospective-model-forecast");
    expect(r.coverage).toEqual({ evaluated: 1, total: 2, missing: [2] });
  });

  it("re-orients a forecast stored with the opposite home/away", () => {
    const flipped: MatchForecastLike[] = [
      { matchNumber: 1, stage: "group", homeTeamId: "y", awayTeamId: "x", homeWin: 0.1, draw: 0.2, awayWin: 0.7 },
    ];
    const r = evaluateGroupMatches(ledgerOf([groupRow(1, "x", "y", 2, 0)]), flipped, "retrospective-model-forecast");
    // x won 2-0; after re-orientation the 0.7 must sit on the ledger's home team.
    expect(r.rows[0]!.correct).toBe(true);
    expect(r.rows[0]!.confidence).toBeCloseTo(0.7, 9);
  });

  it("separates average confidence on correct calls from misses", () => {
    const r = evaluateGroupMatches(ledger, forecasts, "retrospective-model-forecast");
    expect(r.averageConfidenceCorrect).toBeCloseTo(0.7, 9);
    expect(r.averageConfidenceMiss).toBeCloseTo(0.6, 9);
  });
});

describe("evaluateKnockoutAdvancement", () => {
  const ledger = ledgerOf([
    koRow(73, "roundOf32", "x", "y", 1, 0, "x"),
    koRow(74, "roundOf32", "p", "q", 0, 0, "q", [3, 4]),
    koRow(89, "roundOf16", "x", "q", 2, 1, "x"),
  ]);
  const forecasts: MatchForecastLike[] = [
    { matchNumber: 73, stage: "roundOf32", homeTeamId: "x", awayTeamId: "y", homeWin: 0.6, draw: 0.2, awayWin: 0.2, homeAdvance: 0.75, awayAdvance: 0.25 },
    { matchNumber: 74, stage: "roundOf32", homeTeamId: "p", awayTeamId: "q", homeWin: 0.5, draw: 0.25, awayWin: 0.25, homeAdvance: 0.65, awayAdvance: 0.35 },
    { matchNumber: 89, stage: "roundOf16", homeTeamId: "x", awayTeamId: "q", homeWin: 0.5, draw: 0.25, awayWin: 0.25, homeAdvance: 0.6, awayAdvance: 0.4 },
  ];

  it("scores advancement, not the 90-minute result", () => {
    const r = evaluateKnockoutAdvancement(ledger, forecasts, "archived-pre-match-forecast");
    expect(r.coverage.evaluated).toBe(3);
    expect(r.correct).toBe(2); // M74's favourite lost on penalties
    expect(r.accuracy).toBeCloseTo(2 / 3, 12);
    expect(r.upsetCount).toBe(1);
    expect(r.upsets[0]!.matchNumber).toBe(74);
  });

  it("credits a shootout winner as having advanced", () => {
    const r = evaluateKnockoutAdvancement(ledger, forecasts, "archived-pre-match-forecast");
    const m74 = r.rows.find((x) => x.matchNumber === 74)!;
    expect(m74.decidedOnPenalties).toBe(true);
    expect(m74.actualWinner).toBe("q");
    expect(m74.favouriteWon).toBe(false);
  });

  it("treats a forecast without advancement probabilities as missing coverage", () => {
    const partial: MatchForecastLike[] = [
      { matchNumber: 73, stage: "roundOf32", homeTeamId: "x", awayTeamId: "y", homeWin: 0.6, draw: 0.2, awayWin: 0.2 },
    ];
    const r = evaluateKnockoutAdvancement(ledger, partial, "archived-pre-match-forecast");
    expect(r.coverage.evaluated).toBe(0);
    expect(r.coverage.missing).toEqual([73, 74, 89]);
  });

  it("re-orients advancement probabilities onto the ledger's team order", () => {
    const flipped: MatchForecastLike[] = [
      { matchNumber: 73, stage: "roundOf32", homeTeamId: "y", awayTeamId: "x", homeWin: 0.2, draw: 0.2, awayWin: 0.6, homeAdvance: 0.25, awayAdvance: 0.75 },
    ];
    const r = evaluateKnockoutAdvancement(ledgerOf([koRow(73, "roundOf32", "x", "y", 1, 0, "x")]), flipped, "archived-pre-match-forecast");
    expect(r.rows[0]!.favourite).toBe("x");
    expect(r.rows[0]!.favouriteProbability).toBeCloseTo(0.75, 9);
    expect(r.correct).toBe(1);
  });

  it("breaks accuracy down by round", () => {
    const r = evaluateKnockoutAdvancement(ledger, forecasts, "archived-pre-match-forecast");
    const r32 = r.byStage.find((s) => s.stage === "roundOf32")!;
    expect(r32).toEqual({ stage: "roundOf32", evaluated: 2, correct: 1, accuracy: 0.5 });
  });
});
