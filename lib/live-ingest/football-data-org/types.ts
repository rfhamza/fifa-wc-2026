/**
 * Phase 1.28A - football-data.org PROVIDER-NATIVE types (minimal, sanitized subset).
 * --------------------------------------------------------------------------------
 * A minimal model of the football-data.org v4 shapes this adapter consumes. It is
 * DELIBERATELY a small subset - we model only what the normalizer reads, and never
 * crest/logo URLs, odds, referees, bookings, substitutions, or event arrays. The
 * full raw payloads are NEVER committed; only minimized sanitized test fixtures are.
 *
 * football-data.org does NOT expose official FIFA match numbers or bracket edges, so
 * the provider match `id` is provenance-only; canonical `matchNumber`/`M{n}` is
 * resolved by the normalizer against the app's official fixtures.
 */

/** Provider team reference. Knockout shells may have null id/name (unresolved). */
export interface FdTeamRef {
  id: number | null;
  name: string | null;
  shortName?: string | null;
  tla?: string | null;
  // NOTE: `crest` is intentionally omitted - we never ingest/commit logo URLs.
}

/** Provider score block. `regularTime`/`extraTime`/`penalties` are optional. */
export interface FdScore {
  winner?: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
  /** e.g. "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT". */
  duration?: string | null;
  fullTime?: { home: number | null; away: number | null };
  halfTime?: { home: number | null; away: number | null };
  regularTime?: { home: number | null; away: number | null };
  extraTime?: { home: number | null; away: number | null };
  penalties?: { home: number | null; away: number | null };
}

/** One provider match row (subset). */
export interface FdMatch {
  /** Provider-native match id - PROVENANCE ONLY (never the canonical key). */
  id: number;
  utcDate: string;
  /** TIMED | SCHEDULED | LIVE | IN_PLAY | PAUSED | FINISHED | POSTPONED | SUSPENDED | CANCELLED. */
  status: string;
  matchday?: number | null;
  /** GROUP_STAGE | LAST_32 | LAST_16 | QUARTER_FINALS | SEMI_FINALS | THIRD_PLACE | FINAL. */
  stage: string;
  /** "GROUP_A".."GROUP_L" for group stage; null for knockout. */
  group?: string | null;
  lastUpdated: string;
  /** Provider venue NAME (provenance-only); often absent. */
  venue?: string | null;
  homeTeam: FdTeamRef;
  awayTeam: FdTeamRef;
  score: FdScore;
}

export interface FdCompetition {
  id?: number;
  name?: string;
  /** Must be "WC" for the World Cup. */
  code?: string;
  type?: string;
}

export interface FdResultSet {
  count?: number;
  first?: string;
  last?: string;
  played?: number;
}

export interface FdMatchesResponse {
  competition?: FdCompetition;
  resultSet?: FdResultSet;
  matches: FdMatch[];
}

/* ---- Standings (comparison-only) ---- */

export interface FdStandingRow {
  position: number;
  team: FdTeamRef;
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export interface FdStandingsBlock {
  stage: string;
  /** "TOTAL" | "HOME" | "AWAY". We read only TOTAL. */
  type: string;
  /** Observed null - the WC standings endpoint returns one overall 48-team table. */
  group: string | null;
  table: FdStandingRow[];
}

export interface FdStandingsResponse {
  competition?: FdCompetition;
  standings: FdStandingsBlock[];
}
