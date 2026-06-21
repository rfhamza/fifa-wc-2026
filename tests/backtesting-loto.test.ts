import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WC2010_PACK } from "@/data/historical/snapshots/wc-2010";
import { WC2014_PACK } from "@/data/historical/snapshots/wc-2014";
import { WC2018_PACK } from "@/data/historical/snapshots/wc-2018";
import { WC2022_PACK } from "@/data/historical/snapshots/wc-2022";
import { BASELINE_LADDER } from "@/lib/backtesting/model-variants";
import { computeLotoDiagnostics } from "@/lib/backtesting/loto";

/**
 * Phase 1.18C-8 - Leave-One-Tournament-Out diagnostics. DIAGNOSTIC ONLY.
 * Pins the descriptive LOTO view and proves it FITS NOTHING: held-out values equal
 * the existing per-tournament pins, reference macro-averages are equal-weight means
 * over the OTHER three tournaments, and deltas are heldOut - reference. No calibration,
 * no tuning, no parameters.
 */
const PACKS = [WC2010_PACK, WC2014_PACK, WC2018_PACK, WC2022_PACK];
const YEARS = [2010, 2014, 2018, 2022] as const;
const VARIANTS = ["elo-only", "fifa-only", "elo-fifa", "elo-fifa-host-regional"] as const;
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;
type M = { rps: number; logLoss: number; brier: number; accuracy: number };

// Canonical per-tournament pins (independently transcribed from
// tests/backtesting-match-evaluator.test.ts) - the external anchor LOTO must reproduce.
const CANONICAL_GROUP: Record<number, Record<string, M>> = {
  2010: {
    "elo-only": { rps: 0.196084, logLoss: 0.997914, brier: 0.601816, accuracy: 0.520833 },
    "fifa-only": { rps: 0.220927, logLoss: 1.074604, brier: 0.649351, accuracy: 0.479167 },
    "elo-fifa": { rps: 0.202127, logLoss: 1.018394, brier: 0.616182, accuracy: 0.5 },
    "elo-fifa-host-regional": { rps: 0.20161, logLoss: 1.014471, brier: 0.614649, accuracy: 0.5 },
  },
  2014: {
    "elo-only": { rps: 0.189773, logLoss: 0.908006, brier: 0.536186, accuracy: 0.604167 },
    "fifa-only": { rps: 0.226187, logLoss: 1.017085, brier: 0.610345, accuracy: 0.645833 },
    "elo-fifa": { rps: 0.183794, logLoss: 0.888234, brier: 0.523563, accuracy: 0.645833 },
    "elo-fifa-host-regional": { rps: 0.182562, logLoss: 0.884112, brier: 0.521259, accuracy: 0.666667 },
  },
  2018: {
    "elo-only": { rps: 0.196349, logLoss: 0.932544, brier: 0.546919, accuracy: 0.583333 },
    "fifa-only": { rps: 0.230587, logLoss: 1.029163, brier: 0.619041, accuracy: 0.541667 },
    "elo-fifa": { rps: 0.195006, logLoss: 0.931218, brier: 0.542734, accuracy: 0.625 },
    "elo-fifa-host-regional": { rps: 0.19246, logLoss: 0.925844, brier: 0.537438, accuracy: 0.625 },
  },
  2022: {
    "elo-only": { rps: 0.238651, logLoss: 1.110921, brier: 0.637314, accuracy: 0.541667 },
    "fifa-only": { rps: 0.231994, logLoss: 1.047412, brier: 0.631767, accuracy: 0.541667 },
    "elo-fifa": { rps: 0.238636, logLoss: 1.123338, brier: 0.636163, accuracy: 0.5625 },
    "elo-fifa-host-regional": { rps: 0.240298, logLoss: 1.126756, brier: 0.639973, accuracy: 0.520833 },
  },
};
const CANONICAL_ALL: Record<number, Record<string, M>> = {
  2010: {
    "elo-only": { rps: 0.188848, logLoss: 0.971146, brier: 0.580925, accuracy: 0.546875 },
    "fifa-only": { rps: 0.22146, logLoss: 1.068904, brier: 0.645454, accuracy: 0.53125 },
    "elo-fifa": { rps: 0.191949, logLoss: 0.981823, brier: 0.588761, accuracy: 0.53125 },
    "elo-fifa-host-regional": { rps: 0.191403, logLoss: 0.978522, brier: 0.58716, accuracy: 0.53125 },
  },
  2014: {
    "elo-only": { rps: 0.19067, logLoss: 0.966312, brier: 0.579339, accuracy: 0.546875 },
    "fifa-only": { rps: 0.219121, logLoss: 1.051875, brier: 0.633173, accuracy: 0.578125 },
    "elo-fifa": { rps: 0.186371, logLoss: 0.952269, brier: 0.570727, accuracy: 0.578125 },
    "elo-fifa-host-regional": { rps: 0.18745, logLoss: 0.955101, brier: 0.573118, accuracy: 0.59375 },
  },
  2018: {
    "elo-only": { rps: 0.20117, logLoss: 0.967517, brier: 0.573507, accuracy: 0.546875 },
    "fifa-only": { rps: 0.228229, logLoss: 1.044223, brier: 0.629291, accuracy: 0.5 },
    "elo-fifa": { rps: 0.200959, logLoss: 0.968904, brier: 0.572945, accuracy: 0.578125 },
    "elo-fifa-host-regional": { rps: 0.197796, logLoss: 0.960757, brier: 0.56574, accuracy: 0.59375 },
  },
  2022: {
    "elo-only": { rps: 0.217873, logLoss: 1.057303, brier: 0.609806, accuracy: 0.5625 },
    "fifa-only": { rps: 0.227853, logLoss: 1.054135, brier: 0.635823, accuracy: 0.5625 },
    "elo-fifa": { rps: 0.217252, logLoss: 1.064169, brier: 0.607658, accuracy: 0.578125 },
    "elo-fifa-host-regional": { rps: 0.218526, logLoss: 1.06712, brier: 0.610567, accuracy: 0.546875 },
  },
};
const CANONICAL = { group: CANONICAL_GROUP, all: CANONICAL_ALL } as const;
const META = ["rps", "logLoss", "brier", "accuracy"] as const;
const macroOf = (year: number, variant: string, mode: "group" | "all"): M => {
  const others = YEARS.filter((y) => y !== year);
  const mean = (k: (typeof META)[number]) =>
    round6(others.reduce((s, y) => s + CANONICAL[mode][y]![variant]![k], 0) / others.length);
  return { rps: mean("rps"), logLoss: mean("logLoss"), brier: mean("brier"), accuracy: mean("accuracy") };
};

describe("LOTO: fold structure and held-out coverage", () => {
  for (const mode of ["group", "all"] as const) {
    const loto = computeLotoDiagnostics(PACKS, mode);
    it(`${mode}: exactly four folds, ascending by held-out year`, () => {
      expect(loto.folds.map((f) => f.heldOutYear)).toEqual([...YEARS]);
      expect(loto.mode).toBe(mode);
    });
    it(`${mode}: each fold excludes its held-out year and has exactly three reference years`, () => {
      for (const f of loto.folds) {
        expect(f.referenceYears).not.toContain(f.heldOutYear);
        expect(f.referenceYears).toHaveLength(3);
        expect(f.referenceYears).toEqual(YEARS.filter((y) => y !== f.heldOutYear));
      }
    });
    it(`${mode}: every fold includes all four diagnostic variants`, () => {
      for (const f of loto.folds) expect(Object.keys(f.byVariant).sort()).toEqual([...VARIANTS].sort());
    });
    it(`${mode}: held-out match counts are 48 (group) / 64 (all)`, () => {
      const expected = mode === "group" ? 48 : 64;
      for (const f of loto.folds) for (const v of VARIANTS) {
        expect(f.byVariant[v]!.heldOut.matchCount).toBe(expected);
      }
    });
  }
});

describe("LOTO is purely descriptive: held-out == canonical pins, reference == macro, delta == difference", () => {
  for (const mode of ["group", "all"] as const) {
    const loto = computeLotoDiagnostics(PACKS, mode);
    it(`${mode}: held-out metrics equal the existing pinned per-tournament metrics`, () => {
      for (const f of loto.folds) for (const v of VARIANTS) {
        const ho = f.byVariant[v]!.heldOut;
        expect({ rps: ho.rps, logLoss: ho.logLoss, brier: ho.brier, accuracy: ho.accuracy })
          .toEqual(CANONICAL[mode][f.heldOutYear]![v]!);
      }
    });
    it(`${mode}: reference macro-average is the equal-weight mean of the other three tournaments`, () => {
      for (const f of loto.folds) for (const v of VARIANTS) {
        const ref = f.byVariant[v]!.referenceMacroAverage;
        expect(ref.tournamentCount).toBe(3);
        // Macro-averages the RAW per-tournament metrics then rounds (as consolidate.ts does),
        // so it matches the mean of the 6-dp canonical pins within rounding (<=1e-6).
        const exp = macroOf(f.heldOutYear, v, mode);
        for (const k of META) expect(ref[k]).toBeCloseTo(exp[k], 5);
      }
    });
    it(`${mode}: delta equals heldOut minus referenceMacroAverage (6 dp)`, () => {
      for (const f of loto.folds) for (const v of VARIANTS) {
        const { heldOut, referenceMacroAverage, delta } = f.byVariant[v]!;
        for (const k of META) {
          expect(delta[k]).toBe(round6(heldOut[k] - referenceMacroAverage[k]));
        }
      }
    });
  }
});

describe("LOTO: pinned summary, best-variant counts and host/regional comparison", () => {
  it("group: pinned summary statistics (mean / population stdDev / range)", () => {
    const { summaryByVariant } = computeLotoDiagnostics(PACKS, "group");
    expect(summaryByVariant).toEqual({
      "elo-only": {
        mean: { rps: 0.205214, logLoss: 0.987346, brier: 0.580559, accuracy: 0.5625 },
        stdDev: { rps: 0.019483, logLoss: 0.07855, brier: 0.041151, accuracy: 0.03294 },
        range: { rps: { min: 0.189773, max: 0.238651 }, logLoss: { min: 0.908006, max: 1.110921 }, brier: { min: 0.536186, max: 0.637314 }, accuracy: { min: 0.520833, max: 0.604167 } },
      },
      "fifa-only": {
        mean: { rps: 0.227424, logLoss: 1.042066, brier: 0.627626, accuracy: 0.552084 },
        stdDev: { rps: 0.004319, logLoss: 0.021667, brier: 0.014675, accuracy: 0.059839 },
        range: { rps: { min: 0.220927, max: 0.231994 }, logLoss: { min: 1.017085, max: 1.074604 }, brier: { min: 0.610345, max: 0.649351 }, accuracy: { min: 0.479167, max: 0.645833 } },
      },
      "elo-fifa": {
        mean: { rps: 0.204891, logLoss: 0.990296, brier: 0.579661, accuracy: 0.583333 },
        stdDev: { rps: 0.02055, logLoss: 0.089995, brier: 0.047531, accuracy: 0.057054 },
        range: { rps: { min: 0.183794, max: 0.238636 }, logLoss: { min: 0.888234, max: 1.123338 }, brier: { min: 0.523563, max: 0.636163 }, accuracy: { min: 0.5, max: 0.645833 } },
      },
      "elo-fifa-host-regional": {
        mean: { rps: 0.204233, logLoss: 0.987796, brier: 0.57833, accuracy: 0.578125 },
        stdDev: { rps: 0.021885, logLoss: 0.093019, brier: 0.05012, accuracy: 0.069683 },
        range: { rps: { min: 0.182562, max: 0.240298 }, logLoss: { min: 0.884112, max: 1.126756 }, brier: { min: 0.521259, max: 0.639973 }, accuracy: { min: 0.5, max: 0.666667 } },
      },
    });
  });

  it("all: pinned summary statistics (mean / population stdDev / range)", () => {
    const { summaryByVariant } = computeLotoDiagnostics(PACKS, "all");
    expect(summaryByVariant).toEqual({
      "elo-only": {
        mean: { rps: 0.19964, logLoss: 0.99057, brier: 0.585894, accuracy: 0.550781 },
        stdDev: { rps: 0.011529, logLoss: 0.03857, brier: 0.014079, accuracy: 0.006766 },
        range: { rps: { min: 0.188848, max: 0.217873 }, logLoss: { min: 0.966312, max: 1.057303 }, brier: { min: 0.573507, max: 0.609806 }, accuracy: { min: 0.546875, max: 0.5625 } },
      },
      "fifa-only": {
        mean: { rps: 0.224166, logLoss: 1.054784, brier: 0.635935, accuracy: 0.542969 },
        stdDev: { rps: 0.003965, logLoss: 0.008941, brier: 0.005966, accuracy: 0.030004 },
        range: { rps: { min: 0.219121, max: 0.228229 }, logLoss: { min: 1.044223, max: 1.068904 }, brier: { min: 0.629291, max: 0.645454 }, accuracy: { min: 0.5, max: 0.578125 } },
      },
      "elo-fifa": {
        mean: { rps: 0.199133, logLoss: 0.991791, brier: 0.585023, accuracy: 0.566406 },
        stdDev: { rps: 0.011685, logLoss: 0.043081, brier: 0.014803, accuracy: 0.020297 },
        range: { rps: { min: 0.186371, max: 0.217252 }, logLoss: { min: 0.952269, max: 1.064169 }, brier: { min: 0.570727, max: 0.607658 }, accuracy: { min: 0.53125, max: 0.578125 } },
      },
      "elo-fifa-host-regional": {
        mean: { rps: 0.198794, logLoss: 0.990375, brier: 0.584146, accuracy: 0.566406 },
        stdDev: { rps: 0.011976, logLoss: 0.045144, brier: 0.017085, accuracy: 0.027896 },
        range: { rps: { min: 0.18745, max: 0.218526 }, logLoss: { min: 0.955101, max: 1.06712 }, brier: { min: 0.56574, max: 0.610567 }, accuracy: { min: 0.53125, max: 0.59375 } },
      },
    });
  });

  it("the all-fold mean equals the existing four-tournament macro-average (sanity)", () => {
    // mean of the four held-out values == the all-four macro-average from consolidate.ts.
    const g = computeLotoDiagnostics(PACKS, "group").summaryByVariant;
    expect(g["elo-fifa-host-regional"]!.mean.rps).toBe(0.204233); // matches consolidation pin (rounding of mean)
  });

  it("group: pinned best-variant counts (lower is better; accuracy omitted)", () => {
    const { bestVariantCountByMetric } = computeLotoDiagnostics(PACKS, "group");
    expect(bestVariantCountByMetric).toEqual({
      rps: { "elo-only": 1, "fifa-only": 1, "elo-fifa": 0, "elo-fifa-host-regional": 2 },
      logLoss: { "elo-only": 1, "fifa-only": 1, "elo-fifa": 0, "elo-fifa-host-regional": 2 },
      brier: { "elo-only": 1, "fifa-only": 1, "elo-fifa": 0, "elo-fifa-host-regional": 2 },
    });
  });

  it("all: pinned best-variant counts (lower is better; accuracy omitted)", () => {
    const { bestVariantCountByMetric } = computeLotoDiagnostics(PACKS, "all");
    expect(bestVariantCountByMetric).toEqual({
      rps: { "elo-only": 1, "fifa-only": 0, "elo-fifa": 2, "elo-fifa-host-regional": 1 },
      logLoss: { "elo-only": 1, "fifa-only": 1, "elo-fifa": 1, "elo-fifa-host-regional": 1 },
      brier: { "elo-only": 1, "fifa-only": 0, "elo-fifa": 2, "elo-fifa-host-regional": 1 },
    });
  });

  it("best-variant counts sum to the number of folds (4) per metric", () => {
    for (const mode of ["group", "all"] as const) {
      const b = computeLotoDiagnostics(PACKS, mode).bestVariantCountByMetric;
      for (const metric of ["rps", "logLoss", "brier"] as const) {
        const total = VARIANTS.reduce((s, v) => s + b[metric][v]!, 0);
        expect(total).toBe(4);
      }
    }
  });

  it("group: pinned host/regional vs Elo+FIFA by held-out year", () => {
    const { hostRegionalVsEloFifaByYear } = computeLotoDiagnostics(PACKS, "group");
    expect(hostRegionalVsEloFifaByYear).toEqual([
      { heldOutYear: 2010, rpsDelta: -0.000517, logLossDelta: -0.003923, brierDelta: -0.001533, improves: true },
      { heldOutYear: 2014, rpsDelta: -0.001232, logLossDelta: -0.004122, brierDelta: -0.002304, improves: true },
      { heldOutYear: 2018, rpsDelta: -0.002546, logLossDelta: -0.005374, brierDelta: -0.005296, improves: true },
      { heldOutYear: 2022, rpsDelta: 0.001662, logLossDelta: 0.003418, brierDelta: 0.00381, improves: false },
    ]);
  });

  it("all: pinned host/regional vs Elo+FIFA by held-out year", () => {
    const { hostRegionalVsEloFifaByYear } = computeLotoDiagnostics(PACKS, "all");
    expect(hostRegionalVsEloFifaByYear).toEqual([
      { heldOutYear: 2010, rpsDelta: -0.000546, logLossDelta: -0.003301, brierDelta: -0.001601, improves: true },
      { heldOutYear: 2014, rpsDelta: 0.001079, logLossDelta: 0.002832, brierDelta: 0.002391, improves: false },
      { heldOutYear: 2018, rpsDelta: -0.003163, logLossDelta: -0.008147, brierDelta: -0.007205, improves: true },
      { heldOutYear: 2022, rpsDelta: 0.001274, logLossDelta: 0.002951, brierDelta: 0.002909, improves: false },
    ]);
  });
});

describe("LOTO: no calibration / fitting / tuning surface", () => {
  it("top-level and fold-variant shapes carry no calibration fields", () => {
    const loto = computeLotoDiagnostics(PACKS, "group");
    expect(Object.keys(loto).sort()).toEqual(
      ["bestVariantCountByMetric", "folds", "hostRegionalVsEloFifaByYear", "mode", "summaryByVariant"],
    );
    const vf = loto.folds[0]!.byVariant["elo-fifa"]!;
    expect(Object.keys(vf).sort()).toEqual(["delta", "heldOut", "referenceMacroAverage"]);
  });

  it("no fitted-parameter / temperature / weight / tuning fields anywhere in the output", () => {
    const blob = JSON.stringify(computeLotoDiagnostics(PACKS, "all"));
    expect(/calibrat|temperature|tuning|weight|param|optimi[sz]/i.test(blob)).toBe(false);
  });

  it("is pack-agnostic: a custom three-pack input yields three folds (no hard-coded snapshots)", () => {
    const loto = computeLotoDiagnostics([WC2014_PACK, WC2018_PACK, WC2022_PACK], "group");
    expect(loto.folds.map((f) => f.heldOutYear)).toEqual([2014, 2018, 2022]);
    for (const f of loto.folds) expect(f.referenceYears).toHaveLength(2);
  });
});

describe("LOTO: isolation", () => {
  it("loto.ts imports no production / 2026 / model-input path", () => {
    const src = readFileSync(join(process.cwd(), "lib", "backtesting", "loto.ts"), "utf8");
    const specs: string[] = [];
    const re = /(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) specs.push(m[1]!);
    const FORBIDDEN = [
      /data\/model-inputs/,
      /lib\/model\/features/,
      /lib\/model\/predict\b/,
      /data\/official/,
      /lib\/data["']/,
      /2026/,
      /^@\/app\//,
      /^@\/components\//,
    ];
    for (const s of specs) {
      expect({ s, bad: FORBIDDEN.some((re2) => re2.test(s)) }).toEqual({ s, bad: false });
    }
  });

  it("loto.ts reuses the existing diagnostic primitives", () => {
    const src = readFileSync(join(process.cwd(), "lib", "backtesting", "loto.ts"), "utf8");
    expect(src).toContain('from "./consolidate"');
    expect(BASELINE_LADDER.length).toBe(4);
  });
});
