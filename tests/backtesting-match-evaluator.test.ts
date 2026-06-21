import { describe, expect, it } from "vitest";
import type { TeamFeatureSet } from "@/lib/types";
import { WC2022_PACK } from "@/data/historical/snapshots/wc-2022";
import { WC2018_PACK } from "@/data/historical/snapshots/wc-2018";
import { buildHistoricalFeatures } from "@/lib/backtesting/feature-adapter";
import {
  BASELINE_LADDER,
  ELO_FIFA,
  ELO_FIFA_HOST_REGIONAL,
  ELO_ONLY,
  FIFA_ONLY,
} from "@/lib/backtesting/model-variants";
import {
  evaluateLadder,
  evaluateVariant,
  netAdvantage,
  predictTriple,
} from "@/lib/backtesting/match-evaluator";
import { validateProbabilityTriple } from "@/lib/backtesting/metrics";

/**
 * Phase 1.18C-1: deterministic WC-2022 match-level backtest. Headline metrics are
 * group-stage only (48 matches); an all-64 diagnostic mode is available behind a flag
 * (90-minute W/D/L only; no ET/penalty advancement). The pinned metric values below
 * are the canonical reproducible artifact and must fail on real logic drift.
 *
 * Pinned to 6 decimals to catch logic drift while ignoring float formatting noise.
 */
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

/** Neutral feature set with overrides, for sign-direction sanity checks. */
const feat = (over: Partial<TeamFeatureSet>): TeamFeatureSet => ({
  teamId: "x",
  elo: 1800,
  fifaRanking: 20,
  squadQuality: 0,
  recentForm: 0,
  climateFamiliarity: 0,
  sameNationalityManager: false,
  gdpPerCapita: 0,
  population: 0,
  structuralDepth: 0,
  isHost: false,
  isRegional: false,
  tournamentContext: 0,
  ...over,
});

describe("WC-2022 evaluator: match counts and stage tagging", () => {
  it("group mode scores exactly 48 group matches", () => {
    const r = evaluateVariant(WC2022_PACK, ELO_FIFA, "group");
    expect(r.matchCount).toBe(48);
    expect(r.includedStages).toEqual(["group"]);
    expect(r.perMatch).toHaveLength(48);
    expect(r.perMatch.every((m) => m.stage === "group")).toBe(true);
  });

  it("all mode scores exactly 64 matches, stage-tagged", () => {
    const r = evaluateVariant(WC2022_PACK, ELO_FIFA, "all");
    expect(r.matchCount).toBe(64);
    expect(r.perMatch).toHaveLength(64);
    expect(r.perMatch.filter((m) => m.stage === "group")).toHaveLength(48);
    expect(r.perMatch.filter((m) => m.stage !== "group")).toHaveLength(16);
    expect(new Set(r.includedStages)).toContain("final");
  });

  it("defaults to group mode", () => {
    expect(evaluateVariant(WC2022_PACK, ELO_ONLY).matchCount).toBe(48);
  });
});

describe("WC-2022 evaluator: coverage and well-formed probabilities", () => {
  it("every evaluated team has finite Elo and FIFA features", () => {
    const features = buildHistoricalFeatures(WC2022_PACK);
    expect(features.size).toBe(32);
    for (const f of features.values()) {
      expect(Number.isFinite(f.elo)).toBe(true);
      expect(Number.isInteger(f.fifaRanking) && f.fifaRanking >= 1).toBe(true);
    }
  });

  it("every predicted triple is valid and sums to 1", () => {
    const r = evaluateVariant(WC2022_PACK, ELO_FIFA_HOST_REGIONAL, "all");
    for (const m of r.perMatch) {
      expect(() => validateProbabilityTriple({ pA: m.pA, pD: m.pD, pB: m.pB })).not.toThrow();
      expect(m.pA + m.pD + m.pB).toBeCloseTo(1, 9);
    }
  });
});

describe("WC-2022 host/regional are relative to Qatar / AFC (not 2026 CONCACAF)", () => {
  const features = buildHistoricalFeatures(WC2022_PACK);

  it("Qatar is the host; an AFC non-host (Japan) is regional", () => {
    expect(features.get("qatar")?.isHost).toBe(true);
    expect(features.get("qatar")?.isRegional).toBe(false);
    expect(features.get("japan")?.isHost).toBe(false);
    expect(features.get("japan")?.isRegional).toBe(true);
  });

  it("a UEFA team (France) is neither host nor regional", () => {
    expect(features.get("france")?.isHost).toBe(false);
    expect(features.get("france")?.isRegional).toBe(false);
  });
});

describe("sign-direction sanity (reimplemented driver math must not flip signs)", () => {
  const neutralPair = () => ({ a: feat({}), b: feat({}) });

  it("higher Elo for team A increases pA versus an identical comparison", () => {
    const { a, b } = neutralPair();
    const base = predictTriple(a, b, ELO_ONLY);
    expect(base.pA).toBeCloseTo(base.pB, 9); // symmetric baseline
    const strongerA = predictTriple(feat({ elo: 2000 }), feat({ elo: 1700 }), ELO_ONLY);
    expect(strongerA.pA).toBeGreaterThan(base.pA);
    expect(strongerA.pA).toBeGreaterThan(strongerA.pB);
  });

  it("a better FIFA rank (smaller number) for team A increases pA", () => {
    const base = predictTriple(feat({}), feat({}), FIFA_ONLY);
    const betterA = predictTriple(feat({ fifaRanking: 1 }), feat({ fifaRanking: 40 }), FIFA_ONLY);
    expect(betterA.pA).toBeGreaterThan(base.pA);
    expect(betterA.pA).toBeGreaterThan(betterA.pB);
  });

  it("Qatar-style host advantage applies only in the host/regional variant", () => {
    const host = feat({ isHost: true });
    const other = feat({});
    // host driver inactive in Elo+FIFA -> no advantage from isHost
    expect(netAdvantage(host, other, ELO_FIFA.activeDrivers)).toBe(0);
    // host driver active -> positive advantage for the host
    expect(netAdvantage(host, other, ELO_FIFA_HOST_REGIONAL.activeDrivers)).toBeGreaterThan(0);
    expect(predictTriple(host, other, ELO_FIFA_HOST_REGIONAL).pA).toBeGreaterThan(
      predictTriple(host, other, ELO_FIFA).pA,
    );
  });

  it("an AFC non-host gets regional advantage over a non-regional side", () => {
    const regional = feat({ isRegional: true });
    const nonRegional = feat({});
    expect(netAdvantage(regional, nonRegional, ELO_FIFA.activeDrivers)).toBe(0);
    expect(
      netAdvantage(regional, nonRegional, ELO_FIFA_HOST_REGIONAL.activeDrivers),
    ).toBeGreaterThan(0);
  });
});

describe("WC-2022 pinned diagnostic metrics (group-stage headline)", () => {
  const byId = Object.fromEntries(
    evaluateLadder(WC2022_PACK, BASELINE_LADDER, "group").map((r) => [r.modelVariant, r]),
  );

  const expected: Record<string, { rps: number; logLoss: number; brier: number; accuracy: number }> = {
    "elo-only": { rps: 0.238651, logLoss: 1.110921, brier: 0.637314, accuracy: 0.541667 },
    "fifa-only": { rps: 0.231994, logLoss: 1.047412, brier: 0.631767, accuracy: 0.541667 },
    "elo-fifa": { rps: 0.238636, logLoss: 1.123338, brier: 0.636163, accuracy: 0.5625 },
    "elo-fifa-host-regional": { rps: 0.240298, logLoss: 1.126756, brier: 0.639973, accuracy: 0.520833 },
  };

  for (const [id, exp] of Object.entries(expected)) {
    it(`${id} matches pinned metrics over 48 group matches`, () => {
      const r = byId[id]!;
      expect(r.matchCount).toBe(48);
      expect(round6(r.metrics.rps)).toBe(exp.rps);
      expect(round6(r.metrics.logLoss)).toBe(exp.logLoss);
      expect(round6(r.metrics.brier)).toBe(exp.brier);
      expect(round6(r.metrics.accuracy)).toBe(exp.accuracy);
    });
  }
});

describe("WC-2022 pinned diagnostic metrics (all-64 secondary)", () => {
  const byId = Object.fromEntries(
    evaluateLadder(WC2022_PACK, BASELINE_LADDER, "all").map((r) => [r.modelVariant, r]),
  );

  const expected: Record<string, { rps: number; logLoss: number; brier: number; accuracy: number }> = {
    "elo-only": { rps: 0.217873, logLoss: 1.057303, brier: 0.609806, accuracy: 0.5625 },
    "fifa-only": { rps: 0.227853, logLoss: 1.054135, brier: 0.635823, accuracy: 0.5625 },
    "elo-fifa": { rps: 0.217252, logLoss: 1.064169, brier: 0.607658, accuracy: 0.578125 },
    "elo-fifa-host-regional": { rps: 0.218526, logLoss: 1.06712, brier: 0.610567, accuracy: 0.546875 },
  };

  for (const [id, exp] of Object.entries(expected)) {
    it(`${id} matches pinned metrics over 64 matches`, () => {
      const r = byId[id]!;
      expect(r.matchCount).toBe(64);
      expect(round6(r.metrics.rps)).toBe(exp.rps);
      expect(round6(r.metrics.logLoss)).toBe(exp.logLoss);
      expect(round6(r.metrics.brier)).toBe(exp.brier);
      expect(round6(r.metrics.accuracy)).toBe(exp.accuracy);
    });
  }
});

describe("WC-2018 evaluator: counts, host/regional (Russia/UEFA), and pinned metrics", () => {
  it("group mode scores exactly 48 matches; all mode exactly 64 (stage-tagged)", () => {
    const g = evaluateVariant(WC2018_PACK, ELO_FIFA, "group");
    expect(g.matchCount).toBe(48);
    expect(g.includedStages).toEqual(["group"]);
    const a = evaluateVariant(WC2018_PACK, ELO_FIFA, "all");
    expect(a.matchCount).toBe(64);
    expect(a.perMatch.filter((m) => m.stage === "group")).toHaveLength(48);
    expect(a.perMatch.filter((m) => m.stage !== "group")).toHaveLength(16);
  });

  it("host/regional are relative to Russia / UEFA", () => {
    const features = buildHistoricalFeatures(WC2018_PACK);
    expect(features.get("russia")?.isHost).toBe(true);
    expect(features.get("russia")?.isRegional).toBe(false);
    // a UEFA non-host gets regional advantage
    expect(features.get("spain")?.isHost).toBe(false);
    expect(features.get("spain")?.isRegional).toBe(true);
    // a non-UEFA team gets neither
    expect(features.get("brazil")?.isHost).toBe(false);
    expect(features.get("brazil")?.isRegional).toBe(false);
  });

  it("every predicted triple is valid and sums to 1", () => {
    const r = evaluateVariant(WC2018_PACK, ELO_FIFA_HOST_REGIONAL, "all");
    for (const m of r.perMatch) {
      expect(() => validateProbabilityTriple({ pA: m.pA, pD: m.pD, pB: m.pB })).not.toThrow();
      expect(m.pA + m.pD + m.pB).toBeCloseTo(1, 9);
    }
  });

  const groupExpected: Record<string, { rps: number; logLoss: number; brier: number; accuracy: number }> = {
    "elo-only": { rps: 0.196349, logLoss: 0.932544, brier: 0.546919, accuracy: 0.583333 },
    "fifa-only": { rps: 0.230587, logLoss: 1.029163, brier: 0.619041, accuracy: 0.541667 },
    "elo-fifa": { rps: 0.195006, logLoss: 0.931218, brier: 0.542734, accuracy: 0.625 },
    "elo-fifa-host-regional": { rps: 0.19246, logLoss: 0.925844, brier: 0.537438, accuracy: 0.625 },
  };
  const allExpected: Record<string, { rps: number; logLoss: number; brier: number; accuracy: number }> = {
    "elo-only": { rps: 0.20117, logLoss: 0.967517, brier: 0.573507, accuracy: 0.546875 },
    "fifa-only": { rps: 0.228229, logLoss: 1.044223, brier: 0.629291, accuracy: 0.5 },
    "elo-fifa": { rps: 0.200959, logLoss: 0.968904, brier: 0.572945, accuracy: 0.578125 },
    "elo-fifa-host-regional": { rps: 0.197796, logLoss: 0.960757, brier: 0.56574, accuracy: 0.59375 },
  };

  const groupById = Object.fromEntries(
    evaluateLadder(WC2018_PACK, BASELINE_LADDER, "group").map((r) => [r.modelVariant, r]),
  );
  const allById = Object.fromEntries(
    evaluateLadder(WC2018_PACK, BASELINE_LADDER, "all").map((r) => [r.modelVariant, r]),
  );

  for (const [id, exp] of Object.entries(groupExpected)) {
    it(`${id} matches pinned group-stage metrics (48 matches)`, () => {
      const r = groupById[id]!;
      expect(r.matchCount).toBe(48);
      expect(round6(r.metrics.rps)).toBe(exp.rps);
      expect(round6(r.metrics.logLoss)).toBe(exp.logLoss);
      expect(round6(r.metrics.brier)).toBe(exp.brier);
      expect(round6(r.metrics.accuracy)).toBe(exp.accuracy);
    });
  }
  for (const [id, exp] of Object.entries(allExpected)) {
    it(`${id} matches pinned all-64 metrics`, () => {
      const r = allById[id]!;
      expect(r.matchCount).toBe(64);
      expect(round6(r.metrics.rps)).toBe(exp.rps);
      expect(round6(r.metrics.logLoss)).toBe(exp.logLoss);
      expect(round6(r.metrics.brier)).toBe(exp.brier);
      expect(round6(r.metrics.accuracy)).toBe(exp.accuracy);
    });
  }
});
