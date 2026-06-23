/**
 * Phase 1.18B-0 - historical backtesting source-pack CONTRACT (types only).
 * -----------------------------------------------------------------------
 * Machine-readable contract for the per-tournament historical source packs that a
 * later phase (1.18B+) will ingest. This is a STANDALONE type module (no imports)
 * and is part of the isolated `lib/backtesting/` layer: it is NEVER imported by the
 * production 2026 app, and no historical data is ingested in this phase.
 *
 * Leakage rule (enforced by later validators, not here): every as-of field MUST be
 * strictly before the tournament's `openingKickoff`; no tournament result may feed a
 * pre-tournament feature; if a field cannot be reconstructed without leakage, omit it.
 * Raw source files are NEVER committed - only derived snapshots with provenance +
 * checksums. See docs/BACKTESTING_DATA_CONTRACT.md / SOURCE_AUDIT / METHOD.
 */

/** Per-row / per-pack provenance (mirrors the model-input snapshot discipline). */
export interface BacktestProvenance {
  sourceName: string;
  sourceUrl?: string;
  /** Supplied source file name (raw NOT committed). */
  sourceFile?: string;
  /** SHA-256 of the supplied source file - the reproducibility anchor. */
  sha256?: string;
  /** Licence note (e.g. "CC0", "CC BY 4.0", "free non-commercial + attribution"). */
  licence?: string;
  retrievedAt?: string;
  /** Data "as of" instant; for pre-tournament packs MUST be < openingKickoff. */
  asOfDate?: string;
  notes?: string;
}

export type TournamentFormat = "32-team-8-groups" | "24-team" | "48-team-12-groups" | "other";
export type MatchStage = "group" | "round-of-32" | "round-of-16" | "quarter-final" | "semi-final" | "third-place" | "final";
/** 90-minute outcome from team A's perspective. */
export type Outcome90 = "A" | "D" | "B";

/** 1. Tournament identity + structure. */
export interface HistoricalTournamentIdentity {
  tournamentYear: number;
  hostCountries: string[];
  /** ISO instant of the opening kickoff - the leakage cutoff for this tournament. */
  openingKickoff: string;
  format: TournamentFormat;
  /** Backtest team ids (historical id space; mapped, not necessarily the 2026 ids). */
  teamIds: string[];
  /** teamId -> confederation (AFC/CAF/CONCACAF/CONMEBOL/OFC/UEFA). */
  confederations: Record<string, string>;
  /** groupId -> ordered teamIds. */
  groups: Record<string, string[]>;
  /** Optional knockout bracket structure (slots/edges), when available. */
  bracket?: unknown;
  provenance: BacktestProvenance;
}

/** 2. One historical match result. */
export interface HistoricalMatchResult {
  matchId: string;
  date: string;
  stage: MatchStage;
  group?: string;
  teamA: string;
  teamB: string;
  goalsA: number;
  goalsB: number;
  /** 90-minute outcome (the W/D/L the Poisson engine is scored against). */
  resultAt90?: Outcome90;
  afterExtraTime?: boolean;
  penalties?: { a: number; b: number };
  /**
   * Actual knockout WINNER (team id), after extra time / penalties — source-backed from
   * the raw source-pack `winner` column. RECONSTRUCTION METADATA ONLY: it records who
   * actually advanced/won (the final carries the champion; the third-place match carries
   * its winner). It is present on knockout matches only (group-stage matches omit it) and
   * is NEVER used for match-level probability scoring and NEVER drives `resultAt90` — the
   * 90-minute W/D/L diagnostic target remains `resultAt90` from the 90' `goalsA`/`goalsB`.
   */
  winner?: string;
  venue?: string;
  sourceRef: string;
}

/** 3. Pre-tournament Elo (as-of strictly before opening kickoff). */
export interface PreTournamentEloRow {
  teamId: string;
  rating: number;
  asOfDate: string;
  sourceRef: string;
}

/** 4. Pre-tournament FIFA ranking (as-of strictly before opening kickoff). */
export interface PreTournamentFifaRow {
  teamId: string;
  rank: number;
  points?: number;
  rankingDate: string;
  sourceRef: string;
}

/** 5. Historical macro (lagged to tournament year or earlier). */
export interface HistoricalMacroRow {
  teamId: string;
  year: number;
  population: number;
  gdpCurrentUsd: number;
  gdpPerCapitaUsd: number;
  /** Documented lag rule, e.g. "tournament-year" or "year-1". */
  lagRule: string;
  sourceRef: string;
}

/** One completed pre-tournament match for the recent-form pack. */
export interface RecentFormSourceMatch {
  date: string;
  opponent: string;
  goalsFor: number;
  goalsAgainst: number;
  competition: string;
  neutral: boolean;
}

/** 6. Recent-form source pack (matches strictly before opening kickoff). */
export interface RecentFormSourceRow {
  teamId: string;
  asOfDate: string;
  matches: RecentFormSourceMatch[];
  sourceRef: string;
}

/** 7a. Optional manager pack (candidate hypothesis only - NOT a core feature). */
export interface ManagerRow {
  teamId: string;
  managerName: string;
  managerNationality: string;
  sourceRef: string;
}

/** 7b. Optional squad roster pack (NO proprietary ratings / market values). */
export interface SquadRosterSourceRow {
  teamId: string;
  squadType: "final" | "provisional" | "inferred";
  asOfDate: string;
  players: {
    playerName: string;
    position: string;
    dateOfBirth?: string;
    club?: string;
    clubCountry?: string;
    caps?: number;
    goals?: number;
  }[];
  sourceRef: string;
}

/** The complete per-tournament source pack (optional packs may be absent). */
export interface HistoricalSourcePack {
  identity: HistoricalTournamentIdentity;
  results: HistoricalMatchResult[];
  elo: PreTournamentEloRow[];
  fifa: PreTournamentFifaRow[];
  macro: HistoricalMacroRow[];
  recentForm: RecentFormSourceRow[];
  managers?: ManagerRow[];
  squads?: SquadRosterSourceRow[];
}

/** Field names that MUST NOT appear on any historical row (proprietary). */
export const BACKTEST_FORBIDDEN_FIELDS = [
  "marketValue", "transferValue", "playerRating", "fifaRating", "sofifaRating",
  "eaRating", "optaRating", "overall", "potential", "wage", "contractValue",
] as const;

export interface BacktestValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
