/**
 * Phase 1.11 - AUDIT-ONLY model-weight variants (sensitivity / calibration probe).
 *
 * These variants exist purely to measure how sensitive the FROZEN pre-tournament
 * forecast is to the current weighting and source families. They are DIAGNOSTIC
 * ONLY: each is a fresh `{ ...MODEL_WEIGHTS, ...override }` object, so production
 * `MODEL_WEIGHTS` is never mutated, and they are NOT proposed production settings.
 * The placeholder caps are not overridable, so they continue to bind under every
 * variant. Nothing here changes production behaviour - the model only consumes a
 * variant's weights when one is explicitly passed to `computeDrivers` /
 * `runTournamentSimulation`.
 */
import { MODEL_WEIGHTS, type ModelWeights } from "./config";

export interface ModelVariant {
  id: string;
  label: string;
  /** Short note on what this probe isolates (for the audit doc). */
  note: string;
  weights: ModelWeights;
}

/** Build a full weight set from the production baseline + a partial override. */
export function withOverrides(partial: Partial<ModelWeights> = {}): ModelWeights {
  return { ...MODEL_WEIGHTS, ...partial };
}

/**
 * The ~9 sensitivity variants (modest set). `baseline` MUST equal production.
 * FIFA variants scale BOTH `fifaRankingPerPlace` (the per-place slope) AND
 * `fifaRankingCap` (the maximum FIFA contribution) by the same factor, so both
 * the slope and the ceiling of the FIFA signal widen together.
 */
export const AUDIT_VARIANTS: ModelVariant[] = [
  {
    id: "baseline",
    label: "Baseline (production)",
    note: "Current production weights, unchanged. Reference for all deltas.",
    weights: withOverrides(),
  },
  {
    id: "elo-75",
    label: "Elo x0.75",
    note: "Elo anchor reduced to 75% to test reliance on the dominant rating.",
    weights: withOverrides({ elo: 0.75 }),
  },
  {
    id: "elo-50",
    label: "Elo x0.50",
    note: "Elo anchor halved - strongest probe of Elo dominance.",
    weights: withOverrides({ elo: 0.5 }),
  },
  {
    id: "fifa-125",
    label: "FIFA x1.25 (slope + cap)",
    note: "FIFA slope (per place) and cap (max contribution) both x1.25.",
    weights: withOverrides({
      fifaRankingPerPlace: MODEL_WEIGHTS.fifaRankingPerPlace * 1.25,
      fifaRankingCap: MODEL_WEIGHTS.fifaRankingCap * 1.25,
    }),
  },
  {
    id: "fifa-150",
    label: "FIFA x1.50 (slope + cap)",
    note: "FIFA slope (per place) and cap (max contribution) both x1.50.",
    weights: withOverrides({
      fifaRankingPerPlace: MODEL_WEIGHTS.fifaRankingPerPlace * 1.5,
      fifaRankingCap: MODEL_WEIGHTS.fifaRankingCap * 1.5,
    }),
  },
  {
    id: "balanced",
    label: "Elo/FIFA balanced",
    note: "Elo x0.60 with FIFA slope + cap x1.50 - re-balances the two rating inputs.",
    weights: withOverrides({
      elo: 0.6,
      fifaRankingPerPlace: MODEL_WEIGHTS.fifaRankingPerPlace * 1.5,
      fifaRankingCap: MODEL_WEIGHTS.fifaRankingCap * 1.5,
    }),
  },
  {
    id: "no-placeholders",
    label: "No placeholder/capped inputs",
    note: "Zeroes squad quality / recent form (capped placeholders) and the capped climate candidate (Phase 1.13).",
    weights: withOverrides({ squadQuality: 0, recentForm: 0, climate: 0 }),
  },
  {
    id: "no-host-regional",
    label: "No host/regional advantage",
    note: "Zeroes host + regional step contributions (tournament-context flags).",
    weights: withOverrides({ host: 0, regional: 0 }),
  },
  {
    id: "rating-only",
    label: "Rating-only (Elo + FIFA)",
    note:
      "Isolates ONLY the two source-backed RATING inputs (Elo + FIFA ranking). It zeroes squad/form/climate/manager/host/regional/structural - this is NOT 'all source-backed/verified facts' (host advantage is itself verified tournament context but is intentionally zeroed here to isolate the ratings).",
    weights: withOverrides({
      squadQuality: 0,
      recentForm: 0,
      climate: 0,
      manager: 0,
      host: 0,
      regional: 0,
      structural: 0,
    }),
  },
];
