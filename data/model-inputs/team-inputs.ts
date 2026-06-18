import type { TeamModelInputs } from "@/lib/types";
import { officialTeams } from "@/data/official/teams";

/**
 * Phase 1.7 - per-team MODEL-INPUT SNAPSHOT (canonical model-driving values).
 *
 * Currently DERIVED from `officialTeams` (no 48-row duplication). This is the
 * single source the model reads strength values from (see lib/model/features.ts).
 * When an authoritative source snapshot is supplied later, replace this
 * derivation with the snapshot + flip the relevant family statuses in
 * `./sources.ts` - the model logic does not change.
 *
 * Values remain hand-authored placeholders/estimates today; see ./sources.ts for
 * per-family provenance + status, and lib/model/config.ts for the placeholder
 * weight caps that keep low-confidence families from dominating probabilities.
 */
export const MODEL_INPUTS_VERSION = "2026-06-18-derived-placeholder-v1";

export const modelInputSnapshot: TeamModelInputs[] = officialTeams.map((t) => ({
  teamId: t.id,
  eloRating: t.elo,
  fifaRanking: t.fifaRanking,
  gdpPerCapita: t.gdpPerCapita,
  population: t.population,
  recentForm: t.recentForm,
  squadQuality: t.squadQuality,
  climateFamiliarity: t.climateFamiliarity,
}));
