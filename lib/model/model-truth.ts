/**
 * Phase 1.28Q-F (PR-4A) - UI-facing MODEL TRUTH layer.
 * ----------------------------------------------------
 * A small, honest claim layer the UI can import to describe each model signal WITHOUT
 * overclaiming. It is intentionally separate from the governance catalog
 * `lib/model/input-registry.ts` (which is metadata-only and, by test, importable by NO
 * production/UI code). This module IS importable by the UI; it references weight KEYS in
 * `MODEL_WEIGHTS` (never literal numbers) and changes no behaviour - purely how claims read.
 *
 * Source-of-truth alignment (asserted by tests/model-truth.test.ts):
 *   - weights/caps        -> lib/model/config.ts (MODEL_WEIGHTS)
 *   - provenance status   -> data/model-inputs/sources.ts (MODEL_INPUT_SOURCES)
 *   - backtested set      -> only Elo, FIFA, host, regional are exercised in historical mode
 *     (lib/backtesting/feature-adapter.ts); all other active drivers are NOT backtested.
 */
import { MODEL_WEIGHTS } from "./config";

export type WeightKey = keyof typeof MODEL_WEIGHTS;

/** Controlled vocabulary for how strongly a signal may be claimed. */
export const CLAIM_STATUSES = [
  "active-validated", // active in probabilities AND exercised in backtesting
  "active-uncalibrated", // active + source-backed, but not statistically calibrated
  "experimental", // active but a candidate prior, not yet backtested
  "placeholder", // active but hand-authored filler; weight-capped
  "display-only", // shown for transparency; not a probability driver
  "planned", // intended; not active
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export interface ModelSignalTruth {
  /** Stable signal key (mirrors ModelFeatureFamily where one exists). */
  key: string;
  /** User-facing label. */
  label: string;
  claimStatus: ClaimStatus;
  /** Used directly in probability calculations today. */
  active: boolean;
  /** Exercised in the historical backtest (out-of-sample plausibility check). */
  backtested: boolean;
  /** Key(s) into MODEL_WEIGHTS, or null for non-weighted signals. Never a literal weight. */
  weightRef: WeightKey | WeightKey[] | null;
  /** Short, calm, user-facing caption. */
  caption: string;
  /** Optional caveat / confounding note. */
  caveat?: string;
}

/**
 * The model's signals, ordered for display. `active-validated` is reserved for the four
 * drivers that are BOTH active and in the backtest (Elo, FIFA, host, regional). Manager,
 * climate, structural and tournament-context are active but `experimental` (not backtested);
 * squad and recent form are `placeholder`. Live results are `display-only`.
 */
export const MODEL_SIGNAL_TRUTH: readonly ModelSignalTruth[] = [
  {
    key: "eloRating",
    label: "Elo rating",
    claimStatus: "active-validated",
    active: true,
    backtested: true,
    weightRef: "elo",
    caption: "Published World Football Elo — the anchor strength signal.",
  },
  {
    key: "fifaRanking",
    label: "FIFA ranking",
    claimStatus: "active-validated",
    active: true,
    backtested: true,
    weightRef: ["fifaRankingPerPlace", "fifaRankingCap"],
    caption: "FIFA ranking-place advantage, converted to Elo-equivalent points and capped.",
  },
  {
    key: "hostAdvantage",
    label: "Host advantage",
    claimStatus: "active-validated",
    active: true,
    backtested: true,
    weightRef: "host",
    caption: "Co-host edge (crowd, travel, familiarity) — a regulation fact.",
  },
  {
    key: "regionalAdvantage",
    label: "Regional advantage",
    claimStatus: "active-validated",
    active: true,
    backtested: true,
    weightRef: "regional",
    caption: "Host-region (CONCACAF, non-host) travel/familiarity edge.",
  },
  {
    key: "squadQuality",
    label: "Squad quality",
    claimStatus: "placeholder",
    active: true,
    backtested: false,
    weightRef: "squadQuality",
    caption: "Hand-authored placeholder, weight-capped pending a licensed player-data source.",
  },
  {
    key: "recentForm",
    label: "Recent form",
    claimStatus: "placeholder",
    active: true,
    backtested: false,
    weightRef: "recentForm",
    caption: "Hand-authored placeholder, weight-capped pending a wired results feed.",
  },
  {
    key: "managerCohesion",
    label: "Manager cohesion",
    claimStatus: "experimental",
    active: true,
    backtested: false,
    weightRef: "manager",
    caption: "Same-nationality cohesion proxy — included as a small prior, not yet backtested.",
    caveat:
      "Crude binary proxy; correlates with established footballing nations (already captured by Elo/FIFA) and is not a measure of actual squad cohesion.",
  },
  {
    key: "climateFamiliarity",
    label: "Climate suitability",
    claimStatus: "experimental",
    active: true,
    backtested: false,
    weightRef: "climate",
    caption: "Home-climate playability prior, capped — a candidate heuristic, not yet backtested.",
    caveat: "Home-country playability, not a tournament-window/venue acclimatisation score.",
  },
  {
    key: "structural",
    label: "Structural / economic",
    claimStatus: "experimental",
    active: true,
    backtested: false,
    weightRef: "structural",
    caption: "Deliberately weak economic prior (GDP per capita + population) — not yet backtested.",
    caveat: "Never a determinative match-level predictor; risk of being overstated.",
  },
  {
    key: "tournamentContext",
    label: "Tournament context",
    claimStatus: "experimental",
    active: true,
    backtested: false,
    weightRef: "tournamentContext",
    caption:
      "Group-stage logistics prior (travel/rest/altitude/time-zone/venue-continuity), capped — not yet backtested.",
    caveat: "Excludes host/regional (no double-count); heat/venue-climate deferred; no live updates.",
  },
  {
    key: "liveResults",
    label: "Live results",
    claimStatus: "display-only",
    active: false,
    backtested: false,
    weightRef: null,
    caption: "Shown on Tournament State and completed match cards; not recalculated into probabilities yet.",
  },
] as const;

/** Signal keys that are active AND exercised in the backtest (the only `active-validated` set). */
export const BACKTESTED_SIGNAL_KEYS = ["eloRating", "fifaRanking", "hostAdvantage", "regionalAdvantage"] as const;

/** Active drivers that feed probabilities today (weighted). */
export function activeSignals(): ModelSignalTruth[] {
  return MODEL_SIGNAL_TRUTH.filter((s) => s.active && s.weightRef !== null);
}

/** Lookup by signal key. */
export function getSignalTruth(key: string): ModelSignalTruth | undefined {
  return MODEL_SIGNAL_TRUTH.find((s) => s.key === key);
}

/** Calm chip label for a claim status (UI helper). */
export function claimStatusLabel(status: ClaimStatus): string {
  switch (status) {
    case "active-validated":
      return "Active · backtested";
    case "active-uncalibrated":
      return "Active · uncalibrated";
    case "experimental":
      return "Experimental · not backtested";
    case "placeholder":
      return "Placeholder · capped";
    case "display-only":
      return "Display only";
    case "planned":
      return "Planned";
  }
}
