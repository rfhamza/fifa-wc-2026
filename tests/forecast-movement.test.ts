/**
 * UX-3 — Probability Movement pure-logic tests. Synthetic snapshots + real team lookup;
 * no Blob, token, network, provider, or DOM. Covers row building (per-stage from/to/Δpp),
 * stage selection, riser/faller/absolute sorting + topN, status (eliminated only from
 * live-state; 0%-for-stage never eliminated), stage-aware zero labels, and — critically —
 * that the explanation layer is safe-only and never emits a causal claim.
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
  MOVEMENT_NEUTRAL_EXPLANATION,
  MOVEMENT_STAGE_OPTIONS,
  buildMovementRows,
  deriveMovementStatus,
  movementExplanation,
  movementRankMove,
  movementStatusLabel,
  roundsToZeroPct,
  selectMovers,
  type MovementRow,
} from "@/lib/ui/forecast-movement";

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
    {
      teamId: "spain",
      fromRank: 1,
      toRank: 1,
      rankDelta: 0,
      stages: {
        winner: { fromProbability: 0.28, toProbability: 0.21, deltaPercentagePoints: -7 },
        final: { fromProbability: 0.38, toProbability: 0.31, deltaPercentagePoints: -7 },
        semiFinal: { fromProbability: 0.48, toProbability: 0.41, deltaPercentagePoints: -7 },
        quarterFinal: { fromProbability: 0.58, toProbability: 0.51, deltaPercentagePoints: -7 },
        roundOf16: { fromProbability: 0.68, toProbability: 0.61, deltaPercentagePoints: -7 },
      },
    },
    {
      teamId: "brazil",
      fromRank: 3,
      toRank: 2,
      rankDelta: -1,
      stages: {
        winner: { fromProbability: 0.12, toProbability: 0.18, deltaPercentagePoints: 6 },
        final: { fromProbability: 0.22, toProbability: 0.28, deltaPercentagePoints: 6 },
        semiFinal: { fromProbability: 0.32, toProbability: 0.38, deltaPercentagePoints: 6 },
        quarterFinal: { fromProbability: 0.42, toProbability: 0.48, deltaPercentagePoints: 6 },
        roundOf16: { fromProbability: 0.52, toProbability: 0.58, deltaPercentagePoints: 6 },
      },
    },
    {
      teamId: "argentina",
      fromRank: 2,
      toRank: 3,
      rankDelta: 1,
      stages: {
        winner: { fromProbability: 0.14, toProbability: 0, deltaPercentagePoints: -14 },
        final: { fromProbability: 0.24, toProbability: 0.1, deltaPercentagePoints: -14 },
        semiFinal: { fromProbability: 0.34, toProbability: 0.2, deltaPercentagePoints: -14 },
        quarterFinal: { fromProbability: 0.44, toProbability: 0.3, deltaPercentagePoints: -14 },
        roundOf16: { fromProbability: 0.54, toProbability: 0.4, deltaPercentagePoints: -14 },
      },
    },
  ],
} as unknown as ForecastComparison;

const qual = (m: Record<string, LiveViewQualification>) => new Map(Object.entries(m));

describe("buildMovementRows", () => {
  const rows = buildMovementRows({ current, baseline, comparison, resolveTeam: safeTeam });
  const rowOf = (id: string) => rows.find((r) => r.teamId === id)!;

  it("builds a row per current team with per-stage from/current/delta + rank move", () => {
    expect(rows.map((r) => r.teamId)).toEqual(["spain", "brazil", "argentina"]);
    const brazil = rowOf("brazil");
    expect(brazil.stages.winner.from).toBe(0.12);
    expect(brazil.stages.winner.to).toBe(0.18);
    expect(brazil.stages.winner.deltaPp).toBe(6);
    expect(brazil.stages.semiFinal.deltaPp).toBe(6);
    expect(brazil.fromRank).toBe(3);
    expect(brazil.toRank).toBe(2);
    expect(brazil.rankDelta).toBe(-1);
    expect(movementRankMove(brazil)).toBe("#3 → #2");
  });

  it("exposes all five knockout-reach stages", () => {
    expect(MOVEMENT_STAGE_OPTIONS.map((o) => o.value)).toEqual([
      "winner",
      "final",
      "semiFinal",
      "quarterFinal",
      "roundOf16",
    ]);
    for (const s of MOVEMENT_STAGE_OPTIONS) expect(rowOf("spain").stages[s.value]).toBeTruthy();
  });

  it("flags a 0% title chance from the forecast", () => {
    expect(rowOf("argentina").isZeroTitle).toBe(true);
    expect(rowOf("spain").isZeroTitle).toBe(false);
  });

  it("falls back to current + baseline snapshots when the comparison is null", () => {
    const rowsNoCmp = buildMovementRows({ current, baseline, comparison: null, resolveTeam: safeTeam });
    const brazil = rowsNoCmp.find((r) => r.teamId === "brazil")!;
    expect(brazil.stages.winner.from).toBe(0.12);
    expect(brazil.stages.winner.to).toBe(0.18);
    expect(brazil.stages.winner.deltaPp).toBeCloseTo(6, 5);
  });

  it("returns [] when the current snapshot is unavailable", () => {
    expect(buildMovementRows({ current: null, baseline, comparison, resolveTeam: safeTeam })).toEqual([]);
  });

  it("serialized rows contain no token / Blob URL", () => {
    const s = JSON.stringify(rows);
    for (const bad of ["vercel-storage", "BLOB_READ_WRITE_TOKEN", "https://", "http://"]) {
      expect(s.includes(bad)).toBe(false);
    }
  });
});

describe("roundsToZeroPct", () => {
  it("treats exact zero and sub-0.05% as 0%", () => {
    expect(roundsToZeroPct(0)).toBe(true);
    expect(roundsToZeroPct(0.0004)).toBe(true);
    expect(roundsToZeroPct(0.001)).toBe(false);
  });
});

describe("selectMovers", () => {
  const rows = buildMovementRows({ current, baseline, comparison, resolveTeam: safeTeam });

  it("risers sort by positive delta desc; fallers by negative delta (largest drop first)", () => {
    const { risers, fallers } = selectMovers(rows, "winner");
    expect(risers.map((r) => r.teamId)).toEqual(["brazil"]);
    expect(fallers.map((r) => r.teamId)).toEqual(["argentina", "spain"]);
  });

  it("biggest sorts by absolute delta desc (mixed direction)", () => {
    expect(selectMovers(rows, "winner").biggest.map((r) => r.teamId)).toEqual([
      "argentina",
      "spain",
      "brazil",
    ]);
  });

  it("uses the selected stage's delta (not always title)", () => {
    // All deltas are equal per-team across stages here, so ordering is stable, but the
    // selected stage must drive the value that is read.
    const semi = selectMovers(rows, "semiFinal");
    expect(semi.risers.map((r) => r.teamId)).toEqual(["brazil"]);
    expect(semi.biggest[0]!.stages.semiFinal.deltaPp).toBe(-14);
  });

  it("caps each list at topN", () => {
    const { biggest } = selectMovers(rows, "winner", 2);
    expect(biggest).toHaveLength(2);
  });
});

describe("deriveMovementStatus (priority: eliminated → zero-stage → active → unknown)", () => {
  const rows = buildMovementRows({ current, baseline, comparison, resolveTeam: safeTeam });
  const rowOf = (id: string) => rows.find((r) => r.teamId === id)!;

  it("eliminated only from live-state qualificationState", () => {
    expect(deriveMovementStatus(rowOf("spain"), "winner", qual({ spain: "eliminated" }))).toBe("eliminated");
    expect(deriveMovementStatus(rowOf("spain"), "winner", qual({ spain: "qualified" }))).toBe("active");
  });

  it("0% for the selected stage is NOT labelled eliminated", () => {
    expect(deriveMovementStatus(rowOf("argentina"), "winner", qual({ argentina: "undecided" }))).toBe(
      "zero-stage",
    );
    // eliminated wins when live-state says eliminated
    expect(deriveMovementStatus(rowOf("argentina"), "winner", qual({ argentina: "eliminated" }))).toBe(
      "eliminated",
    );
  });

  it("unknown when live-state unavailable and not zero for the stage", () => {
    expect(deriveMovementStatus(rowOf("spain"), "winner", null)).toBe("unknown");
    // zero-for-stage is still derivable without live-state
    expect(deriveMovementStatus(rowOf("argentina"), "winner", null)).toBe("zero-stage");
  });

  it("labels the zero status per stage (0% title chance vs currently 0% for this stage)", () => {
    expect(movementStatusLabel("zero-stage", "winner")).toBe("0% title chance");
    expect(movementStatusLabel("zero-stage", "semiFinal")).toBe("Currently 0% for this stage");
    expect(movementStatusLabel("eliminated", "winner")).toBe("Eliminated");
  });
});

describe("movementExplanation is SAFE — never a causal claim", () => {
  const rows = buildMovementRows({ current, baseline, comparison, resolveTeam: safeTeam });
  const rowOf = (id: string) => rows.find((r) => r.teamId === id)!;
  const ALLOWED = new Set([
    "Eliminated",
    "Now at 0% title chance",
    "Currently 0% for this stage",
    MOVEMENT_NEUTRAL_EXPLANATION,
  ]);
  const BANNED = ["rival", "easier", "harder", "because", "its mind", "won", "lost"];

  it("only ever returns an allowed, non-causal string", () => {
    const cases: Array<[MovementRow, "winner" | "semiFinal", Map<string, LiveViewQualification> | null]> = [
      [rowOf("brazil"), "winner", qual({ brazil: "qualified" })], // active riser → neutral
      [rowOf("spain"), "winner", null], // unknown → neutral
      [rowOf("argentina"), "winner", qual({ argentina: "undecided" })], // 0% title
      [rowOf("argentina"), "semiFinal", qual({ argentina: "undecided" })], // 0%? no (0.2) → neutral
      [rowOf("spain"), "winner", qual({ spain: "eliminated" })], // eliminated
    ];
    for (const [row, stage, q] of cases) {
      const out = movementExplanation(row, stage, q);
      expect(ALLOWED.has(out)).toBe(true);
      const lower = out.toLowerCase();
      for (const bad of BANNED) expect(lower.includes(bad)).toBe(false);
    }
  });

  it("surfaces the neutral sentence for an ordinary active mover", () => {
    expect(movementExplanation(rowOf("brazil"), "winner", qual({ brazil: "qualified" }))).toBe(
      MOVEMENT_NEUTRAL_EXPLANATION,
    );
  });

  it("surfaces 0% title chance only for the Title stage", () => {
    expect(movementExplanation(rowOf("argentina"), "winner", qual({ argentina: "undecided" }))).toBe(
      "Now at 0% title chance",
    );
  });
});

describe("client/server isolation + copy clarity", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("client components import no server-only forecast modules or the Blob SDK", () => {
    for (const f of [
      "components/movement/movement-surface.tsx",
      "components/movement/movement-card.tsx",
      "components/movement/movement-stage-selector.tsx",
    ]) {
      const imports = read(f)
        .split("\n")
        .filter((l) => l.trimStart().startsWith("import"))
        .join("\n");
      expect(imports).not.toMatch(/forecast-runtime-store|forecast-snapshot-store/);
      expect(imports).not.toMatch(/@vercel\/blob/);
    }
  });

  it("uses clear stage labels + the safe neutral sentence, not bare win%/final%", () => {
    const lib = read("lib/ui/forecast-movement.ts");
    const surface = read("components/movement/movement-surface.tsx");
    expect(lib).toContain("Title chance");
    expect(lib).toContain("Reach final");
    expect(lib).toContain("Reach round of 16");
    expect(lib).toContain(MOVEMENT_NEUTRAL_EXPLANATION);
    expect(surface.toLowerCase()).toContain("not re-rated after every match");
    expect(lib.includes("win %")).toBe(false);
    expect(lib.includes("final %")).toBe(false);
  });
});
