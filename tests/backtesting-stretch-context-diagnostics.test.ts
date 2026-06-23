import { describe, expect, it } from "vitest";
import {
  computeStretchContextDiagnostics,
  STRETCH_CONTEXT_DIAGNOSTIC_LABEL,
  STRETCH_CONTEXT_GOVERNANCE_FLAGS,
} from "@/lib/backtesting/stretch-context-diagnostics";
import { stretchContextPacks } from "@/lib/backtesting/historical-cohorts";

/**
 * Phase 1.20D: the SUPPLEMENTARY stretch-context diagnostics (WC 1998/2002/2006) must
 * be exactly the stretch cohort, clearly labelled, governance-flagged, and must emit
 * NO all-seven view, NO LOTO, and NO primary rows. Pinned metric values here are
 * STRETCH-ONLY / SUPPLEMENTARY: they are never compared to the primary headline as
 * better/worse and are not calibration evidence. The primary consolidation/LOTO pins
 * live in their own (untouched) test files.
 */
const VARIANT_IDS = ["elo-only", "fifa-only", "elo-fifa", "elo-fifa-host-regional"] as const;

describe("stretch-context diagnostics - cohort & shape", () => {
  const group = computeStretchContextDiagnostics("group");
  const all = computeStretchContextDiagnostics("all");

  it("consumes exactly the stretch cohort (1998/2002/2006)", () => {
    expect([...stretchContextPacks].map((p) => p.identity.tournamentYear).sort((a, b) => a - b))
      .toEqual([1998, 2002, 2006]);
    expect(group.years).toEqual([1998, 2002, 2006]);
    expect(all.years).toEqual([1998, 2002, 2006]);
  });

  it("perTournament rows are exactly 1998, 2002, 2006 (no 2010/2014/2018/2022)", () => {
    for (const d of [group, all]) {
      expect(d.perTournament.map((t) => t.tournamentYear)).toEqual([1998, 2002, 2006]);
      for (const banned of [2010, 2014, 2018, 2022]) {
        expect(d.perTournament.some((t) => t.tournamentYear === banned)).toBe(false);
      }
    }
  });

  it("tournamentCount is 3; match counts are 144 (group) and 192 (all)", () => {
    expect(group.tournamentCount).toBe(3);
    expect(all.tournamentCount).toBe(3);
    expect(group.matchCount).toBe(144);
    expect(all.matchCount).toBe(192);
  });

  it("mode is carried through", () => {
    expect(group.mode).toBe("group");
    expect(all.mode).toBe("all");
  });

  it("cohortLabel signals Stretch context / supplementary", () => {
    expect(group.cohortLabel).toBe(STRETCH_CONTEXT_DIAGNOSTIC_LABEL);
    expect(group.cohortLabel).toContain("Stretch context");
    expect(group.cohortLabel.toLowerCase()).toContain("supplementary");
  });
});

describe("stretch-context diagnostics - governance flags", () => {
  it("flags are exactly supplementary-only / not headline / not calibration / not LOTO", () => {
    const d = computeStretchContextDiagnostics("group");
    expect(d.governance).toEqual({
      supplementaryOnly: true,
      headlineEligible: false,
      calibrationEligible: false,
      lotoEligible: false,
    });
    expect(STRETCH_CONTEXT_GOVERNANCE_FLAGS).toEqual(d.governance);
  });
});

describe("stretch-context diagnostics - metrics present, finite, and contain no all-seven / LOTO", () => {
  const group = computeStretchContextDiagnostics("group");

  it("every per-tournament + macro metric is finite (RPS, logLoss, Brier, accuracy)", () => {
    for (const t of group.perTournament) {
      for (const v of VARIANT_IDS) {
        const m = t.byVariant[v]!;
        for (const k of ["rps", "logLoss", "brier", "accuracy"] as const) {
          expect(Number.isFinite(m[k])).toBe(true);
        }
        expect(m.matchCount).toBe(48);
      }
    }
    for (const v of VARIANT_IDS) {
      const m = group.supplementaryMacroAverageByVariant[v]!;
      expect(m.tournamentCount).toBe(3);
      for (const k of ["rps", "logLoss", "brier", "accuracy"] as const) {
        expect(Number.isFinite(m[k])).toBe(true);
      }
    }
  });

  it("accuracy is present (descriptive only - not used for any verdict)", () => {
    // Accuracy is carried for description; the result exposes no best-variant pick.
    for (const v of VARIANT_IDS) {
      expect(typeof group.supplementaryMacroAverageByVariant[v]!.accuracy).toBe("number");
    }
  });

  it("emits NO all-seven view, NO blended headline, and NO LOTO/fold result fields", () => {
    // The exact key set guarantees no extra (all-seven / LOTO / fold / blended) fields.
    expect(Object.keys(group)).toEqual([
      "cohortLabel",
      "years",
      "tournamentCount",
      "mode",
      "matchCount",
      "perTournament",
      "supplementaryMacroAverageByVariant",
      "governance",
    ]);
    // No all-seven aggregate can ever appear: cohort is fixed at 3 tournaments / 144|192 matches.
    expect(group.tournamentCount).not.toBe(7);
    expect(group.matchCount).not.toBe(448); // 7 * 64 (all-seven all-mode total) must never appear
    expect(group.perTournament).toHaveLength(3);
    // The only LOTO reference is the governance flag proving LOTO-ineligibility.
    expect(group.governance.lotoEligible).toBe(false);
  });
});

describe("stretch-context diagnostics - pinned SUPPLEMENTARY values (stretch-only, not headline)", () => {
  // STRETCH-ONLY pins for regression protection. NOT the headline, NOT calibration
  // evidence, and deliberately NOT compared against the primary four-tournament values.
  it("group-mode supplementary macro-average per variant", () => {
    const m = computeStretchContextDiagnostics("group").supplementaryMacroAverageByVariant;
    expect(m["elo-only"]).toEqual({ tournamentCount: 3, rps: 0.185835, logLoss: 0.973647, brier: 0.573533, accuracy: 0.569444 });
    expect(m["fifa-only"]).toEqual({ tournamentCount: 3, rps: 0.222198, logLoss: 1.073491, brier: 0.648411, accuracy: 0.493056 });
    expect(m["elo-fifa"]).toEqual({ tournamentCount: 3, rps: 0.185859, logLoss: 0.977157, brier: 0.57318, accuracy: 0.555556 });
    expect(m["elo-fifa-host-regional"]).toEqual({ tournamentCount: 3, rps: 0.183322, logLoss: 0.96916, brier: 0.567988, accuracy: 0.5625 });
  });

  it("all-mode supplementary macro-average per variant", () => {
    const m = computeStretchContextDiagnostics("all").supplementaryMacroAverageByVariant;
    expect(m["elo-only"]).toEqual({ tournamentCount: 3, rps: 0.19025, logLoss: 0.989413, brier: 0.586738, accuracy: 0.536458 });
    expect(m["fifa-only"]).toEqual({ tournamentCount: 3, rps: 0.221624, logLoss: 1.076712, brier: 0.650559, accuracy: 0.479167 });
    expect(m["elo-fifa"]).toEqual({ tournamentCount: 3, rps: 0.189924, logLoss: 0.990706, brier: 0.585988, accuracy: 0.53125 });
    expect(m["elo-fifa-host-regional"]).toEqual({ tournamentCount: 3, rps: 0.187506, logLoss: 0.983303, brier: 0.580894, accuracy: 0.536458 });
  });

  it("per-tournament spot checks (group mode)", () => {
    const byYear = Object.fromEntries(
      computeStretchContextDiagnostics("group").perTournament.map((t) => [t.tournamentYear, t.byVariant]),
    );
    expect(byYear[1998]!["elo-fifa-host-regional"]).toEqual({ matchCount: 48, rps: 0.169164, logLoss: 0.953531, brier: 0.561323, accuracy: 0.520833 });
    expect(byYear[2002]!["elo-fifa-host-regional"]).toEqual({ matchCount: 48, rps: 0.214685, logLoss: 1.084026, brier: 0.63498, accuracy: 0.5 });
    expect(byYear[2006]!["elo-fifa-host-regional"]).toEqual({ matchCount: 48, rps: 0.166117, logLoss: 0.869925, brier: 0.50766, accuracy: 0.666667 });
  });
});
