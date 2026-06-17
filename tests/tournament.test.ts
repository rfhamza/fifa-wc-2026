import { describe, expect, it } from "vitest";
import {
  runTournamentSimulation,
  seedBracket,
} from "@/lib/simulation/tournament";
import { teams } from "@/lib/data";
import { sampleBracket } from "./fixtures/sample-bracket";

describe("tournament simulation", () => {
  // Small iteration count keeps the test fast but still meaningful.
  const snapshot = runTournamentSimulation({ iterations: 400, seed: 123 });

  it("returns the expected snapshot shape", () => {
    expect(snapshot.iterations).toBe(400);
    expect(snapshot.seed).toBe(123);
    expect(snapshot.stageProbabilities).toHaveLength(teams.length);
    expect(snapshot.expectedStandings).toHaveLength(teams.length);
    expect(typeof snapshot.generatedAt).toBe("string");
  });

  it("keeps every probability in [0,1]", () => {
    for (const p of snapshot.stageProbabilities) {
      for (const key of [
        "qualifyTop2",
        "roundOf32",
        "roundOf16",
        "quarterFinal",
        "semiFinal",
        "final",
        "winner",
      ] as const) {
        expect(p[key]).toBeGreaterThanOrEqual(0);
        expect(p[key]).toBeLessThanOrEqual(1);
      }
    }
  });

  it("respects the stage funnel: later stages are never more likely", () => {
    for (const p of snapshot.stageProbabilities) {
      expect(p.roundOf32).toBeGreaterThanOrEqual(p.roundOf16 - 1e-9);
      expect(p.roundOf16).toBeGreaterThanOrEqual(p.quarterFinal - 1e-9);
      expect(p.quarterFinal).toBeGreaterThanOrEqual(p.semiFinal - 1e-9);
      expect(p.semiFinal).toBeGreaterThanOrEqual(p.final - 1e-9);
      expect(p.final).toBeGreaterThanOrEqual(p.winner - 1e-9);
    }
  });

  it("has winner probabilities that sum to ~1 (one champion per run)", () => {
    const total = snapshot.stageProbabilities.reduce(
      (s, p) => s + p.winner,
      0,
    );
    expect(total).toBeGreaterThan(0.98);
    expect(total).toBeLessThan(1.02);
  });

  it("sends exactly 32 teams to the Round of 32 each run on average", () => {
    const total = snapshot.stageProbabilities.reduce(
      (s, p) => s + p.roundOf32,
      0,
    );
    expect(total).toBeCloseTo(32, 0);
  });

  it("per team: qualifyTop2 + qualifyThird equals roundOf32", () => {
    for (const p of snapshot.stageProbabilities) {
      expect(p.qualifyTop2 + p.qualifyThird).toBeCloseTo(p.roundOf32, 6);
    }
  });

  it("total qualifyTop2 across all teams averages 24 (12 groups x 2)", () => {
    const total = snapshot.stageProbabilities.reduce(
      (s, p) => s + p.qualifyTop2,
      0,
    );
    expect(total).toBeCloseTo(24, 1);
  });

  it("total qualifyThird across all teams averages 8 (best thirds)", () => {
    const total = snapshot.stageProbabilities.reduce(
      (s, p) => s + p.qualifyThird,
      0,
    );
    expect(total).toBeCloseTo(8, 1);
  });

  it("is deterministic for a fixed seed", () => {
    const again = runTournamentSimulation({ iterations: 400, seed: 123 });
    expect(again.stageProbabilities).toEqual(snapshot.stageProbabilities);
  });

  it("seedBracket produces a valid bracket permutation", () => {
    const bracket = seedBracket(32);
    expect(bracket).toHaveLength(32);
    expect(new Set(bracket).size).toBe(32);
    // Each first-round pair of seeds sums to n+1 (1v32, 2v31, ...).
    for (let i = 0; i < bracket.length; i += 2) {
      expect(bracket[i]! + bracket[i + 1]!).toBe(33);
    }
  });
});

describe("tournament simulation under the official (fixture) bracket", () => {
  // Inject a fully-valid, verified synthetic bracket so the official path runs.
  const snapshot = runTournamentSimulation({
    iterations: 400,
    seed: 123,
    bracket: sampleBracket,
  });

  const sum = (key: "roundOf32" | "roundOf16" | "quarterFinal" | "semiFinal" | "final" | "winner") =>
    snapshot.stageProbabilities.reduce((s, p) => s + p[key], 0);

  it("holds the stage invariants (32, 16, 8, 4, 2, 1)", () => {
    expect(sum("roundOf32")).toBeCloseTo(32, 1);
    expect(sum("roundOf16")).toBeCloseTo(16, 1);
    expect(sum("quarterFinal")).toBeCloseTo(8, 1);
    expect(sum("semiFinal")).toBeCloseTo(4, 1);
    expect(sum("final")).toBeCloseTo(2, 1);
    expect(sum("winner")).toBeCloseTo(1, 1);
  });

  it("keeps qualifyTop2 + qualifyThird == roundOf32 per team", () => {
    for (const p of snapshot.stageProbabilities) {
      expect(p.qualifyTop2 + p.qualifyThird).toBeCloseTo(p.roundOf32, 6);
    }
  });

  it("respects the stage funnel monotonicity", () => {
    for (const p of snapshot.stageProbabilities) {
      expect(p.roundOf32).toBeGreaterThanOrEqual(p.roundOf16 - 1e-9);
      expect(p.roundOf16).toBeGreaterThanOrEqual(p.quarterFinal - 1e-9);
      expect(p.quarterFinal).toBeGreaterThanOrEqual(p.semiFinal - 1e-9);
      expect(p.semiFinal).toBeGreaterThanOrEqual(p.final - 1e-9);
      expect(p.final).toBeGreaterThanOrEqual(p.winner - 1e-9);
    }
  });

  it("is deterministic for a fixed seed under the official bracket", () => {
    const again = runTournamentSimulation({ iterations: 400, seed: 123, bracket: sampleBracket });
    expect(again.stageProbabilities).toEqual(snapshot.stageProbabilities);
  });

  it("differs from the placeholder path (official routing changes outcomes)", () => {
    const placeholder = runTournamentSimulation({ iterations: 400, seed: 123 });
    expect(snapshot.stageProbabilities).not.toEqual(placeholder.stageProbabilities);
  });
});
