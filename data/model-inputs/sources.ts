import type { ModelFeatureFamily, ModelInputSource } from "@/lib/types";
import { FIFA_RANKING_SOURCE } from "./snapshots/fifa-ranking-2026-06-11";
import { ELO_RATING_SOURCE } from "./snapshots/elo-rating-2026-06-11";
import { STRUCTURAL_ECONOMIC_SOURCE } from "./snapshots/structural-economic-2024";

/**
 * Phase 1.7 - model-input SOURCE REGISTRY (per feature family).
 *
 * HONESTY: every value the model consumes today is hand-authored. Nothing here is
 * `source-backed`/`verified` - that requires a supplied, cited snapshot promoted
 * via lib/data/validate-model-inputs.ts in a later step. Statuses:
 *   - `manual`      : deliberate directional estimate (no source yet).
 *   - `placeholder` : filler; CAPPED so it cannot silently drive probabilities.
 *   - `candidate`   : derived from cross-verified identity/structure.
 *   - `verified`    : regulation/official fact.
 *
 * Placeholder families are weight-capped in lib/model/predict.ts
 * (PLACEHOLDER_CONTRIBUTION_CAP + TOTAL_PLACEHOLDER_CONTRIBUTION_CAP).
 */
export const MODEL_INPUT_SOURCES: Record<ModelFeatureFamily, ModelInputSource> = {
  // Phase 1.10: promoted to source-backed from the supplied 11 Jun 2026 Elo snapshot.
  eloRating: ELO_RATING_SOURCE,
  // Phase 1.8: promoted to source-backed from the supplied FIFA ranking snapshot.
  fifaRanking: FIFA_RANKING_SOURCE,
  // Phase 1.12: promoted to a MIXED `candidate` family from the World Bank WDI 2024
  // snapshot - 46 economies source-backed; England/Scotland stay manual (no separate
  // WB economy, not parent-mapped to the UK). See snapshots/structural-economic-2024.ts.
  structural: STRUCTURAL_ECONOMIC_SOURCE,
  squadQuality: {
    family: "squadQuality",
    label: "Squad quality",
    sourceName: "Placeholder",
    status: "placeholder",
    notes:
      "Not source-backed (no licensed market-value/player data). Weight-capped until a source snapshot is supplied.",
  },
  recentForm: {
    family: "recentForm",
    label: "Recent form",
    sourceName: "Placeholder",
    status: "placeholder",
    notes:
      "Not source-backed (no results feed). Weight-capped until a rolling-results snapshot is supplied.",
  },
  climateFamiliarity: {
    family: "climateFamiliarity",
    label: "Climate familiarity",
    sourceName: "Placeholder",
    status: "placeholder",
    notes:
      "Not source-backed. Could later be derived from official venue climate vs team home region. Weight-capped for now.",
  },
  hostAdvantage: {
    family: "hostAdvantage",
    label: "Host advantage",
    sourceName: "FIFA regulation (co-host status)",
    status: "verified",
    notes: "Mexico/Canada/USA co-host status is a regulation fact.",
  },
  regionalAdvantage: {
    family: "regionalAdvantage",
    label: "Regional advantage",
    sourceName: "Confederation (cross-verified identity)",
    status: "candidate",
    notes: "Derived from confederation membership (candidate team identity).",
  },
  managerCohesion: {
    family: "managerCohesion",
    label: "Manager cohesion",
    sourceName: "Manager nationality (cross-verified identity)",
    status: "candidate",
    notes: "Same-nationality-manager proxy from cross-verified identity data.",
  },
};
