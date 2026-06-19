/**
 * Climate suitability scoring (Phase 1.13)
 * ----------------------------------------
 * A home-country, YEAR-ROUND football-PLAYABILITY proxy (the Klement/Joachim
 * climate pillar): "does this country's climate support year-round outdoor
 * football?". It is deliberately NOT a tournament-acclimatization score - there is
 * no June-July window, no venue climate, no travel/altitude/humidity here (those
 * belong to a later tournament-context phase).
 *
 * Pure + deterministic. Each calendar month is scored on temperature comfort with
 * a small excessive-rain penalty; the score is the mean over all 12 months, bounded
 * 0..1. The constants below are documented CANDIDATE heuristics (calibration
 * deferred), which is why the climate family is `candidate` (not `source-backed`)
 * and the resulting driver is capped (see CLIMATE_CONTRIBUTION_CAP in config.ts).
 */
import { clamp } from "@/lib/utils";
import type { ClimateSuitabilityRow } from "@/lib/types";

/** Ideal comfort band: a month fully in [10, 24] deg C scores 1.0 on temperature. */
export const IDEAL_TEMP_MIN_C = 10;
export const IDEAL_TEMP_MAX_C = 24;
/** Cold floor: at/below 0 deg C a month scores 0 on temperature. */
export const COLD_FLOOR_C = 0;
/** Heat ceiling: at/above 32 deg C a month scores 0 on temperature. */
export const HEAT_CEILING_C = 32;

/** Rain penalty ramps from this monthly total... */
export const EXCESSIVE_PRECIP_MM = 250;
/** ...up to the full penalty at this monthly total. */
export const FULL_PRECIP_PENALTY_MM = 500;
/** Max multiplicative penalty a single month's rain can apply (temperature dominates). */
export const MAX_PRECIP_PENALTY = 0.15;

/** Neutral score for an `unresolved` row (no climate advantage either way). */
export const NEUTRAL_CLIMATE_SCORE = 0.5;

/**
 * Temperature comfort for one month, 0..1: 1 inside the ideal band, linear falloff
 * to 0 at the cold floor / heat ceiling, flat 0 beyond.
 */
export function monthlyTempScore(tempC: number): number {
  if (!Number.isFinite(tempC)) return 0;
  if (tempC >= IDEAL_TEMP_MIN_C && tempC <= IDEAL_TEMP_MAX_C) return 1;
  if (tempC < IDEAL_TEMP_MIN_C) {
    // 0 at COLD_FLOOR_C -> 1 at IDEAL_TEMP_MIN_C.
    return clamp(
      (tempC - COLD_FLOOR_C) / (IDEAL_TEMP_MIN_C - COLD_FLOOR_C),
      0,
      1,
    );
  }
  // 1 at IDEAL_TEMP_MAX_C -> 0 at HEAT_CEILING_C.
  return clamp(
    (HEAT_CEILING_C - tempC) / (HEAT_CEILING_C - IDEAL_TEMP_MAX_C),
    0,
    1,
  );
}

/**
 * Multiplicative rain penalty for one month, 0..MAX_PRECIP_PENALTY: 0 at/below
 * EXCESSIVE_PRECIP_MM, ramping linearly to MAX_PRECIP_PENALTY at/above
 * FULL_PRECIP_PENALTY_MM. Never exceeds MAX_PRECIP_PENALTY.
 */
export function monthlyPrecipPenalty(precipMm: number): number {
  if (!Number.isFinite(precipMm)) return 0;
  const ramp = clamp(
    (precipMm - EXCESSIVE_PRECIP_MM) /
      (FULL_PRECIP_PENALTY_MM - EXCESSIVE_PRECIP_MM),
    0,
    1,
  );
  return ramp * MAX_PRECIP_PENALTY;
}

/** Combined single-month playability score, 0..1 (temperature dominates rain). */
export function monthlyPlayabilityScore(tempC: number, precipMm: number): number {
  return clamp(monthlyTempScore(tempC) * (1 - monthlyPrecipPenalty(precipMm)), 0, 1);
}

/**
 * 12-month year-round playability suitability, 0..1. `unresolved` rows (no usable
 * climate data) return NEUTRAL_CLIMATE_SCORE so they neither help nor hurt.
 */
export function computeClimateSuitability(row: ClimateSuitabilityRow): number {
  if (row.dataStatus === "unresolved") return NEUTRAL_CLIMATE_SCORE;
  const temps = row.monthlyTempC;
  const precip = row.monthlyPrecipMm;
  if (temps.length !== 12 || precip.length !== 12) return NEUTRAL_CLIMATE_SCORE;
  let sum = 0;
  for (let m = 0; m < 12; m++) {
    sum += monthlyPlayabilityScore(temps[m]!, precip[m]!);
  }
  return clamp(sum / 12, 0, 1);
}

/** Map the 0..1 suitability onto the model's 0..100 climateFamiliarity scale. */
export function climateSuitabilityTo100(row: ClimateSuitabilityRow): number {
  return computeClimateSuitability(row) * 100;
}
