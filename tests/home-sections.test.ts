/**
 * UX-1 revision — story-led home section builders. PURE: synthetic fixtures + real
 * team lookup; no Blob, no token, no network, no DOM. Also guards the home composition
 * (no full 48-team table) and server-only isolation of the home components.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTeam } from "@/lib/data";
import type { Team } from "@/lib/types";
import type { ForecastSnapshot } from "@/lib/model/forecast-snapshots";
import type { ForecastComparison } from "@/lib/model/forecast-deltas";
import type { PublicSafeMatchForecasts } from "@/lib/model/forecast-public-safe";
import type { LiveViewMatch } from "@/lib/live-client/public-safe-view.client";
import {
  buildContenders,
  buildMatchForecastIndex,
  buildTeamContextIndex,
  formatKickoff,
  selectHomeMatches,
} from "@/lib/ui/home-sections";

function safeTeam(id: string): Team | null {
  try {
    return getTeam(id);
  } catch {
    return null;
  }
}

function match(matchNumber: number, status: LiveViewMatch["status"], kickoff?: string, teamA = "spain", teamB = "brazil"): LiveViewMatch {
  return { matchNumber, matchId: `M${matchNumber}`, stage: "roundOf16", teamA, teamB, status, kickoff } as LiveViewMatch;
}

const NOW = Date.UTC(2026, 6, 4, 12, 0, 0); // 4 Jul 2026, 12:00 UTC

describe("selectHomeMatches", () => {
  it("titles 'Today's matches' and returns today's fixtures when present", () => {
    const matches = [
      match(90, "scheduled", "2026-07-04T18:00:00Z"),
      match(91, "scheduled", "2026-07-05T18:00:00Z"),
      match(89, "complete", "2026-07-03T18:00:00Z"),
    ];
    const sel = selectHomeMatches(matches, NOW);
    expect(sel.title).toBe("Today's matches");
    expect(sel.matches.map((m) => m.matchNumber)).toEqual([90]);
  });

  it("titles 'Next matches' when nothing is today, earliest first, excluding complete", () => {
    const matches = [
      match(92, "scheduled", "2026-07-07T18:00:00Z"),
      match(91, "scheduled", "2026-07-06T18:00:00Z"),
      match(80, "complete", "2026-07-01T18:00:00Z"),
    ];
    const sel = selectHomeMatches(matches, NOW);
    expect(sel.title).toBe("Next matches");
    expect(sel.matches.map((m) => m.matchNumber)).toEqual([91, 92]);
  });

  it("respects the limit and returns [] when all matches are complete", () => {
    const upcoming = [1, 2, 3, 4, 5, 6].map((n) => match(n, "scheduled", `2026-07-1${n}T18:00:00Z`));
    expect(selectHomeMatches(upcoming, NOW, 3).matches).toHaveLength(3);
    expect(selectHomeMatches([match(9, "complete", "2026-07-05T18:00:00Z")], NOW).matches).toHaveLength(0);
  });
});

describe("formatKickoff", () => {
  it("formats a deterministic UTC kickoff label", () => {
    expect(formatKickoff("2026-07-04T18:00:00Z")).toBe("4 Jul, 18:00 UTC");
    expect(formatKickoff(undefined)).toBeNull();
    expect(formatKickoff("nope")).toBeNull();
  });
});

describe("buildMatchForecastIndex", () => {
  const mf = {
    matchForecasts: [
      { matchNumber: 90, homeTeamId: "spain", awayTeamId: "brazil", homeWin: 0.5, draw: 0.3, awayWin: 0.2, forecastProvenance: "current-pre-match-forecast", homeAdvance: 0.6, awayAdvance: 0.4, topScorelines: [{ homeGoals: 1, awayGoals: 1, probability: 0.18 }, { homeGoals: 2, awayGoals: 1, probability: 0.12 }], stage: "roundOf16" },
      { matchNumber: 91, homeTeamId: "france", awayTeamId: "argentina", homeWin: 0.4, draw: 0.3, awayWin: 0.3, forecastProvenance: "archived-pre-match-forecast", stage: "group" },
      { matchNumber: 92, homeTeamId: "germany", awayTeamId: "portugal", homeWin: 0.45, draw: 0.3, awayWin: 0.25, forecastProvenance: "retrospective-model-forecast", stage: "group" },
    ],
  } as unknown as PublicSafeMatchForecasts;

  it("keeps true pre-match forecasts and excludes retrospective", () => {
    const index = buildMatchForecastIndex(mf);
    expect(Object.keys(index).sort()).toEqual(["90", "91"]);
    expect(index[92]).toBeUndefined();
    expect(index[90]?.homeAdvance).toBe(0.6);
  });

  it("captures the single top scoreline when present and omits it otherwise", () => {
    const index = buildMatchForecastIndex(mf);
    expect(index[90]?.topScoreline).toEqual({ homeGoals: 1, awayGoals: 1, probability: 0.18 });
    expect(index[91]?.topScoreline).toBeUndefined(); // no topScorelines on that entry
  });

  it("returns an empty index for null input", () => {
    expect(buildMatchForecastIndex(null)).toEqual({});
  });
});

describe("buildTeamContextIndex", () => {
  it("indexes per-team win/final/semi context", () => {
    const snap = { teams: [{ teamId: "spain", winner: 0.2, final: 0.4, semiFinal: 0.5 }] } as unknown as ForecastSnapshot;
    const idx = buildTeamContextIndex(snap);
    expect(idx.spain).toEqual({ winner: 0.2, final: 0.4, semiFinal: 0.5 });
    expect(buildTeamContextIndex(null)).toEqual({});
  });
});

describe("buildContenders", () => {
  const snapshot = {
    teams: [
      { teamId: "brazil", winner: 0.18, final: 0.35, semiFinal: 0.5 },
      { teamId: "spain", winner: 0.21, final: 0.4, semiFinal: 0.55 },
      { teamId: "france", winner: 0.13, final: 0.3, semiFinal: 0.45 },
      { teamId: "argentina", winner: 0.11, final: 0.28, semiFinal: 0.42 },
      { teamId: "england", winner: 0.08, final: 0.22, semiFinal: 0.38 },
      { teamId: "portugal", winner: 0.05, final: 0.18, semiFinal: 0.3 },
    ],
  } as unknown as ForecastSnapshot;
  const comparison = {
    teamDeltas: [
      { teamId: "spain", stages: { winner: { deltaPercentagePoints: -2.8 } } },
      { teamId: "brazil", stages: { winner: { deltaPercentagePoints: 4.0 } } },
    ],
  } as unknown as ForecastComparison;

  it("returns the top N sorted by title probability with movement mapped", () => {
    const rows = buildContenders({ snapshot, comparison, resolveTeam: safeTeam, topN: 5 });
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.teamId)).toEqual(["spain", "brazil", "france", "argentina", "england"]);
    expect(rows[0]?.rank).toBe(1);
    expect(rows[0]?.winnerDeltaPp).toBe(-2.8);
    expect(rows[1]?.winnerDeltaPp).toBe(4.0);
    expect(rows[2]?.winnerDeltaPp).toBeNull(); // no comparison entry
  });

  it("returns [] for a null snapshot", () => {
    expect(buildContenders({ snapshot: null, comparison, resolveTeam: safeTeam })).toEqual([]);
  });
});

describe("home composition + isolation", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("the home page does NOT render the full 48-team table / dashboard cards", () => {
    const page = read("app/page.tsx");
    for (const removed of ["WinnerTable", "ModelSummary", "StandoutContenders", "WinnerBarChart"]) {
      expect(page.includes(removed)).toBe(false);
    }
    for (const kept of ["ForecastHero", "HomeMatches", "HomeContenders", "TrustStrip"]) {
      expect(page.includes(kept)).toBe(true);
    }
  });

  it("home components import no server-only forecast modules or the Blob SDK", () => {
    for (const file of [
      "components/home/home-matches.tsx",
      "components/home/home-contenders.tsx",
      "components/home/trust-strip.tsx",
    ]) {
      const imports = read(file)
        .split("\n")
        .filter((l) => l.trimStart().startsWith("import"))
        .join("\n");
      expect(imports).not.toMatch(/forecast-runtime-store|forecast-snapshot-store/);
      expect(imports).not.toMatch(/@vercel\/blob/);
      expect(imports).not.toMatch(/@\/lib\/live-state|football-data|provider/);
    }
  });
});

describe("home copy clarity (no ambiguous 'final %' labels)", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("match cards read as forecast teasers with clear labels and honest empty state", () => {
    const src = read("components/home/home-matches.tsx");
    expect(src).toContain("title chance");
    expect(src.includes("· final")).toBe(false);
    expect(src.includes("win {pct(ctx.winner")).toBe(false);
    // Compact forecast teaser: model lean + a single top scoreline.
    expect(src).toContain("Model lean");
    expect(src).toContain("Likely scoreline");
    // A confirmed-but-unpublished match keeps an honest coming-soon state (not invented).
    expect(src).toContain("Pre-match forecast coming soon.");
    // It must NOT pull in the full detailed /matches fixture card or its dense blocks.
    expect(src).not.toContain("fixture-card");
    expect(src).not.toContain("Key drivers");
    expect(src).not.toContain("topScorelines.map");
  });

  it("top contenders use 'Reach final' and 'title chance', not a bare 'final %'", () => {
    const src = read("components/home/home-contenders.tsx");
    expect(src).toContain("title chance");
    // The reach-final metric is spelled out (not a bare "final 49%").
    expect(src.includes("Reach final {pct(row.final, 0)}")).toBe(true);
  });
});
