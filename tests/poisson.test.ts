import { describe, expect, it } from "vitest";
import {
  outcomeProbabilities,
  poissonPmf,
  scorelineMatrix,
} from "@/lib/simulation/poisson";

describe("poisson scoreline engine", () => {
  it("pmf over k sums to ~1 for a typical lambda", () => {
    let total = 0;
    for (let k = 0; k <= 20; k++) total += poissonPmf(1.6, k);
    expect(total).toBeCloseTo(1, 5);
  });

  it("scoreline matrix sums to ~1", () => {
    const matrix = scorelineMatrix(1.7, 1.1, 8);
    const total = matrix.reduce((s, c) => s + c.probability, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("outcome probabilities sum to ~1", () => {
    const matrix = scorelineMatrix(1.4, 1.4, 8);
    const o = outcomeProbabilities(matrix);
    expect(o.homeWin + o.draw + o.awayWin).toBeCloseTo(1, 6);
  });

  it("equal lambdas give symmetric win probabilities", () => {
    const o = outcomeProbabilities(scorelineMatrix(1.4, 1.4, 8));
    expect(o.homeWin).toBeCloseTo(o.awayWin, 6);
  });
});
