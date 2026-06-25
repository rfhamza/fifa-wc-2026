/**
 * Phase 1.28K - PUBLIC-SAFE live-state projection (pure).
 * -------------------------------------------------------
 * A minimized, sanitized projection of the internal `LiveTournamentState` that is safe
 * to hand to an app read-path. It carries ONLY canonical app identity (official
 * `matchNumber` / `M{n}` and app team ids) plus derived standings/bracket and
 * attribution/freshness/validation metadata.
 *
 * It deliberately EXCLUDES anything provider-sensitive or private: provider match/team
 * ids, raw provider payloads/headers, account identity, the live-state internal `source`
 * string, per-match freshness/warnings internals, provider standings, odds, referees,
 * event arrays, crest URLs. "Public-safe" means *shape*-safe; whether provider-derived
 * data is actually exposed publicly is a SEPARATE, deferred policy decision - surfaced
 * here via `isProviderDerived` + `publicSourcePolicy`.
 */
import type {
  GroupId,
  KnockoutStage,
} from "@/lib/types";
import type {
  LiveFreshnessStatus,
  LiveMatchStatus,
  LiveQualificationState,
  LiveStage,
  LiveTournamentState,
} from "./types";

export const PUBLIC_SAFE_SCHEMA_VERSION = "1.0.0";

/**
 * Where the projected data ultimately came from, for honest public labelling. We do NOT
 * publish football-data.org-derived state publicly yet, so provider-derived projections
 * are tagged `provider-private-deferred` (kept private until the ToU/publication phase).
 */
export type PublicSourcePolicy = "manual-snapshot" | "provider-private-deferred";

/** Coarse availability for a consumer (never leaks internal section detail). */
export type PublicSafeStatus = "ok" | "stale" | "unavailable";

/** Participant-resolution of a knockout slot (by participants, not by winner). */
export type BracketResolution = "resolved" | "partial" | "unresolved";

export interface PublicSafeAttribution {
  sourceName: string;
  sourceUrl?: string;
  /** Visible attribution line for the UI when this data is shown. */
  text: string;
}

export interface PublicSafeMatch {
  /** Canonical official match number (e.g. 73). */
  matchNumber: number;
  /** Canonical app match id ("M{n}"). */
  matchId: string;
  stage: LiveStage;
  group?: GroupId;
  kickoff?: string;
  /** Canonical app team ids (never provider ids). */
  teamA: string;
  teamB: string;
  status: LiveMatchStatus;
  goalsA?: number;
  goalsB?: number;
  /** Canonical app team id of the winner, if decided (knockouts). */
  winner?: string;
  penalties?: { a: number; b: number };
  lastUpdatedAt?: string;
}

export interface PublicSafeStanding {
  group: GroupId;
  position: number;
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  qualificationState: LiveQualificationState;
  /** Always "results": standings are internally derived (Article 13), never provider. */
  derivedFrom: "results";
}

export interface PublicSafeBracketMatch {
  matchNumber: number;
  round: KnockoutStage;
  /** Canonical app team ids, or null while undetermined. */
  homeTeamId: string | null;
  awayTeamId: string | null;
  winner: string | null;
  /** Participant activation: both known / one known / neither. */
  resolution: BracketResolution;
  /** Always "results": bracket is internally derived, never the provider bracket. */
  derivedFrom: "results";
}

export interface PublicSafeLiveState {
  schemaVersion: string;
  tournamentId: string;
  asOf: string;
  generatedAt: string;
  status: PublicSafeStatus;
  freshness: LiveFreshnessStatus;
  validationStatus: { ok: boolean; warningCount: number };
  attribution: PublicSafeAttribution;
  /** True if any input was provider-derived (kept private unless policy allows). */
  isProviderDerived: boolean;
  publicSourcePolicy: PublicSourcePolicy;
  matches: PublicSafeMatch[];
  standings: PublicSafeStanding[];
  bracket: PublicSafeBracketMatch[];
}

export interface ToPublicSafeOptions {
  attribution: PublicSafeAttribution;
  isProviderDerived: boolean;
  publicSourcePolicy: PublicSourcePolicy;
  tournamentId?: string;
}

const matchNumberOf = (matchId: string): number => Number(matchId.replace(/^M/, ""));

function coarseStatus(freshness: LiveFreshnessStatus): PublicSafeStatus {
  if (freshness === "invalid" || freshness === "missing") return "unavailable";
  if (freshness === "stale" || freshness === "fallback") return "stale";
  return "ok";
}

function resolutionOf(home: string | null, away: string | null): BracketResolution {
  if (home != null && away != null) return "resolved";
  if (home != null || away != null) return "partial";
  return "unresolved";
}

/**
 * Project an internal `LiveTournamentState` into the minimized public-safe shape.
 * PURE: no I/O, no env, no provider data. Drops the internal `source`, per-match
 * `freshnessStatus`/`warnings`, any provenance, and all provider fields.
 */
export function toPublicSafeLiveState(
  state: LiveTournamentState,
  opts: ToPublicSafeOptions,
): PublicSafeLiveState {
  const matches: PublicSafeMatch[] = state.matches.map((m) => ({
    matchNumber: matchNumberOf(m.matchId),
    matchId: m.matchId,
    stage: m.stage,
    ...(m.group ? { group: m.group } : {}),
    ...(m.kickoff ? { kickoff: m.kickoff } : {}),
    teamA: m.teamA,
    teamB: m.teamB,
    status: m.status,
    ...(typeof m.goalsA === "number" ? { goalsA: m.goalsA } : {}),
    ...(typeof m.goalsB === "number" ? { goalsB: m.goalsB } : {}),
    ...(m.winner ? { winner: m.winner } : {}),
    ...(m.penalties ? { penalties: { a: m.penalties.a, b: m.penalties.b } } : {}),
    ...(m.lastUpdatedAt ? { lastUpdatedAt: m.lastUpdatedAt } : {}),
  }));

  const standings: PublicSafeStanding[] = state.groupStandings.map((s) => ({
    group: s.group,
    position: s.rank,
    teamId: s.teamId,
    played: s.played,
    won: s.won,
    drawn: s.drawn,
    lost: s.lost,
    goalsFor: s.goalsFor,
    goalsAgainst: s.goalsAgainst,
    goalDifference: s.goalDifference,
    points: s.points,
    qualificationState: s.qualificationState,
    derivedFrom: "results",
  }));

  const bracket: PublicSafeBracketMatch[] = state.bracket.matches.map((b) => ({
    matchNumber: b.matchNumber,
    round: b.stage,
    homeTeamId: b.homeTeamId,
    awayTeamId: b.awayTeamId,
    winner: b.winner,
    resolution: resolutionOf(b.homeTeamId, b.awayTeamId),
    derivedFrom: "results",
  }));

  const invalid = state.freshness.overall === "invalid";
  return {
    schemaVersion: PUBLIC_SAFE_SCHEMA_VERSION,
    tournamentId: opts.tournamentId ?? "wc-2026",
    asOf: state.asOf,
    generatedAt: state.generatedAt,
    status: coarseStatus(state.freshness.overall),
    freshness: state.freshness.overall,
    validationStatus: { ok: !invalid, warningCount: state.warnings.length },
    attribution: opts.attribution,
    isProviderDerived: opts.isProviderDerived,
    publicSourcePolicy: opts.publicSourcePolicy,
    matches,
    standings,
    bracket,
  };
}
