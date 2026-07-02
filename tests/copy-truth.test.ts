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

// UX-4B: /bracket selected-match detail — reuse shared truth, never hardcode/overclaim.
const bracketDetailLib = read("lib/ui/bracket-detail.ts");
const bracketDetailPanel = read("components/bracket/bracket-match-detail.tsx");

describe("Bracket detail reuses shared provenance/aged-well truth (no hardcoding/overclaim)", () => {
  it("resolves provenance + aged-well via the shared helpers, not hardcoded strings", () => {
    expect(bracketDetailLib).toContain("matchProvenanceLabel");
    expect(bracketDetailLib).toContain("agedWellVerdict");
    expect(bracketDetailLib).toContain("resolveCentreForecast");
    // Never re-derive the provenance copy in the bracket layer.
    expect(bracketDetailLib).not.toContain("captured before kickoff");
    expect(bracketDetailLib).not.toContain("Retrospective model estimate");
    expect(bracketDetailPanel).not.toContain("captured before kickoff");
  });

  it("aged-well verdict is gated on the model flag, never shown for a retrospective label directly", () => {
    // The panel renders 'Called it'/'Missed' only from model.agedWell (set by agedWellVerdict).
    expect(bracketDetailPanel).toContain("agedWell");
    expect(bracketDetailPanel).toContain("Called it");
  });

  it("uses clear labels, not bare win%/final%, and links to the Match Forecast Centre", () => {
    expect(bracketDetailPanel).toContain("/matches");
    expect(bracketDetailPanel.includes("win %")).toBe(false);
    expect(bracketDetailPanel.includes("final %")).toBe(false);
  });
});

// UX-4C: /bracket selected-team path — deterministic, no path-difficulty/causal claims.
const bracketPathLib = read("lib/ui/bracket-path.ts");
const bracketPathSummary = read("components/bracket/bracket-team-path-summary.tsx");
const bracketTeamPicker = read("components/bracket/bracket-team-picker.tsx");

describe("Bracket team-path copy is deterministic + non-overclaiming", () => {
  it("never claims path difficulty or causal/fixture certainty", () => {
    const sources = `${bracketPathLib} ${bracketPathSummary} ${bracketTeamPicker}`.toLowerCase();
    for (const bad of ["easier path", "harder path", "will face", "guaranteed", "because", "path became"]) {
      expect(sources, `bracket path copy overclaims: "${bad}"`).not.toContain(bad);
    }
  });

  it("uses cautious, deterministic labels", () => {
    expect(bracketTeamPicker).toContain("Trace a team");
    expect(bracketTeamPicker).toContain("Clear team path");
    // Status/endpoint wording is deterministic (from graph + live-state), not probabilistic.
    for (const ok of ["Champion", "Eliminated", "Third-place match"]) {
      expect(bracketPathSummary.includes(ok)).toBe(true);
    }
  });

  it("reuses human slot placeholders (via slotLabel), never raw slot codes", () => {
    // The path helper labels unresolved opponents through the shared slotLabel helper.
    expect(bracketPathLib).toContain("slotLabel");
    expect(bracketPathLib).not.toContain("groupPosition:");
  });
});

// Corrective bracket pass — nav item, discoverability cues, deterministic copy.
const siteHeader = read("components/site-header.tsx");
const bracketPageSrc = read("components/bracket/bracket-page.tsx");
const bracketCardSrc = read("components/bracket/bracket-match-card.tsx");
const bracketPickerSrc = read("components/bracket/bracket-team-picker.tsx");

describe("Knockout Bracket nav + active-state", () => {
  it("adds a Knockout Bracket item at /bracket between Forecast and Matches", () => {
    expect(siteHeader).toContain('label: "Knockout Bracket"');
    expect(siteHeader).toContain('href: "/bracket"');
    const forecast = siteHeader.indexOf('href: "/"');
    const bracket = siteHeader.indexOf('href: "/bracket"');
    const matches = siteHeader.indexOf('href: "/matches"');
    expect(forecast).toBeLessThan(bracket);
    expect(bracket).toBeLessThan(matches);
  });
  it("keeps other nav items and hardens active-state (home not active on every route)", () => {
    for (const item of ["Matches", "Teams", "Scenario Lab", "Methodology"]) {
      expect(siteHeader).toContain(item);
    }
    expect(siteHeader).toContain('pathname === "/"');
    expect(siteHeader).toContain("startsWith(`${href}/`)");
  });
});

describe("Bracket discoverability cues + deterministic copy", () => {
  it("surfaces the match-detail affordance and the trace-a-team card", () => {
    expect(bracketCardSrc).toContain("View match detail");
    expect(bracketCardSrc).toContain('aria-controls="bracket-detail-panel"');
    expect(bracketPickerSrc).toContain("Trace a team");
    expect(bracketPickerSrc).toContain("Pick a team to highlight its current path through the knockout bracket.");
    expect(bracketPageSrc).toContain("Select a match for its forecast detail");
  });
  it("node stays lightweight — no forecast visuals inside the card", () => {
    expect(bracketCardSrc.includes("ProbabilityBar")).toBe(false);
    expect(bracketCardSrc.includes("chance to advance")).toBe(false);
  });
  it("no path-difficulty / causal / betting claims in bracket surfaces", () => {
    const src = `${bracketPageSrc} ${bracketPickerSrc} ${read("components/bracket/bracket-tree.tsx")}`.toLowerCase();
    for (const bad of ["easier path", "harder path", "will face", "guaranteed", "path became", "win %", "final %"]) {
      expect(src, `bracket copy overclaims: "${bad}"`).not.toContain(bad);
    }
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

// UX-4D: bracket deep-linking, copy-link, and integration links — deterministic copy only.
const bracketCopyLink = read("components/bracket/bracket-copy-link.tsx");
const bracketPageUx4d = read("components/bracket/bracket-page.tsx");
const forecastHero = read("components/home/forecast-hero.tsx");
const matchCardUx4d = read("components/matches/match-forecast-card.tsx");
const teamDetailPage = read("app/teams/[teamId]/page.tsx");

describe("Bracket deep-link + copy-link copy is deterministic (UX-4D)", () => {
  it("copy-link uses the allowed labels + graceful fallbacks, no external SDK", () => {
    expect(bracketCopyLink).toContain("Copy bracket view link");
    expect(bracketCopyLink).toContain("Link copied");
    expect(bracketCopyLink).toContain("Copy from address bar");
    expect(bracketCopyLink).toContain("Copy failed");
    // Builds a canonical share URL from validated state (not raw window.location.href).
    expect(bracketCopyLink).toContain("serializeBracketSearchParams");
    expect(bracketCopyLink).not.toContain("window.location.href");
    // No analytics / external SDK / Blob.
    for (const bad of ["@vercel/blob", "vercel-storage", "analytics", "gtag", "mixpanel"]) {
      expect(bracketCopyLink.includes(bad)).toBe(false);
    }
    // Accessible live feedback, not colour-only.
    expect(bracketCopyLink).toContain('role="status"');
    expect(bracketCopyLink).toContain('aria-live="polite"');
  });

  it("bracket page reads match/team query params and mirrors with replace (not push)", () => {
    expect(bracketPageUx4d).toContain("useSearchParams");
    expect(bracketPageUx4d).toContain("parseBracketSearchParams");
    expect(bracketPageUx4d).toContain("router.replace");
    expect(bracketPageUx4d).not.toContain("router.push");
    // Distinct, safe invalid-param notices.
    expect(bracketPageUx4d).toContain("Match not found");
    expect(bracketPageUx4d).toContain("Team not found");
  });

  it("integration links are deterministic and point into the bracket", () => {
    expect(forecastHero).toContain("Explore the knockout bracket");
    expect(forecastHero).toContain('href="/bracket"');
    expect(matchCardUx4d).toContain("View in bracket");
    expect(matchCardUx4d).toContain("/bracket?match=");
    expect(teamDetailPage).toContain("Trace path in bracket");
    expect(teamDetailPage).toContain("/bracket?team=");
  });

  it("no path-difficulty / causal / betting claims in the new surfaces", () => {
    const src = `${bracketCopyLink} ${forecastHero} ${matchCardUx4d} ${teamDetailPage}`.toLowerCase();
    for (const bad of ["easier path", "harder path", "will face", "guaranteed", "path became", "win %", "final %"]) {
      expect(src, `UX-4D copy overclaims: "${bad}"`).not.toContain(bad);
    }
  });
});
