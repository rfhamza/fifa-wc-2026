/**
 * Phase 1.18C-1 - diagnostic baseline ladder (backtesting layer).
 * --------------------------------------------------------------
 * A small, FIXED ladder of model variants used only to score the historical bench.
 * The `activeDrivers` set is the SINGLE SOURCE OF TRUTH for what each variant uses;
 * inactive drivers are simply not summed (forced to zero) by the evaluator.
 *
 * Active drivers reuse the production `MODEL_WEIGHTS` constants (import-safe: config.ts
 * has no imports) so there are no magic numbers and no value drift from production.
 * These are DIAGNOSTIC baselines, NOT calibrated and NOT a production model claim.
 * There is deliberately no "current production equivalent" variant: too many of its
 * features (squad, recent form, climate, structural, tournamentContext, manager) are
 * intentionally excluded from the WC-2022 pilot.
 */

import { MODEL_WEIGHTS, type ModelWeights } from "@/lib/model/config";

/** The only drivers available in the WC-2022 pilot. */
export type DriverKey = "elo" | "fifa" | "host" | "regional";

export interface ModelVariant {
  id: string;
  label: string;
  /** Source of truth: which drivers contribute. Everything else is zero. */
  activeDrivers: DriverKey[];
}

export const ELO_ONLY: ModelVariant = {
  id: "elo-only",
  label: "Elo only",
  activeDrivers: ["elo"],
};

export const FIFA_ONLY: ModelVariant = {
  id: "fifa-only",
  label: "FIFA ranking only",
  activeDrivers: ["fifa"],
};

export const ELO_FIFA: ModelVariant = {
  id: "elo-fifa",
  label: "Elo + FIFA",
  activeDrivers: ["elo", "fifa"],
};

export const ELO_FIFA_HOST_REGIONAL: ModelVariant = {
  id: "elo-fifa-host-regional",
  label: "Elo + FIFA + host/regional",
  activeDrivers: ["elo", "fifa", "host", "regional"],
};

/** The ordered baseline ladder for the WC-2022 pilot. */
export const BASELINE_LADDER: ModelVariant[] = [
  ELO_ONLY,
  FIFA_ONLY,
  ELO_FIFA,
  ELO_FIFA_HOST_REGIONAL,
];

/**
 * Phase 1.18C-6 - express a diagnostic variant as a `ModelWeights` object so the
 * shared pure prediction core (`computePredictionCore`) can be driven directly.
 *
 * Starts from the production `MODEL_WEIGHTS` and zeroes every weight that is NOT
 * an active diagnostic driver of this variant. The four diagnostic drivers map to
 * `elo` / `fifaRankingPerPlace` / `host` / `regional`; `fifaRankingCap` is the FIFA
 * clamp bound (not a per-driver weight) and is ALWAYS preserved so the FIFA signal
 * stays bounded exactly as in production. Every non-diagnostic production driver
 * (squad / recent form / manager / climate / structural / tournament-context) is
 * zeroed defensively - the historical feature adapter already neutralises those
 * features, so they net to zero regardless, but zeroing the weights makes the
 * variant self-documenting. The base production `MODEL_WEIGHTS` are never mutated;
 * a fresh object is returned. NOT calibration - just a faithful re-expression of
 * the existing `activeDrivers` ladder through the shared core.
 */
export function weightsForActiveDrivers(active: readonly DriverKey[]): ModelWeights {
  const on = new Set(active);
  return {
    ...MODEL_WEIGHTS,
    elo: on.has("elo") ? MODEL_WEIGHTS.elo : 0,
    fifaRankingPerPlace: on.has("fifa") ? MODEL_WEIGHTS.fifaRankingPerPlace : 0,
    fifaRankingCap: MODEL_WEIGHTS.fifaRankingCap,
    host: on.has("host") ? MODEL_WEIGHTS.host : 0,
    regional: on.has("regional") ? MODEL_WEIGHTS.regional : 0,
    // Non-diagnostic drivers: inert on neutral historical features, zeroed for clarity.
    squadQuality: 0,
    recentForm: 0,
    manager: 0,
    climate: 0,
    structural: 0,
    tournamentContext: 0,
  };
}

/** Variant-specific weights for the shared prediction core. */
export function variantWeights(variant: ModelVariant): ModelWeights {
  return weightsForActiveDrivers(variant.activeDrivers);
}
