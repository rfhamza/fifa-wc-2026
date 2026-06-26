/**
 * Phase 1.28R - OFFICIAL knockout-stage schedule (M73-M104), kickoff timing.
 * -------------------------------------------------------------------------
 * Canonical source: FIFA Digital Hub official match schedule
 *   `FWC26 Match Schedule_v17_10042026_EN.pdf` (visible footer: "10 April 2026 (c) FIFA";
 *   header: "All times are Eastern Time (ET)").
 *
 * This module is ADDITIVE official data: it provides the kickoff DATE/TIME for the 32
 * knockout matches (M73-M104). The bracket STRUCTURE (which slots feed each match) lives
 * in `data/official/knockout-graph.ts` and is unchanged; this file adds only timing.
 *
 * Source times are Eastern Time (ET). The entire knockout window (28 Jun - 19 Jul 2026) is
 * Eastern Daylight Time (EDT = UTC-04:00), so canonical `kickoffUtc = ET + 4h` (with
 * date rollover for late ET kickoffs). See
 * `docs/OFFICIAL_KNOCKOUT_SCHEDULE_TRANSCRIPTION_AUDIT.md`.
 *
 * football-data.org is NEVER the source here: provider `utcDate` is used only as a
 * cross-check (in tests/bridge), and provider IDs are never committed to official data.
 */
import type { KnockoutStage } from "@/lib/types";

export interface OfficialKnockoutScheduleRow {
  matchNumber: number;
  matchId: string;
  round: KnockoutStage;
  /** Source local date as printed in the FIFA PDF (Eastern Time). */
  sourceDateEt: string;
  /** Source local time as printed in the FIFA PDF (Eastern Time, 24h). */
  sourceTimeEt: string;
  sourceTimezone: "ET";
  /** Canonical UTC instant = ET + 4h (EDT), with date rollover. */
  kickoffUtc: string;
}

const ROUND_OF_32: KnockoutStage = "roundOf32";
const ROUND_OF_16: KnockoutStage = "roundOf16";
const QUARTER: KnockoutStage = "quarterFinal";
const SEMI: KnockoutStage = "semiFinal";
const THIRD: KnockoutStage = "thirdPlace";
const FINAL: KnockoutStage = "final";

/** M73-M104, transcribed from the official FIFA schedule PDF (ET); kickoffUtc = ET + 4h. */
export const officialKnockoutSchedule: OfficialKnockoutScheduleRow[] = [
  { matchNumber: 73, matchId: "M73", round: ROUND_OF_32, sourceDateEt: "2026-06-28", sourceTimeEt: "15:00", sourceTimezone: "ET", kickoffUtc: "2026-06-28T19:00:00Z" },
  { matchNumber: 74, matchId: "M74", round: ROUND_OF_32, sourceDateEt: "2026-06-29", sourceTimeEt: "16:30", sourceTimezone: "ET", kickoffUtc: "2026-06-29T20:30:00Z" },
  { matchNumber: 75, matchId: "M75", round: ROUND_OF_32, sourceDateEt: "2026-06-29", sourceTimeEt: "21:00", sourceTimezone: "ET", kickoffUtc: "2026-06-30T01:00:00Z" },
  { matchNumber: 76, matchId: "M76", round: ROUND_OF_32, sourceDateEt: "2026-06-29", sourceTimeEt: "13:00", sourceTimezone: "ET", kickoffUtc: "2026-06-29T17:00:00Z" },
  { matchNumber: 77, matchId: "M77", round: ROUND_OF_32, sourceDateEt: "2026-06-30", sourceTimeEt: "17:00", sourceTimezone: "ET", kickoffUtc: "2026-06-30T21:00:00Z" },
  { matchNumber: 78, matchId: "M78", round: ROUND_OF_32, sourceDateEt: "2026-06-30", sourceTimeEt: "13:00", sourceTimezone: "ET", kickoffUtc: "2026-06-30T17:00:00Z" },
  { matchNumber: 79, matchId: "M79", round: ROUND_OF_32, sourceDateEt: "2026-06-30", sourceTimeEt: "21:00", sourceTimezone: "ET", kickoffUtc: "2026-07-01T01:00:00Z" },
  { matchNumber: 80, matchId: "M80", round: ROUND_OF_32, sourceDateEt: "2026-07-01", sourceTimeEt: "12:00", sourceTimezone: "ET", kickoffUtc: "2026-07-01T16:00:00Z" },
  { matchNumber: 81, matchId: "M81", round: ROUND_OF_32, sourceDateEt: "2026-07-01", sourceTimeEt: "20:00", sourceTimezone: "ET", kickoffUtc: "2026-07-02T00:00:00Z" },
  { matchNumber: 82, matchId: "M82", round: ROUND_OF_32, sourceDateEt: "2026-07-01", sourceTimeEt: "16:00", sourceTimezone: "ET", kickoffUtc: "2026-07-01T20:00:00Z" },
  { matchNumber: 83, matchId: "M83", round: ROUND_OF_32, sourceDateEt: "2026-07-02", sourceTimeEt: "19:00", sourceTimezone: "ET", kickoffUtc: "2026-07-02T23:00:00Z" },
  { matchNumber: 84, matchId: "M84", round: ROUND_OF_32, sourceDateEt: "2026-07-02", sourceTimeEt: "15:00", sourceTimezone: "ET", kickoffUtc: "2026-07-02T19:00:00Z" },
  { matchNumber: 85, matchId: "M85", round: ROUND_OF_32, sourceDateEt: "2026-07-02", sourceTimeEt: "23:00", sourceTimezone: "ET", kickoffUtc: "2026-07-03T03:00:00Z" },
  { matchNumber: 86, matchId: "M86", round: ROUND_OF_32, sourceDateEt: "2026-07-03", sourceTimeEt: "18:00", sourceTimezone: "ET", kickoffUtc: "2026-07-03T22:00:00Z" },
  { matchNumber: 87, matchId: "M87", round: ROUND_OF_32, sourceDateEt: "2026-07-03", sourceTimeEt: "21:30", sourceTimezone: "ET", kickoffUtc: "2026-07-04T01:30:00Z" },
  { matchNumber: 88, matchId: "M88", round: ROUND_OF_32, sourceDateEt: "2026-07-03", sourceTimeEt: "14:00", sourceTimezone: "ET", kickoffUtc: "2026-07-03T18:00:00Z" },
  { matchNumber: 89, matchId: "M89", round: ROUND_OF_16, sourceDateEt: "2026-07-04", sourceTimeEt: "17:00", sourceTimezone: "ET", kickoffUtc: "2026-07-04T21:00:00Z" },
  { matchNumber: 90, matchId: "M90", round: ROUND_OF_16, sourceDateEt: "2026-07-04", sourceTimeEt: "13:00", sourceTimezone: "ET", kickoffUtc: "2026-07-04T17:00:00Z" },
  { matchNumber: 91, matchId: "M91", round: ROUND_OF_16, sourceDateEt: "2026-07-05", sourceTimeEt: "16:00", sourceTimezone: "ET", kickoffUtc: "2026-07-05T20:00:00Z" },
  { matchNumber: 92, matchId: "M92", round: ROUND_OF_16, sourceDateEt: "2026-07-05", sourceTimeEt: "20:00", sourceTimezone: "ET", kickoffUtc: "2026-07-06T00:00:00Z" },
  { matchNumber: 93, matchId: "M93", round: ROUND_OF_16, sourceDateEt: "2026-07-06", sourceTimeEt: "15:00", sourceTimezone: "ET", kickoffUtc: "2026-07-06T19:00:00Z" },
  { matchNumber: 94, matchId: "M94", round: ROUND_OF_16, sourceDateEt: "2026-07-06", sourceTimeEt: "20:00", sourceTimezone: "ET", kickoffUtc: "2026-07-07T00:00:00Z" },
  { matchNumber: 95, matchId: "M95", round: ROUND_OF_16, sourceDateEt: "2026-07-07", sourceTimeEt: "12:00", sourceTimezone: "ET", kickoffUtc: "2026-07-07T16:00:00Z" },
  { matchNumber: 96, matchId: "M96", round: ROUND_OF_16, sourceDateEt: "2026-07-07", sourceTimeEt: "16:00", sourceTimezone: "ET", kickoffUtc: "2026-07-07T20:00:00Z" },
  { matchNumber: 97, matchId: "M97", round: QUARTER, sourceDateEt: "2026-07-09", sourceTimeEt: "16:00", sourceTimezone: "ET", kickoffUtc: "2026-07-09T20:00:00Z" },
  { matchNumber: 98, matchId: "M98", round: QUARTER, sourceDateEt: "2026-07-10", sourceTimeEt: "15:00", sourceTimezone: "ET", kickoffUtc: "2026-07-10T19:00:00Z" },
  { matchNumber: 99, matchId: "M99", round: QUARTER, sourceDateEt: "2026-07-11", sourceTimeEt: "17:00", sourceTimezone: "ET", kickoffUtc: "2026-07-11T21:00:00Z" },
  { matchNumber: 100, matchId: "M100", round: QUARTER, sourceDateEt: "2026-07-11", sourceTimeEt: "21:00", sourceTimezone: "ET", kickoffUtc: "2026-07-12T01:00:00Z" },
  { matchNumber: 101, matchId: "M101", round: SEMI, sourceDateEt: "2026-07-14", sourceTimeEt: "15:00", sourceTimezone: "ET", kickoffUtc: "2026-07-14T19:00:00Z" },
  { matchNumber: 102, matchId: "M102", round: SEMI, sourceDateEt: "2026-07-15", sourceTimeEt: "15:00", sourceTimezone: "ET", kickoffUtc: "2026-07-15T19:00:00Z" },
  { matchNumber: 103, matchId: "M103", round: THIRD, sourceDateEt: "2026-07-18", sourceTimeEt: "17:00", sourceTimezone: "ET", kickoffUtc: "2026-07-18T21:00:00Z" },
  { matchNumber: 104, matchId: "M104", round: FINAL, sourceDateEt: "2026-07-19", sourceTimeEt: "15:00", sourceTimezone: "ET", kickoffUtc: "2026-07-19T19:00:00Z" },
];

const VALID_ROUNDS: ReadonlySet<KnockoutStage> = new Set<KnockoutStage>([
  "roundOf32", "roundOf16", "quarterFinal", "semiFinal", "thirdPlace", "final",
]);

/**
 * Convert an Eastern-Daylight-Time (UTC-04:00) wall-clock to a canonical UTC ISO string.
 * The FWC26 knockout window is entirely EDT, so UTC = ET + 4h. `Date.UTC` carries the
 * hour overflow into the next day, so late ET kickoffs roll over correctly.
 */
export function etDaylightToUtc(dateEt: string, timeEt: string): string {
  const [y, mo, d] = dateEt.split("-").map(Number);
  const [h, mi] = timeEt.split(":").map(Number);
  const ms = Date.UTC(y!, mo! - 1, d!, h! + 4, mi!, 0, 0);
  return new Date(ms).toISOString().replace(".000Z", "Z");
}

export interface KnockoutScheduleValidation {
  ok: boolean;
  errors: string[];
}

/** Fail-closed integrity check for the official knockout schedule. No provider data. */
export function validateKnockoutSchedule(
  rows: readonly OfficialKnockoutScheduleRow[] = officialKnockoutSchedule,
): KnockoutScheduleValidation {
  const errors: string[] = [];
  if (rows.length !== 32) errors.push(`expected 32 rows, got ${rows.length}`);

  const numbers = new Set<number>();
  const ids = new Set<string>();
  const roundKick = new Set<string>();
  const isoUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

  for (const r of rows) {
    if (r.matchNumber < 73 || r.matchNumber > 104) errors.push(`matchNumber out of range: ${r.matchNumber}`);
    if (r.matchId !== `M${r.matchNumber}`) errors.push(`matchId/number mismatch: ${r.matchId} vs ${r.matchNumber}`);
    if (!VALID_ROUNDS.has(r.round)) errors.push(`invalid round for M${r.matchNumber}: ${r.round}`);
    if (r.sourceTimezone !== "ET") errors.push(`M${r.matchNumber}: sourceTimezone must be ET`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.sourceDateEt)) errors.push(`M${r.matchNumber}: bad sourceDateEt`);
    if (!/^\d{2}:\d{2}$/.test(r.sourceTimeEt)) errors.push(`M${r.matchNumber}: bad sourceTimeEt`);
    if (!isoUtc.test(r.kickoffUtc)) errors.push(`M${r.matchNumber}: kickoffUtc not ISO-UTC: ${r.kickoffUtc}`);
    // EDT assumption: every source date is in the Jun/Jul 2026 EDT window.
    const month = Number(r.sourceDateEt.slice(5, 7));
    if (r.sourceDateEt.slice(0, 4) !== "2026" || (month !== 6 && month !== 7)) {
      errors.push(`M${r.matchNumber}: source date outside Jun/Jul 2026 (EDT assumption)`);
    }
    // Stored UTC must equal the ET+4h derivation (catches rollover/typo errors).
    const derived = etDaylightToUtc(r.sourceDateEt, r.sourceTimeEt);
    if (derived !== r.kickoffUtc) errors.push(`M${r.matchNumber}: kickoffUtc ${r.kickoffUtc} != ET+4h ${derived}`);

    if (numbers.has(r.matchNumber)) errors.push(`duplicate matchNumber ${r.matchNumber}`);
    numbers.add(r.matchNumber);
    if (ids.has(r.matchId)) errors.push(`duplicate matchId ${r.matchId}`);
    ids.add(r.matchId);
    const rk = `${r.round}|${r.kickoffUtc}`;
    if (roundKick.has(rk)) errors.push(`duplicate (round,kickoffUtc): ${rk}`);
    roundKick.add(rk);
  }
  for (let n = 73; n <= 104; n += 1) if (!numbers.has(n)) errors.push(`missing matchNumber ${n}`);

  return { ok: errors.length === 0, errors };
}
