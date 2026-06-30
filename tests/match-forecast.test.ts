/**
 * PR-83A — match-level forecast core tests. Committed data only; no network,
 * no Blob, no provider fetch, no Monte Carlo rerun (uses the existing single-match
 * predict path only).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTeam } from "@/lib/data";
import { MODEL_WEIGHTS } from "@/lib/model/config";
import { predictMatch } from "@/lib/model/predict";
import { findForbiddenSubstrings } from "@/lib/model/forecast-snapshots";
import {
  buildMatchForecast,
  computeAdvancementProbabilities,
  isKnockoutStage,
  stageForMatchNumber,
  type MatchForecastArchiveEntry,
} from "@/lib/model/match-forecast";

const home = getTeam("spain");
const away = getTeam("argentina");

describe("buildMatchForecast — group stage", () => {
  const f = buildMatchForecast({ matchNumber: 1, stage: "group", home, away });

  it("returns 90-minute W/D/L only (no advancement)", () => {
    expect(f.stage).toBe("group");
    expect(f.mode).toBe("regulation");
    expect(f.advancement).toBeUndefined();
    expect(f.homeWin + f.draw + f.awayWin).toBeCloseTo(1, 2);
    expect(f.topScorelines.length).toBeGreaterThan(0);
    expect(typeof f.expectedHomeGoals).toBe("number");
    expect(typeof f.expectedAwayGoals).toBe("number");
  });

  it("is a faithful pass-through of the existing model (no formula change)", () => {
    const p = predictMatch(home, away);
    expect(f.homeWin).toBe(p.homeWin);
    expect(f.draw).toBe(p.draw);
    expect(f.awayWin).toBe(p.awayWin);
    expect(f.expectedHomeGoals).toBe(p.expectedHomeGoals);
    expect(f.expectedAwayGoals).toBe(p.expectedAwayGoals);
    expect(f.topScorelines).toEqual(p.topScorelines);
  });
});

describe("buildMatchForecast — knockout stage", () => {
  const f = buildMatchForecast({ matchNumber: 73, stage: "roundOf32", home, away });

  it("returns W/D/L plus advancement probabilities", () => {
    expect(f.stage).toBe("roundOf32");
    expect(f.mode).toBe("regulation+advancement");
    expect(f.advancement).toBeDefined();
    expect(f.advancement!.advancementBasis).toBe("derived-from-90min-and-shootout-model");
  });

  it("advancement probabilities sum to ~1 and split the draw by xG ratio", () => {
    const a = f.advancement!;
    // advancement sum equals the regulation sum (which rounds to ~1 at 4dp)
    expect(a.homeAdvance + a.awayAdvance).toBeCloseTo(f.homeWin + f.draw + f.awayWin, 4);
    expect(a.homeAdvance + a.awayAdvance).toBeCloseTo(1, 2);
    const denom = f.expectedHomeGoals + f.expectedAwayGoals;
    const expectedHomeAdvance = f.homeWin + f.draw * (f.expectedHomeGoals / denom);
    expect(a.homeAdvance).toBeCloseTo(expectedHomeAdvance, 3);
  });

  it("90-minute fields are unchanged vs the group projection of the same pair", () => {
    const p = predictMatch(home, away);
    expect(f.homeWin).toBe(p.homeWin);
    expect(f.draw).toBe(p.draw);
    expect(f.awayWin).toBe(p.awayWin);
  });
});

describe("computeAdvancementProbabilities", () => {
  it("splits the draw mass by expected-goals share", () => {
    const a = computeAdvancementProbabilities({
      homeWin: 0.5,
      draw: 0.2,
      awayWin: 0.3,
      expectedHomeGoals: 1.5,
      expectedAwayGoals: 0.5,
    });
    // homeShare = 1.5/2 = 0.75 -> homeAdvance = 0.5 + 0.2*0.75 = 0.65
    expect(a.homeAdvance).toBeCloseTo(0.65, 4);
    expect(a.awayAdvance).toBeCloseTo(0.35, 4);
    expect(a.homeAdvance + a.awayAdvance).toBeCloseTo(1, 4);
    expect(a.advancementBasis).toBe("derived-from-90min-and-shootout-model");
  });

  it("falls back to a 50/50 draw split when both expected goals are zero", () => {
    const a = computeAdvancementProbabilities({
      homeWin: 0.4,
      draw: 0.2,
      awayWin: 0.4,
      expectedHomeGoals: 0,
      expectedAwayGoals: 0,
    });
    expect(a.homeAdvance).toBeCloseTo(0.5, 4);
    expect(a.awayAdvance).toBeCloseTo(0.5, 4);
    expect(a.advancementBasis).toBe("fallback-5050-draw-component");
    expect(a.note.length).toBeGreaterThan(0);
  });
});

describe("stage helpers", () => {
  it("stageForMatchNumber maps group vs knockout", () => {
    expect(stageForMatchNumber(1)).toBe("group");
    expect(stageForMatchNumber(72)).toBe("group");
    expect(stageForMatchNumber(73)).toBe("roundOf32");
    expect(stageForMatchNumber(104)).toBe("final");
    expect(stageForMatchNumber(0)).toBeNull();
    expect(stageForMatchNumber(200)).toBeNull();
  });

  it("isKnockoutStage distinguishes group from knockout", () => {
    expect(isKnockoutStage("group")).toBe(false);
    expect(isKnockoutStage("final")).toBe(true);
    expect(isKnockoutStage("roundOf32")).toBe(true);
  });
});

describe("safety: leak-clean, no mutation, deterministic, no weight change", () => {
  it("output contains no provider/private fields (leak scan clean)", () => {
    const group = buildMatchForecast({ matchNumber: 1, stage: "group", home, away });
    const ko = buildMatchForecast({ matchNumber: 73, stage: "roundOf32", home, away });
    expect(findForbiddenSubstrings(JSON.stringify(group))).toEqual([]);
    expect(findForbiddenSubstrings(JSON.stringify(ko))).toEqual([]);
  });

  it("does not mutate the input teams", () => {
    const homeClone = structuredClone(home);
    const awayClone = structuredClone(away);
    buildMatchForecast({ matchNumber: 73, stage: "roundOf32", home, away });
    expect(home).toEqual(homeClone);
    expect(away).toEqual(awayClone);
  });

  it("is deterministic", () => {
    const a = buildMatchForecast({ matchNumber: 73, stage: "roundOf32", home, away });
    const b = buildMatchForecast({ matchNumber: 73, stage: "roundOf32", home, away });
    expect(a).toEqual(b);
  });

  it("does not change MODEL_WEIGHTS", () => {
    const before = structuredClone(MODEL_WEIGHTS);
    buildMatchForecast({ matchNumber: 1, stage: "group", home, away });
    buildMatchForecast({ matchNumber: 73, stage: "roundOf32", home, away });
    expect(MODEL_WEIGHTS).toEqual(before);
  });

  it("rejects a same-team fixture", () => {
    expect(() => buildMatchForecast({ matchNumber: 1, stage: "group", home, away: home })).toThrow();
  });
});

describe("archive provenance contract (no writing in PR-83A)", () => {
  it("supports a true pre-match archive vs a retrospective forecast label", () => {
    const forecast = buildMatchForecast({ matchNumber: 73, stage: "roundOf32", home, away });
    const archived: MatchForecastArchiveEntry = {
      forecast,
      provenance: "archived-pre-match-forecast",
      forecastAsOf: "2026-06-29",
      generatedAt: "2026-06-29T00:00:00.000Z",
      capturedBeforeCompletion: true,
    };
    const retrospective: MatchForecastArchiveEntry = {
      forecast,
      provenance: "retrospective-model-forecast",
      forecastAsOf: "2026-06-30",
      generatedAt: "2026-06-30T00:00:00.000Z",
      capturedBeforeCompletion: false,
    };
    // the product rule: not captured before completion => never "archived-pre-match"
    expect(archived.capturedBeforeCompletion).toBe(true);
    expect(retrospective.capturedBeforeCompletion).toBe(false);
    expect(retrospective.provenance).toBe("retrospective-model-forecast");
  });
});

describe("isolation: pure modules import nothing forbidden", () => {
  const root = process.cwd();
  const read = (rel: string) => readFileSync(join(root, rel), "utf8");
  const importLines = (src: string) =>
    src.split("\n").filter((l) => l.trimStart().startsWith("import")).join("\n");
  const codeNoComments = (src: string) =>
    src
      .split("\n")
      .filter((l) => {
        const t = l.trimStart();
        return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
      })
      .join("\n");

  for (const rel of [
    "lib/model/match-forecast.ts",
    "lib/model/forecast-checkpoints.ts",
  ]) {
    it(`${rel} avoids live-state/provider/Blob/workflow/env/fetch`, () => {
      const src = read(rel);
      const imports = importLines(src);
      expect(imports).not.toMatch(/@\/lib\/live-state|@\/lib\/live-ingest/);
      expect(imports).not.toMatch(/@vercel\/blob/);
      expect(imports).not.toMatch(/from "(node:)?fs"/);
      const code = codeNoComments(src);
      expect(code).not.toMatch(/process\.env/);
      expect(code).not.toMatch(/\bfetch\s*\(/);
    });
  }
});
