import { describe, expect, it } from "vitest";
import {
  PRIMARY_DIAGNOSTIC_YEARS,
  STRETCH_CONTEXT_YEARS,
  ALL_AVAILABLE_HISTORICAL_YEARS,
  primaryDiagnosticPacks,
  stretchContextPacks,
  allHistoricalPacks,
} from "@/lib/backtesting/historical-cohorts";

/**
 * Phase 1.20B: guard the historical diagnostic COHORTS so primary vs stretch vs
 * all-available can never silently drift or mix. Pins exact membership, counts,
 * disjointness, and the primary ∪ stretch = all relation. This computes NO metrics
 * and asserts NOTHING about model performance - it is a pure cohort-membership guard.
 * The pinned four-tournament consolidation/LOTO tests are intentionally left untouched
 * and remain the headline anti-drift guard.
 */
const yearsOf = (packs: readonly { identity: { tournamentYear: number } }[]) =>
  packs.map((p) => p.identity.tournamentYear);

describe("WC historical cohorts - year constants", () => {
  it("PRIMARY_DIAGNOSTIC_YEARS is exactly [2010, 2014, 2018, 2022]", () => {
    expect([...PRIMARY_DIAGNOSTIC_YEARS]).toEqual([2010, 2014, 2018, 2022]);
  });

  it("STRETCH_CONTEXT_YEARS is exactly [1998, 2002, 2006]", () => {
    expect([...STRETCH_CONTEXT_YEARS]).toEqual([1998, 2002, 2006]);
  });

  it("ALL_AVAILABLE_HISTORICAL_YEARS is exactly [1998, 2002, 2006, 2010, 2014, 2018, 2022]", () => {
    expect([...ALL_AVAILABLE_HISTORICAL_YEARS]).toEqual([1998, 2002, 2006, 2010, 2014, 2018, 2022]);
  });
});

describe("WC historical cohorts - pack arrays map to the declared years", () => {
  it("primaryDiagnosticPacks map to exactly [2010, 2014, 2018, 2022]", () => {
    expect(yearsOf(primaryDiagnosticPacks)).toEqual([2010, 2014, 2018, 2022]);
  });

  it("stretchContextPacks map to exactly [1998, 2002, 2006]", () => {
    expect(yearsOf(stretchContextPacks)).toEqual([1998, 2002, 2006]);
  });

  it("allHistoricalPacks map to exactly [1998, 2002, 2006, 2010, 2014, 2018, 2022]", () => {
    expect(yearsOf(allHistoricalPacks)).toEqual([1998, 2002, 2006, 2010, 2014, 2018, 2022]);
  });

  it("pack-array years match their corresponding year constants", () => {
    expect(yearsOf(primaryDiagnosticPacks)).toEqual([...PRIMARY_DIAGNOSTIC_YEARS]);
    expect(yearsOf(stretchContextPacks)).toEqual([...STRETCH_CONTEXT_YEARS]);
    expect(yearsOf(allHistoricalPacks)).toEqual([...ALL_AVAILABLE_HISTORICAL_YEARS]);
  });
});

describe("WC historical cohorts - counts", () => {
  it("primary has 4, stretch has 3, all-available has 7 (years + packs)", () => {
    expect(PRIMARY_DIAGNOSTIC_YEARS).toHaveLength(4);
    expect(STRETCH_CONTEXT_YEARS).toHaveLength(3);
    expect(ALL_AVAILABLE_HISTORICAL_YEARS).toHaveLength(7);
    expect(primaryDiagnosticPacks).toHaveLength(4);
    expect(stretchContextPacks).toHaveLength(3);
    expect(allHistoricalPacks).toHaveLength(7);
  });
});

describe("WC historical cohorts - disjointness, union, and uniqueness", () => {
  const primary = new Set<number>(PRIMARY_DIAGNOSTIC_YEARS);
  const stretch = new Set<number>(STRETCH_CONTEXT_YEARS);
  const all = new Set<number>(ALL_AVAILABLE_HISTORICAL_YEARS);

  it("primary and stretch are disjoint", () => {
    const overlap = [...primary].filter((y) => stretch.has(y));
    expect(overlap).toEqual([]);
  });

  it("primary ∪ stretch equals all-available (no omission, no extra)", () => {
    const union = new Set<number>([...primary, ...stretch]);
    expect([...union].sort((a, b) => a - b)).toEqual([...all].sort((a, b) => a - b));
  });

  it("no duplicate years in any cohort", () => {
    expect(new Set(PRIMARY_DIAGNOSTIC_YEARS).size).toBe(PRIMARY_DIAGNOSTIC_YEARS.length);
    expect(new Set(STRETCH_CONTEXT_YEARS).size).toBe(STRETCH_CONTEXT_YEARS.length);
    expect(new Set(ALL_AVAILABLE_HISTORICAL_YEARS).size).toBe(ALL_AVAILABLE_HISTORICAL_YEARS.length);
    expect(new Set(yearsOf(allHistoricalPacks)).size).toBe(allHistoricalPacks.length);
  });

  it("all-available = stretch packs followed by primary packs (object identity)", () => {
    // The supplementary all-view is exactly the stretch + primary packs, not a re-derivation.
    expect(allHistoricalPacks).toEqual([...stretchContextPacks, ...primaryDiagnosticPacks]);
  });
});
