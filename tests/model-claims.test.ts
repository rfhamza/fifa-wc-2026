import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Phase 1.28Q-F (PR-4A) - copy guard against model overclaim drift. Reads UI source as
 * text (whitespace-collapsed) and asserts the corrected, honest claims stay in place:
 * no "seven signals", tournament context disclosed, the backtested set named, and manager
 * never shown as an applied "bonus".
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8").replace(/\s+/g, " ");

const methodology = read("app/methodology/page.tsx");
const teamDetail = read("app/teams/[teamId]/page.tsx");
const hero = read("components/dashboard/hero.tsx");
const modelSummary = read("components/dashboard/model-summary.tsx");

describe("methodology claims are aligned and honest", () => {
  it("drops the stale 'seven signals' count", () => {
    expect(methodology).not.toContain("seven signals");
  });
  it("discloses the active-but-experimental drivers, incl. tournament context", () => {
    expect(methodology).toContain("Tournament context");
    expect(methodology.toLowerCase()).toContain("not yet backtested");
  });
  it("names the backtested set (Elo/FIFA/host/regional) in the sanity-check section", () => {
    expect(methodology).toContain("host and regional");
    expect(methodology.toLowerCase()).toContain("backtest exercises only");
  });
  it("labels manager cohesion disabled (zero weight) pending backtest, not an active points bonus", () => {
    expect(methodology).toContain("Manager cohesion");
    expect(methodology.toLowerCase()).not.toContain("cohesion bonus");
    expect(methodology.toLowerCase()).toContain("zero model weight");
  });
});

describe("manager nationality wording is conservative (disabled pending backtest)", () => {
  it("team detail labels manager disabled/pending backtest and never an applied bonus", () => {
    expect(teamDetail).not.toContain("cohesion bonus applied");
    expect(teamDetail.toLowerCase()).toContain("disabled");
    expect(teamDetail.toLowerCase()).toContain("pending out-of-sample backtest");
  });

  it("no stale 'active' manager phrasing returns anywhere user-facing", () => {
    for (const src of [methodology, teamDetail, modelSummary]) {
      expect(src).not.toContain("15 pts");
      expect(src.toLowerCase()).not.toContain("bonus applied");
      expect(src.toLowerCase()).not.toContain("active prior");
      expect(src.toLowerCase()).not.toContain("currently included");
    }
  });
});

describe("dashboard claims consume the truth layer and stay consistent", () => {
  it("hero no longer uses the ad-hoc 7-signal 'blends' list and frames validated vs experimental", () => {
    expect(hero).not.toContain("blends Elo, FIFA ranking, squad quality");
    expect(hero.toLowerCase()).toContain("validated strength signals");
  });
  it("model summary is driven by the model-truth layer (not a hardcoded list)", () => {
    expect(modelSummary).toContain("@/lib/model/model-truth");
    expect(modelSummary).toContain("weightedSignals");
    expect(modelSummary).toContain("claimStatusLabel");
  });
});
