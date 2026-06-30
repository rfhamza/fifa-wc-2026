/**
 * Forecast checkpoint policy (Phase 1.30, PR-83A) — PURE
 * ------------------------------------------------------
 * Defines the milestone/checkpoint boundaries the forecast-refresh system uses,
 * as plain data + deterministic helpers. No fs / env / fetch / live-state /
 * provider / Blob / workflow imports (enforced by a test). It encodes:
 *
 *   - group-stage wave boundaries M24 / M48 / M72 (after which every team has
 *     played 1 / 2 / 3 group matches — INVARIANT, validated against the official
 *     fixtures by `validateGroupWaveBoundaries`, not merely trusted);
 *   - knockout round ranges (R32 M73-88, R16 M89-96, QF M97-100, SF M101-102,
 *     third-place M103, final M104);
 *   - which boundaries are TITLE-PROBABILITY milestones. M103 (third place) is a
 *     dead-end in the official graph (its participants are the SF losers and its
 *     winner feeds nothing), so it does NOT change winner/final probabilities and
 *     is classified as a non-title `third-place` milestone.
 */
import type { Fixture, KnockoutStage } from "@/lib/types";

export const GROUP_STAGE_MAX_MATCH = 72;
export const KNOCKOUT_MIN_MATCH = 73;
export const KNOCKOUT_MAX_MATCH = 104;

/** Group-stage round (matchday). */
export type GroupWave = 1 | 2 | 3;

export type ForecastCheckpointKind = "group-wave" | "knockout-round" | "third-place";

/** A durable forecast checkpoint at the last match of a tournament segment. */
export interface ForecastMilestone {
  /** The match whose completion closes this segment. */
  matchNumber: number;
  kind: ForecastCheckpointKind;
  label: string;
  /**
   * True when completing this segment can move winner/final probabilities, so it
   * warrants a title-probability milestone snapshot. False for the third-place
   * play-off (M103), which feeds nothing downstream.
   */
  isTitleProbabilityMilestone: boolean;
  /** Set for group-wave milestones. */
  groupWave?: GroupWave;
  /** Set for knockout milestones (incl. third place). */
  knockoutRound?: KnockoutStage;
}

export interface GroupWaveBoundary {
  wave: GroupWave;
  /** The last group match of the wave; after it, every team has played `wave`. */
  matchNumber: number;
}

/** Group-stage wave boundaries (validated against fixtures by the helper below). */
export const GROUP_WAVE_BOUNDARIES: readonly GroupWaveBoundary[] = [
  { wave: 1, matchNumber: 24 },
  { wave: 2, matchNumber: 48 },
  { wave: 3, matchNumber: 72 },
];

interface KnockoutRoundRange {
  round: KnockoutStage;
  min: number;
  max: number;
}

/** Match-number ranges per knockout round (from the official bracket graph). */
export const KNOCKOUT_ROUND_RANGES: readonly KnockoutRoundRange[] = [
  { round: "roundOf32", min: 73, max: 88 },
  { round: "roundOf16", min: 89, max: 96 },
  { round: "quarterFinal", min: 97, max: 100 },
  { round: "semiFinal", min: 101, max: 102 },
  { round: "thirdPlace", min: 103, max: 103 },
  { round: "final", min: 104, max: 104 },
];

/**
 * All forecast milestones in match order. The 8 title-probability milestones
 * (M24/48/72/88/96/100/102/104) plus the non-title third-place milestone (M103).
 */
export const FORECAST_MILESTONES: readonly ForecastMilestone[] = [
  { matchNumber: 24, kind: "group-wave", groupWave: 1, label: "Group wave 1 complete", isTitleProbabilityMilestone: true },
  { matchNumber: 48, kind: "group-wave", groupWave: 2, label: "Group wave 2 complete", isTitleProbabilityMilestone: true },
  { matchNumber: 72, kind: "group-wave", groupWave: 3, label: "Group stage complete", isTitleProbabilityMilestone: true },
  { matchNumber: 88, kind: "knockout-round", knockoutRound: "roundOf32", label: "Round of 32 complete", isTitleProbabilityMilestone: true },
  { matchNumber: 96, kind: "knockout-round", knockoutRound: "roundOf16", label: "Round of 16 complete", isTitleProbabilityMilestone: true },
  { matchNumber: 100, kind: "knockout-round", knockoutRound: "quarterFinal", label: "Quarter-finals complete", isTitleProbabilityMilestone: true },
  { matchNumber: 102, kind: "knockout-round", knockoutRound: "semiFinal", label: "Semi-finals complete", isTitleProbabilityMilestone: true },
  { matchNumber: 103, kind: "third-place", knockoutRound: "thirdPlace", label: "Third-place play-off complete", isTitleProbabilityMilestone: false },
  { matchNumber: 104, kind: "knockout-round", knockoutRound: "final", label: "Final complete", isTitleProbabilityMilestone: true },
];

/** All milestones (title + the non-title third-place milestone), in match order. */
export function listForecastMilestones(): ForecastMilestone[] {
  return [...FORECAST_MILESTONES];
}

/** Only the title-probability milestones (excludes the third-place play-off). */
export function listTitleProbabilityMilestones(): ForecastMilestone[] {
  return FORECAST_MILESTONES.filter((m) => m.isTitleProbabilityMilestone);
}

/** The milestone whose segment is closed by `matchNumber`, or null. */
export function getForecastCheckpointForMatchNumber(
  matchNumber: number,
): ForecastMilestone | null {
  return FORECAST_MILESTONES.find((m) => m.matchNumber === matchNumber) ?? null;
}

/** True when `matchNumber` closes any forecast milestone segment. */
export function isForecastMilestoneMatchNumber(matchNumber: number): boolean {
  return FORECAST_MILESTONES.some((m) => m.matchNumber === matchNumber);
}

/** True when `matchNumber` closes a TITLE-PROBABILITY milestone (excludes M103). */
export function isTitleProbabilityMilestone(matchNumber: number): boolean {
  return FORECAST_MILESTONES.some(
    (m) => m.matchNumber === matchNumber && m.isTitleProbabilityMilestone,
  );
}

/** The group wave (1/2/3) a group match belongs to, or null if not M1-72. */
export function getGroupWaveForMatchNumber(matchNumber: number): GroupWave | null {
  if (!Number.isInteger(matchNumber) || matchNumber < 1 || matchNumber > GROUP_STAGE_MAX_MATCH) {
    return null;
  }
  return Math.ceil(matchNumber / 24) as GroupWave;
}

/** The knockout round a match belongs to, or null if not M73-104. */
export function getKnockoutRoundForMatchNumber(matchNumber: number): KnockoutStage | null {
  const range = KNOCKOUT_ROUND_RANGES.find(
    (r) => matchNumber >= r.min && matchNumber <= r.max,
  );
  return range ? range.round : null;
}

/**
 * Validate the group-wave invariant against the official fixtures: after each
 * boundary (M24/M48/M72) every one of the 48 teams must have played exactly
 * `wave` group matches. Returns a list of human-readable errors ([] = valid).
 * Pure — the caller supplies the fixtures (no data import here).
 */
export function validateGroupWaveBoundaries(fixtures: readonly Fixture[]): string[] {
  const errors: string[] = [];
  const groupFixtures = fixtures.filter(
    (f) => typeof f.matchNumber === "number" && (f.matchNumber as number) <= GROUP_STAGE_MAX_MATCH,
  );

  for (const { wave, matchNumber } of GROUP_WAVE_BOUNDARIES) {
    const counts = new Map<string, number>();
    for (const f of groupFixtures) {
      if ((f.matchNumber as number) <= matchNumber) {
        counts.set(f.homeTeamId, (counts.get(f.homeTeamId) ?? 0) + 1);
        counts.set(f.awayTeamId, (counts.get(f.awayTeamId) ?? 0) + 1);
      }
    }
    if (counts.size !== 48) {
      errors.push(`after M${matchNumber}: expected 48 teams, found ${counts.size}`);
      continue;
    }
    const values = [...counts.values()];
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min !== wave || max !== wave) {
      errors.push(
        `after M${matchNumber}: expected every team to have played ${wave} (got min=${min}, max=${max})`,
      );
    }
  }
  return errors;
}
