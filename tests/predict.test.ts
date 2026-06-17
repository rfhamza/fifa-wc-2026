import { describe, expect, it } from "vitest";
import { predictMatch } from "@/lib/model/predict";
import { getTeam } from "@/lib/data";

describe("match prediction", () => {
  const argentina = getTeam("argentina");
  const newZealand = getTeam("new-zealand");
  const prediction = predictMatch(argentina, newZealand);

  it("returns the expected output shape", () => {
    expect(prediction).toMatchObject({
      homeTeamId: "argentina",
      awayTeamId: "new-zealand",
    });
    expect(typeof prediction.homeWin).toBe("number");
    expect(typeof prediction.expectedHomeGoals).toBe("number");
    expect(prediction.topScorelines.length).toBeGreaterThan(0);
    expect(prediction.explanation.positiveDrivers.length).toBeGreaterThan(0);
  });

  it("produces win/draw/loss probabilities that sum to ~1", () => {
    const total = prediction.homeWin + prediction.draw + prediction.awayWin;
    expect(total).toBeGreaterThan(0.98);
    expect(total).toBeLessThan(1.02);
  });

  it("favours the much stronger team", () => {
    expect(prediction.homeWin).toBeGreaterThan(prediction.awayWin);
    expect(prediction.expectedHomeGoals).toBeGreaterThan(
      prediction.expectedAwayGoals,
    );
  });

  it("is symmetric: swapping sides mirrors the probabilities", () => {
    const reversed = predictMatch(newZealand, argentina);
    expect(reversed.awayWin).toBeCloseTo(prediction.homeWin, 5);
    expect(reversed.homeWin).toBeCloseTo(prediction.awayWin, 5);
  });

  it("every scoreline probability is within [0,1]", () => {
    for (const s of prediction.topScorelines) {
      expect(s.probability).toBeGreaterThanOrEqual(0);
      expect(s.probability).toBeLessThanOrEqual(1);
    }
  });
});
