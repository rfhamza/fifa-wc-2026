import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ForecastSnapshot } from "@/lib/model/forecast-snapshots";
import type { ForecastComparison, TeamForecastTrajectory } from "@/lib/model/forecast-deltas";
import type { LiveViewMatch, LiveViewQualification, TeamLite } from "@/lib/live-client/public-safe-view.client";
import {
  CURRENT_PROJECTION_LABEL,
  GROUP_STAGE_COMPLETE_LABEL,
  TOURNAMENT_START_LABEL,
  TRAJECTORY_STAGE_OPTIONS,
  buildTeamHeroModel,
  buildTeamMatchHistoryRows,
  buildTeamTrajectoryModel,
  deriveTeamHeroStatus,
  deriveTeamMatchContext,
  selectKeyMovements,
  selectTrajectorySeries,
  teamHeroStatusLabel,
  trajectoryAriaSummary,
} from "@/lib/ui/team-trajectory";

/**
 * UX-6: pure team-trajectory models. Env `node`, no DOM/network/Blob. The PUBLIC
 * checkpoint policy is the core contract under test: only Tournament start (baseline),
 * Group stage complete (72 locked), and a validly-appended Current projection are ever
 * rendered — committed points at 54/73 locked stay in the data but never in the output.
 */

const STAGES = { winner: 0.2, final: 0.35, semiFinal: 0.5, quarterFinal: 0.65, roundOf16: 0.8, roundOf32: 0.9, qualifyTop2: 0.7, qualifyThird: 0.1 };
const stagesAt = (winner: number) => ({ ...STAGES, winner });

const point = (snapshotId: string, locked: number, winner: number, asOf = `2026-06-${String(11 + Math.min(locked, 18)).padStart(2, "0")}T12:00:00Z`) => ({
  snapshotId,
  asOf,
  completedMatchesLocked: locked,
  rank: 5,
  stages: stagesAt(winner),
});

/** The full committed chain INCLUDING the non-public 54/73 dev checkpoints. */
const fullTrajectory = (): TeamForecastTrajectory => ({
  teamId: "canada",
  points: [
    point("baseline-2026-06-11.pre-tournament", 0, 0.1, "2026-06-11T00:00:00Z"),
    point("snapshot-2026-06-25-after-match-054", 54, 0.13, "2026-06-25T12:00:00Z"),
    point("snapshot-2026-06-29-after-match-072", 72, 0.16, "2026-06-29T07:00:00Z"),
    point("snapshot-2026-06-29-after-match-073", 73, 0.18, "2026-06-29T08:00:00Z"),
  ],
});

const runtimeSnapshot = (snapshotId: string, locked: number, winner: number, asOf: string): ForecastSnapshot =>
  ({
    meta: { snapshotId, asOf, completedMatchesLocked: locked },
    teams: [{ teamId: "canada", rank: 4, ...stagesAt(winner) }],
  } as unknown as ForecastSnapshot);

describe("buildTeamTrajectoryModel — public checkpoint filter", () => {
  it("filters out locked 54 AND locked 73; keeps baseline + group stage complete", () => {
    const model = buildTeamTrajectoryModel({ trajectory: fullTrajectory(), runtimeCurrent: null, runtimeSource: "committed-fallback" });
    expect(model.points.map((p) => p.completedMatchesLocked)).toEqual([0, 72]);
    expect(model.points.map((p) => p.label)).toEqual([TOURNAMENT_START_LABEL, GROUP_STAGE_COMPLETE_LABEL]);
    expect(model.points.some((p) => p.completedMatchesLocked === 54)).toBe(false);
    expect(model.points.some((p) => p.completedMatchesLocked === 73)).toBe(false);
    expect(model.hasEnoughHistory).toBe(true);
    expect(model.hasGroupStageCheckpoint).toBe(true);
  });

  it("no public label ever says After Match", () => {
    const current = runtimeSnapshot("current-2026-07-02-after-match-082", 82, 0.2, "2026-07-02T19:00:00Z");
    const model = buildTeamTrajectoryModel({ trajectory: fullTrajectory(), runtimeCurrent: current, runtimeSource: "blob" });
    for (const p of model.points) {
      expect(p.label.includes("After Match")).toBe(false);
      expect(p.label.includes("54")).toBe(false);
      expect(p.label.includes("73")).toBe(false);
    }
  });

  it("appends the runtime current as Current projection when blob + newer", () => {
    const current = runtimeSnapshot("current-2026-07-02-after-match-082", 82, 0.2, "2026-07-02T19:00:00Z");
    const model = buildTeamTrajectoryModel({ trajectory: fullTrajectory(), runtimeCurrent: current, runtimeSource: "blob" });
    expect(model.points.map((p) => p.label)).toEqual([
      TOURNAMENT_START_LABEL, GROUP_STAGE_COMPLETE_LABEL, CURRENT_PROJECTION_LABEL,
    ]);
    const live = model.points[2]!;
    expect(live.pointSource).toBe("live");
    expect(live.isLatest).toBe(true);
    expect(live.stages.winner).toBe(0.2);
  });

  it("does NOT append on committed-fallback source (no duplicate chain tail)", () => {
    const current = runtimeSnapshot("snapshot-2026-06-29-after-match-073", 73, 0.18, "2026-06-29T08:00:00Z");
    const model = buildTeamTrajectoryModel({ trajectory: fullTrajectory(), runtimeCurrent: current, runtimeSource: "committed-fallback" });
    expect(model.points).toHaveLength(2);
  });

  it("does NOT append a duplicate snapshotId or a stale/equal point", () => {
    const dupOfGsc = runtimeSnapshot("snapshot-2026-06-29-after-match-072", 72, 0.16, "2026-06-29T07:00:00Z");
    expect(buildTeamTrajectoryModel({ trajectory: fullTrajectory(), runtimeCurrent: dupOfGsc, runtimeSource: "blob" }).points).toHaveLength(2);
    const stale = runtimeSnapshot("current-old", 60, 0.14, "2026-06-26T00:00:00Z");
    expect(buildTeamTrajectoryModel({ trajectory: fullTrajectory(), runtimeCurrent: stale, runtimeSource: "blob" }).points).toHaveLength(2);
    const equalLockedNotLater = runtimeSnapshot("current-x", 72, 0.16, "2026-06-29T07:00:00Z");
    expect(buildTeamTrajectoryModel({ trajectory: fullTrajectory(), runtimeCurrent: equalLockedNotLater, runtimeSource: "blob" }).points).toHaveLength(2);
    // Equal locked but strictly later asOf DOES extend (a re-published later read).
    const equalLockedLater = runtimeSnapshot("current-y", 72, 0.17, "2026-06-30T00:00:00Z");
    expect(buildTeamTrajectoryModel({ trajectory: fullTrajectory(), runtimeCurrent: equalLockedLater, runtimeSource: "blob" }).points).toHaveLength(3);
  });

  it("does NOT append when the team is missing from the runtime snapshot", () => {
    const current = { meta: { snapshotId: "c", asOf: "2026-07-02T19:00:00Z", completedMatchesLocked: 82 }, teams: [] } as unknown as ForecastSnapshot;
    expect(buildTeamTrajectoryModel({ trajectory: fullTrajectory(), runtimeCurrent: current, runtimeSource: "blob" }).points).toHaveLength(2);
  });

  it("fallback: group-stage checkpoint unavailable → baseline + current, flag false", () => {
    const noGsc: TeamForecastTrajectory = { teamId: "canada", points: [point("baseline-2026-06-11.pre-tournament", 0, 0.1, "2026-06-11T00:00:00Z")] };
    const current = runtimeSnapshot("current-82", 82, 0.2, "2026-07-02T19:00:00Z");
    const model = buildTeamTrajectoryModel({ trajectory: noGsc, runtimeCurrent: current, runtimeSource: "blob" });
    expect(model.points.map((p) => p.label)).toEqual([TOURNAMENT_START_LABEL, CURRENT_PROJECTION_LABEL]);
    expect(model.hasGroupStageCheckpoint).toBe(false);
    expect(model.hasEnoughHistory).toBe(true);
  });

  it("only baseline → hasEnoughHistory false; empty chain → empty points", () => {
    const onlyBase: TeamForecastTrajectory = { teamId: "canada", points: [point("baseline-2026-06-11.pre-tournament", 0, 0.1)] };
    const m1 = buildTeamTrajectoryModel({ trajectory: onlyBase, runtimeCurrent: null, runtimeSource: "unavailable" });
    expect(m1.points).toHaveLength(1);
    expect(m1.hasEnoughHistory).toBe(false);
    const m2 = buildTeamTrajectoryModel({ trajectory: { teamId: "canada", points: [] }, runtimeCurrent: null, runtimeSource: "unavailable" });
    expect(m2.points).toHaveLength(0);
    expect(m2.hasEnoughHistory).toBe(false);
  });
});

describe("selectTrajectorySeries + aria summary", () => {
  const current = runtimeSnapshot("current-82", 82, 0.204, "2026-07-02T19:00:00Z");
  const model = buildTeamTrajectoryModel({ trajectory: fullTrajectory(), runtimeCurrent: current, runtimeSource: "blob" });

  it("rounds to display percent and computes delta vs Tournament start", () => {
    const series = selectTrajectorySeries(model, "winner");
    expect(series.map((p) => p.valuePct)).toEqual([10, 16, 20.4]);
    expect(series.map((p) => p.deltaPpSinceBaseline)).toEqual([0, 6, 10.4]);
    expect(series[0]!.isBaseline).toBe(true);
    expect(series[2]!.isLatest).toBe(true);
  });

  it("selects per stage", () => {
    const series = selectTrajectorySeries(model, "final");
    expect(series.every((p) => p.valuePct === 35)).toBe(true);
  });

  it("aria summary names the endpoints; short series stays honest", () => {
    const s = trajectoryAriaSummary("Canada", "winner", selectTrajectorySeries(model, "winner"));
    expect(s).toContain("Tournament start");
    expect(s).toContain("Current projection");
    expect(trajectoryAriaSummary("Canada", "winner", [])).toContain("Not enough history yet");
  });
});

describe("selectKeyMovements — deterministic public intervals only", () => {
  const current = runtimeSnapshot("current-82", 82, 0.2, "2026-07-02T19:00:00Z");

  it("returns the three fixed rows when all points exist", () => {
    const model = buildTeamTrajectoryModel({ trajectory: fullTrajectory(), runtimeCurrent: current, runtimeSource: "blob" });
    const rows = selectKeyMovements(model, "winner");
    expect(rows.map((r) => `${r.fromLabel} → ${r.toLabel}`)).toEqual([
      "Tournament start → Group stage complete",
      "Group stage complete → Current projection",
      "Tournament start → Current projection",
    ]);
    expect(rows.map((r) => r.deltaPp)).toEqual([6, 4, 10]);
    expect(rows[0]!.sentence).toBe("Changed between tournament start and group stage complete");
    expect(rows[1]!.sentence).toBe("Changed between group stage complete and current projection");
    expect(rows[2]!.sentence).toBe("Changed since tournament start");
    for (const r of rows) {
      expect(`${r.fromLabel}${r.toLabel}${r.sentence}`.includes("After Match")).toBe(false);
    }
  });

  it("no current → only start → group stage complete", () => {
    const model = buildTeamTrajectoryModel({ trajectory: fullTrajectory(), runtimeCurrent: null, runtimeSource: "committed-fallback" });
    const rows = selectKeyMovements(model, "winner");
    expect(rows.map((r) => r.sentence)).toEqual(["Changed between tournament start and group stage complete"]);
  });

  it("no group-stage checkpoint but current → only changed since tournament start", () => {
    const noGsc: TeamForecastTrajectory = { teamId: "canada", points: [point("baseline-2026-06-11.pre-tournament", 0, 0.1, "2026-06-11T00:00:00Z")] };
    const model = buildTeamTrajectoryModel({ trajectory: noGsc, runtimeCurrent: current, runtimeSource: "blob" });
    expect(selectKeyMovements(model, "winner").map((r) => r.sentence)).toEqual(["Changed since tournament start"]);
  });

  it("only baseline → no rows; neutral movement keeps the row with ±0 delta", () => {
    const onlyBase: TeamForecastTrajectory = { teamId: "canada", points: [point("baseline-2026-06-11.pre-tournament", 0, 0.1)] };
    expect(selectKeyMovements(buildTeamTrajectoryModel({ trajectory: onlyBase, runtimeCurrent: null, runtimeSource: "unavailable" }), "winner")).toEqual([]);
    // Neutral: winner unchanged between baseline and GSC → deltaPp 0, row still present.
    const flat: TeamForecastTrajectory = {
      teamId: "canada",
      points: [point("baseline-2026-06-11.pre-tournament", 0, 0.1, "2026-06-11T00:00:00Z"), point("snapshot-2026-06-29-after-match-072", 72, 0.1, "2026-06-29T07:00:00Z")],
    };
    const rows = selectKeyMovements(buildTeamTrajectoryModel({ trajectory: flat, runtimeCurrent: null, runtimeSource: "committed-fallback" }), "winner");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deltaPp).toBe(0);
  });
});

describe("buildTeamHeroModel + status", () => {
  const snap = (winner: number, id = "s", asOf = "2026-07-02T19:00:00Z"): ForecastSnapshot =>
    ({ meta: { snapshotId: id, asOf, completedMatchesLocked: 82 }, teams: [{ teamId: "canada", rank: 3, ...stagesAt(winner) }] } as unknown as ForecastSnapshot);

  it("prefers the comparison pp delta; falls back to snapshot difference", () => {
    const comparison = { teamDeltas: [{ teamId: "canada", stages: { winner: { deltaPercentagePoints: 7.5 } } }] } as unknown as ForecastComparison;
    const withComparison = buildTeamHeroModel({ teamId: "canada", current: snap(0.2), baseline: snap(0.1, "b", "2026-06-11T00:00:00Z"), comparison, source: "blob" });
    expect(withComparison.titleDeltaPp).toBe(7.5);
    const without = buildTeamHeroModel({ teamId: "canada", current: snap(0.2), baseline: snap(0.1, "b"), comparison: null, source: "blob" });
    expect(without.titleDeltaPp).toBe(10);
    expect(without.currentTitleProbability).toBe(0.2);
    expect(without.baselineTitleProbability).toBe(0.1);
    expect(without.currentRank).toBe(3);
  });

  it("is null-safe when current/baseline/comparison are unavailable", () => {
    const hero = buildTeamHeroModel({ teamId: "canada", current: null, baseline: null, comparison: null, source: "unavailable" });
    expect(hero.currentTitleProbability).toBeNull();
    expect(hero.baselineTitleProbability).toBeNull();
    expect(hero.titleDeltaPp).toBeNull();
    expect(hero.currentRank).toBeNull();
    expect(hero.isZeroTitle).toBe(false);
    expect(hero.asOfLabel).toBeNull();
  });

  it("eliminated ONLY from live-state; zero title chance is never auto-eliminated", () => {
    const qualElim = new Map<string, LiveViewQualification>([["canada", "eliminated"]]);
    const qualUndecided = new Map<string, LiveViewQualification>([["canada", "undecided"]]);
    expect(deriveTeamHeroStatus("canada", true, qualElim)).toBe("eliminated");
    expect(deriveTeamHeroStatus("canada", true, qualUndecided)).toBe("zero-title");
    expect(deriveTeamHeroStatus("canada", true, null)).toBe("zero-title");
    expect(deriveTeamHeroStatus("canada", false, qualUndecided)).toBe("active");
    expect(deriveTeamHeroStatus("canada", false, null)).toBe("unknown");
    expect(teamHeroStatusLabel("zero-title")).toBe("0% title chance");
    expect(teamHeroStatusLabel("unknown")).toBe("Status unavailable");
  });
});

describe("buildTeamMatchHistoryRows", () => {
  const TEAMS: Record<string, TeamLite> = {
    canada: { id: "canada", name: "Canada", flag: "🇨🇦", countryCode: "CAN" },
    "bosnia-herzegovina": { id: "bosnia-herzegovina", name: "Bosnia-Herzegovina", flag: "🇧🇦", countryCode: "BIH" },
    germany: { id: "germany", name: "Germany", flag: "🇩🇪", countryCode: "GER" },
  };
  const resolveTeam = (id: string) => TEAMS[id] ?? null;
  const fixtures = [{ matchNumber: 3, homeTeamId: "canada", awayTeamId: "bosnia-herzegovina" }];

  it("orients probabilities to the team, on both home and away sides", () => {
    const entries = [
      { matchNumber: 3, stage: "group", forecastProvenance: "archived-pre-match-forecast" as const, homeTeamId: "canada", awayTeamId: "bosnia-herzegovina", homeWin: 0.5, draw: 0.3, awayWin: 0.2 },
      { matchNumber: 74, stage: "roundOf32", forecastProvenance: "current-pre-match-forecast" as const, homeTeamId: "germany", awayTeamId: "canada", homeWin: 0.6, draw: 0.2, awayWin: 0.2, homeAdvance: 0.7, awayAdvance: 0.3 },
    ];
    const rows = buildTeamMatchHistoryRows({ teamId: "canada", fixtures, entries, resolveTeam });
    expect(rows.map((r) => r.matchNumber)).toEqual([3, 74]);
    expect(rows[0]!.teamWin).toBe(0.5); // home side
    expect(rows[0]!.teamLoss).toBe(0.2);
    expect(rows[1]!.teamWin).toBe(0.2); // away side → flipped
    expect(rows[1]!.teamLoss).toBe(0.6);
    expect(rows[1]!.teamAdvance).toBe(0.3);
    expect(rows[1]!.isKnockout).toBe(true);
    expect(rows[1]!.stageLabel).toBe("Round of 32");
    expect(rows[1]!.opponent?.name).toBe("Germany");
    expect(rows[0]!.provenanceLabel).toBe("Pre-match forecast captured before kickoff");
  });

  it("rows without an entry stay honest; null entries input keeps fixture rows", () => {
    const rows = buildTeamMatchHistoryRows({ teamId: "canada", fixtures, entries: null, resolveTeam });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.hasForecast).toBe(false);
    expect(rows[0]!.teamWin).toBeNull();
    expect(rows[0]!.provenanceLabel).toBe("No pre-match forecast captured");
  });

  it("ignores entries not involving the team", () => {
    const entries = [{ matchNumber: 80, stage: "roundOf32", forecastProvenance: "current-pre-match-forecast" as const, homeTeamId: "germany", awayTeamId: "bosnia-herzegovina", homeWin: 0.6, draw: 0.2, awayWin: 0.2 }];
    expect(buildTeamMatchHistoryRows({ teamId: "canada", fixtures: [], entries, resolveTeam })).toEqual([]);
  });
});

describe("deriveTeamMatchContext", () => {
  const lm = (over: Partial<LiveViewMatch>): LiveViewMatch =>
    ({ matchNumber: 1, matchId: "M1", stage: "group", teamA: "canada", teamB: "germany", status: "scheduled", ...over } as LiveViewMatch);

  it("selects in-progress / last completed (won) / next scheduled, team-oriented", () => {
    const ctx = deriveTeamMatchContext(
      [
        lm({ matchNumber: 3, status: "complete", goalsA: 2, goalsB: 1 }),
        lm({ matchNumber: 27, status: "complete", teamA: "germany", teamB: "canada", goalsA: 0, goalsB: 3 }),
        lm({ matchNumber: 74, status: "in-progress", goalsA: 1, goalsB: 1 }),
        lm({ matchNumber: 90, status: "scheduled", kickoff: "2026-07-04T21:00:00Z" }),
        lm({ matchNumber: 80, status: "complete", teamA: "germany", teamB: "bosnia-herzegovina", goalsA: 1, goalsB: 0 }), // not ours
      ],
      "canada",
    );
    expect(ctx.inProgress).toEqual({ matchNumber: 74, opponentId: "germany", score: "1–1" });
    expect(ctx.lastCompleted).toEqual({ matchNumber: 27, opponentId: "germany", score: "3–0", won: true });
    expect(ctx.nextScheduled).toEqual({ matchNumber: 90, opponentId: "germany", score: null, kickoff: "2026-07-04T21:00:00Z" });
  });

  it("uses the explicit winner for knockout draws; empty input is all-null", () => {
    const ctx = deriveTeamMatchContext(
      [lm({ matchNumber: 75, stage: "roundOf32", status: "complete", goalsA: 1, goalsB: 1, winner: "germany" })],
      "canada",
    );
    expect(ctx.lastCompleted?.won).toBe(false);
    const empty = deriveTeamMatchContext([], "canada");
    expect(empty).toEqual({ inProgress: null, lastCompleted: null, nextScheduled: null });
  });
});

describe("stage options + no-leak + isolation", () => {
  it("reuses the movement stage labels", () => {
    expect(TRAJECTORY_STAGE_OPTIONS.map((o) => o.label)).toEqual([
      "Title chance", "Reach final", "Reach semi-final", "Reach quarter-final", "Reach round of 16",
    ]);
  });

  it("serialized models contain no token / Blob URL", () => {
    const current = runtimeSnapshot("current-82", 82, 0.2, "2026-07-02T19:00:00Z");
    const model = buildTeamTrajectoryModel({ trajectory: fullTrajectory(), runtimeCurrent: current, runtimeSource: "blob" });
    const blob = JSON.stringify({
      model,
      series: selectTrajectorySeries(model, "winner"),
      movements: selectKeyMovements(model, "winner"),
      hero: buildTeamHeroModel({ teamId: "canada", current, baseline: null, comparison: null, source: "blob" }),
    });
    for (const bad of ["vercel-storage", "BLOB_READ_WRITE_TOKEN", "FOOTBALL_DATA_TOKEN", "https://", "http://"]) {
      expect(blob.includes(bad)).toBe(false);
    }
  });
});

describe("client/server isolation (source scans)", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const importLines = (p: string) =>
    read(p)
      .split("\n")
      .filter((l) => l.trimStart().startsWith("import"))
      .join("\n");

  it("client components import no server-only stores or the Blob SDK", () => {
    for (const f of [
      "components/teams/team-trajectory-surface.tsx",
      "components/teams/team-match-history.tsx",
      "components/charts/team-trajectory-chart.tsx",
    ]) {
      const imports = importLines(f);
      expect(imports).not.toMatch(/forecast-runtime-store|forecast-snapshot-store/);
      expect(imports).not.toMatch(/@vercel\/blob/);
      expect(read(f).startsWith('"use client"')).toBe(true);
    }
  });

  it("the pure lib imports no React and no server-only store", () => {
    const imports = importLines("lib/ui/team-trajectory.ts");
    expect(imports).not.toMatch(/from "react"/);
    expect(imports).not.toMatch(/@vercel\/blob/);
    // Type-only imports from model modules are fine; a VALUE import of the stores is not.
    expect(imports).not.toMatch(/^import \{[^}]*\} from "@\/lib\/model\/forecast-runtime-store"/m);
    expect(imports).not.toMatch(/forecast-snapshot-store/);
  });
});
