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
