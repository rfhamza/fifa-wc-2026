/**
 * UX-2A — Match Forecast Centre pure-logic tests. Synthetic fixtures only; no Blob,
 * token, network, football-data, or DOM. Covers merge/order/filter, provenance
 * labelling (retrospective never pre-match; baseline distinct), and the aged-well
 * verdict (only for genuine captured pre-match forecasts).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LiveViewMatch } from "@/lib/live-client/public-safe-view.client";
import {
  agedWellVerdict,
  buildCentreRuntimeIndex,
  buildMatchCentreModel,
  filterMatches,
  matchProvenanceLabel,
  orderMatches,
  resolveCentreForecast,
  type CentreForecast,
  type CentreRuntimeEntry,
  type CentreSimEntry,
} from "@/lib/ui/match-centre";

function live(
  matchNumber: number,
  status: LiveViewMatch["status"],
  over: Partial<LiveViewMatch> = {},
): LiveViewMatch {
  return {
    matchNumber,
    matchId: `M${matchNumber}`,
    stage: "roundOf16",
    teamA: "spain",
    teamB: "brazil",
    status,
    ...over,
  } as LiveViewMatch;
}

const simEntry: CentreSimEntry = {
  homeTeamId: "spain",
  awayTeamId: "brazil",
  homeWin: 0.5,
  draw: 0.3,
  awayWin: 0.2,
  topScoreline: { homeGoals: 1, awayGoals: 0, probability: 0.16 },
  favoursHome: "Elo rating",
  favoursAway: "Recent form",
};
function runtimeEntry(provenance: CentreRuntimeEntry["provenance"], over: Partial<CentreRuntimeEntry> = {}): CentreRuntimeEntry {
  return {
    provenance,
    homeTeamId: "spain",
    awayTeamId: "brazil",
    homeWin: 0.6,
    draw: 0.25,
    awayWin: 0.15,
    topScoreline: { homeGoals: 2, awayGoals: 1, probability: 0.14 },
    ...over,
  };
}

describe("buildCentreRuntimeIndex", () => {
  it("keeps retrospective entries (labelled later, never dropped) and maps fields", () => {
    const idx = buildCentreRuntimeIndex({
      matchForecasts: [
        { matchNumber: 90, forecastProvenance: "current-pre-match-forecast", homeTeamId: "spain", awayTeamId: "brazil", homeWin: 0.6, draw: 0.25, awayWin: 0.15, homeAdvance: 0.62, awayAdvance: 0.38 },
        { matchNumber: 91, forecastProvenance: "retrospective-model-forecast", homeTeamId: "france", awayTeamId: "germany", homeWin: 0.4, draw: 0.3, awayWin: 0.3 },
      ],
    });
    expect(idx[90]?.provenance).toBe("current-pre-match-forecast");
    expect(idx[90]?.homeAdvance).toBe(0.62);
    expect(idx[91]?.provenance).toBe("retrospective-model-forecast");
    expect(buildCentreRuntimeIndex(null)).toEqual({});
  });
});

describe("resolveCentreForecast (runtime wins → baseline → honest empty)", () => {
  it("captured pre-match (current/archived) is aged-well eligible", () => {
    for (const p of ["current-pre-match-forecast", "archived-pre-match-forecast"] as const) {
      const f = resolveCentreForecast({ runtime: runtimeEntry(p), matchesObjectAvailable: true, status: "complete" });
      expect(f.kind).toBe("pre-match-captured");
      expect(f.agedWellEligible).toBe(true);
    }
  });
  it("retrospective is labelled retrospective and NOT aged-well eligible", () => {
    const f = resolveCentreForecast({ runtime: runtimeEntry("retrospective-model-forecast"), matchesObjectAvailable: true, status: "complete" });
    expect(f.kind).toBe("retrospective");
    expect(f.agedWellEligible).toBe(false);
  });
  it("simulation-only is a baseline model estimate with key edges, not eligible", () => {
    const f = resolveCentreForecast({ sim: simEntry, matchesObjectAvailable: true, status: "scheduled" });
    expect(f.kind).toBe("baseline-model-estimate");
    expect(f.keyEdges).toEqual({ favoursHome: "Elo rating", favoursAway: "Recent form" });
    expect(f.agedWellEligible).toBe(false);
  });
  it("no forecast: unavailable / no-pre-match-captured / coming-soon by state", () => {
    expect(resolveCentreForecast({ matchesObjectAvailable: false, status: "scheduled" }).kind).toBe("unavailable");
    expect(resolveCentreForecast({ matchesObjectAvailable: true, status: "complete" }).kind).toBe("no-pre-match-captured");
    expect(resolveCentreForecast({ matchesObjectAvailable: true, status: "scheduled" }).kind).toBe("coming-soon");
  });
});

describe("matchProvenanceLabel", () => {
  it("uses clear, non-ambiguous labels; retrospective is never 'pre-match'", () => {
    expect(matchProvenanceLabel("pre-match-captured")).toBe("Pre-match forecast captured before kickoff");
    expect(matchProvenanceLabel("retrospective")).toBe("Retrospective model estimate");
    expect(matchProvenanceLabel("baseline-model-estimate")).toBe("Baseline model estimate");
    expect(matchProvenanceLabel("no-pre-match-captured")).toBe("No pre-match forecast captured");
    expect(matchProvenanceLabel("coming-soon")).toBe("Pre-match forecast coming soon");
    expect(matchProvenanceLabel("unavailable")).toBe("Forecast unavailable");
    expect(matchProvenanceLabel("retrospective").toLowerCase()).not.toContain("pre-match");
  });
});

describe("buildMatchCentreModel (merge + precedence)", () => {
  const baseMatches = [
    { matchNumber: 1, stage: "group", group: "A", kickoff: "2026-06-12T16:00:00Z", homeTeamId: "spain", awayTeamId: "brazil", status: "scheduled" as const },
  ];
  it("runtime forecast wins over simulation; merges live actual + status", () => {
    const rows = buildMatchCentreModel({
      liveMatches: [live(1, "complete", { stage: "group", teamA: "spain", teamB: "brazil", goalsA: 2, goalsB: 1, winner: "spain" })],
      baseMatches,
      simIndex: { 1: simEntry },
      runtimeIndex: { 1: runtimeEntry("current-pre-match-forecast") },
      matchesObjectAvailable: true,
    });
    const r = rows.find((x) => x.matchNumber === 1)!;
    expect(r.forecast.kind).toBe("pre-match-captured"); // runtime beats sim
    expect(r.status).toBe("complete");
    expect(r.actual).toEqual({ goalsA: 2, goalsB: 1, winner: "spain", penalties: undefined });
  });
  it("falls back to baseline simulation when no runtime entry", () => {
    const rows = buildMatchCentreModel({ liveMatches: [], baseMatches, simIndex: { 1: simEntry }, runtimeIndex: {}, matchesObjectAvailable: true });
    expect(rows[0]?.forecast.kind).toBe("baseline-model-estimate");
    expect(rows[0]?.status).toBe("scheduled");
  });
  it("adds knockout matches present only in live-state", () => {
    const rows = buildMatchCentreModel({ liveMatches: [live(90, "scheduled", { stage: "roundOf16" })], baseMatches: [], simIndex: {}, runtimeIndex: {}, matchesObjectAvailable: true });
    expect(rows.find((x) => x.matchNumber === 90)?.stage).toBe("roundOf16");
  });
  it("serialized rows contain no token / Blob URL", () => {
    const rows = buildMatchCentreModel({ liveMatches: [live(1, "complete", { goalsA: 1, goalsB: 0 })], baseMatches, simIndex: { 1: simEntry }, runtimeIndex: {}, matchesObjectAvailable: true });
    const s = JSON.stringify(rows);
    for (const bad of ["vercel-storage", "BLOB_READ_WRITE_TOKEN", "https://", "http://"]) expect(s.includes(bad)).toBe(false);
  });
});

describe("orderMatches", () => {
  it("orders Live → Upcoming (asc) → Completed (desc)", () => {
    const rows = buildMatchCentreModel({
      liveMatches: [
        live(10, "complete", { kickoff: "2026-06-20T16:00:00Z" }),
        live(11, "complete", { kickoff: "2026-06-25T16:00:00Z" }),
        live(12, "scheduled", { kickoff: "2026-07-02T16:00:00Z" }),
        live(13, "scheduled", { kickoff: "2026-07-01T16:00:00Z" }),
        live(14, "in-progress", { kickoff: "2026-06-30T16:00:00Z" }),
      ],
      baseMatches: [],
      simIndex: {},
      runtimeIndex: {},
      matchesObjectAvailable: true,
    });
    expect(orderMatches(rows).map((r) => r.matchNumber)).toEqual([14, 13, 12, 11, 10]);
  });
});

describe("filterMatches", () => {
  const rows = buildMatchCentreModel({
    liveMatches: [
      live(1, "scheduled", { stage: "group" }),
      live(2, "in-progress", { stage: "group" }),
      live(3, "complete", { stage: "roundOf16" }),
    ],
    baseMatches: [],
    simIndex: {},
    runtimeIndex: {},
    matchesObjectAvailable: true,
  });
  it("filters by status and stage", () => {
    expect(filterMatches(rows, "upcoming").map((r) => r.matchNumber)).toEqual([1]);
    expect(filterMatches(rows, "live").map((r) => r.matchNumber)).toEqual([2]);
    expect(filterMatches(rows, "completed").map((r) => r.matchNumber)).toEqual([3]);
    expect(filterMatches(rows, "group").map((r) => r.matchNumber).sort()).toEqual([1, 2]);
    expect(filterMatches(rows, "knockout").map((r) => r.matchNumber)).toEqual([3]);
    expect(filterMatches(rows, "all")).toHaveLength(3);
  });
});

describe("agedWellVerdict (only genuine captured pre-match)", () => {
  const preMatch: CentreForecast = { kind: "pre-match-captured", data: runtimeEntry("current-pre-match-forecast"), agedWellEligible: true };
  it("returns 'called' when the predicted outcome matches the actual result", () => {
    expect(agedWellVerdict(preMatch, live(1, "complete", { teamA: "spain", teamB: "brazil", goalsA: 2, goalsB: 1 }))).toBe("called");
  });
  it("returns 'missed' when the predicted outcome was wrong", () => {
    expect(agedWellVerdict(preMatch, live(1, "complete", { teamA: "spain", teamB: "brazil", goalsA: 0, goalsB: 1 }))).toBe("missed");
  });
  it("is null for retrospective, baseline, and non-complete matches", () => {
    const retro: CentreForecast = { kind: "retrospective", data: runtimeEntry("retrospective-model-forecast"), agedWellEligible: false };
    const baseline: CentreForecast = { kind: "baseline-model-estimate", data: simEntry, agedWellEligible: false };
    expect(agedWellVerdict(retro, live(1, "complete", { goalsA: 2, goalsB: 1 }))).toBeNull();
    expect(agedWellVerdict(baseline, live(1, "complete", { goalsA: 2, goalsB: 1 }))).toBeNull();
    expect(agedWellVerdict(preMatch, live(1, "scheduled"))).toBeNull();
  });
});

describe("top scoreline + knockout advancement (data-driven rendering inputs)", () => {
  it("exposes top scoreline and advancement when present, omits when absent", () => {
    const withAdv = runtimeEntry("current-pre-match-forecast", { homeAdvance: 0.6, awayAdvance: 0.4 });
    expect(withAdv.topScoreline).toBeDefined();
    expect(withAdv.homeAdvance).toBe(0.6);
    const noExtras = resolveCentreForecast({ runtime: { provenance: "current-pre-match-forecast", homeTeamId: "a", awayTeamId: "b", homeWin: 0.4, draw: 0.3, awayWin: 0.3 }, matchesObjectAvailable: true, status: "scheduled" });
    expect(noExtras.data?.topScoreline).toBeUndefined();
    expect(noExtras.data?.homeAdvance).toBeUndefined();
  });
});

describe("client/server isolation + page composition", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  it("client components import no server-only forecast modules or the Blob SDK", () => {
    for (const f of [
      "components/matches/match-forecast-centre.tsx",
      "components/matches/match-forecast-card.tsx",
      "components/ui/filter-pills.tsx",
    ]) {
      const imports = read(f).split("\n").filter((l) => l.trimStart().startsWith("import")).join("\n");
      expect(imports).not.toMatch(/forecast-runtime-store|forecast-snapshot-store/);
      expect(imports).not.toMatch(/@vercel\/blob/);
    }
  });
  it("the /matches page renders the centre and drops the old detailed grid", () => {
    const page = read("app/matches/page.tsx");
    expect(page).toContain("MatchForecastCentre");
    expect(page).toContain("getRuntimeMatchForecasts");
    expect(page).not.toContain("FixtureCard");
  });
});
