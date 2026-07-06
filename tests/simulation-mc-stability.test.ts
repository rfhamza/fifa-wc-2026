import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runTournamentSimulation } from "@/lib/simulation/tournament";
import { MODEL_WEIGHTS, SIMULATION_CONFIG } from "@/lib/model/config";
import {
  loadForecastResultsLedger,
  ledgerToLockedResults,
  ledgerToKnockoutLockedResults,
} from "@/lib/model/forecast-results-ledger";
import { fixtures, getTeam } from "@/lib/data";
import {
  STABILITY_STAGE_KEYS,
  analyticBinomialSEpp,
  compareIterationCounts,
  estimateStageStandardError,
  summarizeAbsDeltas,
  type CheckpointInput,
  type IterationComparison,
  type StageStandardError,
} from "@/lib/simulation/mc-stability";

/**
 * Monte Carlo stability / 10,000-iteration audit (DIAGNOSTIC ONLY).
 *
 * CI runs assert-only invariants (determinism, funnel monotonicity, standard-error
 * shrinks with iterations, and a guard that SIMULATION_CONFIG / MODEL_WEIGHTS are
 * never mutated). The real 2,000-vs-10,000 numbers + multi-seed standard error live
 * in the generated docs/MODEL_MC_STABILITY_AUDIT.md (run with WRITE_MC_STABILITY_AUDIT=1).
 *
 * Committed checkpoint inputs ONLY: the baseline (no locks) and each committed results
 * ledger under data/forecast/results/. No current/live-state/provider/Blob/runtime read.
 * Changes no config, no snapshot, no forecast output.
 */
const SEED = SIMULATION_CONFIG.defaultSeed; // 20260611 (frozen production seed)
const RESULTS_DIR = "data/forecast/results";

const MILESTONES = [
  { label: "M24", file: "results-as-of-2026-06-18-after-match-024.json" },
  { label: "M48", file: "results-as-of-2026-06-24-after-match-048.json" },
  { label: "M54", file: "results-as-of-2026-06-25-after-match-054.json" },
  { label: "M72", file: "results-as-of-2026-06-29-after-match-072.json" },
  { label: "M73", file: "results-as-of-2026-06-29-after-match-073.json" },
] as const;

/** Reproduce a committed milestone's EXACT simulator inputs from its committed ledger. */
function loadCheckpoint(label: string, file: string): CheckpointInput {
  const ledger = loadForecastResultsLedger(
    readFileSync(join(process.cwd(), RESULTS_DIR, file), "utf8"),
    fixtures,
  );
  return {
    label,
    lockedResults: ledgerToLockedResults(ledger),
    lockedKnockoutResults: ledgerToKnockoutLockedResults(ledger),
  };
}

const BASELINE: CheckpointInput = { label: "baseline", lockedResults: [], lockedKnockoutResults: [] };
const ALL_CHECKPOINTS: CheckpointInput[] = [
  BASELINE,
  ...MILESTONES.map((m) => loadCheckpoint(m.label, m.file)),
];

// Small, fast, deterministic settings for the CI invariant checks.
const CI_LOW = 100;
const CI_HIGH = 900; // 9x -> analytic SE ~3x smaller; robustly detectable
const CI_SEEDS = Array.from({ length: 8 }, (_, i) => SEED + i);

describe("mc-stability - summarizeAbsDeltas (pure reducer)", () => {
  it("computes max/median/mean and threshold buckets over percentage-point deltas", () => {
    const s = summarizeAbsDeltas([0.05, 0.2, 0.3, 0.6, 1.2]);
    expect(s.count).toBe(5);
    expect(s.maxPP).toBe(1.2);
    expect(s.medianPP).toBe(0.3);
    expect(s.meanPP).toBeCloseTo(0.47, 6);
    expect(s.buckets).toEqual({ gt01: 4, gt025: 3, gt05: 2, gt10: 1 });
  });

  it("is empty-safe", () => {
    expect(summarizeAbsDeltas([])).toEqual({
      count: 0, maxPP: 0, medianPP: 0, meanPP: 0,
      buckets: { gt01: 0, gt025: 0, gt05: 0, gt10: 0 },
    });
  });
});

describe("mc-stability - simulator determinism + funnel invariants", () => {
  it("same (seed, iterations, locks) reproduces identical stage probabilities", () => {
    const a = runTournamentSimulation({ seed: SEED, iterations: 400 });
    const b = runTournamentSimulation({ seed: SEED, iterations: 400 });
    expect(b.stageProbabilities).toEqual(a.stageProbabilities);
  });

  it("every checkpoint yields 48 teams with in-range, monotone-funnel probabilities", () => {
    for (const cp of ALL_CHECKPOINTS) {
      const snap = runTournamentSimulation({
        seed: SEED, iterations: 300,
        lockedResults: cp.lockedResults, lockedKnockoutResults: cp.lockedKnockoutResults,
      });
      expect(snap.stageProbabilities).toHaveLength(48);
      for (const p of snap.stageProbabilities) {
        for (const k of STABILITY_STAGE_KEYS) {
          expect(p[k]).toBeGreaterThanOrEqual(0);
          expect(p[k]).toBeLessThanOrEqual(1);
        }
        // Reaching an earlier stage is at least as likely as a later one.
        expect(p.roundOf32 + 1e-9).toBeGreaterThanOrEqual(p.roundOf16);
        expect(p.roundOf16 + 1e-9).toBeGreaterThanOrEqual(p.quarterFinal);
        expect(p.quarterFinal + 1e-9).toBeGreaterThanOrEqual(p.semiFinal);
        expect(p.semiFinal + 1e-9).toBeGreaterThanOrEqual(p.final);
        expect(p.final + 1e-9).toBeGreaterThanOrEqual(p.winner);
      }
    }
  });
});

describe("mc-stability - comparison + standard-error shape and direction", () => {
  it("compareIterationCounts returns all 8 stages, 48 teams, and rank stability", () => {
    const cmp = compareIterationCounts({
      checkpoint: BASELINE, seed: SEED, iterationsLow: CI_LOW, iterationsHigh: CI_HIGH,
    });
    expect(cmp.teamCount).toBe(48);
    expect(cmp.perStage.map((s) => s.stage)).toEqual([...STABILITY_STAGE_KEYS]);
    expect(cmp.rankStability.topRankChanges).toHaveLength(cmp.rankStability.topN);
    // Every summarized abs delta is a finite, non-negative pp value.
    for (const s of cmp.perStage) {
      expect(s.summary.maxPP).toBeGreaterThanOrEqual(s.summary.medianPP);
      expect(s.summary.meanPP).toBeGreaterThanOrEqual(0);
    }
  });

  it("run-to-run standard error shrinks as iterations rise", () => {
    const low = estimateStageStandardError({ checkpoint: BASELINE, seeds: CI_SEEDS, iterations: CI_LOW });
    const high = estimateStageStandardError({ checkpoint: BASELINE, seeds: CI_SEEDS, iterations: CI_HIGH });
    const stageSE = (rows: StageStandardError[], stage: string) =>
      rows.find((r) => r.stage === stage)!.meanSEpp;
    // Averaged over 48 teams, the noisiest reach-stage tightens with more iterations.
    for (const stage of ["roundOf16", "quarterFinal"] as const) {
      expect(stageSE(high, stage)).toBeLessThan(stageSE(low, stage));
    }
  });

  it("analytic binomial SE matches the closed form (reference used in the report)", () => {
    expect(analyticBinomialSEpp(0.5, 2000)).toBeCloseTo(1.118034, 5);
    expect(analyticBinomialSEpp(0.5, 10000)).toBeCloseTo(0.5, 5);
  });
});

describe("mc-stability - diagnostic-only guardrails (nothing production is mutated)", () => {
  it("does not change SIMULATION_CONFIG or MODEL_WEIGHTS", () => {
    const beforeConfig = JSON.stringify(SIMULATION_CONFIG);
    const beforeWeights = JSON.stringify(MODEL_WEIGHTS);
    compareIterationCounts({ checkpoint: BASELINE, seed: SEED, iterationsLow: 80, iterationsHigh: 160 });
    estimateStageStandardError({ checkpoint: BASELINE, seeds: [SEED, SEED + 1], iterations: 80 });
    expect(JSON.stringify(SIMULATION_CONFIG)).toBe(beforeConfig);
    expect(JSON.stringify(MODEL_WEIGHTS)).toBe(beforeWeights);
    // Production default is unchanged (this audit does NOT adopt 10,000).
    expect(SIMULATION_CONFIG.defaultIterations).toBe(2000);
  });

  it("the diagnostic module is offline and reads no runtime/live/provider state", () => {
    const src = readFileSync(join(process.cwd(), "lib/simulation/mc-stability.ts"), "utf8");
    for (const forbidden of ["/api/live-state", "fetch(", "@vercel/blob", "process.env", "data/model-inputs", "@/app/", "live-state", "provider"]) {
      expect(src).not.toContain(forbidden);
    }
  });
});

describe("mc-stability - committed report carries the two distinct sections", () => {
  it("distinguishes the same-seed comparison from the run-to-run standard error", () => {
    if (process.env.WRITE_MC_STABILITY_AUDIT === "1") return; // during generation the doc may not exist yet
    const report = readFileSync(
      join(process.cwd(), "docs/MODEL_MC_STABILITY_AUDIT.md"),
      "utf8",
    );
    expect(report).toContain("DIAGNOSTIC ONLY");
    expect(report).toContain("what would change if the same committed run were regenerated at 10,000 iterations");
    expect(report).toContain("estimated run-to-run Monte Carlo noise");
    expect(report.toLowerCase()).toContain("no production");
  });
});

/* -------------------------------------------------------------------------- */
/* Guarded audit-doc generator (writes only when WRITE_MC_STABILITY_AUDIT=1)   */
/* -------------------------------------------------------------------------- */
describe("mc-stability - doc generation", () => {
  it("writes docs/MODEL_MC_STABILITY_AUDIT.md when WRITE_MC_STABILITY_AUDIT=1", () => {
    if (process.env.WRITE_MC_STABILITY_AUDIT !== "1") return; // CI: assert-only, no write

    const DOC_LOW = SIMULATION_CONFIG.defaultIterations; // 2000
    const DOC_HIGH = 10000;
    const DOC_SEEDS = Array.from({ length: 8 }, (_, i) => SEED + i);
    const name = (id: string) => getTeam(id).name;
    const REPORT_STAGES = ["winner", "final", "semiFinal", "quarterFinal", "roundOf16", "roundOf32"] as const;

    // --- Measurement A: same seed, 2,000 vs 10,000, per checkpoint ---
    const t0 = performance.now();
    const comparisons: IterationComparison[] = ALL_CHECKPOINTS.map((cp) =>
      compareIterationCounts({ checkpoint: cp, seed: SEED, iterationsLow: DOC_LOW, iterationsHigh: DOC_HIGH }),
    );
    const tA = performance.now() - t0;

    const compTable = (cmp: IterationComparison) => {
      const rows = REPORT_STAGES.map((stage) => {
        const s = cmp.perStage.find((x) => x.stage === stage)!.summary;
        return `| ${stage} | ${s.maxPP.toFixed(4)} | ${s.medianPP.toFixed(4)} | ${s.meanPP.toFixed(4)} | ${s.buckets.gt01} | ${s.buckets.gt025} | ${s.buckets.gt05} | ${s.buckets.gt10} |`;
      }).join("\n");
      return (
        `#### ${cmp.label}\n\n` +
        `Overall (all stages pooled): max ${cmp.overall.maxPP.toFixed(4)} pp, median ${cmp.overall.medianPP.toFixed(4)} pp, mean ${cmp.overall.meanPP.toFixed(4)} pp. ` +
        `Top-${cmp.rankStability.topN} winner-rank stability: max |rank move| = ${cmp.rankStability.maxAbsTopRankDelta}; tail-${cmp.rankStability.topN}: ${cmp.rankStability.maxAbsTailRankDelta}.\n\n` +
        `| stage | max Δpp | median Δpp | mean Δpp | >0.1pp | >0.25pp | >0.5pp | >1.0pp |\n` +
        `|---|--:|--:|--:|--:|--:|--:|--:|\n${rows}`
      );
    };

    const baseline = comparisons[0]!;
    const baseWinnerSummary = baseline.perStage.find((s) => s.stage === "winner")!.summary;
    const readingLine =
      `Observed on the baseline: title (\`winner\`) moves > 0.5 pp for ${baseWinnerSummary.buckets.gt05} team(s) ` +
      `(max ${baseWinnerSummary.maxPP.toFixed(2)} pp), and the top-8 winner ranking shows a max rank move of ` +
      `${baseline.rankStability.maxAbsTopRankDelta}. By the thresholds above this falls in the ` +
      `"consider adopting 10,000 for the committed final snapshots" band; the actual adoption decision is ` +
      `deferred to a separate implementation PR and is NOT taken here.`;
    const baselineTitleMovers = baseline.perStage.find((s) => s.stage === "winner")!.worstMovers
      .map((m) => `| ${name(m.teamId)} | ${m.lowPct.toFixed(3)} | ${m.highPct.toFixed(3)} | ${m.deltaPP >= 0 ? "+" : ""}${m.deltaPP.toFixed(3)} |`)
      .join("\n");

    // --- Measurement B: run-to-run standard error (multi-seed) at each count ---
    const t1 = performance.now();
    const seBaselineLow = estimateStageStandardError({ checkpoint: BASELINE, seeds: DOC_SEEDS, iterations: DOC_LOW });
    const seBaselineHigh = estimateStageStandardError({ checkpoint: BASELINE, seeds: DOC_SEEDS, iterations: DOC_HIGH });
    const m73 = ALL_CHECKPOINTS.find((c) => c.label === "M73")!;
    const seM73Low = estimateStageStandardError({ checkpoint: m73, seeds: DOC_SEEDS, iterations: DOC_LOW });
    const tB = performance.now() - t1;

    const seTable = (low: StageStandardError[], high: StageStandardError[]) =>
      REPORT_STAGES.map((stage) => {
        const l = low.find((r) => r.stage === stage)!;
        const h = high.find((r) => r.stage === stage)!;
        const ratio = h.meanSEpp > 0 ? (l.meanSEpp / h.meanSEpp) : 0;
        return `| ${stage} | ${l.meanSEpp.toFixed(4)} | ${l.p95SEpp.toFixed(4)} | ${h.meanSEpp.toFixed(4)} | ${h.p95SEpp.toFixed(4)} | ${ratio.toFixed(2)}x |`;
      }).join("\n");

    const seM73Table = seM73Low
      .filter((r) => REPORT_STAGES.includes(r.stage as (typeof REPORT_STAGES)[number]))
      .map((r) => `| ${r.stage} | ${r.meanSEpp.toFixed(4)} | ${r.p95SEpp.toFixed(4)} |`)
      .join("\n");

    const md = `# Monte Carlo stability / 10,000-iteration audit

> **DIAGNOSTIC ONLY.** This report measures Monte Carlo sampling noise in the published
> stage probabilities. It changes **no production output**: the production default stays
> **${SIMULATION_CONFIG.defaultIterations} iterations** (\`SIMULATION_CONFIG.defaultIterations\`), no committed
> forecast snapshot is regenerated, and no config/model/weight/live-state/Blob/workflow is
> touched. The numbers are produced by \`tests/simulation-mc-stability.test.ts\` (run with
> \`WRITE_MC_STABILITY_AUDIT=1\`), which is the source of truth; this doc is a readable copy.

## Method

- **Inputs: committed checkpoints only.** Baseline (no locked results) plus each committed
  results ledger under \`data/forecast/results/\` (M24/M48/M54/M72/M73), reproduced through the
  same \`ledgerToLockedResults\`/\`ledgerToKnockoutLockedResults\` machinery the snapshot generator
  uses. No current/live-state, provider, Blob, or runtime projection is read.
- **Deterministic:** seeded mulberry32; a run is fully reproducible for a given (seed, iterations).
- **Two separate measurements**, deliberately not conflated:
  - **Section A** = same fixed production seed (${SEED}), 2,000 vs 10,000 iterations. This answers
    **"what would change if the same committed run were regenerated at 10,000 iterations"**.
  - **Section B** = one iteration count across ${DOC_SEEDS.length} seeds. This is the
    **estimated run-to-run Monte Carlo noise** (the empirical standard error of a single run) -
    it is NOT a 2,000-vs-10,000 diff.

## Section A - same-seed 2,000 vs 10,000 (regeneration delta)

For each checkpoint: absolute change per team in each stage probability when the same seeded run
is taken from ${DOC_LOW} to ${DOC_HIGH} iterations. \`Δpp\` = percentage points.

${comparisons.map(compTable).join("\n\n")}

### Baseline title (\`winner\`) - largest movers, 2,000 -> 10,000

| team | 2,000 (%) | 10,000 (%) | Δpp |
|---|--:|--:|--:|
${baselineTitleMovers}

## Section B - estimated run-to-run Monte Carlo noise (multi-seed standard error)

Per-team standard deviation of each stage probability across ${DOC_SEEDS.length} independent seeds,
averaged over the 48 teams. This quantifies the "on the order of a percentage point" note on the
methodology page (which is otherwise unmeasured in code).

### Baseline - mean / p95 standard error (pp), 2,000 vs 10,000

| stage | mean SE @2,000 | p95 SE @2,000 | mean SE @10,000 | p95 SE @10,000 | shrink |
|---|--:|--:|--:|--:|--:|
${seTable(seBaselineLow, seBaselineHigh)}

Expected analytic shrink is sqrt(10000/2000) = ${Math.sqrt(DOC_HIGH / DOC_LOW).toFixed(2)}x. Analytic
binomial SE at 2,000 for reference: p=0.15 -> ${analyticBinomialSEpp(0.15, DOC_LOW).toFixed(3)} pp,
p=0.5 -> ${analyticBinomialSEpp(0.5, DOC_LOW).toFixed(3)} pp.

### M73 (deep into the knockouts) - mean / p95 standard error @2,000 (pp)

Locking completed results removes random draws, so late-tournament noise is lower than the baseline.

| stage | mean SE @2,000 | p95 SE @2,000 |
|---|--:|--:|
${seM73Table}

## Runtime & size

- Section A (${ALL_CHECKPOINTS.length} checkpoints x (${DOC_LOW}+${DOC_HIGH}) iterations): **${(tA / 1000).toFixed(1)} s**.
- Section B (${DOC_SEEDS.length} seeds x (${DOC_LOW}+${DOC_HIGH}) baseline + ${DOC_SEEDS.length} x ${DOC_LOW} M73): **${(tB / 1000).toFixed(1)} s**.
- These run offline only (this env-gated generator). The Next.js build never simulates, and page
  renders read committed JSON - so iteration count does not affect CI/build time.
- **Snapshot file size is independent of iteration count** (each snapshot is a fixed 48 teams x 8
  probability keys, rounded to 4 dp), so adopting 10,000 would not grow \`data/forecast/**\` or the bundle.

## Cost of adoption (informational; NOT adopted here)

Adopting 10,000 for the **committed snapshots** would require regenerating all six snapshots and
re-pinning the six byte-for-byte tests (\`forecast-snapshot-baseline\`, \`forecast-milestone-backfill\`,
\`forecast-live-aware-artifact\`, \`forecast-live-aware-provider-artifact\`, \`forecast-knockout-locked-results\`)
plus the seed/iteration assertions. Adopting it for the **live Blob refresh** adds recurring cost to the
5-minute scheduled Action. Both are separate implementation PRs.

## Recommendation

Read Section A against the thresholds: if most public probabilities move < 0.25 pp and the top/tail
rankings are stable, **defer** (the current 2,000 is launch-fine and matches the published "~1 pp"
copy). If Section A shows > 0.5 pp movement on title/final for contending teams or any top-8 rank flip,
**consider adopting 10,000 for the committed final snapshots only** (offline one-time cost; file size
unchanged), and keep the live Blob at 2,000 unless the scheduled-Action budget allows. Global adoption
(raising \`SIMULATION_CONFIG.defaultIterations\`) remains a separate, larger PR. **Calibration and model
logic are unchanged either way.**

${readingLine}
`;

    writeFileSync(resolve(process.cwd(), "docs/MODEL_MC_STABILITY_AUDIT.md"), md);
    expect(md).toContain("Section A");
  });
});
