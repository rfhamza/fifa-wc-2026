/**
 * PR-82 — pure forecast-delta selector tests.
 * Synthetic snapshots for exact math + a few committed-data assertions. No fs at
 * the selector layer, no network, no Blob, no provider fetch, no simulation rerun.
 */
import { describe, expect, it } from "vitest";
import {
  FORECAST_PROBABILITY_KEYS,
  findForbiddenSubstrings,
  loadForecastSnapshot,
  type ForecastManifest,
  type ForecastManifestEntry,
  type ForecastSnapshot,
  type ForecastTeamProbabilities,
} from "@/lib/model/forecast-snapshots";
import {
  FORECAST_STAGE_ORDER,
  buildStageForecastTrajectory,
  buildTeamForecastTrajectory,
  compareForecastSnapshots,
  getAllTeamForecastDeltas,
  getBiggestForecastMovers,
  getTeamForecastDelta,
  resolveManifestChain,
  validateForecastSnapshotManifest,
  type ForecastStageKey,
} from "@/lib/model/forecast-deltas";

import baselineRaw from "@/data/forecast/snapshots/baseline-2026-06-11.pre-tournament.json";
import s073Raw from "@/data/forecast/snapshots/snapshot-2026-06-29-after-match-073.json";

// --- factories ---------------------------------------------------------------

function team(
  teamId: string,
  rank: number,
  p: Partial<Record<ForecastStageKey, number>> = {},
): ForecastTeamProbabilities {
  return {
    teamId,
    rank,
    winner: 0,
    final: 0,
    semiFinal: 0,
    quarterFinal: 0,
    roundOf16: 0,
    roundOf32: 0,
    qualifyTop2: 0,
    qualifyThird: 0,
    ...p,
  };
}

function snap(
  snapshotId: string,
  asOf: string,
  completedMatchesLocked: number,
  teams: ForecastTeamProbabilities[],
): ForecastSnapshot {
  return {
    meta: {
      schemaVersion: "1.0.0",
      snapshotId,
      snapshotType: completedMatchesLocked === 0 ? "baseline" : "post-match",
      asOf,
      generatedAt: `${asOf}T00:00:00.000Z`,
      weightsSummary: {},
      modelConfigHash: "mw-test",
      dataVersion: "td-test",
      fixtureVersion: "fx-test",
      liveStateSource: null,
      liveStateAsOf: null,
      completedMatchesLocked,
      simulationIterations: 2000,
      seed: 1,
      notes: "",
    },
    teams,
  };
}

function entry(
  snapshotId: string,
  file: string,
  completedMatchesLocked: number,
  isBaseline: boolean,
  previousSnapshotId: string | null,
  asOf = "2026-06-11",
): ForecastManifestEntry {
  return {
    snapshotId,
    file,
    snapshotType: isBaseline ? "baseline" : "post-match",
    asOf,
    label: snapshotId,
    completedMatchesLocked,
    isBaseline,
    previousSnapshotId,
    notes: "",
  };
}

const manifest = (snapshots: ForecastManifestEntry[]): ForecastManifest => ({
  schemaVersion: "1.0.0",
  snapshots,
});

// --- stage order -------------------------------------------------------------

describe("FORECAST_STAGE_ORDER", () => {
  it("has the 8 keys in reachability order and covers all probability keys", () => {
    expect(FORECAST_STAGE_ORDER).toEqual([
      "qualifyTop2",
      "qualifyThird",
      "roundOf32",
      "roundOf16",
      "quarterFinal",
      "semiFinal",
      "final",
      "winner",
    ]);
    expect([...FORECAST_STAGE_ORDER].sort()).toEqual([...FORECAST_PROBABILITY_KEYS].sort());
  });
});

// --- delta math --------------------------------------------------------------

describe("getTeamForecastDelta", () => {
  const from = snap("b", "2026-06-11", 0, [team("spain", 5, { winner: 0.3 })]);
  const to = snap("c", "2026-06-25", 54, [team("spain", 2, { winner: 0.25 })]);

  it("computes probability-point deltas and rank delta", () => {
    const d = getTeamForecastDelta("spain", from, to)!;
    expect(d.stages.winner.fromProbability).toBe(0.3);
    expect(d.stages.winner.toProbability).toBe(0.25);
    expect(d.stages.winner.delta).toBeCloseTo(-0.05, 6);
    expect(d.stages.winner.deltaPercentagePoints).toBeCloseTo(-5, 4);
    expect(d.stages.winner.absoluteDelta).toBeCloseTo(0.05, 6);
    // rank 5 -> 2 = improved by 3 (negative)
    expect(d.rankDelta).toBe(-3);
    expect(d.presentInFrom).toBe(true);
    expect(d.presentInTo).toBe(true);
    expect(d.stages.winner.isStructurallyEliminatedForStage).toBeNull();
  });

  it("treats a team missing from `from` as previous = 0 / rank null", () => {
    const d = getTeamForecastDelta("newteam", from, snap("c", "x", 1, [team("newteam", 1, { winner: 0.1 })]))!;
    expect(d.presentInFrom).toBe(false);
    expect(d.stages.winner.fromProbability).toBe(0);
    expect(d.fromRank).toBeNull();
    expect(d.rankDelta).toBeNull();
  });

  it("returns null when the team is in neither snapshot", () => {
    expect(getTeamForecastDelta("ghost", from, to)).toBeNull();
  });
});

describe("getAllTeamForecastDeltas", () => {
  it("sorts by toRank then teamId", () => {
    const from = snap("b", "x", 0, [team("a", 1), team("b", 2)]);
    const to = snap("c", "y", 1, [team("b", 1, { winner: 0.4 }), team("a", 2)]);
    const ids = getAllTeamForecastDeltas(from, to).map((d) => d.teamId);
    expect(ids).toEqual(["b", "a"]);
  });
});

// --- movers ------------------------------------------------------------------

describe("getBiggestForecastMovers", () => {
  // alpha +0.10, bravo -0.08, charlie +0.02, zero falls to 0 (eliminated for winner)
  const from = snap("b", "x", 0, [
    team("alpha", 1, { winner: 0.2 }),
    team("bravo", 2, { winner: 0.18 }),
    team("charlie", 3, { winner: 0.05 }),
    team("zero", 4, { winner: 0.03 }),
  ]);
  const to = snap("c", "y", 1, [
    team("alpha", 1, { winner: 0.3 }),
    team("bravo", 2, { winner: 0.1 }),
    team("charlie", 3, { winner: 0.07 }),
    team("zero", 4, { winner: 0 }),
  ]);

  it("defaults to signed winner movers, top 5, excluding zero-probability teams", () => {
    const r = getBiggestForecastMovers(from, to);
    expect(r.stage).toBe("winner");
    expect(r.mode).toBe("signed");
    expect(r.risers!.map((m) => m.teamId)).toEqual(["alpha", "charlie"]);
    expect(r.fallers!.map((m) => m.teamId)).toEqual(["bravo"]); // zero excluded
    expect(r.movers).toBeUndefined();
  });

  it("includes zero-probability teams when asked", () => {
    const r = getBiggestForecastMovers(from, to, { includeZeroProbabilityTeams: true });
    expect(r.fallers!.map((m) => m.teamId)).toEqual(["bravo", "zero"]);
    const zero = r.fallers!.find((m) => m.teamId === "zero")!;
    expect(zero.isZeroProbabilityForStage).toBe(true);
    expect(zero.zeroProbabilityBasis).toBe("snapshot-probability-zero");
  });

  it("absolute mode returns one list by absoluteDelta desc", () => {
    const r = getBiggestForecastMovers(from, to, { mode: "absolute" });
    expect(r.risers).toBeUndefined();
    expect(r.movers!.map((m) => m.teamId)).toEqual(["alpha", "bravo", "charlie"]);
  });

  it("honours topN, minFromProbability and minAbsDelta", () => {
    expect(getBiggestForecastMovers(from, to, { topN: 1 }).risers).toHaveLength(1);
    // minFromProbability 0.1 drops charlie (from 0.05)
    const r = getBiggestForecastMovers(from, to, { minFromProbability: 0.1 });
    expect(r.risers!.map((m) => m.teamId)).toEqual(["alpha"]);
    // minAbsDelta 0.09 keeps only alpha(+0.10)
    const r2 = getBiggestForecastMovers(from, to, { minAbsDelta: 0.09, includeZeroProbabilityTeams: true });
    expect(r2.risers!.map((m) => m.teamId)).toEqual(["alpha"]);
    expect(r2.fallers!.map((m) => m.teamId)).toEqual([]);
  });

  it("treats zero-probability as STAGE-RELATIVE", () => {
    // team is winner=0 but roundOf32=0.5 -> excluded for winner, present for roundOf32
    const f = snap("b", "x", 0, [team("t", 1, { winner: 0.01, roundOf32: 0.4 })]);
    const t = snap("c", "y", 1, [team("t", 1, { winner: 0, roundOf32: 0.5 })]);
    expect(getBiggestForecastMovers(f, t, { stage: "winner" }).risers).toEqual([]);
    const ko = getBiggestForecastMovers(f, t, { stage: "roundOf32" });
    expect(ko.risers!.map((m) => m.teamId)).toEqual(["t"]);
    expect(ko.risers![0]!.isZeroProbabilityForStage).toBe(false);
  });
});

// --- trajectories ------------------------------------------------------------

describe("trajectories", () => {
  const a = snap("a", "2026-06-11", 0, [team("x", 1, { winner: 0.2, roundOf32: 0.9 }), team("y", 2, { winner: 0.1, roundOf32: 0.8 })]);
  const b = snap("b", "2026-06-20", 30, [team("x", 1, { winner: 0.25, roundOf32: 1 }), team("y", 2, { winner: 0.05, roundOf32: 0.4 })]);
  const c = snap("c", "2026-06-29", 60, [team("x", 1, { winner: 0.3, roundOf32: 1 })]); // y eliminated/absent

  it("builds a team trajectory keeping absent snapshots as zero/null", () => {
    const tr = buildTeamForecastTrajectory("y", [a, b, c]);
    expect(tr.points.map((p) => p.snapshotId)).toEqual(["a", "b", "c"]);
    expect(tr.points[2]!.rank).toBeNull();
    expect(tr.points[2]!.stages.winner).toBe(0);
    expect(tr.points[2]!.stages.roundOf32).toBe(0); // trends to 0, still present in the series
  });

  it("builds a stage trajectory sorted by last value", () => {
    const st = buildStageForecastTrajectory("winner", [a, b, c]);
    expect(st.teams.map((t) => t.teamId)).toEqual(["x", "y"]);
    expect(st.teams[0]!.series.map((s) => s.value)).toEqual([0.2, 0.25, 0.3]);
    expect(st.teams[1]!.series.map((s) => s.value)).toEqual([0.1, 0.05, 0]);
  });
});

// --- manifest chain policy ---------------------------------------------------

describe("resolveManifestChain", () => {
  it("resolves a clean linear chain with zero warnings", () => {
    const p = resolveManifestChain(
      manifest([
        entry("b", "b.json", 0, true, null),
        entry("c", "c.json", 54, false, "b"),
        entry("d", "d.json", 72, false, "c"),
      ]),
    );
    expect(p.warnings).toEqual([]);
    expect(p.isValidChain).toBe(true);
    expect(p.selectionMode).toBe("chain");
    expect(p.baselineSnapshotId).toBe("b");
    expect(p.currentSnapshotId).toBe("d");
    expect(p.chainIds).toEqual(["b", "c", "d"]);
  });

  it("warns missing-baseline and falls back to earliest", () => {
    const p = resolveManifestChain(
      manifest([
        entry("c", "c.json", 54, false, null, "2026-06-25"),
        entry("d", "d.json", 72, false, "c", "2026-06-29"),
      ]),
    );
    expect(p.warnings.map((w) => w.code)).toContain("missing-baseline");
    expect(p.baselineSnapshotId).toBe("c");
  });

  it("warns duplicate-baseline", () => {
    const p = resolveManifestChain(
      manifest([
        entry("b", "b.json", 0, true, null),
        entry("b2", "b2.json", 0, true, null, "2026-06-12"),
      ]),
    );
    expect(p.warnings.map((w) => w.code)).toContain("duplicate-baseline");
    expect(p.baselineSnapshotId).toBe("b");
  });

  it("warns broken-previous-snapshot-chain on a missing parent", () => {
    const p = resolveManifestChain(
      manifest([
        entry("b", "b.json", 0, true, null),
        entry("d", "d.json", 72, false, "ghost"),
      ]),
    );
    expect(p.warnings.map((w) => w.code)).toContain("broken-previous-snapshot-chain");
    expect(p.selectionMode).not.toBe("chain");
  });

  it("warns duplicate-current-candidate when a node has two children", () => {
    const p = resolveManifestChain(
      manifest([
        entry("b", "b.json", 0, true, null),
        entry("c", "c.json", 54, false, "b"),
        entry("d", "d.json", 72, false, "b"),
      ]),
    );
    expect(p.warnings.map((w) => w.code)).toContain("duplicate-current-candidate");
  });

  it("warns current-not-highest-completed-matches on a non-monotonic chain", () => {
    const p = resolveManifestChain(
      manifest([
        entry("b", "b.json", 0, true, null),
        entry("c", "c.json", 72, false, "b"),
        entry("d", "d.json", 54, false, "c"),
      ]),
    );
    expect(p.selectionMode).toBe("chain");
    expect(p.currentSnapshotId).toBe("d");
    expect(p.warnings.map((w) => w.code)).toContain("current-not-highest-completed-matches");
  });
});

describe("validateForecastSnapshotManifest", () => {
  it("flags duplicate snapshotId as an error", () => {
    const r = validateForecastSnapshotManifest(
      manifest([entry("b", "b.json", 0, true, null), entry("b", "b2.json", 1, false, "b")]),
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/duplicate snapshotId/);
  });

  it("flags an empty manifest", () => {
    const r = validateForecastSnapshotManifest(manifest([]));
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/no snapshots/);
  });

  it("passes a clean manifest", () => {
    const r = validateForecastSnapshotManifest(
      manifest([entry("b", "b.json", 0, true, null), entry("c", "c.json", 1, false, "b")]),
    );
    expect(r).toEqual({ ok: true, warnings: [], errors: [] });
  });
});

// --- committed data: range, leak, no mutation --------------------------------

describe("committed-snapshot selectors", () => {
  const baseline = loadForecastSnapshot(baselineRaw);
  const current = loadForecastSnapshot(s073Raw);

  it("keeps all probabilities in [0,1] and reports no leakage", () => {
    const cmp = compareForecastSnapshots(baseline, current);
    for (const d of cmp.teamDeltas) {
      for (const stage of FORECAST_STAGE_ORDER) {
        const sd = d.stages[stage];
        expect(sd.fromProbability).toBeGreaterThanOrEqual(0);
        expect(sd.fromProbability).toBeLessThanOrEqual(1);
        expect(sd.toProbability).toBeGreaterThanOrEqual(0);
        expect(sd.toProbability).toBeLessThanOrEqual(1);
      }
    }
    const movers = getBiggestForecastMovers(baseline, current);
    expect(findForbiddenSubstrings(JSON.stringify(cmp))).toEqual([]);
    expect(findForbiddenSubstrings(JSON.stringify(movers))).toEqual([]);
  });

  it("does not mutate the input snapshots", () => {
    const baselineClone = structuredClone(baseline);
    const currentClone = structuredClone(current);
    getAllTeamForecastDeltas(baseline, current);
    getBiggestForecastMovers(baseline, current, { mode: "absolute" });
    buildTeamForecastTrajectory("spain", [baseline, current]);
    buildStageForecastTrajectory("winner", [baseline, current]);
    expect(baseline).toEqual(baselineClone);
    expect(current).toEqual(currentClone);
  });
});
