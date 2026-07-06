/**
 * Stage 1C - in-tournament performance driver, real historical RESULTS aggregator.
 * --------------------------------------------------------------------------------
 * Pure, offline wiring that runs the already-merged Stage 1B harness once over the
 * committed historical packs and applies the FROZEN Stage 1A activation rule (G1-G5)
 * to the real numbers. It computes NO metric math of its own - it only orchestrates
 * `runWalkForward` -> `summarizePerformanceSweep` -> `computePerformanceLoto` ->
 * `evaluateActivationRule` and shapes the output for pinning + the governance report.
 *
 * GOVERNANCE (see docs/BACKTESTING_IN_TOURNAMENT_PERFORMANCE.md):
 *  - The ACTIVATION DECISION is derived from the four PRIMARY packs (2010/2014/2018/2022)
 *    ONLY. The stretch packs (1998/2002/2006) are computed into a SEPARATE `supplementary`
 *    field that is never read by the gate/selection wiring, never merged into the primary
 *    macro-average, and can neither approve nor veto.
 *  - Gates are evaluated on RAW doubles (never rounded) so 6-dp display rounding can never
 *    flip a boundary gate. The results test rounds to 6 dp only for pinning/display.
 *  - Field names stay neutral (`byWeight`, `deltaVsZero`, `selectedWeight`, `activationDecision`,
 *    `passingWeights`, `gatesByWeight`); the candidate driver's weight stays 0 unless a
 *    separate later stage approves it. Calibration remains NO-GO. No live/current-season
 *    data (committed historical packs only), no network, no I/O.
 */
import { PERF_SWEEP_WEIGHTS } from "./in-tournament-performance";
import { runWalkForward, type WalkForwardResult } from "./walk-forward";
import {
  summarizePerformanceSweep,
  PERFORMANCE_SWEEP_GOVERNANCE_FLAGS,
  type PerformanceGovernanceFlags,
  type SubsetSweep,
} from "./performance-sweep";
import { computePerformanceLoto } from "./performance-loto";
import {
  evaluateActivationRule,
  type ActivationGateResult,
  type ActivationWeightInput,
} from "./activation-rule";
import { primaryDiagnosticPacks, stretchContextPacks } from "./historical-cohorts";
import type { HistoricalSourcePack } from "./types";

/** The pre-registered decision subset (group matchday 2+3) and knockout guardrail. */
const PRIMARY_DECISION_SUBSET = "groupMd2Md3";
const KNOCKOUT_GUARDRAIL_SUBSET = "knockoutOnly";
/** Reported, NON-gating context subsets (fall out of the same sweep for free). */
const REPORTED_CONTEXT_SUBSETS = ["allPostMd1", "groupAll48", "all64"] as const;

/** Candidate (activation-eligible) weights: the swept grid minus the 0 baseline reference. */
export const CANDIDATE_WEIGHTS: number[] = PERF_SWEEP_WEIGHTS.filter((w) => w > 0);

export interface PerfSubsetMetricRow {
  weight: number;
  rps: number;
  logLoss: number;
  brier: number;
  accuracy: number;
  n: number;
}
export interface PerfSubsetDeltaRow {
  weight: number;
  rps: number;
  logLoss: number;
  brier: number;
  accuracy: number;
}
export interface PerfSubsetView {
  subset: string;
  byWeight: PerfSubsetMetricRow[];
  deltaVsZero: PerfSubsetDeltaRow[];
}
export interface PerfPerTournamentRow {
  tournamentYear: number;
  byWeight: { weight: number; rps: number; logLoss: number }[];
}
export interface PerfFoldConsistencyRow {
  weight: number;
  improvedFolds: number;
  totalFolds: number;
}
export interface PerfWorstFoldDegradeRow {
  /** Candidate/baseline weight. */
  weight: number;
  /** max over tournaments of (RPS(primaryDecision, weight) - RPS(., 0)); the G5 evidence. */
  worstDelta: number;
}

export interface PerfActivationView {
  candidateWeights: number[];
  gatesByWeight: Record<number, ActivationGateResult>;
  passingWeights: number[];
  selectedWeight: number;
  /** Neutral verdict label: "keep-weight-0" (negative result) or "gates-passed". */
  activationDecision: "keep-weight-0" | "gates-passed";
  /** True only when a weight passed all gates. Stage 1C never activates or shadows. */
  stage2ShadowMayBeConsidered: boolean;
}

export interface PerfPrimaryBlock {
  weights: number[];
  primaryDecision: PerfSubsetView;
  knockoutGuardrail: PerfSubsetView;
  reported: PerfSubsetView[];
  perTournament: PerfPerTournamentRow[];
  foldConsistencyByWeight: PerfFoldConsistencyRow[];
  worstFoldDegradeByWeight: PerfWorstFoldDegradeRow[];
}

export interface PerfSupplementaryBlock {
  /** Label: these numbers are context only and never touch the activation decision. */
  contextOnly: true;
  weights: number[];
  primaryDecision: PerfSubsetView;
  knockoutGuardrail: PerfSubsetView;
  perTournament: PerfPerTournamentRow[];
}

export interface InTournamentPerformanceResults {
  governance: PerformanceGovernanceFlags;
  cohorts: { primaryYears: number[]; supplementaryYears: number[] };
  primary: PerfPrimaryBlock;
  activation: PerfActivationView;
  supplementary: PerfSupplementaryBlock;
}

const at = <T extends { weight: number }>(rows: readonly T[], weight: number): T => {
  const row = rows.find((r) => r.weight === weight);
  if (!row) throw new Error(`performance-results: no row for weight ${weight}`);
  return row;
};

function subsetView(sweep: { subsets: Record<string, SubsetSweep> }, key: string): PerfSubsetView {
  const s = sweep.subsets[key];
  if (!s) throw new Error(`performance-results: missing subset "${key}"`);
  return {
    subset: key,
    byWeight: s.byWeight.map((b) => ({
      weight: b.weight,
      rps: b.rps,
      logLoss: b.logLoss,
      brier: b.brier,
      accuracy: b.accuracy,
      n: b.n,
    })),
    deltaVsZero: s.deltaVsZero.map((d) => ({
      weight: d.weight,
      rps: d.rps,
      logLoss: d.logLoss,
      brier: d.brier,
      accuracy: d.accuracy,
    })),
  };
}

function perTournamentView(subset: SubsetSweep): PerfPerTournamentRow[] {
  return subset.perTournament.map((t) => ({
    tournamentYear: t.tournamentYear,
    byWeight: t.byWeight.map((b) => ({ weight: b.weight, rps: b.rps, logLoss: b.logLoss })),
  }));
}

/** Per-tournament RPS delta vs weight 0 for one candidate weight, ordered by pack. */
function perTournamentPrimaryRpsDeltaVsZero(subset: SubsetSweep, weight: number): number[] {
  return subset.perTournament.map(
    (t) => at(t.byWeight, weight).rps - at(t.byWeight, 0).rps,
  );
}

/**
 * Run the real sweep once over the committed packs and apply the frozen activation rule.
 * Pure. The activation decision uses `primaryPacks` ONLY; `stretchPacks` are computed into a
 * separate, non-gating `supplementary` block. Verdict is computed on RAW doubles.
 */
export function computeInTournamentPerformanceResults(opts?: {
  primaryPacks?: readonly HistoricalSourcePack[];
  stretchPacks?: readonly HistoricalSourcePack[];
}): InTournamentPerformanceResults {
  const primaryPacks = opts?.primaryPacks ?? primaryDiagnosticPacks;
  const stretchPacks = opts?.stretchPacks ?? stretchContextPacks;

  // --- PRIMARY (gating) ---
  const primaryWf: WalkForwardResult[] = primaryPacks.map((p) => runWalkForward(p));
  const primarySweep = summarizePerformanceSweep(primaryWf);
  const primaryDecision = primarySweep.subsets[PRIMARY_DECISION_SUBSET];
  if (!primaryDecision) throw new Error("performance-results: primary decision subset missing");
  const loto = computePerformanceLoto(primaryWf, PRIMARY_DECISION_SUBSET);

  const weights = primarySweep.weights;

  const worstFoldDegradeByWeight: PerfWorstFoldDegradeRow[] = weights.map((weight) => {
    const deltas = perTournamentPrimaryRpsDeltaVsZero(primaryDecision, weight);
    return { weight, worstDelta: deltas.length === 0 ? 0 : Math.max(...deltas) };
  });

  // Build the activation-rule input for the candidate weights from RAW primary metrics.
  const knockoutGuardrail = primarySweep.subsets[KNOCKOUT_GUARDRAIL_SUBSET];
  if (!knockoutGuardrail) throw new Error("performance-results: knockout guardrail subset missing");
  const activationWeights: ActivationWeightInput[] = CANDIDATE_WEIGHTS.map((weight) => ({
    weight,
    primaryRpsDeltaVsZero: at(primaryDecision.deltaVsZero, weight).rps,
    primaryLogLossDeltaVsZero: at(primaryDecision.deltaVsZero, weight).logLoss,
    knockoutRpsDeltaVsZero: at(knockoutGuardrail.deltaVsZero, weight).rps,
    perTournamentPrimaryRpsDeltaVsZero: perTournamentPrimaryRpsDeltaVsZero(primaryDecision, weight),
  }));
  const decision = evaluateActivationRule({ weights: activationWeights });

  const activation: PerfActivationView = {
    candidateWeights: [...CANDIDATE_WEIGHTS],
    gatesByWeight: decision.gatesByWeight,
    passingWeights: decision.passingWeights,
    selectedWeight: decision.selectedWeight,
    activationDecision: decision.selectedWeight === 0 ? "keep-weight-0" : "gates-passed",
    stage2ShadowMayBeConsidered: decision.selectedWeight !== 0,
  };

  const primary: PerfPrimaryBlock = {
    weights,
    primaryDecision: subsetView(primarySweep, PRIMARY_DECISION_SUBSET),
    knockoutGuardrail: subsetView(primarySweep, KNOCKOUT_GUARDRAIL_SUBSET),
    reported: REPORTED_CONTEXT_SUBSETS.map((k) => subsetView(primarySweep, k)),
    perTournament: perTournamentView(primaryDecision),
    foldConsistencyByWeight: loto.foldConsistencyByWeight.map((f) => ({
      weight: f.weight,
      improvedFolds: f.improvedFolds,
      totalFolds: f.totalFolds,
    })),
    worstFoldDegradeByWeight,
  };

  // --- SUPPLEMENTARY (context only; NEVER feeds the activation decision above) ---
  const stretchWf: WalkForwardResult[] = stretchPacks.map((p) => runWalkForward(p));
  const stretchSweep = summarizePerformanceSweep(stretchWf);
  const stretchDecisionSubset = stretchSweep.subsets[PRIMARY_DECISION_SUBSET];
  if (!stretchDecisionSubset) throw new Error("performance-results: stretch decision subset missing");
  const supplementary: PerfSupplementaryBlock = {
    contextOnly: true,
    weights: stretchSweep.weights,
    primaryDecision: subsetView(stretchSweep, PRIMARY_DECISION_SUBSET),
    knockoutGuardrail: subsetView(stretchSweep, KNOCKOUT_GUARDRAIL_SUBSET),
    perTournament: perTournamentView(stretchDecisionSubset),
  };

  return {
    governance: PERFORMANCE_SWEEP_GOVERNANCE_FLAGS,
    cohorts: {
      primaryYears: primaryPacks.map((p) => p.identity.tournamentYear),
      supplementaryYears: stretchPacks.map((p) => p.identity.tournamentYear),
    },
    primary,
    activation,
    supplementary,
  };
}
