import { describe, expect, it } from "vitest";
import { computeDrivers, predictFromFeatures } from "@/lib/model/predict";
import { buildFeatureSet } from "@/lib/model/features";
import { MODEL_WEIGHTS, TOURNAMENT_CONTEXT_CONTRIBUTION_CAP } from "@/lib/model/config";
import { getTeam } from "@/lib/data";
import { tournamentContextScoreForTeam } from "@/lib/tournament-context";
import type { TeamFeatureSet } from "@/lib/types";

/** A feature set built from a real team, with tournamentContext overridden. */
function fsWithContext(teamId: string, tournamentContext: number): TeamFeatureSet {
  return { ...buildFeatureSet(getTeam(teamId)), tournamentContext };
}

const ctxOf = (drivers: ReturnType<typeof computeDrivers>) =>
  drivers.find((d) => d.family === "tournamentContext")!;

describe("tournamentContext driver (Phase 1.15B)", () => {
  it("is present in computeDrivers with candidate status", () => {
    const a = buildFeatureSet(getTeam("argentina"));
    const b = buildFeatureSet(getTeam("brazil"));
    const d = ctxOf(computeDrivers(a, b));
    expect(d).toBeTruthy();
    expect(d.status).toBe("candidate");
    expect(d.label).toBe("Tournament context");
  });

  it("uses the pairwise score difference x weight (uncapped range)", () => {
    // Same team base => all other drivers are 0; only tournamentContext differs.
    const a = fsWithContext("argentina", 0.5);
    const b = fsWithContext("argentina", 0.1);
    const d = ctxOf(computeDrivers(a, b));
    expect(d.contribution).toBeCloseTo((0.5 - 0.1) * MODEL_WEIGHTS.tournamentContext, 9);
    expect(d.capped).toBe(false);
  });

  it("is zero for a team against itself (offset cancels)", () => {
    const a = fsWithContext("argentina", 0.7);
    const d = ctxOf(computeDrivers(a, { ...a }));
    expect(d.contribution).toBe(0);
  });

  it("depends only on the difference, so a common offset cancels", () => {
    const lowPair = ctxOf(computeDrivers(fsWithContext("argentina", 0.5), fsWithContext("argentina", 0.1)));
    const highPair = ctxOf(computeDrivers(fsWithContext("argentina", 0.9), fsWithContext("argentina", 0.5)));
    expect(highPair.contribution).toBeCloseTo(lowPair.contribution, 9);
  });

  it("is hard-capped at +/- TOURNAMENT_CONTEXT_CONTRIBUTION_CAP for extreme gaps", () => {
    const a = fsWithContext("argentina", 1);
    const b = fsWithContext("argentina", -1); // raw diff 2 * 15 = 30 -> capped
    const d = ctxOf(computeDrivers(a, b));
    expect(Math.abs(d.contribution)).toBeLessThanOrEqual(TOURNAMENT_CONTEXT_CONTRIBUTION_CAP + 1e-9);
    expect(d.contribution).toBe(TOURNAMENT_CONTEXT_CONTRIBUTION_CAP);
    expect(d.capped).toBe(true);
  });

  it("leaves host/regional drivers unchanged (no double-count)", () => {
    // USA (host) vs Brazil (non-host, CONMEBOL): host = +60, regional = 0,
    // independent of tournamentContext.
    const usa = buildFeatureSet(getTeam("usa"));
    const bra = buildFeatureSet(getTeam("brazil"));
    const drivers = computeDrivers(usa, bra);
    const host = drivers.find((d) => d.family === "hostAdvantage")!;
    const regional = drivers.find((d) => d.family === "regionalAdvantage")!;
    expect(host.contribution).toBe(MODEL_WEIGHTS.host);
    expect(regional.contribution).toBe(0);
  });

  it("keeps every existing model weight unchanged (only the new key added)", () => {
    expect(MODEL_WEIGHTS.elo).toBe(1.0);
    expect(MODEL_WEIGHTS.fifaRankingPerPlace).toBe(1.4);
    expect(MODEL_WEIGHTS.host).toBe(60);
    expect(MODEL_WEIGHTS.regional).toBe(18);
    expect(MODEL_WEIGHTS.climate).toBe(0.8);
    expect(MODEL_WEIGHTS.structural).toBe(10);
    expect(MODEL_WEIGHTS.tournamentContext).toBe(15);
  });

  it("preserves prediction symmetry and W/D/L sum with the driver active", () => {
    const a = buildFeatureSet(getTeam("mexico")); // altitude-heavy context
    const b = buildFeatureSet(getTeam("paraguay")); // favourable context
    const ab = predictFromFeatures(a, b);
    const ba = predictFromFeatures(b, a);
    expect(ab.homeWin + ab.draw + ab.awayWin).toBeGreaterThan(0.98);
    expect(ab.homeWin + ab.draw + ab.awayWin).toBeLessThan(1.02);
    expect(ba.awayWin).toBeCloseTo(ab.homeWin, 5);
    expect(ba.homeWin).toBeCloseTo(ab.awayWin, 5);
  });

  it("is deterministic (same inputs -> identical contribution)", () => {
    const a = fsWithContext("argentina", 0.42);
    const b = fsWithContext("brazil", 0.13);
    expect(ctxOf(computeDrivers(a, b)).contribution).toBe(
      ctxOf(computeDrivers(a, b)).contribution,
    );
  });

  it("carries no venue heat/climate dependency (deferred sub-metrics present)", () => {
    const s = tournamentContextScoreForTeam("argentina")!;
    expect(s.deferred).toContain("heat");
    expect(s.deferred).toContain("venueClimate");
  });
});
