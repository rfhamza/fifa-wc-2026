import type { TeamModelInputs } from "@/lib/types";
import { officialTeams } from "@/data/official/teams";
import { fifaRankingSnapshot } from "./snapshots/fifa-ranking-2026-06-11";
import { eloRatingSnapshot } from "./snapshots/elo-rating-2026-06-11";
import { structuralEconomicSnapshot } from "./snapshots/structural-economic-2024";
import { climateSuitabilitySnapshot } from "./snapshots/climate-suitability-1991-2020";
import { climateSuitabilityTo100 } from "@/lib/model/climate-suitability";
import { tournamentContextScoreForTeam } from "@/lib/tournament-context";

/** Source-backed FIFA ranking (rank + points) by team id (Phase 1.8). */
const FIFA_BY_TEAM = new Map(fifaRankingSnapshot.map((r) => [r.teamId, r]));
/** Source-backed Elo rating (rank + rating) by team id (Phase 1.10). */
const ELO_BY_TEAM = new Map(eloRatingSnapshot.map((r) => [r.teamId, r]));
/** Structural/economic row (World Bank WDI 2024; England/Scotland official-derived) by team id (Phase 1.12). */
const STRUCTURAL_BY_TEAM = new Map(structuralEconomicSnapshot.map((r) => [r.teamId, r]));
/** Climate-suitability row (CCKP 1991-2020; England/Scotland Met Office) by team id (Phase 1.13). */
const CLIMATE_BY_TEAM = new Map(climateSuitabilitySnapshot.map((r) => [r.teamId, r]));

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
export const MODEL_INPUTS_VERSION = "2026-06-20-tournament-context-v7";

export const modelInputSnapshot: TeamModelInputs[] = officialTeams.map((t) => {
  // FIFA ranking (Phase 1.8), Elo rating (Phase 1.10) and structural/economic
  // (Phase 1.12) come from the snapshots; remaining placeholder families stay
  // derived. Structural values are World Bank WDI 2024 for 46 teams; England/
  // Scotland snapshot rows carry the existing hand-authored (manual) values. Fall
  // back to the team's own value only if a snapshot row is missing (validator flags).
  const fifa = FIFA_BY_TEAM.get(t.id);
  const elo = ELO_BY_TEAM.get(t.id);
  const struct = STRUCTURAL_BY_TEAM.get(t.id);
  const climate = CLIMATE_BY_TEAM.get(t.id);
  return {
    teamId: t.id,
    eloRating: elo?.eloRating ?? t.elo,
    eloRank: elo?.eloRank,
    fifaRanking: fifa?.fifaRank ?? t.fifaRanking,
    fifaRankingPoints: fifa?.fifaPoints,
    gdpPerCapita: struct?.gdpPerCapitaCurrentUsd ?? t.gdpPerCapita,
    population: struct?.population ?? t.population,
    gdpCurrentUsd: struct?.gdpCurrentUsd,
    recentForm: t.recentForm,
    squadQuality: t.squadQuality,
    // Phase 1.13: candidate climate-suitability score (CCKP 1991-2020; England/
    // Scotland Met Office), mapped onto the 0..100 scale. Fall back to the team's
    // own value only if a snapshot row is missing (validator flags).
    climateFamiliarity: climate
      ? climateSuitabilityTo100(climate)
      : t.climateFamiliarity,
    // Phase 1.15B: signed -1..+1 relative tournament-context score from the team's
    // group-stage itinerary (venue geo + official fixtures). Neutral 0 fallback if
    // a team has no resolvable itinerary. Candidate; capped + pairwise in predict.ts.
    tournamentContext: tournamentContextScoreForTeam(t.id)?.composite ?? 0,
  };
});
