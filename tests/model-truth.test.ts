import { describe, expect, it } from "vitest";
import {
  MODEL_SIGNAL_TRUTH,
  BACKTESTED_SIGNAL_KEYS,
  CLAIM_STATUSES,
  activeSignals,
  type ClaimStatus,
} from "@/lib/model/model-truth";
import { MODEL_WEIGHTS } from "@/lib/model/config";
import { MODEL_INPUT_SOURCES } from "@/data/model-inputs";

/**
 * Phase 1.28Q-F (PR-4A) - guards the UI-facing model-truth claim layer against drift and
 * overclaim. Asserts weightRefs resolve to real MODEL_WEIGHTS keys, statuses use the
 * controlled vocab, `active-validated` is limited to the backtested set, manager is
 * experimental (not validated), and the layer stays aligned with sources.ts provenance.
 */
const WEIGHT_KEYS = new Set(Object.keys(MODEL_WEIGHTS));
const byKey = (k: string) => MODEL_SIGNAL_TRUTH.find((s) => s.key === k);

describe("model-truth structure", () => {
  it("every weightRef resolves to a real MODEL_WEIGHTS key (no literal weights)", () => {
    for (const s of MODEL_SIGNAL_TRUTH) {
      if (s.weightRef === null) continue;
      const keys = Array.isArray(s.weightRef) ? s.weightRef : [s.weightRef];
      for (const k of keys) expect(WEIGHT_KEYS.has(k), `${s.key} -> ${k}`).toBe(true);
    }
  });

  it("every active driver is weighted, and every claimStatus is in the controlled vocab", () => {
    for (const s of MODEL_SIGNAL_TRUTH) {
      expect(CLAIM_STATUSES).toContain(s.claimStatus);
      if (s.active && s.claimStatus !== "display-only") {
        expect(s.weightRef, `${s.key} active but no weightRef`).not.toBeNull();
      }
    }
    // The 10 active weighted drivers are present.
    expect(activeSignals().length).toBe(10);
  });
});

describe("active-validated is limited to the backtested set", () => {
  const validated = MODEL_SIGNAL_TRUTH.filter((s) => s.claimStatus === "active-validated").map((s) => s.key).sort();

  it("active-validated == {elo, fifa, host, regional}", () => {
    expect(validated).toEqual([...BACKTESTED_SIGNAL_KEYS].sort());
  });

  it("backtested:true iff active-validated", () => {
    for (const s of MODEL_SIGNAL_TRUTH) {
      expect(s.backtested).toBe(s.claimStatus === "active-validated");
    }
  });
});

describe("manager & other priors are not presented as validated", () => {
  it("manager cohesion is experimental and not backtested", () => {
    const m = byKey("managerCohesion")!;
    expect(m.claimStatus).toBe("experimental");
    expect(m.claimStatus).not.toBe("active-validated");
    expect(m.backtested).toBe(false);
    expect(m.active).toBe(true);
    expect(m.caveat ?? "").not.toBe("");
  });

  it("climate, structural and tournament context are experimental (not validated)", () => {
    for (const k of ["climateFamiliarity", "structural", "tournamentContext"]) {
      const s = byKey(k)!;
      expect(s.claimStatus, k).toBe("experimental");
      expect(s.backtested, k).toBe(false);
    }
  });

  it("squad quality and recent form are placeholders", () => {
    for (const k of ["squadQuality", "recentForm"]) {
      expect(byKey(k)!.claimStatus, k).toBe("placeholder");
    }
  });
});

describe("alignment with data/model-inputs/sources.ts provenance", () => {
  const expectedSourceStatus: Record<ClaimStatus, string[] | null> = {
    "active-validated": null, // mixed: source-backed/verified/candidate (regional)
    "active-uncalibrated": null,
    experimental: ["candidate"],
    placeholder: ["placeholder"],
    "display-only": null,
    planned: null,
  };

  it("experimental signals are `candidate` and placeholders are `placeholder` in sources.ts", () => {
    for (const s of MODEL_SIGNAL_TRUTH) {
      if (s.weightRef === null) continue; // display-only / non-family
      const source = (MODEL_INPUT_SOURCES as Record<string, { status: string } | undefined>)[s.key];
      expect(source, `sources.ts missing ${s.key}`).toBeTruthy();
      const allowed = expectedSourceStatus[s.claimStatus];
      if (allowed) expect(allowed, `${s.key} status ${source!.status}`).toContain(source!.status);
    }
  });
});
