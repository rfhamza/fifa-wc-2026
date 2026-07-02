/**
 * UX-4C — selected-team path tests (pure) + picker/a11y/copy source scans. Real official
 * graph + a live-overlaid bracket view; no Blob, token, network, DOM. Verifies deterministic
 * forward tracing (winner→M104, SF loser→M103 only), status classification from `isWinner`,
 * honest third-place, human placeholders, and no leakage.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { officialKnockoutGraph } from "@/data/official/knockout-graph";
import { buildBracketView, type BracketTeamRef } from "@/lib/ui/bracket-view";
import type {
  LiveViewBracketMatch,
  LiveViewMatch,
} from "@/lib/live-client/public-safe-view.client";
import {
  buildForwardEdges,
  buildTeamBracketPath,
  teamPathMatchNumbers,
} from "@/lib/ui/bracket-path";

const TEAMS: Record<string, BracketTeamRef> = {
  spain: { id: "spain", name: "Spain", flag: "🇪🇸", countryCode: "ESP" },
  brazil: { id: "brazil", name: "Brazil", flag: "🇧🇷", countryCode: "BRA" },
  germany: { id: "germany", name: "Germany", flag: "🇩🇪", countryCode: "DEU" },
  france: { id: "france", name: "France", flag: "🇫🇷", countryCode: "FRA" },
  canada: { id: "canada", name: "Canada", flag: "🇨🇦", countryCode: "CAN" },
  southafrica: { id: "southafrica", name: "South Africa", flag: "🇿🇦", countryCode: "ZAF" },
};
const resolveTeam = (id: string): BracketTeamRef | null => TEAMS[id] ?? null;

function lb(
  matchNumber: number,
  homeTeamId: string | null,
  awayTeamId: string | null,
  winner: string | null,
  resolution: LiveViewBracketMatch["resolution"] = "resolved",
): LiveViewBracketMatch {
  return { matchNumber, round: "roundOf32", homeTeamId, awayTeamId, winner, resolution, derivedFrom: "results" };
}
function lm(matchNumber: number, status: LiveViewMatch["status"], over: Partial<LiveViewMatch> = {}): LiveViewMatch {
  return { matchNumber, matchId: `M${matchNumber}`, stage: "roundOf32", teamA: "spain", teamB: "brazil", status, ...over };
}
const view = (liveBracket: LiveViewBracketMatch[], liveMatches: LiveViewMatch[]) =>
  buildBracketView({
    skeleton: officialKnockoutGraph.matches,
    liveBracket,
    liveMatches,
    provenanceByMatch: {},
    matchesObjectAvailable: true,
    resolveTeam,
  });
const pathFor = (teamId: string, v: ReturnType<typeof view>) =>
  buildTeamBracketPath({ teamId, view: v, graph: officialKnockoutGraph });

describe("buildForwardEdges (from the official graph)", () => {
  const edges = buildForwardEdges(officialKnockoutGraph);
  it("winner edges flow toward the Final; M104 has no outgoing edge", () => {
    expect(edges.get(73)?.winnerTo).toBe(90);
    expect(edges.get(74)?.winnerTo).toBe(89);
    expect(edges.get(97)?.winnerTo).toBe(101);
    expect(edges.get(101)?.winnerTo).toBe(104);
    expect(edges.get(102)?.winnerTo).toBe(104);
    expect(edges.get(104)?.winnerTo).toBeUndefined();
  });
  it("loser edges exist ONLY for semi-final losers into M103", () => {
    expect(edges.get(101)?.loserTo).toBe(103);
    expect(edges.get(102)?.loserTo).toBe(103);
    expect(edges.get(73)?.loserTo).toBeUndefined();
    expect(edges.get(97)?.loserTo).toBeUndefined();
  });
});

describe("active team traces the winner path to M104", () => {
  const v = view(
    [lb(73, "southafrica", "canada", "canada")],
    [lm(73, "complete", { teamA: "southafrica", teamB: "canada", goalsA: 0, goalsB: 1, winner: "canada" })],
  );
  const canada = pathFor("canada", v);

  it("status active with future winner chain and next opponent placeholder", () => {
    expect(canada.status).toBe("active");
    expect(canada.currentMatchNumber).toBe(73);
    expect(canada.futureMatchNumbers).toEqual([90, 97, 101, 104]);
    expect(canada.nextMatch).toEqual({ matchNumber: 90, opponentLabel: "Winner of Match 75" });
    expect(canada.endpoint).toEqual({ matchNumber: 104, kind: "final" });
    expect(canada.includesThirdPlace).toBe(false);
  });
  it("teamPathMatchNumbers = played ∪ future", () => {
    expect([...teamPathMatchNumbers(canada)].sort((a, b) => a - b)).toEqual([73, 90, 97, 101, 104]);
  });
  it("no token / Blob URL in the serialized path", () => {
    const s = JSON.stringify(canada);
    for (const bad of ["vercel-storage", "BLOB_READ_WRITE_TOKEN", "https://", "http://"]) expect(s.includes(bad)).toBe(false);
  });
});

describe("active team that WON a completed non-final match (next node not yet populated)", () => {
  // Germany won R16 M89; M97 has not resolved its participants yet.
  const v = view(
    [lb(89, "germany", "france", "germany")],
    [lm(89, "complete", { stage: "roundOf16", teamA: "germany", teamB: "france", goalsA: 1, goalsB: 0, winner: "germany" })],
  );
  const germany = pathFor("germany", v);
  it("is active with the current at the won match and a future chain to M104", () => {
    expect(germany.status).toBe("active");
    expect(germany.currentMatchNumber).toBe(89);
    expect(germany.futureMatchNumbers).toEqual([97, 101, 104]);
    expect(germany.nextMatch?.matchNumber).toBe(97);
    expect(germany.pathMatchNumbers).toEqual([89, 97, 101, 104]);
  });
});

describe("eliminated team stops at its completed losing match", () => {
  const v = view(
    [lb(73, "southafrica", "canada", "canada")],
    [lm(73, "complete", { teamA: "southafrica", teamB: "canada", goalsA: 0, goalsB: 1, winner: "canada" })],
  );
  const sa = pathFor("southafrica", v);
  it("status eliminated, endpoint at the losing match, no future", () => {
    expect(sa.status).toBe("eliminated");
    expect(sa.endpoint).toEqual({ matchNumber: 73, kind: "eliminated" });
    expect(sa.futureMatchNumbers).toEqual([]);
    expect(sa.pathMatchNumbers).toEqual([73]);
  });
});

describe("champion path ends at M104", () => {
  const v = view(
    [lb(104, "spain", "brazil", "spain")],
    [lm(104, "complete", { teamA: "spain", teamB: "brazil", goalsA: 2, goalsB: 1, winner: "spain" })],
  );
  it("winner of M104 is champion; loser is eliminated at the Final", () => {
    const spain = pathFor("spain", v);
    expect(spain.status).toBe("champion");
    expect(spain.endpoint).toEqual({ matchNumber: 104, kind: "final" });
    const brazil = pathFor("brazil", v);
    expect(brazil.status).toBe("eliminated");
    expect(brazil.endpoint).toEqual({ matchNumber: 104, kind: "final" });
  });
});

describe("semi-final loser is routed to M103 honestly", () => {
  it("routes to the third-place match only after the SF is complete", () => {
    const v = view(
      [lb(101, "spain", "germany", "spain")],
      [lm(101, "complete", { stage: "semiFinal", teamA: "spain", teamB: "germany", goalsA: 2, goalsB: 1, winner: "spain" })],
    );
    const germany = pathFor("germany", v);
    expect(germany.status).toBe("third-place");
    expect(germany.includesThirdPlace).toBe(true);
    expect(germany.nextMatch).toEqual({ matchNumber: 103, opponentLabel: "Loser of Match 102" });
    expect(germany.futureMatchNumbers).toEqual([103]);
    expect(germany.summary.toLowerCase()).toContain("third-place match");
  });
  it("a team actually in M103 has third-place status ending at M103", () => {
    const v = view(
      [lb(101, "spain", "germany", "spain"), lb(103, "germany", "france", "germany")],
      [
        lm(101, "complete", { stage: "semiFinal", teamA: "spain", teamB: "germany", winner: "spain" }),
        lm(103, "complete", { stage: "thirdPlace", teamA: "germany", teamB: "france", winner: "germany" }),
      ],
    );
    const germany = pathFor("germany", v);
    expect(germany.status).toBe("third-place");
    expect(germany.endpoint).toEqual({ matchNumber: 103, kind: "third-place" });
    expect(germany.currentMatchNumber).toBe(103);
  });

  it("SF loser routed into a NOT-yet-played M103 is third-place, never 'active'", () => {
    // Real live flow: derive.ts resolves the SF loser into M103 the moment the SF completes,
    // so the team's max node is a scheduled/partial M103 — must NOT fall through to active.
    const v = view(
      [lb(101, "spain", "germany", "spain"), lb(103, "germany", null, null, "partial")],
      [lm(101, "complete", { stage: "semiFinal", teamA: "spain", teamB: "germany", winner: "spain" })],
    );
    const germany = pathFor("germany", v);
    expect(germany.status).toBe("third-place");
    expect(germany.includesThirdPlace).toBe(true);
    expect(germany.currentMatchNumber).toBe(103);
    expect(germany.futureMatchNumbers).toEqual([]);
    expect(germany.summary.toLowerCase()).toContain("plays the third-place match");
  });
});

describe("team not in the knockout stage", () => {
  it("returns notInKnockout with empty path", () => {
    const p = pathFor("narnia", view([], []));
    expect(p.status).toBe("notInKnockout");
    expect(p.currentMatchNumber).toBeNull();
    expect(p.pathMatchNumbers).toEqual([]);
    expect(p.summary.toLowerCase()).toContain("not in the knockout stage");
  });

  it("uses the fallback team name (not the raw id) when the team is absent", () => {
    const p = buildTeamBracketPath({
      teamId: "narnia",
      view: view([], []),
      graph: officialKnockoutGraph,
      team: { id: "narnia", name: "Narnia", flag: "🏴", countryCode: "NAR" },
    });
    expect(p.name).toBe("Narnia");
    expect(p.summary).toContain("Narnia");
  });
});

describe("picker / summary / highlight source scans", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("picker is a labelled search control with a Clear team path action", () => {
    const picker = read("components/bracket/bracket-team-picker.tsx");
    expect(picker).toContain('type="search"');
    expect(picker).toContain("Trace a team");
    expect(picker).toContain("Clear team path");
  });

  it("summary card has a heading and a Clear team path control", () => {
    const summary = read("components/bracket/bracket-team-path-summary.tsx");
    expect(summary).toContain('id="bracket-team-path"');
    expect(summary).toContain('id="bracket-team-path-heading"');
    expect(summary).toContain("Clear team path");
  });

  it("path highlight has an accessible text cue, not colour-only", () => {
    const card = read("components/bracket/bracket-match-card.tsx");
    expect(card).toContain("On path");
    expect(card).toContain("Current match");
  });

  it("path client files import no server-only forecast modules or the Blob SDK", () => {
    for (const f of [
      "lib/ui/bracket-path.ts",
      "components/bracket/bracket-team-picker.tsx",
      "components/bracket/bracket-team-path-summary.tsx",
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
