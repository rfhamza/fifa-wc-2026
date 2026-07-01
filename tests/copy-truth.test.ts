import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Phase 1.28Q-C - content-truth guard. After the schedule (v17) + bracket activation
 * and live-state ingestion, several page copy statements became stale/contradictory.
 * These tests pin the corrected copy so the stale phrasing cannot silently return.
 * (Source files are read as text - this asserts the rendered prose, not behaviour.)
 */
// Read source and collapse whitespace so multi-word phrases that JSX wraps across
// lines are still matched as contiguous text.
const read = (rel: string) =>
  readFileSync(join(process.cwd(), rel), "utf8").replace(/\s+/g, " ");

const methodology = read("app/methodology/page.tsx");
// UX-2A: /matches is now the Match Forecast Centre — user-facing copy lives in the
// client centre header + the provenance labels module (page.tsx is a data shell).
const matchesCentre = read("components/matches/match-forecast-centre.tsx");
const matchCentreLabels = read("lib/ui/match-centre.ts");
const matchCard = read("components/matches/match-forecast-card.tsx");
const footer = read("components/data-source-badge.tsx");

// Stale phrasing that is no longer true on the user-facing pages.
const STALE_ON_PAGES = [
  "not yet activated",
  "no kickoff dates",
  "balanced-seeding placeholder",
  "not yet source-verified",
  "position-generated", // legit only in the FixtureSource enum/machinery, not page copy
];

describe("methodology copy reflects current truth", () => {
  it("drops stale schedule/bracket phrasing", () => {
    for (const phrase of STALE_ON_PAGES) {
      expect(methodology, `methodology still says "${phrase}"`).not.toContain(phrase);
    }
  });

  it("states the now-active schedule, bracket, 495 allocation and live-state truth", () => {
    expect(methodology).toContain("v17");
    expect(methodology).toContain("active");
    expect(methodology).toContain("495");
    expect(methodology).toContain("Football-Data.org");
    // probabilities are explicitly not yet recalculated from live results
    expect(methodology.toLowerCase()).toContain("model estimate");
    expect(methodology.toLowerCase()).toContain("recalculated from live results");
    // provider feed does not drive internal logic
    expect(methodology.toLowerCase()).toContain("does not drive");
  });
});

describe("Match Forecast Centre copy reflects current truth", () => {
  it("drops stale position-generated/no-kickoff phrasing", () => {
    for (const phrase of STALE_ON_PAGES) {
      expect(matchesCentre, `matches centre still says "${phrase}"`).not.toContain(phrase);
      expect(matchCard, `match card still says "${phrase}"`).not.toContain(phrase);
    }
  });

  it("labels forecast provenance honestly (retrospective never called pre-match; baseline distinct)", () => {
    expect(matchCentreLabels).toContain("Pre-match forecast captured before kickoff");
    expect(matchCentreLabels).toContain("Retrospective model estimate");
    expect(matchCentreLabels).toContain("Baseline model estimate");
    expect(matchCentreLabels).toContain("No pre-match forecast captured");
    // The header explains the captured / retrospective / not-captured distinction.
    expect(matchesCentre.toLowerCase()).toContain("captured before kickoff");
    expect(matchesCentre.toLowerCase()).toContain("retrospective");
  });

  it("uses clear metric labels, not ambiguous bare win%/final%", () => {
    expect(matchCard).toContain("Model lean");
    expect(matchCard).toContain("Likely scoreline");
    expect(matchCard.includes("· final")).toBe(false);
  });
});

describe("footer provenance labels are scoped, not a broad 'Data: Candidate'", () => {
  it("uses per-concern labels and avoids the over-broad label", () => {
    expect(footer).not.toContain("Data: ");
    expect(footer).not.toContain("cross-verified, not official");
    expect(footer).toContain("Model inputs:");
    expect(footer).toContain("Fixtures:");
    expect(footer).toContain("Bracket:");
    expect(footer).toContain("Live results: provider-backed delayed");
    expect(footer).toContain("Probabilities: model estimates");
  });
});
