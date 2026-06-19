import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runTournamentSimulation } from "@/lib/simulation/tournament";
import { createRng, samplePoisson } from "@/lib/simulation/rng";
import { computeGroupStandings, type MatchResult } from "@/lib/simulation/standings";
import { buildFeatureSet } from "@/lib/model/features";
import { computeDrivers, expectedGoalsFromAdvantage, predictMatch } from "@/lib/model/predict";
import {
  PLACEHOLDER_CONTRIBUTION_CAP,
  TOTAL_PLACEHOLDER_CONTRIBUTION_CAP,
  SIMULATION_CONFIG,
} from "@/lib/model/config";
import {
  teams,
  groups,
  getTeam,
  getFixturesForGroup,
  getTeamMeta,
  fixtureSource,
} from "@/lib/data";
import { getFeatureStatus } from "@/data/model-inputs";
import { round, pct } from "@/lib/utils";
import type { ModelInputStatus, TeamFeatureSet } from "@/lib/types";

/**
 * Phase 1.9 - Frozen pre-tournament forecast BEHAVIOUR AUDIT (QA only).
 *
 * Deterministic invariant checks over the frozen pre-tournament baseline (the
 * 11 Jun 2026 source-backed FIFA ranking + Elo snapshots + the official schedule).
 * Tests assert INVARIANTS ONLY - never exact probabilities or ordering - so a
 * harmless future model-input change cannot make them fail. Real numbers live in
 * the generated docs/FORECAST_BEHAVIOR_AUDIT.md (run with WRITE_FORECAST_AUDIT=1).
 *
 * No model/weights/data changes; nothing here uses the current system date,
 * updated rankings, or completed match results.
 */

const SEED = SIMULATION_CONFIG.defaultSeed; // 20260611 (frozen baseline seed)
const ITERATIONS = SIMULATION_CONFIG.defaultIterations; // 2000
const STAGE_KEYS = [
  "roundOf32", "roundOf16", "quarterFinal", "semiFinal", "final", "winner",
] as const;

/* -------------------------------------------------------------------------- */
/* Audit-only helpers (reuse production scoring; no production change)         */
/* -------------------------------------------------------------------------- */

/** Net Elo advantage of A over B (same definition the simulator uses). */
const netAdvantage = (a: TeamFeatureSet, b: TeamFeatureSet): number =>
  computeDrivers(a, b).reduce((s, d) => s + d.contribution, 0);

/**
 * Audit-only group-winner probability: P(team finishes 1st in its group),
 * simulating each group's six official fixtures with a fixed seed and ranking via
 * the production Article-13 standings code. This is NOT qualifyTop2.
 */
function simulateGroupWinners(seed: number, iterations: number) {
  const rng = createRng(seed);
  const feat = new Map(teams.map((t) => [t.id, buildFeatureSet(t)] as const));
  const teamMeta = getTeamMeta();
  const out = new Map<string, Record<string, number>>();

  for (const group of groups) {
    const fixtures = getFixturesForGroup(group.id);
    const wins = new Map<string, number>(group.teamIds.map((id) => [id, 0]));
    for (let i = 0; i < iterations; i++) {
      const results: MatchResult[] = fixtures.map((f) => {
        const lambdas = expectedGoalsFromAdvantage(
          netAdvantage(feat.get(f.homeTeamId)!, feat.get(f.awayTeamId)!),
        );
        return {
          homeTeamId: f.homeTeamId,
          awayTeamId: f.awayTeamId,
          homeGoals: samplePoisson(rng, lambdas.home),
          awayGoals: samplePoisson(rng, lambdas.away),
        };
      });
      const standings = computeGroupStandings(group.id, group.teamIds, results, teamMeta);
      const winner = standings.find((s) => s.rank === 1)!.teamId;
      wins.set(winner, (wins.get(winner) ?? 0) + 1);
    }
    out.set(
      group.id,
      Object.fromEntries([...wins].map(([id, n]) => [id, n / iterations])),
    );
  }
  return out;
}

/** Method A: SIGNED NET contribution by status for a single match (A vs B). */
function netContributionByStatus(homeId: string, awayId: string): Record<string, number> {
  const drivers = computeDrivers(buildFeatureSet(getTeam(homeId)), buildFeatureSet(getTeam(awayId)));
  const acc: Record<string, number> = {};
  for (const d of drivers) {
    const s = (d.status ?? "unknown") as string;
    acc[s] = (acc[s] ?? 0) + d.contribution;
  }
  return acc;
}

/** Method B: ABSOLUTE MAGNITUDE contribution by status, aggregated over fixtures. */
function absContributionByStatus(
  pairs: { homeTeamId: string; awayTeamId: string }[],
): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const f of pairs) {
    const drivers = computeDrivers(buildFeatureSet(getTeam(f.homeTeamId)), buildFeatureSet(getTeam(f.awayTeamId)));
    for (const d of drivers) {
      const s = (d.status ?? "unknown") as string;
      acc[s] = (acc[s] ?? 0) + Math.abs(d.contribution);
    }
  }
  return acc;
}

const allGroupFixtures = () => groups.flatMap((g) => getFixturesForGroup(g.id));
const finite = (x: number) => Number.isFinite(x);

/* -------------------------------------------------------------------------- */
/* Invariant tests                                                            */
/* -------------------------------------------------------------------------- */

describe("forecast behaviour audit - determinism & finiteness", () => {
  it("is deterministic for a fixed seed (identical stage probabilities)", () => {
    const a = runTournamentSimulation({ iterations: 400, seed: SEED });
    const b = runTournamentSimulation({ iterations: 400, seed: SEED });
    expect(b.stageProbabilities).toEqual(a.stageProbabilities);
  });

  it("produces only finite stage probabilities (no NaN/Infinity)", () => {
    const snap = runTournamentSimulation({ iterations: 400, seed: SEED });
    for (const p of snap.stageProbabilities) {
      for (const k of STAGE_KEYS) expect(finite(p[k])).toBe(true);
      expect(finite(p.qualifyTop2)).toBe(true);
      expect(finite(p.qualifyThird)).toBe(true);
    }
  });
});

describe("forecast behaviour audit - probability bounds & sums", () => {
  const snap = runTournamentSimulation({ iterations: ITERATIONS, seed: SEED });

  it("keeps every stage probability in [0,1]", () => {
    for (const p of snap.stageProbabilities) {
      for (const k of STAGE_KEYS) {
        expect(p[k]).toBeGreaterThanOrEqual(0);
        expect(p[k]).toBeLessThanOrEqual(1);
      }
    }
  });

  it("respects the stage funnel (later stages never more likely)", () => {
    for (const p of snap.stageProbabilities) {
      expect(p.roundOf32).toBeGreaterThanOrEqual(p.roundOf16 - 1e-9);
      expect(p.roundOf16).toBeGreaterThanOrEqual(p.quarterFinal - 1e-9);
      expect(p.quarterFinal).toBeGreaterThanOrEqual(p.semiFinal - 1e-9);
      expect(p.semiFinal).toBeGreaterThanOrEqual(p.final - 1e-9);
      expect(p.final).toBeGreaterThanOrEqual(p.winner - 1e-9);
    }
  });

  it("has winner probabilities summing to ~1 (one champion per run)", () => {
    const total = snap.stageProbabilities.reduce((s, p) => s + p.winner, 0);
    expect(total).toBeGreaterThan(0.98);
    expect(total).toBeLessThan(1.02);
  });

  it("has ~32 teams reaching the round of 32 and ~2 top-two per group", () => {
    const r32 = snap.stageProbabilities.reduce((s, p) => s + p.roundOf32, 0);
    expect(r32).toBeGreaterThan(31.5);
    expect(r32).toBeLessThan(32.5);
    const byTeam = new Map(snap.stageProbabilities.map((p) => [p.teamId, p]));
    for (const g of groups) {
      const top2 = g.teamIds.reduce((s, id) => s + (byTeam.get(id)?.qualifyTop2 ?? 0), 0);
      expect(top2).toBeGreaterThan(1.8);
      expect(top2).toBeLessThan(2.2);
    }
  });
});

describe("forecast behaviour audit - match predictions", () => {
  it("W/D/L sums to ~1 and scorelines stay in [0,1] for sampled fixtures", () => {
    for (const g of groups) {
      for (const f of getFixturesForGroup(g.id)) {
        const p = predictMatch(getTeam(f.homeTeamId), getTeam(f.awayTeamId));
        const total = p.homeWin + p.draw + p.awayWin;
        expect(finite(total)).toBe(true);
        expect(total).toBeGreaterThan(0.98);
        expect(total).toBeLessThan(1.02);
        for (const s of p.topScorelines) {
          expect(s.probability).toBeGreaterThanOrEqual(0);
          expect(s.probability).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe("forecast behaviour audit - placeholder caps bind", () => {
  it("each placeholder driver <= per-driver cap and total <= aggregate cap", () => {
    for (const f of allGroupFixtures()) {
      const drivers = computeDrivers(buildFeatureSet(getTeam(f.homeTeamId)), buildFeatureSet(getTeam(f.awayTeamId)));
      const placeholders = drivers.filter((d) => d.status === "placeholder");
      for (const d of placeholders) {
        expect(Math.abs(d.contribution)).toBeLessThanOrEqual(PLACEHOLDER_CONTRIBUTION_CAP + 1e-9);
      }
      const total = placeholders.reduce((s, d) => s + d.contribution, 0);
      expect(Math.abs(total)).toBeLessThanOrEqual(TOTAL_PLACEHOLDER_CONTRIBUTION_CAP + 1e-9);
    }
  });
});

describe("forecast behaviour audit - provenance disclosure", () => {
  it("FIFA-ranking and Elo drivers are both source-backed", () => {
    const drivers = computeDrivers(buildFeatureSet(getTeam("argentina")), buildFeatureSet(getTeam("new-zealand")));
    expect(drivers.find((d) => d.family === "fifaRanking")?.status).toBe("source-backed");
    expect(drivers.find((d) => d.family === "eloRating")?.status).toBe("source-backed");
    expect(getFeatureStatus("fifaRanking")).toBe("source-backed");
    expect(getFeatureStatus("eloRating")).toBe("source-backed");
  });

  it("the resolver still serves the official schedule", () => {
    expect(fixtureSource).toBe("official");
  });
});

describe("forecast behaviour audit - audit-only group-winner sim", () => {
  it("each group's P(win) values are finite, in [0,1], and sum to ~1", () => {
    const winners = simulateGroupWinners(SEED, 600);
    expect(winners.size).toBe(12);
    for (const g of groups) {
      const probs = winners.get(g.id)!;
      expect(Object.keys(probs)).toHaveLength(4);
      let sum = 0;
      for (const v of Object.values(probs)) {
        expect(finite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        sum += v;
      }
      expect(sum).toBeCloseTo(1, 6);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Guarded audit-doc generator (writes only when WRITE_FORECAST_AUDIT=1)       */
/* -------------------------------------------------------------------------- */

describe("forecast behaviour audit - doc generation", () => {
  it("writes docs/FORECAST_BEHAVIOR_AUDIT.md when WRITE_FORECAST_AUDIT=1", () => {
    if (process.env.WRITE_FORECAST_AUDIT !== "1") return; // CI: assert-only, no write

    const snap = runTournamentSimulation({ iterations: ITERATIONS, seed: SEED });
    const byWinner = [...snap.stageProbabilities].sort((a, b) => b.winner - a.winner);
    const byR16 = [...snap.stageProbabilities].sort((a, b) => b.roundOf16 - a.roundOf16);
    const winners = simulateGroupWinners(SEED, 4000);
    const name = (id: string) => getTeam(id).name;

    const LABEL = "Frozen pre-tournament baseline forecast, using information available at tournament start.";
    const STATUS_ORDER: (ModelInputStatus | string)[] = [
      "source-backed", "manual", "verified", "candidate", "placeholder",
    ];

    const topTable = (rows: typeof byWinner, key: "winner" | "roundOf16") =>
      ["| # | Team | " + (key === "winner" ? "Title" : "Reach R16") + " |", "|--:|---|--:|"]
        .concat(rows.slice(0, 10).map((p, i) => `| ${i + 1} | ${name(p.teamId)} | ${pct(p[key], 1)} |`))
        .join("\n");

    const groupWinnerLines = groups
      .map((g) => {
        const probs = winners.get(g.id)!;
        const ranked = Object.entries(probs).sort((a, b) => b[1] - a[1]);
        return `- **Group ${g.id}:** ` + ranked.map(([id, v]) => `${name(id)} ${pct(v, 0)}`).join(" · ");
      })
      .join("\n");

    // Sample scheduled (not played) matches - one per a few groups.
    const sampleFixtures = ["A", "C", "F", "J", "L"].map((gid) => getFixturesForGroup(gid as never)[0]!);
    const sampleMatchLines = sampleFixtures
      .map((f) => {
        const p = predictMatch(getTeam(f.homeTeamId), getTeam(f.awayTeamId));
        return `| M${f.matchNumber} | ${name(f.homeTeamId)} v ${name(f.awayTeamId)} | ${pct(p.homeWin, 0)} / ${pct(p.draw, 0)} / ${pct(p.awayWin, 0)} |`;
      })
      .join("\n");

    const netByStatusTable = (() => {
      const f = sampleFixtures[0]!;
      const acc = netContributionByStatus(f.homeTeamId, f.awayTeamId);
      const rows = STATUS_ORDER.filter((s) => s in acc).map(
        (s) => `| ${s} | ${round(acc[s as string]!, 1)} |`,
      );
      return { fixture: f, body: rows.join("\n") };
    })();

    const absByStatus = absContributionByStatus(allGroupFixtures());
    const absTotal = Object.values(absByStatus).reduce((s, v) => s + v, 0);
    const absRows = STATUS_ORDER.filter((s) => s in absByStatus)
      .map((s) => `| ${s} | ${round(absByStatus[s as string]!, 0)} | ${pct(absByStatus[s as string]! / absTotal, 1)} |`)
      .join("\n");

    const placeholderMax = Math.max(
      ...allGroupFixtures().map((f) => {
        const ph = computeDrivers(buildFeatureSet(getTeam(f.homeTeamId)), buildFeatureSet(getTeam(f.awayTeamId)))
          .filter((d) => d.status === "placeholder");
        return Math.abs(ph.reduce((s, d) => s + d.contribution, 0));
      }),
    );

    const md = `# Forecast Behaviour Audit (Phase 1.9, extended in Phase 1.10)

> **${LABEL}**
>
> Probabilities are **not** conditioned on any match played after 11 Jun 2026 and
> are **not** compared to actual 2026 outcomes. Sample matches below are
> **scheduled fixtures, not played**.

## 1. Scope - baseline vs live model

- **Baseline model (this audit):** uses information available at tournament start -
  the **11 Jun 2026** source-backed FIFA ranking + Elo rating snapshots, the
  **World Bank WDI 2024** structural prior (now \`candidate\`: 46 teams source-backed,
  England/Scotland manual), capped placeholders, and the official schedule.
- **Live model (future phase):** will ingest completed match results and update
  standings / conditional probabilities. **Not** part of this baseline audit.

Deterministic seed \`${SEED}\`, ${ITERATIONS} iterations (Monte Carlo). Re-running
with the same seed yields identical probabilities (asserted in
\`tests/forecast-behavior.test.ts\`). The snapshot timestamp is intentionally
omitted (audit must not depend on the current date).

## 2. Model-input status summary

| Family | Status | In model |
|---|---|---|
| Elo rating | **source-backed** (11 Jun 2026 snapshot) | anchor (weight 1.0) |
| FIFA ranking | **source-backed** (11 Jun 2026 snapshot) | rank driver (cap +/-90) |
| Structural (GDP+pop) | candidate (46 World Bank source-backed; England/Scotland manual) | weak prior (<=10) |
| Squad quality / Recent form / Climate | placeholder | **weight-capped** |
| Host / Regional / Manager | verified / candidate | structural flags |

Placeholder caps: per-driver +/-${PLACEHOLDER_CONTRIBUTION_CAP}, aggregate
+/-${TOTAL_PLACEHOLDER_CONTRIBUTION_CAP} Elo-equivalent pts.

## 3. Top-level probability snapshot

**Top 10 title probability**

${topTable(byWinner, "winner")}

**Top 10 reach round-of-16**

${topTable(byR16, "roundOf16")}

**Group-winner probability** (audit-only sim: P(finish 1st), seed \`${SEED}\`, 4000
iters per group; ranks via the production Article-13 standings - this is NOT
qualifyTop2):

${groupWinnerLines}

**Sample scheduled matches** (W / D / L for the home side; not played)

| Match | Fixture | Home win / Draw / Away win |
|---|---|---|
${sampleMatchLines}

## 4. Contribution-by-status (two explicitly separate methods)

**Method A - signed net contribution per match** (directional, single match
${name(netByStatusTable.fixture.homeTeamId)} v ${name(netByStatusTable.fixture.awayTeamId)}; Elo-equivalent pts, + favours home):

| Status | Signed net |
|---|--:|
${netByStatusTable.body}

**Method B - absolute contribution magnitude, aggregated over all 72 group
fixtures** (overall influence; sum of |contribution| by status):

| Status | Abs magnitude | Share |
|---|--:|--:|
${absRows}

## 5. Sanity-check results (invariants - all PASS)

- Deterministic for a fixed seed; no NaN/Infinity anywhere.
- Every stage probability in [0,1]; stage funnel monotone (R32 >= R16 >= QF >= SF >= Final >= Winner).
- Winner probabilities sum to ~1; ~32 teams reach R32; each group's top-two sums to ~2.
- Match W/D/L sums to ~1; group-winner P(win) per group sums to ~1.
- Placeholder caps bind: max placeholder net magnitude over all fixtures =
  ${round(placeholderMax, 1)} pts (<= ${TOTAL_PLACEHOLDER_CONTRIBUTION_CAP}).
- Elo and FIFA-ranking drivers are both \`source-backed\`; \`fixtureSource === "official"\`.

## 6. Finding - the forecast is now anchored by a source-backed input

Method B shows **source-backed** contribution magnitude now dominates: with Elo
promoted to source-backed (Phase 1.10), both the high-influence Elo anchor and the
capped FIFA-ranking driver come from cited 11 Jun 2026 snapshots. The weak
structural prior moved from \`manual\` to **\`candidate\`** in Phase 1.12 (46 teams
source-backed from the World Bank WDI 2024; England/Scotland remain manual), so
\`manual\` all but disappears from the status mix. The forecast is therefore anchored
by a **source-backed** input - a provenance/credibility improvement over the Phase
1.9 baseline, where manual Elo dominated. This is a status-mix shift only: **no
model weights were changed**, so the relative magnitude of Elo vs FIFA ranking is
unchanged (Elo still spans hundreds of Elo-equivalent pts while FIFA ranking is
capped at +/-90). That Elo still out-influences FIFA ranking is a **modelling /
calibration consideration, not a defect**.

## 7. Recommendation

Probabilities are sane, finite, deterministic, explainable, and not silently
distorted (placeholders are capped and disclosed). The main inputs are now
source-backed. The remaining open item is **calibration**: run a separate phase to
decide how the (now source-backed) Elo anchor and the source-backed FIFA ranking
should be balanced, rather than letting one input dominate by construction. No
model weights were changed in this phase.

---
_Regenerate with \`WRITE_FORECAST_AUDIT=1 npx vitest run tests/forecast-behavior.test.ts\`._
`;

    writeFileSync(resolve(process.cwd(), "docs/FORECAST_BEHAVIOR_AUDIT.md"), md);
    expect(md).toContain("Frozen pre-tournament baseline");
  });
});
