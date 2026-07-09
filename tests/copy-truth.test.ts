import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
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

describe("methodology distinguishes tournament-state updates from team-strength re-rating", () => {
  const lc = methodology.toLowerCase();

  it("says probabilities update as official results are locked", () => {
    expect(lc).toContain("as official results are locked");
    // The updates are tournament-state, spelled out.
    expect(lc).toContain("tournament state");
  });

  it("says locked results reshape standings, qualification, bracket paths, and eliminations", () => {
    expect(methodology).toContain(
      "locked results reshape standings, qualification, and bracket paths",
    );
    expect(lc).toContain("eliminations");
    expect(lc).toContain("qualification status");
  });

  it("says the underlying team strength is NOT yet re-rated from in-tournament form", () => {
    expect(methodology).toContain("baseline team-strength model");
    expect(methodology).toContain("not yet a live team-strength re-rating model");
    expect(methodology).toContain("not yet re-rated from in-tournament form");
  });

  it("says margin of victory / opponent-adjusted performance is not yet active", () => {
    expect(lc).toContain("margin of victory");
    expect(lc).toContain("opponent-adjusted performance");
    // Framed as planned upgrades, not active drivers.
    expect(lc).toContain("planned modelling upgrades");
    expect(lc).toContain("margin-adjusted performance");
  });

  it("clarifies tournamentContext means static logistics/draw context, not live form", () => {
    expect(methodology).toContain(
      "Tournament context refers to",
    );
    expect(lc).toContain("static draw and logistics factors");
    expect(lc).toContain("does not mean live in-tournament form");
  });

  it("adds an honest Monte Carlo uncertainty / close-rankings note", () => {
    expect(lc).toContain("monte carlo noise");
    expect(lc).toContain("approximately level");
  });

  it("explains a results-based in-tournament signal was tested and left inactive", () => {
    expect(lc).toContain("results-based in-tournament performance signal");
    expect(lc).toContain("outperforming or underperforming");
    expect(lc).toContain("historical backtest");
    expect(lc).toContain("did not improve predictive accuracy consistently");
    expect(lc).toContain("remains inactive at zero weight");
    // Framed as a governance decision, not an oversight, and non-dismissive of results.
    expect(lc).toContain("deliberate governance decision, not");
    expect(lc).toContain("pass historical validation");
  });

  it("does not dismiss results or in-tournament form as meaningless", () => {
    for (const bad of [
      "form does not matter",
      "in-tournament form is useless",
      "momentum is fake",
      "the model ignores results",
      "results do not matter",
    ]) {
      expect(lc, `methodology over-dismisses form/results: "${bad}"`).not.toContain(bad);
    }
  });

  it("never implies live form-adjusted / performance-reactive probabilities", () => {
    // Strip the negated FIFA disclaimer so its wording never false-positives.
    const DISCLAIMER =
      "Independent forecasting project. Not affiliated with, endorsed by, or sponsored by FIFA.";
    const scrubbed = methodology.split(DISCLAIMER).join(" ").toLowerCase();
    for (const bad of [
      "live form-adjusted",
      "current-form adjusted",
      "re-rated based on",
      "performance-reactive",
      "updated based on how teams are playing",
      "the model now knows",
      "guaranteed",
      "will beat",
      "betting odds",
      // No affirmative FIFA endorsement outside the negated disclaimer.
      "endorsed by fifa",
      "sponsored by fifa",
      "affiliated with fifa",
      "partner of fifa",
    ]) {
      expect(scrubbed, `methodology implies/overclaims: "${bad}"`).not.toContain(bad);
    }
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

// Match Impact ("What changed?") — pure selector + progressive-disclosure panel.
const matchImpactLib = read("lib/ui/match-impact.ts");
const matchImpactPanel = read("components/matches/match-impact-panel.tsx");

describe("Match Impact copy is honest, checkpoint-framed, and non-overclaiming", () => {
  it("frames probability movement by checkpoint interval, never the single match", () => {
    expect(matchImpactLib).toContain("Forecast movement since");
    expect(matchImpactPanel).toContain("Across this forecast interval");
    expect(matchImpactPanel.toLowerCase()).toContain("not this match alone");
  });

  it("uses clear stage labels, never bare win%/final% or betting/causal language", () => {
    expect(matchImpactPanel).toContain("Title chance");
    for (const bad of ["because", "rival", "easier path", "harder path", "will beat", "will face", "guaranteed", "betting odds", "momentum", "win %", "final %", "form proves"]) {
      expect(matchImpactLib.toLowerCase(), `impact lib overclaims: "${bad}"`).not.toContain(bad);
      expect(matchImpactPanel.toLowerCase(), `impact panel overclaims: "${bad}"`).not.toContain(bad);
    }
  });

  it("surfaces elimination only as a status event, never inferred from a 0% probability", () => {
    expect(matchImpactLib).toContain("Impact data is unavailable for this checkpoint.");
    expect(matchImpactLib.toLowerCase()).not.toContain("0% means");
    expect(matchImpactLib.toLowerCase()).not.toContain("zero title chance means");
    // The eliminating-round guard is by knockout stage, not by probability.
    expect(matchImpactLib).toContain("knockout-result");
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

  it("uses a hamburger menu on mobile and the inline nav on desktop (no horizontal scroll)", () => {
    // Desktop inline nav is gated to lg+ and hidden below it.
    expect(siteHeader).toContain("hidden");
    expect(siteHeader).toContain("lg:flex");
    // The old always-on horizontal scroller is gone.
    expect(siteHeader.includes("overflow-x-auto")).toBe(false);
    // A mobile-only toggle button with accessible open/close state.
    expect(siteHeader).toContain("lg:hidden");
    expect(siteHeader).toContain("aria-expanded");
    expect(siteHeader).toContain("aria-controls");
    expect(siteHeader).toContain('"Open menu"');
    expect(siteHeader).toContain('"Close menu"');
    // A collapsible panel wired to the toggle, with client state that closes on route change.
    expect(siteHeader).toContain('id="mobile-nav"');
    expect(siteHeader).toContain("useState");
    expect(siteHeader).toContain("usePathname");
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

// UX-6: team forecast trajectory — public checkpoints only (Tournament start →
// Group stage complete → Current projection); M54/M73 never rendered publicly.
const trajectoryLib = read("lib/ui/team-trajectory.ts");
// Public checkpoint labels now live in the shared policy module.
const trajectoryChkpt = read("lib/model/forecast-checkpoints.ts");
const trajectorySurface = read("components/teams/team-trajectory-surface.tsx");
const trajectoryChart = read("components/charts/team-trajectory-chart.tsx");
const teamMatchHistory = read("components/teams/team-match-history.tsx");
const teamPageUx6 = read("app/teams/[teamId]/page.tsx");
// UX-6B: team outlook storytelling (compact summary card + pure selector).
const teamOutlookLib = read("lib/ui/team-outlook.ts");
const teamOutlookCard = read("components/teams/team-outlook-card.tsx");

describe("Team forecast trajectory copy is honest (UX-6)", () => {
  it("uses the public checkpoint labels and the retained-checkpoint explanation", () => {
    expect(trajectorySurface).toContain("Forecast trajectory");
    expect(trajectoryChkpt).toContain("Tournament start");
    expect(trajectoryChkpt).toContain("Group matchday 1 complete");
    expect(trajectoryChkpt).toContain("Group matchday 2 complete");
    expect(trajectoryChkpt).toContain("Group stage complete");
    expect(trajectoryChkpt).toContain("Current projection");
    expect(trajectorySurface).toContain("Group matchday 1 complete");
    expect(trajectorySurface).toContain("Group matchday 2 complete");
    expect(trajectorySurface).toContain("Since tournament start");
    expect(trajectorySurface).toContain("Percentage points");
    expect(trajectorySurface).toContain("Not enough history yet");
    expect(trajectorySurface).toContain(
      "knockout-round checkpoints (Round of 32 onward) appear once their snapshots are committed",
    );
    expect(trajectorySurface).toContain("not re-rated after every match");
    // The single allowed after-every-match mention is the explicit clarification.
    expect(trajectorySurface).toContain("It is not an after-every-match timeline.");
  });

  it("never surfaces the non-public M54/M73 checkpoints or arbitrary-checkpoint wording", () => {
    const src = `${trajectoryLib} ${trajectorySurface} ${trajectoryChart} ${teamMatchHistory} ${teamOutlookLib} ${teamOutlookCard}`;
    for (const bad of ["After Match 54", "After Match 73", "M54", "M73", "historical manual checkpoint", "knockout-lock proof", "arbitrary checkpoint", "match-by-match"]) {
      expect(src.includes(bad), `UX-6 leaks non-public checkpoint wording: "${bad}"`).toBe(false);
    }
    // "after-every-match" may appear ONLY in the explicit clarification sentence.
    const clarifications = trajectorySurface.split("after-every-match").length - 1;
    expect(clarifications).toBe(1);
    for (const f of [trajectoryLib, trajectoryChart, teamMatchHistory, teamOutlookLib, teamOutlookCard]) {
      expect(f.includes("after-every-match timeline")).toBe(false);
    }
  });

  it("no causal / betting / ambiguous-metric claims in the trajectory surfaces", () => {
    const src = `${trajectoryLib} ${trajectorySurface} ${trajectoryChart} ${teamMatchHistory} ${teamOutlookLib} ${teamOutlookCard}`.toLowerCase();
    for (const bad of ["because", "caused by", "probability rose", "guaranteed", "will face", "easier path", "harder path", "path became", "win %", "final %", "vercel-storage", "blob_read_write_token", "became easier", "became harder", "momentum", "form proves", "morale", "small team", "weak team", "giant killing", "footballing giant"]) {
      expect(src, `UX-6 copy overclaims/leaks: "${bad}"`).not.toContain(bad);
    }
    // Movement sentences are built from public-milestone labels ("Changed between {from}
    // and {to}") plus the anchored total; no non-public interval wording appears.
    expect(trajectoryLib).toContain("Changed between ${from.label.toLowerCase()} and ${to.label.toLowerCase()}");
    expect(trajectoryLib).toContain("Changed since tournament start");
  });

  it("the outlook card uses the required section labels and soft route wording (UX-6B)", () => {
    for (const label of ["Current outlook", "Route from here", "Forecast movement", "Title chance", "Reach final"]) {
      expect(teamOutlookCard, `UX-6B outlook card is missing the "${label}" label`).toContain(label);
    }
    // Route stays soft and non-causal; the selector owns the bracket-link copy and
    // the card must not reintroduce the second "after-every-match" mention (the
    // surface owns the single allowed one).
    expect(teamOutlookLib).toContain("Trace path in bracket");
    expect(teamOutlookCard).not.toContain("after-every-match");
  });

  it("the personalized outlook narrative is data-driven and uses only approved wording (UX-6B follow-up)", () => {
    // The card renders the precomputed narrative; the selector owns the templates.
    expect(teamOutlookCard).toContain("story.primaryNarrative");
    expect(teamOutlookCard).toContain("story.supportingNarrative");
    // Approved, neutral, non-causal story templates are present in the selector.
    for (const phrase of [
      "advanced after a",
      "tournament ended after a",
      "out of the title race",
      "did not advance from the group stage",
      "came through the group stage",
      "latest result was",
      "Across the latest forecast interval",
      "mostly stable across the latest forecast checkpoint",
      "The route updates in the bracket view.",
      "host nation",
      // Upset / strength-context refinement templates.
      "upset",
      "exited the World Cup",
      "advancing to",
      "lower-ranked",
      "higher-rated",
    ]) {
      expect(teamOutlookLib, `UX-6B narrative is missing template: "${phrase}"`).toContain(phrase);
    }
    // No hardcoded team-specific stories: example display names from the brief must not
    // appear as literals in the selector or card (host-nation team IDs are lowercase and
    // are structural tournament facts, not story text).
    for (const name of ["England", "Brazil", "Norway", "Mexico", "Argentina", "Estadio", "Azteca"]) {
      expect(teamOutlookLib, `UX-6B hardcodes a team story: "${name}"`).not.toContain(name);
      expect(teamOutlookCard, `UX-6B hardcodes a team story: "${name}"`).not.toContain(name);
    }
    // The card stays compact — a summary, not a dense probability table.
    expect(teamOutlookCard).not.toContain("<table");
  });

  it("the team page is live-aware and wires the trajectory (no static re-freeze)", () => {
    expect(teamPageUx6).toContain('dynamic = "force-dynamic"');
    expect(teamPageUx6).toContain("getTeamForecastTrajectory");
    expect(teamPageUx6).toContain("TeamTrajectorySurface");
    expect(teamPageUx6).not.toContain("generateStaticParams");
    // Relabelled baseline tiles + funnel clarification.
    expect(teamPageUx6).toContain("Baseline title chance");
    expect(teamPageUx6).toContain("Baseline reach round of 16");
    expect(teamPageUx6).toContain("pre-tournament baseline");
    // UX-4D pins that must survive.
    expect(teamPageUx6).toContain("Trace path in bracket");
    expect(teamPageUx6).toContain("/bracket?team=");
  });
});

// Home forecast race — multi-team public checkpoint comparison; same policy as UX-6.
const raceLib = read("lib/ui/home-trajectory-comparison.ts");
const raceChart = read("components/home/home-forecast-race-chart.tsx");

describe("Home forecast race copy is honest (checkpoints, not every match)", () => {
  it("uses the allowed race labels + metric/top-N copy", () => {
    expect(raceChart).toContain("Forecast race");
    expect(raceChart).toContain("Compare top teams");
    // Top-N options render `Top ${n}` from RACE_TOP_N_OPTIONS = [5, 10, 15].
    expect(raceChart).toContain("Top ${n}");
    expect(raceLib).toContain("RACE_TOP_N_OPTIONS = [5, 10, 15]");
    // Public checkpoint labels live in the shared policy module.
    expect(trajectoryChkpt).toContain("Tournament start");
    expect(trajectoryChkpt).toContain("Group stage complete");
    expect(trajectoryChkpt).toContain("Current projection");
    // The race card names the milestone checkpoints.
    expect(raceChart).toContain("group matchday 1");
    expect(raceChart).toContain("group matchday 2");
    // Stage labels come from the shared movement options (Title chance / Reach final / …).
    expect(raceLib).toContain("RACE_STAGE_OPTIONS");
    expect(raceChart).toContain("percentage points");
    expect(raceChart).toContain("This chart compares retained checkpoints, not every match.");
    // The single allowed after-every-match mention is the explicit clarification.
    // (`read` collapses whitespace, so JSX line-wraps become single spaces.)
    expect(raceChart).toContain("It is not an after-every-match timeline.");
  });

  it("never surfaces the non-public 54/73 checkpoints or match-by-match wording", () => {
    const src = `${raceLib} ${raceChart}`;
    for (const bad of ["After Match 54", "After Match 73", "M54", "M73", "match-by-match", "after-match-054", "after-match-073"]) {
      expect(src.includes(bad), `Home race leaks non-public wording: "${bad}"`).toBe(false);
    }
    // "after-every-match" appears ONLY once, in the explicit clarification.
    expect(raceChart.split("after-every-match").length - 1).toBe(1);
    expect(raceLib.includes("after-every-match")).toBe(false);
  });

  it("no causal / betting / ambiguous-metric claims or leaks", () => {
    const src = `${raceLib} ${raceChart}`.toLowerCase();
    for (const bad of ["because", "caused by", "probability rose", "guaranteed", "will face", "easier path", "harder path", "path became", "win %", "final %", "vercel-storage", "blob_read_write_token", "providerid"]) {
      expect(src, `Home race copy overclaims/leaks: "${bad}"`).not.toContain(bad);
    }
  });

  it("home page wires the race chart below the hero", () => {
    const page = read("app/page.tsx");
    expect(page).toContain("HomeForecastRaceChart");
    expect(page).toContain("buildHomeForecastRaceModel");
    // Placed after the hero (and the radial), before the match/contender lists.
    const hero = page.indexOf("<ForecastHero");
    const race = page.indexOf("<HomeForecastRaceChart");
    const matches = page.indexOf("<HomeMatches");
    expect(hero).toBeLessThan(race);
    expect(race).toBeLessThan(matches);
  });
});

// Home match cards — "why the model leans" driver chips (pre-tournament signals only).
const homeMatches = read("components/home/home-matches.tsx");
const matchDriversLib = read("lib/ui/match-drivers.ts");

describe("Home match-card driver chips are honest (pre-tournament signals only)", () => {
  it("surfaces the driver section heading + fallback and the allowed neutral labels", () => {
    // Heading + empty-state copy come from the shared helper, not hardcoded.
    expect(matchDriversLib).toContain('MATCH_DRIVER_HEADING = "Why the model leans"');
    expect(matchDriversLib).toContain('MATCH_DRIVER_EMPTY_LABEL = "No single driver dominates"');
    expect(homeMatches).toContain("MATCH_DRIVER_HEADING");
    expect(homeMatches).toContain("MATCH_DRIVER_EMPTY_LABEL");
    // Neutral driver labels present; chips read "<label> favours <team>".
    for (const label of ["Elo", "FIFA ranking", "Squad signal", "Host edge", "Climate", "Tournament logistics"]) {
      expect(matchDriversLib, `driver label missing: "${label}"`).toContain(`"${label}"`);
    }
    expect(homeMatches).toContain("favours");
  });

  it("never labels a driver as live / current / in-tournament form, and omits frozen recentForm", () => {
    // recentForm + managerCohesion are omitted from the home chips.
    expect(matchDriversLib).toContain('"recentForm"');
    expect(matchDriversLib).toContain('"managerCohesion"');
    expect(matchDriversLib).toContain("OMITTED_DRIVER_FAMILIES");
    // recentForm must NOT be an allowed label (so it can never render).
    const labelsBlock = matchDriversLib.slice(
      matchDriversLib.indexOf("MATCH_DRIVER_LABELS"),
      matchDriversLib.indexOf("OMITTED_DRIVER_FAMILIES"),
    );
    expect(labelsBlock.includes("recentForm")).toBe(false);
  });

  it("no misleading live-form / betting / certainty wording in the card or helper", () => {
    const src = `${homeMatches} ${matchDriversLib}`.toLowerCase();
    for (const bad of [
      "live form",
      "current form",
      "current-form adjusted",
      "in-tournament form favours",
      "recent tournament performance",
      "re-rated based on form",
      "guaranteed",
      "will beat",
      "betting odds",
      "easy path",
      "hard path",
    ]) {
      expect(src, `home match-card copy overclaims: "${bad}"`).not.toContain(bad);
    }
  });
});

describe("Home knockout radial copy is honest (Road to the trophy)", () => {
  const radialChart = read("components/home/home-knockout-radial.tsx");
  const radialLib = read("lib/ui/bracket-radial.ts");

  it("uses the allowed section, legend and caption copy", () => {
    expect(radialChart).toContain("Road to the trophy");
    expect(radialChart).toContain("Winners move inward. Faded teams are out. Open the full bracket for details.");
    expect(radialChart).toContain("Open the full bracket");
    // Legend carries state without relying on colour alone.
    expect(radialChart).toContain("Solid — still in the running");
    expect(radialChart).toContain("Faded, dashed — eliminated");
    expect(radialChart).toContain("Hollow — awaiting teams");
    // Third-place is not on the rings — it points to the full bracket instead.
    expect(radialChart).toContain("Third-place match is shown in the full bracket.");
    // Deep links reuse the shared /bracket URL-state helper.
    expect(radialChart).toContain("serializeBracketSearchParams");
    expect(radialChart).toContain('href="/bracket"');
    expect(radialChart).toContain('href="/bracket?match=104"');
  });

  it("carries no scores, forecast bars, betting/path-difficulty, or leaks", () => {
    const src = `${radialLib} ${radialChart}`.toLowerCase();
    for (const bad of [
      "will face",
      "guaranteed",
      "easier path",
      "harder path",
      "path became",
      "because",
      "caused by",
      "win %",
      "final %",
      "likely scoreline",
      "vercel-storage",
      "blob_read_write_token",
      "providerid",
    ]) {
      expect(src, `Home radial copy overclaims/leaks: "${bad}"`).not.toContain(bad);
    }
  });

  it("home page wires the radial between the hero and the race chart", () => {
    const page = read("app/page.tsx");
    expect(page).toContain("HomeKnockoutRadial");
    expect(page).toContain("officialKnockoutGraph");
    const hero = page.indexOf("<ForecastHero");
    const radial = page.indexOf("<HomeKnockoutRadial");
    const race = page.indexOf("<HomeForecastRaceChart");
    const matches = page.indexOf("<HomeMatches");
    expect(hero).toBeLessThan(radial);
    expect(radial).toBeLessThan(race);
    expect(race).toBeLessThan(matches);
  });
});

// ---------------------------------------------------------------------------
// BeyondVAR brand identity — header, hero, metadata, disclaimer, IP safety.
// ---------------------------------------------------------------------------
const brandMark = read("components/brand-mark.tsx");
const rootLayout = read("app/layout.tsx");

const DISCLAIMER =
  "Independent forecasting project. Not affiliated with, endorsed by, or sponsored by FIFA.";

describe("BeyondVAR brand identity (header, hero, metadata)", () => {
  it("header carries the BeyondVAR wordmark + local BrandMark, not the old name", () => {
    expect(siteHeader).toContain("BeyondVAR");
    expect(siteHeader).toContain("BrandMark");
    expect(siteHeader.includes("World Cup Probability Lab")).toBe(false);
    expect(siteHeader.includes("WC Lab")).toBe(false);
    // The old trophy icon is no longer the brand mark.
    expect(siteHeader.includes("Trophy")).toBe(false);
  });

  it("homepage hero keeps the question tagline and the brand promise (brand lives in the header)", () => {
    // Product decision: the hero headline stays the editorial question; the
    // BeyondVAR wordmark is carried by the header and the footer brand line.
    expect(forecastHero).toContain("Who is favoured now?");
    expect(forecastHero).toContain(
      "Follow how every result reshapes title chances, knockout paths, and the road to the trophy.",
    );
    expect(forecastHero.includes("World Cup Probability Lab")).toBe(false);
    // The honest not-re-rated caveat survives the rebrand.
    expect(forecastHero).toContain("not re-rated after every match");
  });

  it("metadata + footer use the new brand, the exact positioning line, and the disclaimer", () => {
    expect(rootLayout).toContain("BeyondVAR — World Cup intelligence beyond the score");
    expect(rootLayout).toContain(
      "Independent World Cup forecasting and tournament intelligence, tracking how every result reshapes probabilities, paths, and knockout state.",
    );
    expect(rootLayout).toContain("openGraph");
    // The positioning line appears exactly, in the footer brand line.
    expect(rootLayout).toContain("The World Cup intelligence layer beyond the score.");
    expect(rootLayout).toContain(DISCLAIMER);
    expect(rootLayout.includes("World Cup Probability Lab")).toBe(false);
    // Methodology carries the disclaimer + new name too.
    expect(methodology).toContain("BeyondVAR");
    expect(methodology).toContain(DISCLAIMER);
    expect(methodology.includes("World Cup Probability Lab")).toBe(false);
  });

  it("every page title uses BeyondVAR (no page still titled with the old name)", () => {
    for (const p of [
      "app/methodology/page.tsx",
      "app/teams/page.tsx",
      "app/movement/page.tsx",
      "app/bracket/page.tsx",
      "app/matches/page.tsx",
      "app/scenario/page.tsx",
      "app/live/page.tsx",
    ]) {
      const src = read(p);
      expect(src, `${p} title should carry BeyondVAR`).toContain("· BeyondVAR");
      expect(src.includes("Probability Lab"), `${p} still references the old name`).toBe(false);
    }
  });

  it("the app mark is original, local SVG — no external/scraped assets, no FIFA marks", () => {
    expect(brandMark).toContain("<svg");
    expect(brandMark).toContain("currentColor");
    for (const bad of ["http://", "https://", "next/image", ".png", ".jpg", ".jpeg", ".webp", ".gif", "lucide-react", "FIFA", "fifa"]) {
      expect(brandMark.includes(bad), `brand mark must not reference: "${bad}"`).toBe(false);
    }
    // The header imports the local mark, not an image asset.
    expect(siteHeader).toContain('from "@/components/brand-mark"');
  });

  it("the favicon / app icon is an original local asset built from the mark (no external refs)", () => {
    // Next App Router auto-serves app/icon.svg (favicon) and app/apple-icon.png (touch icon).
    const icon = read("app/icon.svg");
    expect(icon).toContain("<svg");
    // Strip the standard SVG namespace declaration (a W3C URI, not an asset reference).
    const iconRefs = icon.replace(/xmlns(:\w+)?="[^"]*"/g, "");
    // Pure geometry (rects + the ball circle); no external/scraped references, no FIFA marks.
    for (const bad of ["http://", "https://", "xlink:href", "<image", "FIFA", "fifa"]) {
      expect(iconRefs.includes(bad), `favicon must not reference: "${bad}"`).toBe(false);
    }
    expect(icon).toContain("<circle");
    // The rasterised Apple touch icon exists alongside it.
    expect(existsSync(join(process.cwd(), "app/apple-icon.png"))).toBe(true);
  });

  it("no affiliation/endorsement claims anywhere in the brand surfaces", () => {
    // Brand surfaces only: methodology's factual "official FIFA match schedule (v17…)"
    // provenance statement describes the DATA, not the app, and is checked elsewhere.
    // Strip the explicit NEGATED disclaimer before scanning, so "…or sponsored by FIFA"
    // inside "Not affiliated with, endorsed by, or sponsored by FIFA" never false-positives.
    const src = [siteHeader, forecastHero, rootLayout, brandMark]
      .join(" ")
      .split(DISCLAIMER)
      .join(" ")
      .toLowerCase();
    for (const bad of [
      "official fifa",
      "official world cup",
      "endorsed by fifa",
      "sponsored by fifa",
      "partner of fifa",
      "affiliated with fifa",
    ]) {
      expect(src, `brand surfaces imply affiliation: "${bad}"`).not.toContain(bad);
    }
  });
});
