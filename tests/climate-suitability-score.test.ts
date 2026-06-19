import { describe, expect, it } from "vitest";
import {
  computeClimateSuitability,
  monthlyTempScore,
  monthlyPrecipPenalty,
  monthlyPlayabilityScore,
  IDEAL_TEMP_MIN_C,
  IDEAL_TEMP_MAX_C,
  COLD_FLOOR_C,
  HEAT_CEILING_C,
  EXCESSIVE_PRECIP_MM,
  FULL_PRECIP_PENALTY_MM,
  MAX_PRECIP_PENALTY,
  NEUTRAL_CLIMATE_SCORE,
} from "@/lib/model/climate-suitability";
import type { ClimateSuitabilityRow } from "@/lib/types";

const rowOf = (
  temp: number[],
  precip: number[],
  dataStatus: ClimateSuitabilityRow["dataStatus"] = "source-backed",
): ClimateSuitabilityRow => ({
  teamId: "x",
  countryNameRaw: "X",
  climateCode: dataStatus === "source-backed" ? "XXX" : "",
  monthlyTempC: temp,
  monthlyPrecipMm: precip,
  baselinePeriod: "1991-2020",
  dataStatus,
});

describe("climate suitability - temperature boundaries", () => {
  it("scores 1.0 across the ideal band [10, 24]", () => {
    expect(monthlyTempScore(IDEAL_TEMP_MIN_C)).toBe(1); // 10
    expect(monthlyTempScore(IDEAL_TEMP_MAX_C)).toBe(1); // 24
    expect(monthlyTempScore(17)).toBe(1);
  });

  it("scores 0 at/below the cold floor and at/above the heat ceiling", () => {
    expect(monthlyTempScore(COLD_FLOOR_C)).toBe(0); // 0
    expect(monthlyTempScore(-5)).toBe(0);
    expect(monthlyTempScore(HEAT_CEILING_C)).toBe(0); // 32
    expect(monthlyTempScore(40)).toBe(0);
  });

  it("falls off linearly on each side", () => {
    expect(monthlyTempScore(5)).toBeCloseTo(0.5, 9); // halfway 0->10
    expect(monthlyTempScore(28)).toBeCloseTo(0.5, 9); // halfway 24->32
  });

  it("is monotonic non-decreasing up to the band and non-increasing after", () => {
    for (let t = -10; t < IDEAL_TEMP_MIN_C; t++) {
      expect(monthlyTempScore(t + 1)).toBeGreaterThanOrEqual(monthlyTempScore(t));
    }
    for (let t = IDEAL_TEMP_MAX_C; t < 40; t++) {
      expect(monthlyTempScore(t + 1)).toBeLessThanOrEqual(monthlyTempScore(t));
    }
  });
});

describe("climate suitability - precipitation penalty", () => {
  it("is exactly 0 at the excessive threshold (250 mm) and below", () => {
    expect(monthlyPrecipPenalty(EXCESSIVE_PRECIP_MM)).toBe(0); // 250
    expect(monthlyPrecipPenalty(0)).toBe(0);
    expect(monthlyPrecipPenalty(100)).toBe(0);
  });

  it("applies a small penalty just above 250 mm", () => {
    const p = monthlyPrecipPenalty(EXCESSIVE_PRECIP_MM + 0.001);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(0.001);
  });

  it("reaches the full cap at/above 500 mm and never exceeds it", () => {
    expect(monthlyPrecipPenalty(FULL_PRECIP_PENALTY_MM)).toBeCloseTo(MAX_PRECIP_PENALTY, 9); // 0.15
    expect(monthlyPrecipPenalty(1000)).toBe(MAX_PRECIP_PENALTY);
    expect(monthlyPrecipPenalty(5000)).toBe(MAX_PRECIP_PENALTY);
    for (let mm = 0; mm <= 3000; mm += 25) {
      expect(monthlyPrecipPenalty(mm)).toBeLessThanOrEqual(MAX_PRECIP_PENALTY + 1e-12);
    }
  });

  it("ramps linearly between 250 and 500 mm (e.g. 375 -> half the cap)", () => {
    expect(monthlyPrecipPenalty(375)).toBeCloseTo(MAX_PRECIP_PENALTY / 2, 9);
  });
});

describe("climate suitability - combined month + 12-month average", () => {
  it("monthly playability stays within [0,1] under heavy rain", () => {
    for (let t = -20; t <= 50; t += 2) {
      for (const mm of [0, 250, 400, 1000, 3000]) {
        const s = monthlyPlayabilityScore(t, mm);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
      }
    }
  });

  it("temperature dominates: rain can only shave up to 15% off an ideal month", () => {
    const dry = monthlyPlayabilityScore(18, 0);
    const soaked = monthlyPlayabilityScore(18, 5000);
    expect(dry).toBe(1);
    expect(soaked).toBeCloseTo(1 - MAX_PRECIP_PENALTY, 9);
  });

  it("an ideal year (all months 18C, dry) scores 1.0", () => {
    const score = computeClimateSuitability(rowOf(Array(12).fill(18), Array(12).fill(50)));
    expect(score).toBe(1);
  });

  it("a frozen year (all months <=0C) scores 0", () => {
    const score = computeClimateSuitability(rowOf(Array(12).fill(-10), Array(12).fill(20)));
    expect(score).toBe(0);
  });

  it("the 12-month average is always within [0,1]", () => {
    const score = computeClimateSuitability(
      rowOf([2, 4, 8, 12, 18, 24, 28, 33, 26, 15, 7, 1], [300, 60, 80, 600, 40, 0, 10, 90, 250, 251, 700, 120]),
    );
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("an unresolved row returns the neutral score 0.5", () => {
    expect(computeClimateSuitability(rowOf([], [], "unresolved"))).toBe(NEUTRAL_CLIMATE_SCORE);
  });
});
