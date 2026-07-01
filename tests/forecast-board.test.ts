/**
 * UX-2B — Forecast Board pure-logic tests. Synthetic snapshots + real team lookup; no
 * Blob, token, network, provider, or DOM. Covers row building, movement, status
 * (eliminated only from live-state; 0% title never eliminated), sorting, and filters.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTeam } from "@/lib/data";
import type { Team } from "@/lib/types";
import type { ForecastSnapshot } from "@/lib/model/forecast-snapshots";
import type { ForecastComparison } from "@/lib/model/forecast-deltas";
import type { LiveViewQualification } from "@/lib/live-client/public-safe-view.client";
import {
  buildBoardRows,
  deriveStatus,
  matchesSearch,
  matchesStatusFilter,
  roundsToZeroTitle,
  sortBoard,
} from "@/lib/ui/forecast-board";

function safeTeam(id: string): Team | null {
  try {
    return getTeam(id);
  } catch {
    return null;
  }
}

function team(teamId: string, rank: number, winner: number, over: Partial<Record<string, number>> = {}) {
  return {
    teamId,
    rank,
    winner,
    final: over.final ?? winner + 0.1,
    semiFinal: over.semiFinal ?? winner + 0.2,
    quarterFinal: over.quarterFinal ?? winner + 0.3,
    roundOf16: over.roundOf16 ?? winner + 0.4,
    roundOf32: 0.9,
    qualifyTop2: 0.8,
    qualifyThird: 0.1,
  };
}
function snap(teams: ReturnType<typeof team>[]): ForecastSnapshot {
  return { meta: {}, teams } as unknown as ForecastSnapshot;
}

const current = snap([team("spain", 1, 0.21), team("brazil", 2, 0.18), team("argentina", 3, 0)]);
const baseline = snap([team("spain", 1, 0.28), team("brazil", 3, 0.12), team("argentina", 2, 0.14)]);
const comparison = {
  from: {},
  to: {},
  teamDeltas: [
    { teamId: "spain", fromRank: 1, toRank: 1, rankDelta: 0, stages: { winner: { deltaPercentagePoints: -7 } } },
    { teamId: "brazil", fromRank: 3, toRank: 2, rankDelta: -1, stages: { winner: { deltaPercentagePoints: 6 } } },
    { teamId: "argentina", fromRank: 2, toRank: 3, rankDelta: 1, stages: { winner: { deltaPercentagePoints: -14 } } },
  ],
} as unknown as ForecastComparison;

describe("buildBoardRows", () => {
  const rows = buildBoardRows({ current, baseline, comparison, resolveTeam: safeTeam });
  it("builds a row per current team with baseline + movement + rank movement", () => {
    expect(rows.map((r) => r.teamId)).toEqual(["spain", "brazil", "argentina"]);
    const brazil = rows.find((r) => r.teamId === "brazil")!;
    expect(brazil.current.winner).toBe(0.18);
    expect(brazil.baseline?.winner).toBe(0.12);
    expect(brazil.winnerDeltaPp).toBe(6);
    expect(brazil.fromRank).toBe(3);
    expect(brazil.toRank).toBe(2);
    expect(brazil.rankDelta).toBe(-1);
  });
  it("flags 0% title chance from the forecast", () => {
    expect(rows.find((r) => r.teamId === "argentina")!.isZeroTitle).toBe(true);
    expect(rows.find((r) => r.teamId === "spain")!.isZeroTitle).toBe(false);
  });
  it("returns [] when the current snapshot is unavailable (committed fallback handled upstream)", () => {
    expect(buildBoardRows({ current: null, baseline, comparison, resolveTeam: safeTeam })).toEqual([]);
  });
  it("serialized rows contain no token / Blob URL", () => {
    const s = JSON.stringify(rows);
    for (const bad of ["vercel-storage", "BLOB_READ_WRITE_TOKEN", "https://", "http://"]) expect(s.includes(bad)).toBe(false);
  });
});

describe("roundsToZeroTitle", () => {
  it("treats exact zero and sub-0.05% as 0%", () => {
    expect(roundsToZeroTitle(0)).toBe(true);
    expect(roundsToZeroTitle(0.0004)).toBe(true);
    expect(roundsToZeroTitle(0.001)).toBe(false);
  });
});

describe("deriveStatus (priority: eliminated → 0% → active → unknown)", () => {
  const rows = buildBoardRows({ current, baseline, comparison, resolveTeam: safeTeam });
  const rowOf = (id: string) => rows.find((r) => r.teamId === id)!;
  const qual = (m: Record<string, LiveViewQualification>) => new Map(Object.entries(m));

  it("eliminated only from live-state qualificationState", () => {
    expect(deriveStatus(rowOf("spain"), qual({ spain: "eliminated" }))).toBe("eliminated");
    expect(deriveStatus(rowOf("spain"), qual({ spain: "qualified" }))).toBe("active");
  });
  it("0% title chance is NOT labelled eliminated (forecast fact)", () => {
    // argentina has 0 winner but is not eliminated in live-state
    expect(deriveStatus(rowOf("argentina"), qual({ argentina: "undecided" }))).toBe("zero-title");
    // eliminated wins over 0% when live-state says eliminated
    expect(deriveStatus(rowOf("argentina"), qual({ argentina: "eliminated" }))).toBe("eliminated");
  });
  it("unknown when live-state is unavailable and not 0%", () => {
    expect(deriveStatus(rowOf("spain"), null)).toBe("unknown");
    // 0% is still derivable without live-state
    expect(deriveStatus(rowOf("argentina"), null)).toBe("zero-title");
  });
});

describe("sortBoard", () => {
  const rows = buildBoardRows({ current, baseline, comparison, resolveTeam: safeTeam });
  it("current: by current title chance (rank asc)", () => {
    expect(sortBoard(rows, "current").map((r) => r.teamId)).toEqual(["spain", "brazil", "argentina"]);
  });
  it("movement: by absolute movement desc", () => {
    expect(sortBoard(rows, "movement").map((r) => r.teamId)).toEqual(["argentina", "spain", "brazil"]);
  });
  it("baseline: by baseline title chance desc", () => {
    expect(sortBoard(rows, "baseline").map((r) => r.teamId)).toEqual(["spain", "argentina", "brazil"]);
  });
});

describe("filters", () => {
  const rows = buildBoardRows({ current, baseline, comparison, resolveTeam: safeTeam });
  it("search matches team name (case-insensitive)", () => {
    expect(rows.filter((r) => matchesSearch(r, "bra")).map((r) => r.teamId)).toEqual(["brazil"]);
    expect(rows.filter((r) => matchesSearch(r, "")).length).toBe(3);
  });
  it("status filter matches derived status", () => {
    expect(matchesStatusFilter("eliminated", "eliminated")).toBe(true);
    expect(matchesStatusFilter("zero-title", "zero-title")).toBe(true);
    expect(matchesStatusFilter("active", "eliminated")).toBe(false);
    expect(matchesStatusFilter("unknown", "all")).toBe(true);
  });
});

describe("client/server isolation + copy clarity", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  it("client components import no server-only forecast modules or the Blob SDK", () => {
    for (const f of [
      "components/teams/forecast-board.tsx",
      "components/teams/forecast-board-table.tsx",
      "components/teams/forecast-board-cards.tsx",
    ]) {
      const imports = read(f).split("\n").filter((l) => l.trimStart().startsWith("import")).join("\n");
      expect(imports).not.toMatch(/forecast-runtime-store|forecast-snapshot-store/);
      expect(imports).not.toMatch(/@vercel\/blob/);
    }
  });
  it("uses clear labels + the not-re-rated caveat, not bare final%", () => {
    const board = read("components/teams/forecast-board.tsx");
    const table = read("components/teams/forecast-board-table.tsx");
    expect(board.toLowerCase()).toContain("not re-rated after every match");
    expect(table).toContain("Title chance");
    expect(table).toContain("Reach final");
    expect(table.includes("· final")).toBe(false);
  });
});
