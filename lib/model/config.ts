/**
 * Model configuration & tunable weights
 * -------------------------------------
 * Every weight below is expressed in **Elo-equivalent points** so the drivers
 * combine on one comparable scale. Increase a weight to make that signal
 * matter more. This file is the single place to tune the baseline model —
 * no magic numbers live inside the engine or the UI.
 *
 * See docs/MODEL_METHOD.md for the rationale behind each value.
 */
export const MODEL_WEIGHTS = {
  /** Elo difference is already in Elo points → weight 1.0 (the anchor). */
  elo: 1.0,
  /** Elo points granted per FIFA-ranking place of advantage (capped). */
  fifaRankingPerPlace: 1.4,
  /** Max Elo points the ranking signal may contribute (avoids tail blowups). */
  fifaRankingCap: 90,
  /** Elo points per squad-quality point (0..100 scale). */
  squadQuality: 4.0,
  /** Elo points per recent-form point (0..100 scale). */
  recentForm: 2.0,
  /** Elo points for having a same-nationality manager (cohesion proxy). */
  manager: 15,
  /** Elo points for being a co-host (crowd, travel, familiarity). */
  host: 60,
  /** Elo points for being in the host region (CONCACAF) but not a host. */
  regional: 18,
  /** Elo points per climate-familiarity point (0..100 scale). */
  climate: 0.8,
  /**
   * Elo points across the full 0..1 structural-depth range (log-scaled GDP per
   * capita + population). Deliberately SMALL — an experimental weak structural
   * prior, never a determinative match-level predictor.
   */
  structural: 10,
} as const;

/**
 * Phase 1.7 - placeholder-weight caps (Elo-equivalent points).
 *
 * Feature families whose model-input status is `placeholder` (see
 * data/model-inputs/sources.ts) must not silently drive probabilities. Each such
 * driver is clamped to +/- PLACEHOLDER_CONTRIBUTION_CAP, and ALL placeholder
 * drivers combined are clamped to +/- TOTAL_PLACEHOLDER_CONTRIBUTION_CAP so they
 * cannot collectively dominate. Caps are modest + documented; they shift
 * probabilities slightly in exchange for honesty. Manual/source-backed/verified
 * families are never capped here.
 */
export const PLACEHOLDER_CONTRIBUTION_CAP = 25;
export const TOTAL_PLACEHOLDER_CONTRIBUTION_CAP = 40;

export const SCORELINE_CONFIG = {
  /** League-average total goals per match (Poisson baseline). */
  baseTotalGoals: 2.6,
  /** Elo points of supremacy that equate to a one-goal expected edge. */
  supremacyPerGoal: 250,
  /** Floor on a team's expected goals so no side is ever "shut out" at 0. */
  minExpectedGoals: 0.18,
  /** Largest scoreline (per side) enumerated in the Poisson matrix. */
  maxGoalsPerSide: 8,
} as const;

export const SIMULATION_CONFIG = {
  /** Default Monte Carlo iterations for the tournament simulator. */
  defaultIterations: 2000,
  /** Default deterministic RNG seed for reproducible snapshots. */
  defaultSeed: 20260611,
} as const;
