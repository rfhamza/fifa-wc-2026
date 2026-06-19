import { describe, expect, it } from "vitest";
import {
  eloRatingSnapshot,
  ELO_RATING_SOURCE,
  ELO_NAME_TO_ID,
  getEloRating,
  getModelInputsForTeam,
  getFeatureStatus,
} from "@/data/model-inputs";
import { validateEloSnapshot } from "@/lib/data/validate-model-inputs";
import { buildFeatureSet } from "@/lib/model/features";
import { predictFromFeatures } from "@/lib/model/predict";
import { getTeam } from "@/lib/data";
import { officialTeams } from "@/data/official/teams";
import type { EloRatingRow } from "@/lib/types";

describe("Elo rating snapshot - coverage & validity", () => {
  it("has exactly one row per official team (48)", () => {
    expect(eloRatingSnapshot).toHaveLength(48);
    const ids = new Set(eloRatingSnapshot.map((r) => r.teamId));
    expect(ids.size).toBe(48);
    for (const t of officialTeams) expect(ids.has(t.id)).toBe(true);
  });

  it("has integer ranks in 1..250 and finite ratings in 1000..2500", () => {
    for (const r of eloRatingSnapshot) {
      expect(Number.isInteger(r.eloRank)).toBe(true);
      expect(r.eloRank).toBeGreaterThanOrEqual(1);
      expect(r.eloRank).toBeLessThanOrEqual(250);
      expect(Number.isFinite(r.eloRating)).toBe(true);
      expect(r.eloRating).toBeGreaterThanOrEqual(1000);
      expect(r.eloRating).toBeLessThanOrEqual(2500);
    }
  });

  it("ALLOWS tied Elo ranks (equal ratings share a rank)", () => {
    // The 11 Jun snapshot contains ties (e.g. Algeria/Iran #30, Czechia/Sweden #42).
    const byRank = new Map<number, EloRatingRow[]>();
    for (const r of eloRatingSnapshot) {
      const list = byRank.get(r.eloRank) ?? [];
      list.push(r);
      byRank.set(r.eloRank, list);
    }
    const tied = [...byRank.values()].filter((l) => l.length > 1);
    expect(tied.length).toBeGreaterThan(0);
    // Tied teams must share the same rating (that is what a tie means).
    for (const list of tied) {
      const ratings = new Set(list.map((r) => r.eloRating));
      expect(ratings.size).toBe(1);
    }
  });

  it("maps every Elo display name to its app id", () => {
    for (const r of eloRatingSnapshot) {
      expect(ELO_NAME_TO_ID[r.eloNameRaw]).toBe(r.teamId);
    }
  });

  it("carries explicit source-backed provenance (file, date, methodology)", () => {
    expect(ELO_RATING_SOURCE.status).toBe("source-backed");
    expect(ELO_RATING_SOURCE.sourceFile).toContain("Elo ratings table");
    expect(ELO_RATING_SOURCE.sourceDate).toBe("2026-06-11");
    expect(ELO_RATING_SOURCE.sourceUrl).toContain("eloratings.net");
    expect(ELO_RATING_SOURCE.notes).toMatch(/not recalculated/i);
  });

  it("passes validateEloSnapshot (ties allowed, no warnings)", () => {
    const r = validateEloSnapshot();
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
    // Ratings are stored in rank order, so no out-of-order warnings.
    expect(r.warnings).toEqual([]);
  });

  it("does NOT flag a duplicate rank (ties are valid)", () => {
    // Force two teams to share a rank with matching ratings -> still valid.
    const tiedRating = eloRatingSnapshot[0]!.eloRating;
    const bad: EloRatingRow[] = eloRatingSnapshot.map((r, i) =>
      i === 1 ? { ...r, eloRank: eloRatingSnapshot[0]!.eloRank, eloRating: tiedRating } : r,
    );
    const res = validateEloSnapshot(bad);
    expect(res.errors.join(" ")).not.toMatch(/duplicate Elo rank/i);
  });

  it("flags an out-of-range rating", () => {
    const bad: EloRatingRow[] = eloRatingSnapshot.map((r, i) =>
      i === 0 ? { ...r, eloRating: 99 } : r,
    );
    const res = validateEloSnapshot(bad);
    expect(res.valid).toBe(false);
    expect(res.errors.join(" ")).toMatch(/eloRating .* not finite in/);
  });

  it("flags a non-integer rank", () => {
    const bad: EloRatingRow[] = eloRatingSnapshot.map((r, i) =>
      i === 0 ? { ...r, eloRank: 1.5 } : r,
    );
    expect(validateEloSnapshot(bad).valid).toBe(false);
  });

  it("flags a name that does not map to its id", () => {
    const bad: EloRatingRow[] = eloRatingSnapshot.map((r, i) =>
      i === 0 ? { ...r, eloNameRaw: "Atlantis" } : r,
    );
    expect(validateEloSnapshot(bad).errors.join(" ")).toMatch(/does not map/);
  });
});

describe("Elo rating - model integration", () => {
  it("the model consumes the source-backed Elo values", () => {
    const spainElo = getEloRating("spain")!;
    expect(spainElo.eloRank).toBe(1);
    expect(spainElo.eloRating).toBe(2157);
    expect(buildFeatureSet(getTeam("spain")).elo).toBe(spainElo.eloRating);
    expect(getModelInputsForTeam("spain")?.eloRating).toBe(spainElo.eloRating);
    expect(getModelInputsForTeam("spain")?.eloRank).toBe(spainElo.eloRank);
  });

  it("the Elo driver is disclosed as source-backed and not capped", () => {
    const { explanation } = predictFromFeatures(
      buildFeatureSet(getTeam("spain")),
      buildFeatureSet(getTeam("qatar")),
    );
    const all = [...explanation.positiveDrivers, ...explanation.negativeDrivers];
    const elo = all.find((d) => d.family === "eloRating");
    expect(elo).toBeTruthy();
    expect(elo!.status).toBe("source-backed");
    expect(elo!.capped).toBeFalsy();
  });

  it("only this phase's family flipped; others unchanged", () => {
    expect(getFeatureStatus("eloRating")).toBe("source-backed");
    expect(getFeatureStatus("fifaRanking")).toBe("source-backed");
    expect(getFeatureStatus("structural")).toBe("manual");
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
