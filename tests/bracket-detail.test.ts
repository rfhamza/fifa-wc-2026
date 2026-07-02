/**
 * UX-4B — selected-match detail model tests (pure) + selection/a11y source scans.
 * Synthetic BracketNode + runtime entry + live match; no Blob, token, network, DOM.
 * Verifies id-orientation (by team id, not positional), honest provenance/empty states,
 * aged-well eligibility (retrospective never aged, never pre-match), and no leakage.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BracketNode, BracketParticipant } from "@/lib/ui/bracket-view";
import type { CentreRuntimeEntry } from "@/lib/ui/match-centre";
import type { LiveViewMatch } from "@/lib/live-client/public-safe-view.client";
import { buildBracketDetailModel } from "@/lib/ui/bracket-detail";

function part(teamId: string | null, name: string, isWinner = false): BracketParticipant {
  return {
    teamId,
    name,
    flag: teamId ? "🏳" : null,
    countryCode: teamId ? "XXX" : null,
    placeholder: teamId ? null : name,
    isWinner,
  };
}
function node(over: Partial<BracketNode> = {}): BracketNode {
  return {
    matchNumber: 89,
    stage: "roundOf16",
    stageLabel: "Round of 16",
    state: "scheduled",
    home: part("spain", "Spain"),
    away: part("brazil", "Brazil"),
    kickoff: null,
    score: null,
    forecast: null,
    ...over,
  };
}
function lm(over: Partial<LiveViewMatch> = {}): LiveViewMatch {
  return { matchNumber: 89, matchId: "M89", stage: "roundOf16", teamA: "spain", teamB: "brazil", status: "scheduled", ...over };
}
function runtime(over: Partial<CentreRuntimeEntry> = {}): CentreRuntimeEntry {
  return {
    homeTeamId: "spain",
    awayTeamId: "brazil",
    homeWin: 0.6,
    draw: 0.2,
    awayWin: 0.2,
    provenance: "current-pre-match-forecast",
    ...over,
  };
}

describe("buildBracketDetailModel — orientation by team id", () => {
  it("keeps A/B when the runtime entry matches the node orientation", () => {
    const m = buildBracketDetailModel({
      node: node(),
      runtime: runtime({ homeWin: 0.6, draw: 0.25, awayWin: 0.15, homeAdvance: 0.7, awayAdvance: 0.3, topScoreline: { homeGoals: 2, awayGoals: 0, probability: 0.18 } }),
      liveMatch: lm(),
      matchesObjectAvailable: true,
    });
    expect(m.lean).toEqual({ aWin: 0.6, draw: 0.25, bWin: 0.15 });
    expect(m.scoreline).toEqual({ aGoals: 2, bGoals: 0, probability: 0.18 });
    expect(m.advance).toEqual({ aAdv: 0.7, bAdv: 0.3 });
  });

  it("INVERTS lean/scoreline/advance when runtime homeTeamId is the node's away team", () => {
    // node home=spain, away=brazil; entry is brazil-home.
    const m = buildBracketDetailModel({
      node: node(),
      runtime: runtime({
        homeTeamId: "brazil",
        awayTeamId: "spain",
        homeWin: 0.15, // brazil
        draw: 0.25,
        awayWin: 0.6, // spain
        homeAdvance: 0.3, // brazil
        awayAdvance: 0.7, // spain
        topScoreline: { homeGoals: 0, awayGoals: 2, probability: 0.18 }, // brazil 0 – spain 2
      }),
      liveMatch: lm(),
      matchesObjectAvailable: true,
    });
    // Oriented to node home=spain (A), away=brazil (B):
    expect(m.lean).toEqual({ aWin: 0.6, draw: 0.25, bWin: 0.15 });
    expect(m.scoreline).toEqual({ aGoals: 2, bGoals: 0, probability: 0.18 });
    expect(m.advance).toEqual({ aAdv: 0.7, bAdv: 0.3 });
  });
});

describe("buildBracketDetailModel — resolution + honest states", () => {
  it("unresolved node → no forecast, resolved=false", () => {
    const m = buildBracketDetailModel({
      node: node({ home: part(null, "Winner of Match 74"), state: "awaiting" }),
      runtime: undefined,
      liveMatch: undefined,
      matchesObjectAvailable: true,
    });
    expect(m.resolved).toBe(false);
    expect(m.lean).toBeNull();
    expect(m.scoreline).toBeNull();
    expect(m.advance).toBeNull();
    expect(m.agedWell).toBeNull();
  });

  it("resolved future match, no entry → 'Pre-match forecast coming soon'", () => {
    const m = buildBracketDetailModel({ node: node(), runtime: undefined, liveMatch: lm({ status: "scheduled" }), matchesObjectAvailable: true });
    expect(m.provenanceLabel).toBe("Pre-match forecast coming soon");
    expect(m.lean).toBeNull();
  });

  it("completed match, no entry → 'No pre-match forecast captured'", () => {
    const m = buildBracketDetailModel({ node: node({ state: "completed" }), runtime: undefined, liveMatch: lm({ status: "complete", goalsA: 1, goalsB: 0 }), matchesObjectAvailable: true });
    expect(m.provenanceLabel).toBe("No pre-match forecast captured");
  });

  it("no forecast object → 'Forecast unavailable' (shared helper, never hardcoded)", () => {
    const m = buildBracketDetailModel({ node: node(), runtime: undefined, liveMatch: lm(), matchesObjectAvailable: false });
    expect(m.provenanceLabel).toBe("Forecast unavailable");
  });
});

describe("buildBracketDetailModel — provenance + aged-well honesty", () => {
  const completedLive = lm({ status: "complete", goalsA: 2, goalsB: 0, winner: "spain" });

  it("retrospective → labelled 'Retrospective model estimate', NEVER pre-match, NEVER aged-well", () => {
    const m = buildBracketDetailModel({
      node: node({ state: "completed", score: { homeGoals: 2, awayGoals: 0 } }),
      runtime: runtime({ provenance: "retrospective-model-forecast", topScoreline: { homeGoals: 2, awayGoals: 0, probability: 0.2 } }),
      liveMatch: completedLive,
      matchesObjectAvailable: true,
    });
    expect(m.provenanceLabel).toBe("Retrospective model estimate");
    expect(m.provenanceLabel.toLowerCase()).not.toContain("pre-match");
    expect(m.lean).not.toBeNull(); // retrospective still shows a lean
    expect(m.agedWell).toBeNull(); // but never an aged-well verdict
  });

  it("true captured pre-match on a completed match → aged-well verdict allowed ('called')", () => {
    const m = buildBracketDetailModel({
      node: node({ state: "completed", score: { homeGoals: 2, awayGoals: 0 } }),
      runtime: runtime({ provenance: "current-pre-match-forecast", homeWin: 0.6, draw: 0.2, awayWin: 0.2, topScoreline: { homeGoals: 2, awayGoals: 0, probability: 0.2 } }),
      liveMatch: completedLive,
      matchesObjectAvailable: true,
    });
    expect(m.provenanceLabel).toBe("Pre-match forecast captured before kickoff");
    expect(m.agedWell).toBe("called");
  });

  it("advance shown only when BOTH advance numbers exist", () => {
    const m = buildBracketDetailModel({
      node: node(),
      runtime: runtime({ homeAdvance: 0.7 }), // awayAdvance missing
      liveMatch: lm(),
      matchesObjectAvailable: true,
    });
    expect(m.advance).toBeNull();
  });

  it("actual result reuses the already-oriented node score (incl. penalties)", () => {
    const score = { homeGoals: 1, awayGoals: 1, penalties: { home: 4, away: 2 } };
    const m = buildBracketDetailModel({ node: node({ state: "completed", score }), runtime: runtime(), liveMatch: lm({ status: "complete", goalsA: 1, goalsB: 1 }), matchesObjectAvailable: true });
    expect(m.score).toEqual(score);
  });

  it("serialized model contains no token / Blob URL", () => {
    const m = buildBracketDetailModel({ node: node(), runtime: runtime({ homeAdvance: 0.6, awayAdvance: 0.4 }), liveMatch: lm(), matchesObjectAvailable: true });
    const s = JSON.stringify(m);
    for (const bad of ["vercel-storage", "BLOB_READ_WRITE_TOKEN", "https://", "http://"]) expect(s.includes(bad)).toBe(false);
  });
});

describe("selection + a11y source scans", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("card header is a real button with aria-expanded/aria-controls, links NOT nested in it", () => {
    const card = read("components/bracket/bracket-match-card.tsx");
    expect(card).toContain("<button");
    expect(card).toContain("aria-expanded={selected}");
    expect(card).toContain('aria-controls="bracket-detail-panel"');
    // the team /teams/ link lives in ParticipantLine, outside the header button
    const buttonBlock = card.slice(card.indexOf("<button"), card.indexOf("</button>"));
    expect(buttonBlock.includes("/teams/")).toBe(false);
  });

  it("bracket node stays lightweight — no probability bar / lean / scoreline inside the card", () => {
    const card = read("components/bracket/bracket-match-card.tsx");
    expect(card.includes("ProbabilityBar")).toBe(false);
    expect(card.includes("BracketMatchDetail")).toBe(false);
    expect(card.includes("@/lib/ui/bracket-detail")).toBe(false);
    expect(card.toLowerCase().includes("chance to advance")).toBe(false);
  });

  it("detail panel has the controlled id, a heading, and a Close control", () => {
    const panel = read("components/bracket/bracket-match-detail.tsx");
    expect(panel).toContain('id="bracket-detail-panel"');
    expect(panel).toContain('id="bracket-detail-heading"');
    expect(panel).toContain('aria-label="Close match detail"');
    expect(panel).toContain("ProbabilityBar"); // rich forecast lives here, not in the node
  });

  it("client bracket files import no server-only forecast modules or the Blob SDK", () => {
    for (const f of [
      "components/bracket/bracket-match-detail.tsx",
      "lib/ui/bracket-detail.ts",
    ]) {
      const imports = read(f)
        .split("\n")
        .filter((l) => l.trimStart().startsWith("import"))
        .join("\n");
      expect(imports).not.toMatch(/forecast-runtime-store|forecast-snapshot-store/);
      expect(imports).not.toMatch(/@vercel\/blob/);
    }
  });
});
