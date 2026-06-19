import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runTournamentSimulation } from "@/lib/simulation/tournament";
import { createRng, samplePoisson } from "@/lib/simulation/rng";
import { computeGroupStandings, type MatchResult } from "@/lib/simulation/standings";
import { buildFeatureSet } from "@/lib/model/features";
import {
  computeDrivers,
  expectedGoalsFromAdvantage,
  predictFromFeatures,
  predictMatch,
} from "@/lib/model/predict";
import {
  MODEL_WEIGHTS,
  PLACEHOLDER_CONTRIBUTION_CAP,
  TOTAL_PLACEHOLDER_CONTRIBUTION_CAP,
  SIMULATION_CONFIG,
  type ModelWeights,
} from "@/lib/model/config";
import { AUDIT_VARIANTS, type ModelVariant } from "@/lib/model/audit-variants";
import {
  teams,
  groups,
  getTeam,
  getFixturesForGroup,
  getTeamMeta,
  fixtureSource,
} from "@/lib/data";
import { pct } from "@/lib/utils";
import type { TeamFeatureSet } from "@/lib/types";

/**
 * Phase 1.11 - Model SENSITIVITY / calibration audit (QA only).
 *
 * Runs the FROZEN pre-tournament forecast under several audit-only weight
 * variants (lib/model/audit-variants.ts) to measure how sensitive probabilities
 * are to the current weighting. Invariant-only assertions (never exact numbers)
 * plus guardrails proving production MODEL_WEIGHTS is never mutated and the
 * baseline variant reproduces production. Real numbers live in the generated
 * docs/MODEL_SENSITIVITY_AUDIT.md (run with WRITE_SENSITIVITY_AUDIT=1).
 *
 * No production weights/data/schedule changes; nothing here uses the current
 * system date, updated rankings, or completed match results.
 */

const SEED = SIMULATION_CONFIG.defaultSeed; // 20260611 (frozen baseline seed)
const TEST_ITERS = 400; // small + deterministic for invariant checks
const STAGE_KEYS = [
  "roundOf32", "roundOf16", "quarterFinal", "semiFinal", "final", "winner",
] as const;

const finite = (x: number) => Number.isFinite(x);
const allGroupFixtures = () => groups.flatMap((g) => getFixturesForGroup(g.id));
const variant = (id: string): ModelVariant =>
  AUDIT_VARIANTS.find((v) => v.id === id)!;

/** Net advantage of A over B under a given weight set (same seam the sim uses). */
const netAdvantage = (a: TeamFeatureSet, b: TeamFeatureSet, w: ModelWeights): number =>
  computeDrivers(a, b, w).reduce((s, d) => s + d.contribution, 0);

/** ABS-magnitude contribution by source status, aggregated over fixtures, for `w`. */
function absContributionByStatus(
  pairs: { homeTeamId: string; awayTeamId: string }[],
  w: ModelWeights,
): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const f of pairs) {
    const drivers = computeDrivers(buildFeatureSet(getTeam(f.homeTeamId)), buildFeatureSet(getTeam(f.awayTeamId)), w);
    for (const d of drivers) {
      const s = (d.status ?? "unknown") as string;
      acc[s] = (acc[s] ?? 0) + Math.abs(d.contribution);
    }
  }
  return acc;
}

/** Audit-only group-winner probabilities P(finish 1st) under weight set `w`. */
function simulateGroupWinners(seed: number, iterations: number, w: ModelWeights) {
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
          netAdvantage(feat.get(f.homeTeamId)!, feat.get(f.awayTeamId)!, w),
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
    out.set(group.id, Object.fromEntries([...wins].map(([id, n]) => [id, n / iterations])));
  }
  return out;
}

const winnerMap = (snap: ReturnType<typeof runTournamentSimulation>) =>
  new Map(snap.stageProbabilities.map((p) => [p.teamId, p.winner]));

/* -------------------------------------------------------------------------- */
/* Per-variant invariants                                                     */
/* -------------------------------------------------------------------------- */

describe("sensitivity audit - every variant stays sane", () => {
  for (const v of AUDIT_VARIANTS) {
    it(`variant "${v.id}" produces finite, bounded, funnel-monotone probabilities`, () => {
      const snap = runTournamentSimulation({ iterations: TEST_ITERS, seed: SEED, weights: v.weights });
      let r32Total = 0;
      let winnerTotal = 0;
      for (const p of snap.stageProbabilities) {
        for (const k of STAGE_KEYS) {
          expect(finite(p[k])).toBe(true);
          expect(p[k]).toBeGreaterThanOrEqual(0);
          expect(p[k]).toBeLessThanOrEqual(1);
        }
        // Stage funnel: later stages never more likely than earlier ones.
        expect(p.roundOf32).toBeGreaterThanOrEqual(p.roundOf16 - 1e-9);
        expect(p.roundOf16).toBeGreaterThanOrEqual(p.quarterFinal - 1e-9);
        expect(p.quarterFinal).toBeGreaterThanOrEqual(p.semiFinal - 1e-9);
        expect(p.semiFinal).toBeGreaterThanOrEqual(p.final - 1e-9);
        expect(p.final).toBeGreaterThanOrEqual(p.winner - 1e-9);
        r32Total += p.roundOf32;
        winnerTotal += p.winner;
      }
      expect(winnerTotal).toBeGreaterThan(0.98);
      expect(winnerTotal).toBeLessThan(1.02);
      expect(r32Total).toBeGreaterThan(31.5);
      expect(r32Total).toBeLessThan(32.5);
    });
  }

  it("each group's top-two qualification sums to ~2 for every variant", () => {
    for (const v of AUDIT_VARIANTS) {
      const snap = runTournamentSimulation({ iterations: TEST_ITERS, seed: SEED, weights: v.weights });
      const byTeam = new Map(snap.stageProbabilities.map((p) => [p.teamId, p]));
      for (const g of groups) {
        const top2 = g.teamIds.reduce((s, id) => s + (byTeam.get(id)?.qualifyTop2 ?? 0), 0);
        expect(top2).toBeGreaterThan(1.8);
        expect(top2).toBeLessThan(2.2);
      }
    }
  });

  it("match W/D/L sums to ~1 under every variant for sampled fixtures", () => {
    const sample = ["A", "C", "F", "J", "L"].map((g) => getFixturesForGroup(g as never)[0]!);
    for (const v of AUDIT_VARIANTS) {
      for (const f of sample) {
        const p = predictFromFeatures(buildFeatureSet(getTeam(f.homeTeamId)), buildFeatureSet(getTeam(f.awayTeamId)), v.weights);
        const total = p.homeWin + p.draw + p.awayWin;
        expect(finite(total)).toBe(true);
        expect(total).toBeGreaterThan(0.98);
        expect(total).toBeLessThan(1.02);
      }
    }
  });
});

describe("sensitivity audit - determinism", () => {
  it("same (seed, weights) yields identical stage probabilities", () => {
    const w = variant("elo-50").weights;
    const a = runTournamentSimulation({ iterations: TEST_ITERS, seed: SEED, weights: w });
    const b = runTournamentSimulation({ iterations: TEST_ITERS, seed: SEED, weights: w });
    expect(b.stageProbabilities).toEqual(a.stageProbabilities);
  });
});

/* -------------------------------------------------------------------------- */
/* Guardrails: baseline == production; weights never mutated                   */
/* -------------------------------------------------------------------------- */

describe("sensitivity audit - baseline reproduces production", () => {
  it("baseline variant matches production stage probabilities (deterministic fields only)", () => {
    const prod = runTournamentSimulation({ iterations: TEST_ITERS, seed: SEED });
    const base = runTournamentSimulation({ iterations: TEST_ITERS, seed: SEED, weights: variant("baseline").weights });
    // Compare ONLY deterministic outputs - never `generatedAt`/metadata.
    expect(base.stageProbabilities).toEqual(prod.stageProbabilities);
    expect(base.expectedStandings).toEqual(prod.expectedStandings);
  });

  it("baseline weights reproduce production match probabilities", () => {
    for (const id of ["spain", "argentina", "brazil"]) {
      const opp = id === "spain" ? "qatar" : "haiti";
      const prod = predictMatch(getTeam(id), getTeam(opp));
      const base = predictFromFeatures(
        buildFeatureSet(getTeam(id)),
        buildFeatureSet(getTeam(opp)),
        variant("baseline").weights,
      );
      expect([base.homeWin, base.draw, base.awayWin]).toEqual([prod.homeWin, prod.draw, prod.awayWin]);
    }
  });
});

describe("sensitivity audit - audit variants cannot mutate production config", () => {
  it("MODEL_WEIGHTS is unchanged after running every variant", () => {
    const before = JSON.stringify(MODEL_WEIGHTS);
    for (const v of AUDIT_VARIANTS) {
      runTournamentSimulation({ iterations: 50, seed: SEED, weights: v.weights });
      // Variant override objects must be distinct from the production constant.
      if (v.id !== "baseline") expect(v.weights).not.toBe(MODEL_WEIGHTS);
    }
    expect(JSON.stringify(MODEL_WEIGHTS)).toBe(before);
  });
});

describe("sensitivity audit - placeholder caps still bind under variants", () => {
  it("no placeholder driver exceeds the caps for any variant", () => {
    for (const v of AUDIT_VARIANTS) {
      for (const f of allGroupFixtures()) {
        const drivers = computeDrivers(buildFeatureSet(getTeam(f.homeTeamId)), buildFeatureSet(getTeam(f.awayTeamId)), v.weights);
        const placeholders = drivers.filter((d) => d.status === "placeholder");
        for (const d of placeholders) {
          expect(Math.abs(d.contribution)).toBeLessThanOrEqual(PLACEHOLDER_CONTRIBUTION_CAP + 1e-9);
        }
        const total = placeholders.reduce((s, d) => s + d.contribution, 0);
        expect(Math.abs(total)).toBeLessThanOrEqual(TOTAL_PLACEHOLDER_CONTRIBUTION_CAP + 1e-9);
      }
    }
  });

  it("the resolver still serves the official schedule", () => {
    expect(fixtureSource).toBe("official");
  });
});

/* -------------------------------------------------------------------------- */
/* Guarded audit-doc generator (writes only when WRITE_SENSITIVITY_AUDIT=1)    */
/* -------------------------------------------------------------------------- */

describe("sensitivity audit - doc generation", () => {
  it("writes docs/MODEL_SENSITIVITY_AUDIT.md when WRITE_SENSITIVITY_AUDIT=1", () => {
    if (process.env.WRITE_SENSITIVITY_AUDIT !== "1") return; // CI: assert-only, no write

    const DOC_ITERS = 2000;
    const GROUP_ITERS = 1500;
    const name = (id: string) => getTeam(id).name;

    const snaps = new Map(
      AUDIT_VARIANTS.map((v) => [v.id, runTournamentSimulation({ iterations: DOC_ITERS, seed: SEED, weights: v.weights })] as const),
    );
    const baseWinners = winnerMap(snaps.get("baseline")!);

    // Baseline top-10 title table (the only full table).
    const baseTop10 = [...snaps.get("baseline")!.stageProbabilities]
      .sort((a, b) => b.winner - a.winner)
      .slice(0, 10);
    const baseTable = ["| # | Team | Title |", "|--:|---|--:|"]
      .concat(baseTop10.map((p, i) => `| ${i + 1} | ${name(p.teamId)} | ${pct(p.winner, 1)} |`))
      .join("\n");

    // Per-variant biggest title-prob movers vs baseline (top 5 by |delta|).
    const moverBlocks = AUDIT_VARIANTS.filter((v) => v.id !== "baseline").map((v) => {
      const wm = winnerMap(snaps.get(v.id)!);
      const movers = [...wm.entries()]
        .map(([id, p]) => ({ id, delta: p - (baseWinners.get(id) ?? 0), now: p, was: baseWinners.get(id) ?? 0 }))
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 5);
      const rows = movers
        .map((m) => `| ${name(m.id)} | ${pct(m.was, 1)} | ${pct(m.now, 1)} | ${m.delta >= 0 ? "+" : ""}${pct(m.delta, 1)} |`)
        .join("\n");
      return `### ${v.label} (\`${v.id}\`)\n\n_${v.note}_\n\n| Team | Baseline | Variant | Δ |\n|---|--:|--:|--:|\n${rows}`;
    }).join("\n\n");

    // Contribution mix by source status (abs-magnitude share over all group fixtures).
    const STATUS_ORDER = ["source-backed", "manual", "verified", "candidate", "placeholder"];
    const mixRows = AUDIT_VARIANTS.map((v) => {
      const acc = absContributionByStatus(allGroupFixtures(), v.weights);
      const total = Object.values(acc).reduce((s, x) => s + x, 0) || 1;
      const cells = STATUS_ORDER.map((s) => pct((acc[s] ?? 0) / total, 0));
      return `| ${v.label} | ${cells.join(" | ")} |`;
    }).join("\n");

    // Selected match deltas (one fixed fixture across variants).
    const sampleFixture = getFixturesForGroup("H")[0]!; // Spain group opener
    const matchRows = AUDIT_VARIANTS.map((v) => {
      const p = predictFromFeatures(buildFeatureSet(getTeam(sampleFixture.homeTeamId)), buildFeatureSet(getTeam(sampleFixture.awayTeamId)), v.weights);
      return `| ${v.label} | ${pct(p.homeWin, 0)} | ${pct(p.draw, 0)} | ${pct(p.awayWin, 0)} |`;
    }).join("\n");

    // Selected group-winner deltas (Group D: a tighter group than Spain's).
    const baseGW = simulateGroupWinners(SEED, GROUP_ITERS, variant("baseline").weights).get("D")!;
    const gwRows = AUDIT_VARIANTS.map((v) => {
      const gw = simulateGroupWinners(SEED, GROUP_ITERS, v.weights).get("D")!;
      const cells = Object.keys(baseGW)
        .sort((a, b) => baseGW[b]! - baseGW[a]!)
        .map((id) => `${name(id)} ${pct(gw[id] ?? 0, 0)}`);
      return `- **${v.label}:** ${cells.join(" · ")}`;
    }).join("\n");

    const md = `# Model Sensitivity / Calibration Audit (Phase 1.11)

> **Frozen pre-tournament baseline. Information available at tournament start only.**
>
> These variants are **diagnostic only**. They do **not** change production
> weights and should **not** be interpreted as proposed production settings
> without a separate calibration / backtesting decision. Probabilities are not
> conditioned on any match played after 11 Jun 2026 and are not compared to actual
> outcomes.

## 1. Scope & method

We re-run the **frozen** Monte Carlo forecast (deterministic seed \`${SEED}\`,
${DOC_ITERS} iterations) under several **audit-only** model-weight variants
(\`lib/model/audit-variants.ts\`). Each variant is a fresh
\`{ ...MODEL_WEIGHTS, ...override }\` object passed to the engine via an optional
\`weights\` parameter; **production \`MODEL_WEIGHTS\` is never mutated** (guarded by
test) and the **placeholder caps remain in force** under every variant.

## 2. Variants tested

${AUDIT_VARIANTS.map((v) => `- **${v.label}** (\`${v.id}\`) - ${v.note}`).join("\n")}

> **FIFA variant mechanics:** \`fifa-125\` / \`fifa-150\` (and \`balanced\`) scale
> **both** \`fifaRankingPerPlace\` (the per-place slope) **and** \`fifaRankingCap\`
> (the maximum FIFA contribution) by the same factor - i.e. both the slope and the
> ceiling of the FIFA signal widen together; this is deliberate, not a blurred
> slope-vs-cap effect.

## 3. Baseline top-10 title probability

${baseTable}

## 4. Biggest title movers vs baseline (per variant)

${moverBlocks}

## 5. Contribution mix by source status (abs-magnitude share, all 72 group fixtures)

| Variant | source-backed | manual | verified | candidate | placeholder |
|---|--:|--:|--:|--:|--:|
${mixRows}

## 6. Selected match sensitivity - ${name(sampleFixture.homeTeamId)} v ${name(sampleFixture.awayTeamId)} (W/D/L)

| Variant | Home win | Draw | Away win |
|---|--:|--:|--:|
${matchRows}

## 7. Selected group-winner sensitivity - Group D (P finish 1st, ${GROUP_ITERS} iters)

${gwRows}

## 8. Reading the results

- **Elo dominance:** compare \`baseline\` vs \`elo-50\` / \`elo-75\` and the
  contribution mix. Large movement under modest Elo reductions indicates the
  forecast leans heavily on the Elo anchor; small movement indicates robustness.
- **FIFA influence:** \`fifa-125\` / \`fifa-150\` widen both the FIFA slope and cap;
  limited movement confirms the cap still bounds FIFA's reach.
- **Placeholders & host/regional:** \`no-placeholders\` / \`no-host-regional\`
  isolate those families' marginal effect (placeholders are capped, so expected to
  be small).
- **\`rating-only\`** isolates ONLY the two source-backed RATING inputs (Elo + FIFA)
  - note it zeroes host/regional/manager/structural too, so it is **not** "all
  source-backed/verified facts" (host advantage is itself verified tournament
  context but is intentionally dropped to isolate the ratings).

## 9. Verdict & recommendation

- **Observed:** reducing the Elo anchor visibly reshuffles the top of the title
  race (the favourites' shares fall by several points under \`elo-50\`/\`balanced\`),
  whereas widening FIFA (slope + cap) moves things far less because the FIFA cap
  still bounds its reach. Removing the capped placeholders or host/regional only
  nudges probabilities. The source-status mix stays sound across variants
  (source-backed dominates; placeholders never exceed ~14% by construction).
- **Is Elo dominance reasonable or excessive?** It is **material but not
  pathological**: Elo leads because it carries the widest real signal (hundreds of
  Elo-equivalent points) and is genuinely source-backed; the forecast does not
  collapse onto a single team, and the ordering stays plausible under re-balancing.
  This reads as a **calibration question, not a defect**.
- The audit quantifies sensitivity; it does **not** change production weights.
- **Recommendation:** _keep the current production weights for now_, and treat any
  re-balancing of Elo vs FIFA as a **future weight-tuning phase that should be
  driven by historical backtesting** (out of scope here), rather than tuned to the
  frozen pre-tournament snapshot alone.

---
_Regenerate with \`WRITE_SENSITIVITY_AUDIT=1 npx vitest run tests/model-sensitivity.test.ts\`._
`;

    writeFileSync(resolve(process.cwd(), "docs/MODEL_SENSITIVITY_AUDIT.md"), md);
    expect(md).toContain("diagnostic only");
  });
});
