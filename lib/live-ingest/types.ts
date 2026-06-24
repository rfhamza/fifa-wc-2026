/**
 * Phase 1.26B - Provider-agnostic live INGESTION adapter boundary (types only).
 * ----------------------------------------------------------------------------
 * The typed boundary for a FUTURE automated API ingestion path. It defines how a
 * provider feed is normalised into the EXISTING `RawLiveSnapshot` contract so the
 * rest of the app keeps depending only on `LiveTournamentState` - never on any
 * provider's native schema.
 *
 * Flow:  provider raw payload
 *        -> provider-specific normalize()  (this layer; pure)
 *        -> RawLiveSnapshot
 *        -> validateLiveSnapshot / ingestLiveSnapshot  (lib/live-state; unchanged)
 *        -> LiveTournamentState
 *
 * Hard rules (locked by tests/live-ingest-isolation.test.ts):
 *   - No production module imports `lib/live-ingest/*`.
 *   - This layer performs NO network I/O, reads NO env/secrets, and is type-only
 *     here (only `import type`). `fetchRaw()` is where a REAL adapter would later do
 *     network I/O; the only adapter in this phase is a mock that returns a fixture.
 *   - `matchNumber` stays canonical (`matchId = "M{n}"`); provider ids are
 *     PROVENANCE ONLY; provider standings/bracket are COMPARISON ONLY; the manual
 *     snapshot remains the fallback/audit path.
 *
 * Plan: `docs/LIVE_API_INGESTION_PLAN.md`.
 */
import type { GroupId } from "@/lib/types";
import type {
  LiveIngestionSource,
  RawLiveSnapshot,
} from "@/lib/live-state/types";

/* ----------------------------------------------------------------------------
 * Illustrative provider-native schema (NOT a real provider).
 * A real adapter would replace these shapes with the provider's actual schema;
 * the normalizer is the only place that ever sees them.
 * -------------------------------------------------------------------------- */

/** Provider metadata (illustrative). */
export interface ProviderMeta {
  sourceId: string;
  sourceName: string;
  /** A future real feed is `api`/`external`; never `manual` (that is the fallback). */
  sourceType: "api" | "external";
  sourceUrl?: string;
  /** ISO instant the provider payload was retrieved. */
  retrievedAt: string;
  /** ISO "as of" instant the provider snapshot represents. */
  asOf: string;
  reliability?: "high" | "medium" | "low";
}

/** One provider-native match row (illustrative). */
export interface ProviderMatch {
  /** Provider-native match id - PROVENANCE ONLY, never the fixture key. */
  providerId: string;
  /** Official FIFA match number exposed by the provider (the canonical key source). */
  matchNumber: number;
  /** Provider round label, e.g. "Group Stage" / "Round of 32". */
  round: string;
  /** Provider group label, e.g. "Group A" (group stage only). */
  group?: string;
  homeName: string;
  awayName: string;
  /** Provider team codes - PROVENANCE ONLY (codes mix IOC/FIFA/ISO; never mapped). */
  homeCode?: string;
  awayCode?: string;
  /** Provider status string, e.g. "finished" / "live" / "scheduled". */
  state: string;
  homeGoals?: number | null;
  awayGoals?: number | null;
  kickoffUtc: string;
  venueName?: string;
  /** Knockout winner (provider name); ignored for group stage. */
  winnerName?: string | null;
  /** Knockout shootout score, when applicable. */
  shootout?: { home: number; away: number } | null;
}

/** Provider standings row - COMPARISON ONLY (never source of truth). */
export interface ProviderStandingRow {
  group: string;
  position: number;
  teamName: string;
  played: number;
  points: number;
}

/** Provider bracket row - COMPARISON ONLY (never source of truth). */
export interface ProviderBracketRow {
  round: string;
  matchNumber: number;
  homeName: string | null;
  awayName: string | null;
  winnerName: string | null;
}

/** A full provider payload (illustrative; the mock fixture implements this). */
export interface ProviderPayload {
  meta: ProviderMeta;
  matches: ProviderMatch[];
  /** Provider-supplied standings - kept only for comparison, never ingested. */
  standings?: ProviderStandingRow[];
  /** Provider-supplied bracket - kept only for comparison, never ingested. */
  bracket?: ProviderBracketRow[];
}

/* ----------------------------------------------------------------------------
 * Normalized output (canonical contract + provenance + comparison + issues).
 * -------------------------------------------------------------------------- */

/** A non-fatal-to-fatal normalization problem (the offending match is excluded). */
export interface NormalizationIssue {
  providerId: string;
  code: string;
  message: string;
}

/** Per-match provider provenance - external identifiers, NEVER used for matching. */
export interface ProviderProvenanceRow {
  matchNumber: number;
  /** Canonical key derived from `matchNumber`. */
  matchId: string;
  /** Provider-native id (provenance only). */
  providerId: string;
  providerRound: string;
  homeCode?: string;
  awayCode?: string;
  venueRaw?: string;
  /** App venue id if resolvable, else null (provenance only; not fed to the snapshot). */
  providerVenueId: string | null;
}

export interface ProviderProvenance {
  sourceId: string;
  retrievedAt: string;
  asOf: string;
  matches: ProviderProvenanceRow[];
}

/** Provider standings/bracket carried for COMPARISON ONLY (never ingested). */
export interface ProviderComparison {
  standings: ProviderStandingRow[];
  bracket: ProviderBracketRow[];
  note: string;
}

/** Result of normalizing a provider payload into the canonical contract. */
export interface NormalizedResult {
  /** The canonical contract consumed by `lib/live-state` (matches only). */
  snapshot: RawLiveSnapshot;
  /** Provider ids/codes/venues kept aside as provenance. */
  provenance: ProviderProvenance;
  /** Provider standings/bracket kept aside for comparison only. */
  comparison: ProviderComparison;
  /** Matches that could not be mapped (excluded, never silently guessed). */
  errors: NormalizationIssue[];
}

/* ----------------------------------------------------------------------------
 * The provider-agnostic adapter boundary.
 * -------------------------------------------------------------------------- */

/**
 * A live provider adapter. `fetchRaw()` is the ONLY place a real adapter would do
 * network I/O (none in this phase); `normalize()` is pure. App code depends on the
 * resulting `LiveTournamentState`, never on `TRaw`.
 */
export interface LiveProviderAdapter<TRaw = unknown> {
  readonly source: LiveIngestionSource;
  fetchRaw(): Promise<TRaw>;
  normalize(raw: TRaw): NormalizedResult;
}

/** Re-export the canonical group id for adapter authors (type only). */
export type { GroupId };
