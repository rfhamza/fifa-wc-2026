/**
 * Phase 1.18C-1 - historical feature adapter (backtesting layer).
 * --------------------------------------------------------------
 * Converts a `HistoricalSourcePack` into per-team `TeamFeatureSet`s built DIRECTLY
 * from the historical snapshot - never from 2026 `Team` records, `data/model-inputs/*`,
 * `lib/model/features.ts`, or any 2026 placeholder.
 *
 * Only Elo and FIFA ranking are sourced from the pack; host / regional are derived
 * RELATIVE TO THIS TOURNAMENT'S host (Qatar / AFC for WC-2022), not the production
 * 2026 CONCACAF hardcoding. Every other feature is set to an explicit NEUTRAL value
 * so that, consumed as a pairwise difference, it contributes nothing. The active
 * driver set (see model-variants.ts) is the source of truth for what is "on"; these
 * neutral values are the defensive backstop.
 *
 * Type-only import of `TeamFeatureSet` keeps this module free of any runtime
 * production dependency.
 */
import type { TeamFeatureSet } from "@/lib/types";
import type { HistoricalSourcePack } from "./types";

/** Neutral (disabled) values for every feature the WC-2022 pilot excludes. */
const NEUTRAL = {
  squadQuality: 0,
  recentForm: 0,
  climateFamiliarity: 0,
  sameNationalityManager: false,
  gdpPerCapita: 0,
  population: 0,
  structuralDepth: 0,
  tournamentContext: 0,
} as const;

/** Slugify a host country name to the historical team-id convention ("Qatar" -> "qatar"). */
const slug = (name: string): string => name.toLowerCase().replace(/\s+/g, "-");

/**
 * Build `teamId -> TeamFeatureSet` for every team in the pack identity. Elo and
 * FIFA rank come from the pack; host/regional are relative to the pack's host. Throws
 * if a team is missing Elo or FIFA coverage (the validator already guarantees this).
 */
export function buildHistoricalFeatures(
  pack: HistoricalSourcePack,
): Map<string, TeamFeatureSet> {
  const { identity, elo, fifa } = pack;
  const eloByTeam = new Map(elo.map((r) => [r.teamId, r.rating]));
  const fifaByTeam = new Map(fifa.map((r) => [r.teamId, r.rank]));

  const hostIds = new Set(
    identity.hostCountries.map(slug).filter((s) => identity.teamIds.includes(s)),
  );
  const hostConfederations = new Set(
    [...hostIds].map((h) => identity.confederations[h]).filter((c): c is string => !!c),
  );

  const out = new Map<string, TeamFeatureSet>();
  for (const teamId of identity.teamIds) {
    const eloRating = eloByTeam.get(teamId);
    const fifaRanking = fifaByTeam.get(teamId);
    if (eloRating === undefined) throw new Error(`no Elo for historical team "${teamId}"`);
    if (fifaRanking === undefined) throw new Error(`no FIFA rank for historical team "${teamId}"`);
    const confederation = identity.confederations[teamId];
    const isHost = hostIds.has(teamId);
    const isRegional = !isHost && !!confederation && hostConfederations.has(confederation);
    out.set(teamId, {
      teamId,
      elo: eloRating,
      fifaRanking,
      isHost,
      isRegional,
      ...NEUTRAL,
    });
  }
  return out;
}
