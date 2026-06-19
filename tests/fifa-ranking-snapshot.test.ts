import { describe, expect, it } from "vitest";
import {
  fifaRankingSnapshot,
  FIFA_RANKING_SOURCE,
  FIFA_NAME_TO_ID,
  getFifaRanking,
  getModelInputsForTeam,
  getFeatureStatus,
} from "@/data/model-inputs";
import { validateFifaRankingSnapshot } from "@/lib/data/validate-model-inputs";
import { buildFeatureSet } from "@/lib/model/features";
import { predictFromFeatures } from "@/lib/model/predict";
import { getTeam } from "@/lib/data";
import { officialTeams } from "@/data/official/teams";
import type { FifaRankingRow } from "@/lib/types";

describe("FIFA ranking snapshot - coverage & validity", () => {
  it("has exactly one row per official team (48)", () => {
    expect(fifaRankingSnapshot).toHaveLength(48);
    const ids = new Set(fifaRankingSnapshot.map((r) => r.teamId));
    expect(ids.size).toBe(48);
    for (const t of officialTeams) expect(ids.has(t.id)).toBe(true);
  });

  it("has integer ranks 1..210, finite positive points, unique ranks", () => {
    const ranks = new Set<number>();
    for (const r of fifaRankingSnapshot) {
      expect(Number.isInteger(r.fifaRank)).toBe(true);
      expect(r.fifaRank).toBeGreaterThanOrEqual(1);
      expect(r.fifaRank).toBeLessThanOrEqual(210);
      expect(Number.isFinite(r.fifaPoints)).toBe(true);
      expect(r.fifaPoints).toBeGreaterThan(0);
      expect(ranks.has(r.fifaRank)).toBe(false);
      ranks.add(r.fifaRank);
    }
  });

  it("maps every FIFA display name to its app id", () => {
    for (const r of fifaRankingSnapshot) {
      expect(FIFA_NAME_TO_ID[r.fifaNameRaw]).toBe(r.teamId);
    }
  });

  it("carries explicit source-backed provenance (file, date, methodology)", () => {
    expect(FIFA_RANKING_SOURCE.status).toBe("source-backed");
    expect(FIFA_RANKING_SOURCE.sourceFile).toContain("FIFA_Coca-Cola");
    expect(FIFA_RANKING_SOURCE.sourceDate).toBe("2026-06-11");
    expect(FIFA_RANKING_SOURCE.notes).toMatch(/not recalculated/i);
  });

  it("passes validateFifaRankingSnapshot", () => {
    const r = validateFifaRankingSnapshot();
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it("flags an out-of-range rank", () => {
    const bad: FifaRankingRow[] = fifaRankingSnapshot.map((r, i) =>
      i === 0 ? { ...r, fifaRank: 999 } : r,
    );
    expect(validateFifaRankingSnapshot(bad).valid).toBe(false);
  });

  it("flags a duplicate rank", () => {
    const bad: FifaRankingRow[] = fifaRankingSnapshot.map((r, i) =>
      i === 1 ? { ...r, fifaRank: fifaRankingSnapshot[0]!.fifaRank } : r,
    );
    expect(validateFifaRankingSnapshot(bad).errors.join(" ")).toMatch(/duplicate FIFA rank/);
  });
});

describe("FIFA ranking - model integration", () => {
  it("the model consumes the source-backed ranking values", () => {
    const argFifa = getFifaRanking("argentina")!;
    expect(argFifa.fifaRank).toBe(1);
    expect(buildFeatureSet(getTeam("argentina")).fifaRanking).toBe(argFifa.fifaRank);
    expect(getModelInputsForTeam("argentina")?.fifaRankingPoints).toBe(argFifa.fifaPoints);
  });

  it("the FIFA-ranking driver is disclosed as source-backed and not capped", () => {
    const { explanation } = predictFromFeatures(
      buildFeatureSet(getTeam("argentina")),
      buildFeatureSet(getTeam("new-zealand")),
    );
    const all = [...explanation.positiveDrivers, ...explanation.negativeDrivers];
    const fifa = all.find((d) => d.family === "fifaRanking");
    expect(fifa).toBeTruthy();
    expect(fifa!.status).toBe("source-backed");
    expect(fifa!.capped).toBeFalsy();
  });

  it("fifaRanking + eloRating are source-backed; placeholders/structural unchanged", () => {
    expect(getFeatureStatus("fifaRanking")).toBe("source-backed");
    // Elo promoted to source-backed in Phase 1.10.
    expect(getFeatureStatus("eloRating")).toBe("source-backed");
    // Structural promoted to a mixed `candidate` family in Phase 1.12 (World Bank WDI).
    expect(getFeatureStatus("structural")).toBe("candidate");
    expect(getFeatureStatus("squadQuality")).toBe("placeholder");
    expect(getFeatureStatus("recentForm")).toBe("placeholder");
    expect(getFeatureStatus("climateFamiliarity")).toBe("placeholder");
  });

  it("probabilities remain finite and the resolver stays official", async () => {
    const p = predictFromFeatures(
      buildFeatureSet(getTeam("brazil")),
      buildFeatureSet(getTeam("haiti")),
    );
    expect(Number.isNaN(p.homeWin + p.draw + p.awayWin)).toBe(false);
    const { resolveDataset } = await import("@/lib/data/source");
    expect(resolveDataset().fixtureSource).toBe("official");
  });
});
