import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WC2010_PACK } from "@/data/historical/snapshots/wc-2010";
import { WC2014_PACK } from "@/data/historical/snapshots/wc-2014";
import { WC2018_PACK } from "@/data/historical/snapshots/wc-2018";
import { WC2022_PACK } from "@/data/historical/snapshots/wc-2022";
import { consolidateDiagnostics } from "@/lib/backtesting/consolidate";

/**
 * Phase 1.18C-1: four-tournament diagnostic consolidation. DIAGNOSTIC ONLY. Verifies
 * the consolidated view reproduces the already-pinned per-tournament metrics and pins
 * the macro-average aggregates the report cites. No calibration, no tuning.
 */
const PACKS = [WC2010_PACK, WC2014_PACK, WC2018_PACK, WC2022_PACK];
const VARIANTS = ["elo-only", "fifa-only", "elo-fifa", "elo-fifa-host-regional"];

type Row = { rps: number; logLoss: number; brier: number; accuracy: number };

// Per-tournament values already pinned in tests/backtesting-match-evaluator.test.ts.
const PINNED_GROUP: Record<number, Record<string, Row>> = {
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

const PINNED_ALL: Record<number, Record<string, Row>> = {
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

// Macro-average = simple mean of the four per-tournament metric values (6 dp).
const MACRO_GROUP: Record<string, Row> = {
  "elo-only": { rps: 0.205214, logLoss: 0.987346, brier: 0.580559, accuracy: 0.5625 },
  "fifa-only": { rps: 0.227424, logLoss: 1.042066, brier: 0.627626, accuracy: 0.552083 },
  "elo-fifa": { rps: 0.204891, logLoss: 0.990296, brier: 0.57966, accuracy: 0.583333 },
  "elo-fifa-host-regional": { rps: 0.204232, logLoss: 0.987796, brier: 0.57833, accuracy: 0.578125 },
};
const MACRO_ALL: Record<string, Row> = {
  "elo-only": { rps: 0.19964, logLoss: 0.990569, brier: 0.585894, accuracy: 0.550781 },
  "fifa-only": { rps: 0.224166, logLoss: 1.054784, brier: 0.635935, accuracy: 0.542969 },
  "elo-fifa": { rps: 0.199133, logLoss: 0.991791, brier: 0.585023, accuracy: 0.566406 },
  "elo-fifa-host-regional": { rps: 0.198794, logLoss: 0.990375, brier: 0.584146, accuracy: 0.566406 },
};

describe("four-tournament consolidation: coverage and structure", () => {
  it("includes exactly the four primary tournaments in ascending order", () => {
    const c = consolidateDiagnostics(PACKS, "group");
    expect(c.tournaments.map((t) => t.tournamentYear)).toEqual([2010, 2014, 2018, 2022]);
  });

  it("is order-independent of the input packs", () => {
    const shuffled = [WC2022_PACK, WC2010_PACK, WC2018_PACK, WC2014_PACK];
    const c = consolidateDiagnostics(shuffled, "group");
    expect(c.tournaments.map((t) => t.tournamentYear)).toEqual([2010, 2014, 2018, 2022]);
  });

  it("includes the four diagnostic variants for every tournament", () => {
    for (const mode of ["group", "all"] as const) {
      for (const t of consolidateDiagnostics(PACKS, mode).tournaments) {
        expect(Object.keys(t.byVariant).sort()).toEqual([...VARIANTS].sort());
      }
    }
  });

  it("group headline uses exactly 48 matches; all-64 uses exactly 64, per tournament", () => {
    for (const t of consolidateDiagnostics(PACKS, "group").tournaments) {
      for (const v of VARIANTS) expect(t.byVariant[v]!.matchCount).toBe(48);
    }
    for (const t of consolidateDiagnostics(PACKS, "all").tournaments) {
      for (const v of VARIANTS) expect(t.byVariant[v]!.matchCount).toBe(64);
    }
  });
});

describe("four-tournament consolidation: per-tournament metrics equal the pinned values", () => {
  const check = (mode: "group" | "all", pinned: Record<number, Record<string, Row>>) => {
    const c = consolidateDiagnostics(PACKS, mode);
    for (const t of c.tournaments) {
      for (const v of VARIANTS) {
        const got = t.byVariant[v]!;
        const exp = pinned[t.tournamentYear]![v]!;
        expect({ year: t.tournamentYear, v, ...({ rps: got.rps, logLoss: got.logLoss, brier: got.brier, accuracy: got.accuracy }) })
          .toEqual({ year: t.tournamentYear, v, ...exp });
      }
    }
  };
  it("group-stage per-tournament metrics match", () => check("group", PINNED_GROUP));
  it("all-64 per-tournament metrics match", () => check("all", PINNED_ALL));
});

describe("four-tournament consolidation: pinned macro-averages (equal weight, 6 dp)", () => {
  it("group-stage macro-average matches the pinned aggregate", () => {
    const macro = consolidateDiagnostics(PACKS, "group").macroAverageByVariant;
    for (const v of VARIANTS) {
      expect({ v, ...macro[v]! }).toEqual({ v, tournamentCount: 4, ...MACRO_GROUP[v]! });
    }
  });

  it("all-64 macro-average matches the pinned aggregate", () => {
    const macro = consolidateDiagnostics(PACKS, "all").macroAverageByVariant;
    for (const v of VARIANTS) {
      expect({ v, ...macro[v]! }).toEqual({ v, tournamentCount: 4, ...MACRO_ALL[v]! });
    }
  });

  it("macro-average equals the simple mean of the four per-tournament values", () => {
    const macro = consolidateDiagnostics(PACKS, "group").macroAverageByVariant;
    const mean = (xs: number[]) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1e6) / 1e6;
    for (const v of VARIANTS) {
      const rpsMean = mean([2010, 2014, 2018, 2022].map((y) => PINNED_GROUP[y]![v]!.rps));
      expect(macro[v]!.rps).toBeCloseTo(rpsMean, 5);
    }
  });
});

describe("four-tournament consolidation: isolation", () => {
  it("consolidate.ts imports no production / 2026 / model-input path", () => {
    const src = readFileSync(join(process.cwd(), "lib", "backtesting", "consolidate.ts"), "utf8");
    const specs: string[] = [];
    const re = /(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) specs.push(m[1]!);
    const FORBIDDEN = [/data\/model-inputs/, /lib\/model\/features/, /lib\/model\/predict/, /data\/official/, /lib\/data["']/, /2026/];
    for (const s of specs) {
      expect({ s, bad: FORBIDDEN.some((re2) => re2.test(s)) }).toEqual({ s, bad: false });
    }
  });
});
