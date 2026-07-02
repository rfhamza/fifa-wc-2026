/**
 * UX-4A — Tournament Bracket pure-logic tests. Official-graph skeleton + synthetic
 * live-state overlay; no Blob, token, network, provider, or DOM. Covers skeleton
 * completeness (M73–M104), round grouping/order, third-place separation, node states
 * (awaiting/partial/scheduled/live/completed), score + penalty orientation, winner
 * indication, human slot placeholders, and state-aware forecast provenance (retrospective
 * never labelled pre-match; awaiting ≠ "no pre-match captured").
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { officialKnockoutGraph } from "@/data/official/knockout-graph";
import type {
  LiveViewBracketMatch,
  LiveViewMatch,
} from "@/lib/live-client/public-safe-view.client";
import {
  bracketForecastBadge,
  buildBracketView,
  deriveNodeState,
  slotLabel,
  type BracketTeamRef,
} from "@/lib/ui/bracket-view";

const TEAMS: Record<string, BracketTeamRef> = {
  spain: { id: "spain", name: "Spain", flag: "🇪🇸", countryCode: "ESP" },
  brazil: { id: "brazil", name: "Brazil", flag: "🇧🇷", countryCode: "BRA" },
};
const resolveTeam = (id: string): BracketTeamRef | null => TEAMS[id] ?? null;

function lb(
  matchNumber: number,
  homeTeamId: string | null,
  awayTeamId: string | null,
  winner: string | null,
  resolution: LiveViewBracketMatch["resolution"],
): LiveViewBracketMatch {
  return { matchNumber, round: "roundOf32", homeTeamId, awayTeamId, winner, resolution, derivedFrom: "results" };
}
function lm(matchNumber: number, status: LiveViewMatch["status"], over: Partial<LiveViewMatch> = {}): LiveViewMatch {
  return {
    matchNumber,
    matchId: `M${matchNumber}`,
    stage: "roundOf32",
    teamA: "spain",
    teamB: "brazil",
    status,
    ...over,
  };
}

const base = {
  skeleton: officialKnockoutGraph.matches,
  provenanceByMatch: {},
  matchesObjectAvailable: true,
  resolveTeam,
};

describe("skeleton completeness + round grouping", () => {
  const view = buildBracketView({ ...base, liveBracket: [], liveMatches: [] });

  it("covers the full official knockout tree M73–M104", () => {
    const all = [...view.rounds.flatMap((r) => r.nodes.map((n) => n.matchNumber)), view.thirdPlace!.matchNumber];
    expect(Math.min(...all)).toBe(73);
    expect(Math.max(...all)).toBe(104);
    expect(all).toHaveLength(32);
  });

  it("groups rounds in column order and sizes each round", () => {
    expect(view.rounds.map((r) => r.stage)).toEqual([
      "roundOf32",
      "roundOf16",
      "quarterFinal",
      "semiFinal",
      "final",
    ]);
    expect(view.rounds.map((r) => r.nodes.length)).toEqual([16, 8, 4, 2, 1]);
    expect(view.rounds[0]!.label).toBe("Round of 32");
  });

  it("orders matches by match number within a round", () => {
    const r32 = view.rounds[0]!.nodes.map((n) => n.matchNumber);
    expect(r32).toEqual([73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88]);
  });

  it("places the final (M104) in the final round and third place (M103) on its own", () => {
    expect(view.rounds.at(-1)!.nodes.map((n) => n.matchNumber)).toEqual([104]);
    expect(view.thirdPlace!.matchNumber).toBe(103);
    expect(view.thirdPlace!.stage).toBe("thirdPlace");
    expect(view.thirdPlace!.stageLabel).toBe("Third place");
    // M103 must NOT appear anywhere in the title tree.
    expect(view.rounds.flatMap((r) => r.nodes).some((n) => n.matchNumber === 103)).toBe(false);
  });
});

describe("human slot placeholders (never raw codes)", () => {
  it("labels each qualifier slot kind", () => {
    expect(slotLabel({ kind: "groupPosition", group: "A", position: 1 })).toBe("Winner Group A");
    expect(slotLabel({ kind: "groupPosition", group: "B", position: 2 })).toBe("Runner-up Group B");
    expect(slotLabel({ kind: "thirdPlace", slot: "T1" })).toBe("Third-place qualifier");
    expect(slotLabel({ kind: "matchWinner", matchNumber: 97 })).toBe("Winner of Match 97");
    expect(slotLabel({ kind: "matchLoser", matchNumber: 101 })).toBe("Loser of Match 101");
  });

  it("unresolved skeleton renders placeholders, not team names", () => {
    const view = buildBracketView({ ...base, liveBracket: [], liveMatches: [] });
    const m73 = view.rounds[0]!.nodes.find((n) => n.matchNumber === 73)!;
    expect(m73.state).toBe("awaiting");
    expect(m73.home.teamId).toBeNull();
    expect(m73.home.placeholder).toBe("Runner-up Group A");
    expect(m73.away.placeholder).toBe("Runner-up Group B");
    const m89 = view.rounds[1]!.nodes.find((n) => n.matchNumber === 89)!;
    expect(m89.home.placeholder).toBe("Winner of Match 74");
    expect(view.thirdPlace!.home.placeholder).toBe("Loser of Match 101");
  });
});

describe("deriveNodeState + node states from live overlay", () => {
  it("derives state from resolution + status", () => {
    expect(deriveNodeState(false, false, null)).toBe("awaiting");
    expect(deriveNodeState(true, false, null)).toBe("partial");
    expect(deriveNodeState(true, true, "scheduled")).toBe("scheduled");
    expect(deriveNodeState(true, true, "in-progress")).toBe("live");
    expect(deriveNodeState(true, true, "complete")).toBe("completed");
  });

  it("partial when only one participant is known", () => {
    const view = buildBracketView({
      ...base,
      liveBracket: [lb(73, "spain", null, null, "partial")],
      liveMatches: [],
    });
    const m73 = view.rounds[0]!.nodes.find((n) => n.matchNumber === 73)!;
    expect(m73.state).toBe("partial");
    expect(m73.home.teamId).toBe("spain");
    expect(m73.away.placeholder).toBe("Runner-up Group B");
  });

  it("scheduled / live states for a resolved pairing", () => {
    const sched = buildBracketView({
      ...base,
      liveBracket: [lb(73, "spain", "brazil", null, "resolved")],
      liveMatches: [lm(73, "scheduled", { kickoff: "2026-07-04T18:00:00Z" })],
    });
    expect(sched.rounds[0]!.nodes.find((n) => n.matchNumber === 73)!.state).toBe("scheduled");

    const live = buildBracketView({
      ...base,
      liveBracket: [lb(73, "spain", "brazil", null, "resolved")],
      liveMatches: [lm(73, "in-progress")],
    });
    expect(live.rounds[0]!.nodes.find((n) => n.matchNumber === 73)!.state).toBe("live");
  });

  it("completed: score, penalties, and winner indication (oriented by team id)", () => {
    const view = buildBracketView({
      ...base,
      liveBracket: [lb(73, "spain", "brazil", "spain", "resolved")],
      liveMatches: [lm(73, "complete", { goalsA: 2, goalsB: 1, winner: "spain", penalties: { a: 4, b: 2 } })],
    });
    const m73 = view.rounds[0]!.nodes.find((n) => n.matchNumber === 73)!;
    expect(m73.state).toBe("completed");
    expect(m73.score).toEqual({ homeGoals: 2, awayGoals: 1, penalties: { home: 4, away: 2 } });
    expect(m73.home.isWinner).toBe(true);
    expect(m73.away.isWinner).toBe(false);
  });

  it("orients the score when bracket home is the live match's teamB", () => {
    const view = buildBracketView({
      ...base,
      liveBracket: [lb(73, "brazil", "spain", "spain", "resolved")], // home = brazil
      liveMatches: [lm(73, "complete", { teamA: "spain", teamB: "brazil", goalsA: 2, goalsB: 1, winner: "spain" })],
    });
    const m73 = view.rounds[0]!.nodes.find((n) => n.matchNumber === 73)!;
    // home is brazil (teamB) → 1; away is spain (teamA) → 2
    expect(m73.score).toEqual({ homeGoals: 1, awayGoals: 2 });
    expect(m73.away.isWinner).toBe(true);
  });

  it("renders fully from the skeleton alone when live-state is unavailable", () => {
    const view = buildBracketView({ ...base, liveBracket: [], liveMatches: [] });
    expect(view.rounds.flatMap((r) => r.nodes).every((n) => n.state === "awaiting")).toBe(true);
  });
});

describe("state-aware forecast provenance", () => {
  const badge = (over: Parameters<typeof bracketForecastBadge>[0]) => bracketForecastBadge(over);

  it("captured pre-match → captured label; retrospective → retrospective (never pre-match)", () => {
    expect(badge({ state: "completed", provenance: "current-pre-match-forecast", matchesObjectAvailable: true, status: "complete" })!.label).toBe(
      "Pre-match forecast captured before kickoff",
    );
    const retro = badge({ state: "completed", provenance: "retrospective-model-forecast", matchesObjectAvailable: true, status: "complete" })!;
    expect(retro.label).toBe("Retrospective model estimate");
    expect(retro.label.toLowerCase()).not.toContain("pre-match");
  });

  it("completed with no entry → no pre-match captured; future with no entry → coming soon", () => {
    expect(badge({ state: "completed", provenance: undefined, matchesObjectAvailable: true, status: "complete" })!.label).toBe(
      "No pre-match forecast captured",
    );
    expect(badge({ state: "scheduled", provenance: undefined, matchesObjectAvailable: true, status: "scheduled" })!.label).toBe(
      "Pre-match forecast coming soon",
    );
  });

  it("no matches object → unavailable", () => {
    expect(badge({ state: "scheduled", provenance: undefined, matchesObjectAvailable: false, status: "scheduled" })!.label).toBe(
      "Forecast unavailable",
    );
  });

  it("awaiting / partial nodes carry NO forecast badge (not 'no pre-match captured')", () => {
    expect(badge({ state: "awaiting", provenance: undefined, matchesObjectAvailable: true, status: "complete" })).toBeNull();
    expect(badge({ state: "partial", provenance: undefined, matchesObjectAvailable: true, status: null })).toBeNull();
    // and via the built view: an unresolved node has forecast === null
    const view = buildBracketView({ ...base, liveBracket: [], liveMatches: [] });
    expect(view.rounds[0]!.nodes[0]!.forecast).toBeNull();
  });
});

describe("no leak + client/server isolation", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("serialized view contains no token / Blob URL", () => {
    const view = buildBracketView({
      ...base,
      liveBracket: [lb(73, "spain", "brazil", "spain", "resolved")],
      liveMatches: [lm(73, "complete", { goalsA: 2, goalsB: 1, winner: "spain" })],
    });
    const s = JSON.stringify(view);
    for (const bad of ["vercel-storage", "BLOB_READ_WRITE_TOKEN", "https://", "http://"]) {
      expect(s.includes(bad)).toBe(false);
    }
  });

  it("client components import no server-only forecast modules or the Blob SDK", () => {
    for (const f of [
      "components/bracket/bracket-page.tsx",
      "components/bracket/bracket-round.tsx",
      "components/bracket/bracket-match-card.tsx",
      "components/bracket/bracket-status-badge.tsx",
      "components/bracket/bracket-match-detail.tsx",
      "lib/ui/bracket-detail.ts",
      "components/bracket/bracket-team-picker.tsx",
      "components/bracket/bracket-team-path-summary.tsx",
      "lib/ui/bracket-path.ts",
    ]) {
      const imports = read(f)
        .split("\n")
        .filter((l) => l.trimStart().startsWith("import"))
        .join("\n");
      expect(imports).not.toMatch(/forecast-runtime-store|forecast-snapshot-store/);
      expect(imports).not.toMatch(/@vercel\/blob/);
    }
  });

  it("bracket-view reuses the honest shared provenance labels (no hardcoded mislabel)", () => {
    const lib = read("lib/ui/bracket-view.ts");
    expect(lib).toContain("matchProvenanceLabel");
    expect(lib).toContain("Winner of Match");
    expect(lib).toContain("Runner-up Group");
  });
});
