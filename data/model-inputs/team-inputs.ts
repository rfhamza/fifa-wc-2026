import type { TeamModelInputs } from "@/lib/types";
import { officialTeams } from "@/data/official/teams";
import { fifaRankingSnapshot } from "./snapshots/fifa-ranking-2026-06-11";
import { eloRatingSnapshot } from "./snapshots/elo-rating-2026-06-11";

/** Source-backed FIFA ranking (rank + points) by team id (Phase 1.8). */
const FIFA_BY_TEAM = new Map(fifaRankingSnapshot.map((r) => [r.teamId, r]));
/** Source-backed Elo rating (rank + rating) by team id (Phase 1.10). */
const ELO_BY_TEAM = new Map(eloRatingSnapshot.map((r) => [r.teamId, r]));

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
export const MODEL_INPUTS_VERSION = "2026-06-19-elo-source-backed-v3";

export const modelInputSnapshot: TeamModelInputs[] = officialTeams.map((t) => {
  // FIFA ranking (Phase 1.8) + Elo rating (Phase 1.10) come from the source-backed
  // snapshots; structural/placeholder families stay derived. Fall back to the
  // team's own value only if a snapshot row is missing (the validator flags that).
  const fifa = FIFA_BY_TEAM.get(t.id);
  const elo = ELO_BY_TEAM.get(t.id);
  return {
    teamId: t.id,
    eloRating: elo?.eloRating ?? t.elo,
    eloRank: elo?.eloRank,
    fifaRanking: fifa?.fifaRank ?? t.fifaRanking,
    fifaRankingPoints: fifa?.fifaPoints,
    gdpPerCapita: t.gdpPerCapita,
    population: t.population,
    recentForm: t.recentForm,
    squadQuality: t.squadQuality,
    climateFamiliarity: t.climateFamiliarity,
  };
});
