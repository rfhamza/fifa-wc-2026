/**
 * Phase 1.25B - Live tournament state CONTRACT (types only).
 * ---------------------------------------------------------
 * The typed contract for the first live-2026 ingestion layer. This is a
 * DATA-LAYER FOUNDATION: a manual-snapshot-style ingestion + freshness-governance
 * contract. It is NOT in-play prediction, NOT model tuning, and changes NO model
 * behaviour.
 *
 * Scope guarantees (locked by tests/live-state-isolation.test.ts):
 *   - No production prediction module imports `lib/live-state/*`.
 *   - This module is type-only at runtime (only `import type` from `@/lib/types`).
 *   - NO in-play event fields exist here (no lineups/injuries/xG/shots/cards/subs).
 *   - The first live phase covers fixtures, results, match status, group standings,
 *     bracket progression, and data freshness/fallback ONLY. No probability refresh.
 *
 * Source strategy: manual JSON/snapshot first (see `RawLiveSnapshot`); an API
 * adapter may map an external feed into the SAME contract later. No API/scraping
 * exists in this phase.
 *
 * Human-readable contract: `docs/LIVE_STATE.md`.
 */
import type { GroupId, KnockoutStage } from "@/lib/types";

/* ----------------------------------------------------------------------------
 * Controlled vocabularies.
 * -------------------------------------------------------------------------- */

/**
 * Match status. Aligned with the existing `FixtureStatus`
 * (`scheduled | in-progress | complete | unknown`), extended with the lifecycle
 * states a live tournament needs. We deliberately use `in-progress` rather than an
 * ambiguous `live`; an external feed's `live` is adapter-mapped to `in-progress`.
 */
export const LIVE_MATCH_STATUSES = [
  "scheduled",
  "in-progress",
  "complete",
  "postponed",
  "cancelled",
  "unknown",
] as const;
export type LiveMatchStatus = (typeof LIVE_MATCH_STATUSES)[number];

/** Stage of a live match: group stage or one of the official knockout stages. */
export const LIVE_STAGES = [
  "group",
  "roundOf32",
  "roundOf16",
  "quarterFinal",
  "semiFinal",
  "thirdPlace",
  "final",
] as const;
export type LiveStage = "group" | KnockoutStage;

/** Per-item data-freshness status. */
export const LIVE_FRESHNESS_STATUSES = [
  "fresh", // within the freshness window
  "stale", // older than the freshness window (still served, labelled)
  "fallback", // serving a prior good snapshot because the latest is unavailable
  "missing", // expected but absent
  "invalid", // failed validation; excluded from derivation
] as const;
export type LiveFreshnessStatus = (typeof LIVE_FRESHNESS_STATUSES)[number];

/** Origin/format of an ingestion source (no API/scraping wired in this phase). */
export const LIVE_SOURCE_TYPES = ["manual", "api", "external"] as const;
export type LiveSourceType = (typeof LIVE_SOURCE_TYPES)[number];

/** Qualification state derived from results (never overclaimed). */
export const LIVE_QUALIFICATION_STATES = ["qualified", "eliminated", "undecided"] as const;
export type LiveQualificationState = (typeof LIVE_QUALIFICATION_STATES)[number];

/* ----------------------------------------------------------------------------
 * Ingestion source.
 * -------------------------------------------------------------------------- */

export interface LiveIngestionSource {
  sourceId: string;
  sourceType: LiveSourceType;
  sourceName: string;
  /** ISO instant the source itself was last updated/retrieved. */
  lastUpdatedAt: string;
  sourceUrl?: string;
  reliability?: "high" | "medium" | "low";
}

/* ----------------------------------------------------------------------------
 * Raw (manual-snapshot) input shape — what an adapter supplies BEFORE validation.
 * -------------------------------------------------------------------------- */

export interface RawLiveMatch {
  /** Official match id, e.g. "M1".."M104" (maps to matchNumber). */
  matchId: string;
  stage: LiveStage;
  /** Group letter (group stage only). */
  group?: GroupId;
  teamA: string;
  teamB: string;
  status: LiveMatchStatus;
  goalsA?: number;
  goalsB?: number;
  /** Knockout winner (team id); required for a drawn-on-goals completed knockout. */
  winner?: string;
  /** Knockout shootout score, when a completed knockout went to penalties. */
  penalties?: { a: number; b: number };
  kickoff?: string;
  venueId?: string;
  /** ISO instant this match row was last updated at source. */
  lastUpdatedAt?: string;
}

export interface RawLiveSnapshot {
  sourceVersion?: string;
  source: LiveIngestionSource;
  /** ISO "as of" instant of the snapshot; defaults to source.lastUpdatedAt. */
  asOf?: string;
  matches: RawLiveMatch[];
}

/* ----------------------------------------------------------------------------
 * Validated/derived state shapes.
 * -------------------------------------------------------------------------- */

/** A validated, freshness-tagged match state. */
export interface LiveMatchState {
  matchId: string;
  stage: LiveStage;
  group?: GroupId;
  kickoff?: string;
  venueId?: string;
  teamA: string;
  teamB: string;
  status: LiveMatchStatus;
  goalsA?: number;
  goalsB?: number;
  winner?: string;
  penalties?: { a: number; b: number };
  lastUpdatedAt?: string;
  source: string;
  freshnessStatus: LiveFreshnessStatus;
  warnings: string[];
}

/** Derived group standing (reuses the GroupStanding numbers, adds qual state). */
export interface LiveGroupStanding {
  teamId: string;
  group: GroupId;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  rank: number;
  /** Derived ONLY when safe without overclaiming; otherwise `undecided`. */
  qualificationState: LiveQualificationState;
  /** Always "results": standings are derived, never trusted as supplied. */
  derivedFrom: "results";
}

/** One knockout match's progression state (resolved only where inputs allow). */
export interface LiveBracketMatch {
  matchNumber: number;
  stage: KnockoutStage;
  /** Resolved participants, or null while still undetermined. */
  homeTeamId: string | null;
  awayTeamId: string | null;
  winner: string | null;
  status: LiveMatchStatus;
  resolved: boolean;
}

export interface LiveBracketState {
  matches: LiveBracketMatch[];
  /** Match numbers whose slots/winner could not be resolved yet (flagged, never forced). */
  unresolved: number[];
  /** Ties/edge cases surfaced rather than silently forced (e.g. drawing of lots). */
  unresolvedTies: string[];
  derivedFrom: "results";
}

export interface LiveDataFreshness {
  /** ISO instant the consumer asked "as of". */
  asOf: string;
  /** ISO instant this state object was assembled. */
  generatedAt: string;
  /** Latest source update instant. */
  sourceLastUpdatedAt: string;
  /** Worst status across all sections (precedence: invalid>missing>fallback>stale>fresh). */
  overall: LiveFreshnessStatus;
  sections: {
    matches: LiveFreshnessStatus;
    standings: LiveFreshnessStatus;
    bracket: LiveFreshnessStatus;
  };
  /** Set whenever any section is `fallback` — never a silent fallback. */
  fallbackReason?: string;
  warnings: string[];
}

/** Top-level validated live tournament state. */
export interface LiveTournamentState {
  sourceVersion: string;
  generatedAt: string;
  asOf: string;
  matches: LiveMatchState[];
  groupStandings: LiveGroupStanding[];
  bracket: LiveBracketState;
  warnings: string[];
  freshness: LiveDataFreshness;
}

/* ----------------------------------------------------------------------------
 * Validation result + reference data the validator checks against.
 * -------------------------------------------------------------------------- */

/** A single validation problem. `fatal` rows mark a match invalid + exclude it. */
export interface LiveValidationIssue {
  matchId: string;
  code: string;
  message: string;
  fatal: boolean;
}

export interface LiveValidationResult {
  ok: boolean;
  /** Validated matches (fatal-invalid ones carry freshnessStatus "invalid"). */
  matches: LiveMatchState[];
  errors: LiveValidationIssue[];
  warnings: LiveValidationIssue[];
}

/** Expected official identity of a group-stage match (teams pre-known via the draw). */
export interface ReferenceGroupMatch {
  matchId: string;
  matchNumber: number;
  group: GroupId;
  homeTeamId: string;
  awayTeamId: string;
}

/** Expected official identity of a knockout match (teams depend on results). */
export interface ReferenceKnockoutMatch {
  matchId: string;
  matchNumber: number;
  stage: KnockoutStage;
}

/**
 * Static official reference the validator checks ingested rows against. Injected
 * so the pure validator/deriver can be unit-tested with small synthetic fixtures;
 * `buildOfficialReference()` (ingest.ts) constructs the real one from `lib/data`.
 */
export interface LiveStateReference {
  groupMatches: ReferenceGroupMatch[];
  knockoutMatches: ReferenceKnockoutMatch[];
  validTeamIds: string[];
  groups: { id: GroupId; teamIds: string[] }[];
  /** Per-team Article-13 metadata (fifaRanking + conduct) for standings derivation. */
  teamMeta: { teamId: string; fifaRanking: number; conductScore: number }[];
}

/** Options for freshness computation (deterministic: caller supplies `asOf`). */
export interface FreshnessOptions {
  /** ISO instant to evaluate freshness against. */
  asOf: string;
  /** A match older than this many seconds (vs asOf) is `stale`. */
  staleAfterSeconds: number;
}
