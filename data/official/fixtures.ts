import type { OfficialFixture } from "@/lib/types";
import { stagedOfficialSchedule, OFFICIAL_SCHEDULE_SOURCE } from "./staging/schedule";

/**
 * OFFICIAL chronological group-stage schedule (FIFA Art. 16) - ACTIVE.
 *
 * PROVENANCE (A3): Official FIFA World Cup 2026 Match Schedule, v17, 10 Apr 2026,
 * all times Eastern Time, "subject to change". Transcribed + verified in Phase 1.6
 * Step A (see data/official/staging/schedule.ts and
 * docs/OFFICIAL_SCHEDULE_TRANSCRIPTION_AUDIT.md); activated in Step B.
 *
 * These rows are DERIVED from the staged schedule (single source of truth) - the
 * 72 M1..M72 rows are not duplicated here. Rows are keyed by DRAW POSITION; the
 * resolver maps positions -> teams using each group's (now verified) draw
 * positions, so `resolveDataset()` serves `fixtureSource: "official"`.
 *
 * The schedule remains officially labelled "subject to change" (see
 * OFFICIAL_SCHEDULE_SOURCE), preserved on every row via `subjectToChange: true`.
 */
export const officialFixtures: OfficialFixture[] = stagedOfficialSchedule.map((row) => ({
  matchNumber: row.matchNumber,
  group: row.group,
  matchday: row.matchday,
  homePosition: row.homePosition,
  awayPosition: row.awayPosition,
  venueId: row.venueId,
  kickoff: row.kickoffUtc,
  status: row.status ?? "scheduled",
  sourceRef: row.sourceRef,
  subjectToChange: row.subjectToChange,
  kickoffSourceTz: "America/New_York",
  kickoffLocalSourceTime: row.kickoffLocalSourceTime,
  venueLabelRaw: row.venueLabelRaw,
}));

export { OFFICIAL_SCHEDULE_SOURCE };
