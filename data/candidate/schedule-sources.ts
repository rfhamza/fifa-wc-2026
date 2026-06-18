import type { CandidateProvenance } from "@/lib/types/candidate";

/**
 * Provenance for the two THIRD-PARTY CANDIDATE sources reconciled in Phase 1.5.
 *
 * Neither source is official FIFA data. They are used only to stage and
 * cross-check a candidate schedule + draw order. The source binaries are NOT
 * committed (third-party copyright / unclear redistribution); only the derived
 * JSON snapshots under ./raw/ and this typed layer are committed. See
 * docs/CANDIDATE_SCHEDULE_RECONCILIATION.md.
 */

/** Fan-made interactive Excel workbook — structured source (match#, venue, time). */
export const EXCEL_SOURCE: CandidateProvenance = {
  sourceName:
    "FIFA World Cup 2026 Interactive Schedule & Automated Standings (V2.62 Free)",
  sourceType: "third-party-xlsx",
  sourceFile: "FIFAWorldCup2026InteractiveScheduleAutomatedStandingsV2.62Free.xlsx",
  sourceLocation: "Matches + Setup sheets",
  extractionMethod: "scripts/extract-candidate-schedule.py (Python stdlib)",
  extractedAt: "2026-06-18T00:00:00Z",
  kickoffSourceTz: "America/New_York",
  confidence: "medium",
  notes:
    "Third-party fan tool. Kickoff times converted from New York time (EDT=UTC-4 " +
    "in June 2026) to UTC. Candidate draw order solved from the Article 12.4 chart.",
};

/** Newspaper wallchart — independent visual cross-check (no match#/venues). */
export const TELEGRAPH_SOURCE: CandidateProvenance = {
  sourceName: "The Telegraph — World Cup 2026 wallchart",
  sourceType: "third-party-pdf",
  sourceFile: "telegraph-world-cup-2026-wallchart.pdf",
  sourceLocation: "pages 1-2 (group fixtures)",
  extractionMethod: "manual transcription from the published wallchart",
  extractedAt: "2026-06-18T00:00:00Z",
  kickoffSourceTz: "Europe/London",
  confidence: "medium",
  notes:
    "Third-party newspaper wallchart. Kickoff times printed in UK time (BST=UTC+1) " +
    "and converted to UTC. Carries no match numbers or per-match venues.",
};

/** Both candidate sources, in priority order (structured Excel first). */
export const candidateSources: CandidateProvenance[] = [EXCEL_SOURCE, TELEGRAPH_SOURCE];
