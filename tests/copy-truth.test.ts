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

// UX-3: /movement surface + its pure copy/label source.
const movementSurface = read("components/movement/movement-surface.tsx");
const movementLib = read("lib/ui/forecast-movement.ts");

describe("Movement surface copy is honest + non-overclaiming", () => {
  it("uses the not-re-rated caveat and the safe neutral explanation", () => {
    expect(movementSurface.toLowerCase()).toContain("not re-rated after every match");
    expect(movementLib).toContain(
      "Probability moved as results were locked and tournament paths changed.",
    );
  });

  it("never overclaims a causal reason for movement", () => {
    for (const bad of ["rival", "became easier", "became harder", "because they won", "because they lost", "changed its mind"]) {
      expect(movementLib.toLowerCase(), `movement lib overclaims: "${bad}"`).not.toContain(bad);
    }
  });

  it("uses clear stage labels, not bare win%/final%", () => {
    expect(movementLib).toContain("Title chance");
    expect(movementLib).toContain("Reach final");
    expect(movementLib.includes("win %")).toBe(false);
    expect(movementLib.includes("final %")).toBe(false);
  });
});

// UX-4A: /bracket surface + its pure node/label source.
const bracketPage = read("components/bracket/bracket-page.tsx");
const bracketLib = read("lib/ui/bracket-view.ts");
const bracketCard = read("components/bracket/bracket-match-card.tsx");

describe("Bracket surface copy is honest + human-readable", () => {
  it("uses human slot placeholders, not raw slot/provider codes", () => {
    expect(bracketLib).toContain("Winner of Match");
    expect(bracketLib).toContain("Runner-up Group");
    expect(bracketLib).toContain("Third-place qualifier");
    expect(bracketLib).toContain("Awaiting teams");
  });

  it("reuses the shared provenance labels (retrospective never rendered as pre-match)", () => {
    // The bracket maps to the shared label helper rather than hardcoding provenance copy.
    expect(bracketLib).toContain("matchProvenanceLabel");
    expect(bracketLib).not.toContain("captured before kickoff");
  });

  it("renders public 'Match N' labels, not bare provider ids", () => {
    expect(bracketCard).toContain("Match {node.matchNumber}");
    for (const bad of ["vercel-storage", "BLOB_READ_WRITE_TOKEN"]) {
      expect(bracketPage.includes(bad)).toBe(false);
      expect(bracketLib.includes(bad)).toBe(false);
    }
  });

  it("links to the Match Forecast Centre and Tournament State", () => {
    expect(bracketPage).toContain("/matches");
    expect(bracketPage).toContain("/live");
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
