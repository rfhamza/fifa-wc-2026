import type { CandidateScheduleDataset } from "@/lib/types/candidate";
import { candidateGroups } from "./groups";
import { candidateDrawOrder } from "./draw-order";
import { candidateGroupFixtures } from "./group-fixtures";
import { candidateSources } from "./schedule-sources";

/**
 * Phase 1.5 — assembled CANDIDATE schedule dataset.
 *
 * ⚠️  CANDIDATE / STAGING ONLY — NOT OFFICIAL FIFA DATA.
 *
 * Cross-checked from two THIRD-PARTY sources (a newspaper wallchart + a fan-made
 * Excel workbook). This module is intentionally NOT re-exported from
 * `lib/data/index.ts` and is NEVER read by the production resolver
 * (`lib/data/source.ts`). Production fixtures stay `position-generated` and no
 * non-host draw slot is written onto a `Team`.
 *
 * Promotion to official/verified requires an OFFICIAL FIFA source or
 * user-supplied authoritative JSON explicitly approved as authoritative —
 * agreement between the two candidate sources raises confidence but cannot, by
 * itself, make this data official.
 */
export const candidateSchedule: CandidateScheduleDataset = {
  groups: candidateGroups,
  drawOrder: candidateDrawOrder,
  fixtures: candidateGroupFixtures,
  sources: candidateSources,
};

/**
 * Off-by-default flag scaffolding a future, clearly-labelled candidate-schedule
 * preview. Kept `false` in this phase: there is NO preview UI, and enabling it
 * must never set `fixtureSource: "official"` nor mark any draw slot verified.
 */
export const CANDIDATE_SCHEDULE_PREVIEW = false;

export { candidateGroups } from "./groups";
export { candidateDrawOrder } from "./draw-order";
export { candidateGroupFixtures } from "./group-fixtures";
export { candidateSources, EXCEL_SOURCE, TELEGRAPH_SOURCE } from "./schedule-sources";
export { telegraphFixtures } from "./telegraph-cross-check";
export { excelCrossCheckFixtures } from "./excel-cross-check";
export { MANUAL_CONFLICT_RESOLUTIONS } from "./manual-resolutions";
export type { ManualConflictResolution } from "./manual-resolutions";
