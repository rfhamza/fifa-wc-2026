/**
 * Post-tournament retrospective (PR B) - binary calibration helpers.
 * Synthetic fixtures only; no artifacts, no model, no I/O.
 */
import { describe, expect, it } from "vitest";
import {
  binaryBrier,
  binaryLogLoss,
  binaryReliabilityBins,
  summarizeBinary,
  type BinaryObservation,
} from "@/lib/retrospective/calibration";

describe("binaryBrier", () => {
  it("is zero for a perfect confident forecast and one for a confidently wrong one", () => {
    expect(binaryBrier(1, true)).toBe(0);
    expect(binaryBrier(0, false)).toBe(0);
    expect(binaryBrier(1, false)).toBe(1);
    expect(binaryBrier(0, true)).toBe(1);
  });

  it("is 0.25 for a coin-flip forecast either way", () => {
    expect(binaryBrier(0.5, true)).toBeCloseTo(0.25, 12);
    expect(binaryBrier(0.5, false)).toBeCloseTo(0.25, 12);
  });

  it("rejects a probability outside [0,1]", () => {
    expect(() => binaryBrier(1.2, true)).toThrow(/within \[0,1\]/);
    expect(() => binaryBrier(Number.NaN, true)).toThrow(/within \[0,1\]/);
  });
});

describe("binaryLogLoss", () => {
  it("is zero for a perfect confident forecast", () => {
    expect(binaryLogLoss(1, true)).toBeCloseTo(0, 12);
    expect(binaryLogLoss(0, false)).toBeCloseTo(0, 12);
  });

  it("clamps rather than returning infinity on a confidently wrong forecast", () => {
    const v = binaryLogLoss(0, true);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeGreaterThan(30);
  });

  it("equals ln(2) for a coin flip", () => {
    expect(binaryLogLoss(0.5, true)).toBeCloseTo(Math.LN2, 12);
  });
});

describe("summarizeBinary", () => {
  it("returns zeroes for an empty set rather than NaN", () => {
    expect(summarizeBinary([])).toEqual({ n: 0, brier: 0, logLoss: 0, meanPredicted: 0, baseRate: 0 });
  });

  it("reports the mean forecast alongside the realised base rate", () => {
    const obs: BinaryObservation[] = [
      { probability: 0.8, occurred: true },
      { probability: 0.6, occurred: false },
      { probability: 0.4, occurred: true },
      { probability: 0.2, occurred: false },
    ];
    const s = summarizeBinary(obs);
    expect(s.n).toBe(4);
    expect(s.meanPredicted).toBeCloseTo(0.5, 12);
    expect(s.baseRate).toBeCloseTo(0.5, 12);
    // (0.04 + 0.36 + 0.36 + 0.04) / 4
    expect(s.brier).toBeCloseTo(0.2, 12);
  });
});

describe("binaryReliabilityBins", () => {
  it("keeps empty bands so the full ladder is always visible", () => {
    const bins = binaryReliabilityBins([{ probability: 0.55, occurred: true }], 10);
    expect(bins.length).toBe(10);
    expect(bins.filter((b) => b.count > 0).length).toBe(1);
    expect(bins[5]!.count).toBe(1);
    expect(bins[0]!.count).toBe(0);
    // An empty band reports zeroes, never NaN.
    expect(bins[0]!.meanPredicted).toBe(0);
    expect(bins[0]!.gap).toBe(0);
  });

  it("places a probability of exactly 1 in the top band, not out of range", () => {
    const bins = binaryReliabilityBins([{ probability: 1, occurred: true }], 10);
    expect(bins[9]!.count).toBe(1);
  });

  it("computes the gap as observed minus forecast", () => {
    // Four observations at 0.5, three of which occur -> observed 0.75, gap +0.25.
    const obs: BinaryObservation[] = [
      { probability: 0.5, occurred: true },
      { probability: 0.5, occurred: true },
      { probability: 0.5, occurred: true },
      { probability: 0.5, occurred: false },
    ];
    const band = binaryReliabilityBins(obs, 10)[5]!;
    expect(band.count).toBe(4);
    expect(band.meanPredicted).toBeCloseTo(0.5, 12);
    expect(band.empiricalRate).toBeCloseTo(0.75, 12);
    expect(band.gap).toBeCloseTo(0.25, 12);
  });

  it("rejects a non-positive bin count", () => {
    expect(() => binaryReliabilityBins([], 0)).toThrow(/positive integer/);
  });
});
