import { describe, expect, it } from "vitest";
import { runWalkForward } from "@/lib/backtesting/walk-forward";
import { evaluateVariant, type StageMode } from "@/lib/backtesting/match-evaluator";
import { ELO_FIFA_HOST_REGIONAL } from "@/lib/backtesting/model-variants";
import { primaryDiagnosticPacks } from "@/lib/backtesting/historical-cohorts";
import { WC2018_PACK } from "@/data/historical/snapshots/wc-2018";
import type { HistoricalMatchResult, HistoricalSourcePack, Outcome90 } from "@/lib/backtesting/types";

// ---------------------------------------------------------------------------
// Synthetic mini-packs: reuse a real pack's identity/elo/fifa (so historical
// features build), overriding ONLY the results with a controlled fixture over
// four real teams. Structural leakage/chronology assertions need no real numbers.
// ---------------------------------------------------------------------------
const TEAMS = WC2018_PACK.identity.teamIds.slice(0, 4);
const [T0, T1, T2, T3] = TEAMS as [string, string, string, string];

function mkMatch(
  matchId: string,
  date: string,
  teamA: string,
  teamB: string,
  goalsA: number,
  goalsB: number,
  stage: HistoricalMatchResult["stage"] = "group",
): HistoricalMatchResult {
  const resultAt90: Outcome90 = goalsA > goalsB ? "A" : goalsA < goalsB ? "B" : "D";
  return {
    matchId,
    date,
    stage,
    group: stage === "group" ? "X" : undefined,
    teamA,
    teamB,
    goalsA,
    goalsB,
    resultAt90,
    sourceRef: "synthetic",
  };
}

function synthPack(results: HistoricalMatchResult[]): HistoricalSourcePack {
  return { ...WC2018_PACK, results };
}

// A three-matchday round-robin over 4 teams; two matches per matchday (same day).
const D1 = "2018-06-14";
const D2 = "2018-06-19";
const D3 = "2018-06-24";
const ROUND_ROBIN: HistoricalMatchResult[] = [
  mkMatch("S-001", D1, T0, T1, 3, 0),
  mkMatch("S-002", D1, T2, T3, 2, 0),
  mkMatch("S-003", D2, T0, T2, 1, 0),
  mkMatch("S-004", D2, T1, T3, 1, 1),
  mkMatch("S-005", D3, T0, T3, 2, 1),
  mkMatch("S-006", D3, T1, T2, 0, 0),
];

describe("walk-forward: day-strict leakage + chronology", () => {
  const result = runWalkForward(synthPack(ROUND_ROBIN));
  const byId = new Map(result.rows.map((r) => [r.matchId, r]));

  it("matchday-1 matches have empty history (S = 0) and identical triples across all weights", () => {
    for (const id of ["S-001", "S-002"]) {
      const r = byId.get(id)!;
      expect(r.matchday).toBe(1);
      expect(r.nA).toBe(0);
      expect(r.nB).toBe(0);
      expect(r.signalA).toBe(0);
      expect(r.signalB).toBe(0);
      // S=0 -> contribution 0 at every weight -> every triple equals the baseline.
      for (const w of r.byWeight) {
        expect(w.triple.pA).toBeCloseTo(r.baseline.pA, 12);
        expect(w.triple.pD).toBeCloseTo(r.baseline.pD, 12);
        expect(w.triple.pB).toBeCloseTo(r.baseline.pB, 12);
      }
    }
  });

  it("same-day matches do not leak: every matchday-2 match sees exactly one prior own match", () => {
    for (const id of ["S-003", "S-004"]) {
      const r = byId.get(id)!;
      expect(r.matchday).toBe(2);
      expect(r.nA).toBe(1); // only the MD1 result, never the same-day MD2 partner
      expect(r.nB).toBe(1);
    }
  });

  it("state is applied only after scoring the whole day; matchday-3 sees two prior matches", () => {
    for (const id of ["S-005", "S-006"]) {
      const r = byId.get(id)!;
      expect(r.matchday).toBe(3);
      expect(r.nA).toBe(2);
      expect(r.nB).toBe(2);
    }
  });

  it("both teams' histories advance together (group matchdays synchronised, A/B agree)", () => {
    for (const r of result.rows) {
      if (r.stage === "group") expect(r.nA).toBe(r.nB);
    }
  });

  it("is chronological regardless of source array order", () => {
    const shuffled = [ROUND_ROBIN[4]!, ROUND_ROBIN[0]!, ROUND_ROBIN[3]!, ROUND_ROBIN[1]!, ROUND_ROBIN[5]!, ROUND_ROBIN[2]!];
    const r = runWalkForward(synthPack(shuffled));
    const m = new Map(r.rows.map((x) => [x.matchId, x]));
    expect(m.get("S-001")!.nA).toBe(0); // still MD1
    expect(m.get("S-003")!.nA).toBe(1); // still MD2
    expect(m.get("S-005")!.nA).toBe(2); // still MD3
  });

  it("a future result present in the pack is unreachable from an earlier prediction", () => {
    // Adding MD3 matches must not change any MD1/MD2 prediction.
    const withoutFuture = runWalkForward(synthPack(ROUND_ROBIN.slice(0, 4)));
    const withFuture = runWalkForward(synthPack(ROUND_ROBIN));
    const a = new Map(withoutFuture.rows.map((r) => [r.matchId, r]));
    const b = new Map(withFuture.rows.map((r) => [r.matchId, r]));
    for (const id of ["S-001", "S-002", "S-003", "S-004"]) {
      const ra = a.get(id)!;
      const rb = b.get(id)!;
      expect(rb.signalA).toBeCloseTo(ra.signalA, 12);
      expect(rb.signalB).toBeCloseTo(ra.signalB, 12);
      for (let i = 0; i < ra.byWeight.length; i++) {
        expect(rb.byWeight[i]!.triple.pA).toBeCloseTo(ra.byWeight[i]!.triple.pA, 12);
      }
    }
  });

  it("throws if a scored match has no 90-minute result", () => {
    const broken = [{ ...ROUND_ROBIN[0]!, resultAt90: undefined }];
    expect(() => runWalkForward(synthPack(broken))).toThrow(/resultAt90/);
  });
});

// ---------------------------------------------------------------------------
// WEIGHT-0 PARITY ANCHOR (the Stage-1B acceptance proof).
// At weight 0 the walk-forward per-match triples must equal the existing
// evaluator's, for all four primary packs and both modes. Filter walk-forward
// rows to the evaluator's match set first, then join by matchId.
// ---------------------------------------------------------------------------
describe("walk-forward: weight-0 parity vs the existing evaluator", () => {
  const modes: StageMode[] = ["group", "all"];
  for (const pack of primaryDiagnosticPacks) {
    for (const mode of modes) {
      it(`reproduces evaluateVariant(${pack.identity.tournamentYear}, "${mode}") per-match at weight 0`, () => {
        const ev = evaluateVariant(pack, ELO_FIFA_HOST_REGIONAL, mode);
        const wf = runWalkForward(pack);
        const rows = mode === "group" ? wf.rows.filter((r) => r.stage === "group") : wf.rows;
        const zeroById = new Map(
          rows.map((r) => [r.matchId, r.byWeight.find((w) => w.weight === 0)!.triple]),
        );
        // One-to-one coverage: no unmatched ids either way.
        expect(rows.length).toBe(ev.perMatch.length);
        for (const pm of ev.perMatch) {
          const t = zeroById.get(pm.matchId);
          expect(t, `missing walk-forward row for ${pm.matchId}`).toBeDefined();
          expect(t!.pA).toBeCloseTo(pm.pA, 12);
          expect(t!.pD).toBeCloseTo(pm.pD, 12);
          expect(t!.pB).toBeCloseTo(pm.pB, 12);
        }
      });
    }
  }
});
