import type { GroupId } from "@/lib/types";

/**
 * Phase 1.5 — manually resolved CANDIDATE cross-source conflicts.
 *
 * ⚠️  CANDIDATE / STAGING ONLY — NOT OFFICIAL FIFA DATA.
 *
 * When the Excel and Telegraph sources disagreed on a high-impact field, the
 * default policy keeps the Excel value and leaves the conflict for manual
 * review. The entries below were inspected by a human who confirmed the
 * Telegraph value is correct, so the candidate value for those fixtures uses the
 * Telegraph kickoff instead. Both source values are retained here so the
 * reconciliation record still shows that Excel conflicted and the Telegraph was
 * selected after manual review (see lib/data/validate-candidate.ts and
 * docs/CANDIDATE_SCHEDULE_RECONCILIATION.md).
 *
 * A manual resolution RAISES confidence but does NOT make the data official.
 * The chosen value remains candidate until an official FIFA schedule, or
 * user-approved authoritative JSON, is supplied.
 */
export interface ManualConflictResolution {
  /** Candidate match number (1..72) from the Excel workbook. */
  matchNumber: number;
  group: GroupId;
  homeTeamId: string;
  awayTeamId: string;
  /** The field that conflicted and was resolved. */
  field: "kickoff";
  /** The original Excel value (kept for the reconciliation record). */
  excelValue: string;
  /** The Telegraph value, selected as the candidate value. */
  telegraphValue: string;
  /** Which source's value was chosen. */
  selectedSource: "telegraph" | "excel";
  /** Who reviewed it and when (ISO date). */
  reviewedBy: string;
  reviewedAt: string;
  note: string;
}

export const MANUAL_CONFLICT_RESOLUTIONS: ManualConflictResolution[] = [
  {
    matchNumber: 20,
    group: "J",
    homeTeamId: "austria",
    awayTeamId: "jordan",
    field: "kickoff",
    excelValue: "2026-06-16T04:00:00Z",
    telegraphValue: "2026-06-17T04:00:00Z",
    selectedSource: "telegraph",
    reviewedBy: "user",
    reviewedAt: "2026-06-18",
    note: "Manual review confirmed the Telegraph date (one day later than Excel). Candidate only; not official.",
  },
  {
    matchNumber: 36,
    group: "F",
    homeTeamId: "tunisia",
    awayTeamId: "japan",
    field: "kickoff",
    excelValue: "2026-06-20T04:00:00Z",
    telegraphValue: "2026-06-21T04:00:00Z",
    selectedSource: "telegraph",
    reviewedBy: "user",
    reviewedAt: "2026-06-18",
    note: "Manual review confirmed the Telegraph date (one day later than Excel). Candidate only; not official.",
  },
];
