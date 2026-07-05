/**
 * Pre-registered activation rule (Stage 1B, pure decision helper).
 * ----------------------------------------------------------------
 * Implements the FROZEN gates G1-G5 and the smallest-passing-weight selection from
 * `docs/BACKTESTING_IN_TOURNAMENT_PERFORMANCE.md` Section 8.3. This helper computes NO
 * metrics: it consumes per-weight deltas-vs-zero (which a Stage 1C run supplies from
 * the real sweep, and which Stage 1B supplies synthetically) and returns the decision.
 *
 * The thresholds are frozen constants. If no weight passes, the outcome is
 * `selectedWeight: 0` (keep zero) — a legitimate, expected result. Field names are
 * neutral: the rule never labels any weight as superior, it only returns the
 * deterministic output of the frozen gates.
 */

/** Frozen gate thresholds (Elo-equivalent-point weights sweep the only free knob). */
export const G1_MIN_RPS_IMPROVEMENT = 0.002; // primary RPS must improve by >= this
export const G2_MAX_LOGLOSS_DEGRADE = 0.001; // primary log-loss may degrade by <= this
export const G3_MIN_IMPROVING_FOLDS = 3; // primary RPS must improve in >= this many folds
export const G4_MAX_KNOCKOUT_DEGRADE = 0.002; // knockout RPS may degrade by <= this
export const G5_MAX_SINGLE_FOLD_DEGRADE = 0.005; // no fold's primary RPS may degrade by > this
export const SELECTION_TOLERANCE = 0.0005; // "within" band around the strongest passing G1

/** Per-candidate-weight inputs, all expressed as deltas versus weight 0. */
export interface ActivationWeightInput {
  /** Candidate weight (> 0). */
  weight: number;
  /** macro RPS(group MD2+MD3, weight) - macro RPS(group MD2+MD3, 0). Negative = better. */
  primaryRpsDeltaVsZero: number;
  /** macro log-loss(group MD2+MD3, weight) - baseline. Positive = worse. */
  primaryLogLossDeltaVsZero: number;
  /** macro RPS(knockout-only, weight) - baseline. Positive = worse. */
  knockoutRpsDeltaVsZero: number;
  /** Per-tournament RPS(group MD2+MD3, weight) - RPS(., 0). One entry per primary pack. */
  perTournamentPrimaryRpsDeltaVsZero: number[];
}

export interface ActivationRuleInput {
  weights: ActivationWeightInput[];
}

export interface ActivationGateResult {
  g1: boolean;
  g2: boolean;
  g3: boolean;
  g4: boolean;
  g5: boolean;
  passed: boolean;
}

export interface ActivationDecision {
  /** The selected candidate weight; 0 means keep zero (no weight passed / rule chose 0). */
  selectedWeight: number;
  /** Every candidate weight's gate breakdown. */
  gatesByWeight: Record<number, ActivationGateResult>;
  /** Candidate weights that passed all five gates (ascending). */
  passingWeights: number[];
}

function evaluateGates(w: ActivationWeightInput): ActivationGateResult {
  const improvingFolds = w.perTournamentPrimaryRpsDeltaVsZero.filter((d) => d < 0).length;
  const worstFoldDegrade =
    w.perTournamentPrimaryRpsDeltaVsZero.length === 0
      ? 0
      : Math.max(...w.perTournamentPrimaryRpsDeltaVsZero);

  const g1 = w.primaryRpsDeltaVsZero <= -G1_MIN_RPS_IMPROVEMENT;
  const g2 = w.primaryLogLossDeltaVsZero <= G2_MAX_LOGLOSS_DEGRADE;
  const g3 = improvingFolds >= G3_MIN_IMPROVING_FOLDS;
  const g4 = w.knockoutRpsDeltaVsZero <= G4_MAX_KNOCKOUT_DEGRADE;
  const g5 = worstFoldDegrade <= G5_MAX_SINGLE_FOLD_DEGRADE;

  return { g1, g2, g3, g4, g5, passed: g1 && g2 && g3 && g4 && g5 };
}

/**
 * Apply the frozen activation rule. Pure. Ties resolve to the smaller weight; if no
 * candidate weight passes, `selectedWeight` is 0.
 */
export function evaluateActivationRule(input: ActivationRuleInput): ActivationDecision {
  const gatesByWeight: Record<number, ActivationGateResult> = {};
  const passing: ActivationWeightInput[] = [];

  for (const w of input.weights) {
    const gates = evaluateGates(w);
    gatesByWeight[w.weight] = gates;
    if (gates.passed) passing.push(w);
  }

  const passingWeights = passing.map((w) => w.weight).sort((a, b) => a - b);

  if (passing.length === 0) {
    return { selectedWeight: 0, gatesByWeight, passingWeights };
  }

  // The strongest passing G1 improvement is the most negative delta.
  const strongestG1 = Math.min(...passing.map((w) => w.primaryRpsDeltaVsZero));
  // Eligible = passing weights within SELECTION_TOLERANCE of the strongest G1.
  const eligible = passing.filter(
    (w) => w.primaryRpsDeltaVsZero - strongestG1 <= SELECTION_TOLERANCE,
  );
  const selectedWeight = Math.min(...eligible.map((w) => w.weight));

  return { selectedWeight, gatesByWeight, passingWeights };
}
