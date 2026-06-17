import { describe, expect, it } from "vitest";
import { computeProbabilityDeltas } from "@/lib/model/snapshot-delta";
import type { SimulationSnapshot, TournamentStageProbability } from "@/lib/types";

function stageProb(
  teamId: string,
  winner: number,
): TournamentStageProbability {
  return {
    teamId,
    qualifyTop2: 0,
    qualifyThird: 0,
    roundOf32: 0,
    roundOf16: 0,
    quarterFinal: 0,
    semiFinal: 0,
    final: 0,
    winner,
  };
}

function snapshot(probs: TournamentStageProbability[]): SimulationSnapshot {
  return {
    iterations: 100,
    seed: 1,
    stageProbabilities: probs,
    expectedStandings: [],
    generatedAt: new Date(0).toISOString(),
  };
}

describe("computeProbabilityDeltas", () => {
  const prev = snapshot([stageProb("a", 0.2), stageProb("b", 0.3), stageProb("c", 0.1)]);
  const curr = snapshot([stageProb("a", 0.35), stageProb("b", 0.25), stageProb("c", 0.1)]);

  it("computes delta = current - previous per team", () => {
    const deltas = computeProbabilityDeltas(prev, curr, "winner");
    const a = deltas.find((d) => d.teamId === "a")!;
    expect(a.previous).toBeCloseTo(0.2, 6);
    expect(a.current).toBeCloseTo(0.35, 6);
    expect(a.delta).toBeCloseTo(0.15, 6);
  });

  it("sorts by descending delta and respects the limit", () => {
    const deltas = computeProbabilityDeltas(prev, curr, "winner", 2);
    expect(deltas).toHaveLength(2);
    expect(deltas[0]!.teamId).toBe("a"); // +0.15, biggest riser
    expect(deltas[0]!.delta).toBeGreaterThan(deltas[1]!.delta);
  });

  it("treats teams missing from the previous snapshot as previous = 0", () => {
    const prevMissing = snapshot([stageProb("a", 0.2)]);
    const deltas = computeProbabilityDeltas(prevMissing, curr, "winner");
    const b = deltas.find((d) => d.teamId === "b")!;
    expect(b.previous).toBe(0);
    expect(b.delta).toBeCloseTo(0.25, 6);
  });
});
