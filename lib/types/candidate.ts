/**
 * Phase 1.5 — CANDIDATE schedule & draw-order staging types.
 * ----------------------------------------------------------
 * These types describe a CANDIDATE layer cross-checked from third-party sources
 * (a newspaper wallchart + a fan-made interactive Excel workbook). They are kept
 * deliberately SEPARATE from the core domain types in `lib/types/index.ts`:
 *
 *   - Nothing here is "official" or "verified". The candidate layer stages a
 *     plausible schedule + draw order for reconciliation only.
 *   - The production resolver (lib/data/source.ts) NEVER imports this layer, so
 *     `fixtureSource` stays "position-generated" and no non-host draw slot is
 *     written onto a `Team`.
 *   - Promotion to official/verified requires an OFFICIAL FIFA source or
 *     user-supplied authoritative JSON the user explicitly approves — agreement
 *     between two third-party sources raises confidence but is NOT sufficient.
 */
import type { DrawPosition, FixtureStatus, GroupId } from "@/lib/types";

/**
 * How a candidate value compares across the two third-party sources.
 *
 * `resolved` marks a conflict that was inspected by a human and deliberately
 * settled by selecting one source's value (recorded in
 * `data/candidate/manual-resolutions.ts`). It is still a CANDIDATE value — a
 * manual resolution raises confidence but does not make the data official.
 */
export type SourceAgreementStatus =
  | "matches"
  | "conflict"
  | "resolved"
  | "missing-in-one-source"
  | "not-checked";

/** The kind of third-party source a candidate value was derived from. */
export type CandidateSourceType = "third-party-pdf" | "third-party-xlsx";

/** Provenance for one third-party candidate source. */
export interface CandidateProvenance {
  sourceName: string;
  sourceType: CandidateSourceType;
  /** Original file name (the binary itself is NOT committed). */
  sourceFile: string;
  /** Sheet / page the data came from, when applicable. */
  sourceLocation?: string;
  /** How the data was pulled out (script path or "manual transcription"). */
  extractionMethod: string;
  /** ISO timestamp the snapshot was taken. */
  extractedAt: string;
  /** Source timezone of any printed kickoff times. */
  kickoffSourceTz?: "America/New_York" | "Europe/London";
  confidence: "high" | "medium" | "low";
  notes?: string;
}

/** A candidate draw slot, e.g. "A1".."L4" (reuses the group + draw position). */
export type CandidateDrawSlot = `${GroupId}${DrawPosition}`;

/** A single resolved slot within a group's candidate draw order. */
export interface CandidateDrawSlotAssignment {
  position: DrawPosition;
  teamId: string;
  candidateDrawSlot: CandidateDrawSlot;
}

/** A group's candidate intra-group draw order (positions 1..4). */
export interface CandidateDrawOrder {
  group: GroupId;
  slots: CandidateDrawSlotAssignment[];
  agreement: SourceAgreementStatus;
  provenance: CandidateProvenance[];
}

/** A group's candidate membership (four team ids). */
export interface CandidateGroupMembership {
  group: GroupId;
  teamIds: string[];
  agreement: SourceAgreementStatus;
  provenance: CandidateProvenance[];
}

/**
 * A single candidate group-stage fixture. The Excel value is preferred on
 * conflict, EXCEPT where a conflict was manually resolved in favour of the
 * Telegraph (see `data/candidate/manual-resolutions.ts`); such fixtures carry
 * `agreement: "resolved"`.
 */
export interface CandidateFixture {
  /** Candidate match number (1..72) from the Excel workbook. */
  matchNumber: number;
  group: GroupId;
  /** Round-robin matchday within the group (1..3), from the Article 12.4 chart. */
  matchday: number;
  homeTeamId: string;
  awayTeamId: string;
  /** Article 12.4 draw positions this fixture pairs (home vs away). */
  homePosition: DrawPosition;
  awayPosition: DrawPosition;
  /**
   * Kickoff in UTC (ISO). Normally the Excel value (converted from New York
   * time); for a manually resolved conflict it is the selected Telegraph value.
   */
  kickoffUtc: string;
  /** Source timezone the chosen kickoff was printed in (before UTC conversion). */
  kickoffSourceTz: "America/New_York" | "Europe/London";
  /** Resolved venue id, when the candidate venue string maps to a known venue. */
  venueId?: string;
  /** Raw venue string as printed in the source (kept for transparency). */
  venueRaw?: string;
  status?: FixtureStatus;
  /** Cross-source agreement for this fixture (Excel vs Telegraph). */
  agreement: SourceAgreementStatus;
  provenance: CandidateProvenance[];
}

/** Result of validating + reconciling the candidate schedule. */
export interface CandidateScheduleValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  /** Tally of fixtures by cross-source agreement status. */
  agreement: Record<SourceAgreementStatus, number>;
  /**
   * UNRESOLVED high-impact conflicts (date/time, home/away, venue, team) still
   * awaiting human review. Empty once every such conflict has been resolved.
   */
  manualReview: string[];
  /**
   * Conflicts that WERE inspected and deliberately settled (see
   * `data/candidate/manual-resolutions.ts`). The chosen value remains candidate.
   */
  manuallyResolved: string[];
}

/** A minimal cross-check record from a single source (used by reconcileSources). */
export interface CandidateSourceFixture {
  group: GroupId;
  homeTeamId: string;
  awayTeamId: string;
  kickoffUtc: string;
  /** Present only for the Excel source. */
  matchNumber?: number;
  /** Present only for the Excel source. */
  venueId?: string;
}

/** The assembled candidate dataset (data only — never resolved into production). */
export interface CandidateScheduleDataset {
  groups: CandidateGroupMembership[];
  drawOrder: CandidateDrawOrder[];
  fixtures: CandidateFixture[];
  sources: CandidateProvenance[];
}
