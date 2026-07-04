import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ForecastSnapshot } from "@/lib/model/forecast-snapshots";
import type { Team } from "@/lib/types";
import {
  RACE_STAGE_OPTIONS,
  RACE_TOP_N_OPTIONS,
  buildHomeForecastRaceModel,
  raceAriaSummary,
  selectRaceRanking,
  selectRaceView,
} from "@/lib/ui/home-trajectory-comparison";

/**
 * Home forecast race — pure comparison model. Env `node`. Uses the shared public
 * checkpoint policy: baseline + title-probability milestones (24/48/72/88/…) +
 * Current projection; the committed 54 and 73 locked-match dev checkpoints are never
 * included, and future round milestones appear automatically once committed.
 */

const STAGE_BASE = { qualifyTop2: 0.7, qualifyThird: 0.1, roundOf32: 0.9 };
const team = (teamId: string, rank: number, winner: number, over: Partial<Record<string, number>> = {}) => ({
  teamId,
  rank,
  winner,
  final: over.final ?? winner + 0.1,
  semiFinal: over.semiFinal ?? winner + 0.2,
  quarterFinal: over.quarterFinal ?? winner + 0.3,
  roundOf16: over.roundOf16 ?? winner + 0.4,
  ...STAGE_BASE,
});

const IDS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p"];
const snap = (id: string, locked: number, asOf: string, winners: Record<string, number>): ForecastSnapshot =>
  ({
    meta: { snapshotId: id, asOf, completedMatchesLocked: locked },
    teams: IDS.map((tid, i) => team(tid, i + 1, winners[tid] ?? (0.3 - i * 0.015))),
  } as unknown as ForecastSnapshot);

const NAMES: Record<string, string> = Object.fromEntries(IDS.map((id) => [id, id.toUpperCase()]));
const resolveTeam = (id: string): Team | null =>
  IDS.includes(id) ? ({ id, name: NAMES[id]!, flag: "🏳️", countryCode: id.toUpperCase() } as unknown as Team) : null;

const baseline = () => snap("baseline-2026-06-11.pre-tournament", 0, "2026-06-11T00:00:00Z", {});
const md1 = () => snap("snapshot-2026-06-18-after-match-024", 24, "2026-06-18T02:00:00Z", {});
const md2 = () => snap("snapshot-2026-06-24-after-match-048", 48, "2026-06-24T02:00:00Z", {});
const gsc = () => snap("snapshot-2026-06-29-after-match-072", 72, "2026-06-29T07:00:00Z", {});
const current = () => snap("current-2026-07-02-after-match-082", 82, "2026-07-02T19:00:00Z", {});
// The non-public dev checkpoints — present in the chain but never rendered publicly.
const m54 = () => snap("snapshot-2026-06-25-after-match-054", 54, "2026-06-25T12:00:00Z", {});
const m73 = () => snap("snapshot-2026-06-29-after-match-073", 73, "2026-06-29T08:00:00Z", {});
// A future round milestone (Round of 32 complete) — auto-recognized once committed.
const r32 = () => snap("snapshot-2026-07-05-after-match-088", 88, "2026-07-05T02:00:00Z", {});

// The committed milestone chain the home page passes (unordered, incl. dev checkpoints).
const chain = () => [gsc(), baseline(), m73(), md2(), m54(), md1()];

describe("buildHomeForecastRaceModel — public milestone checkpoints", () => {
  it("includes Start/MD1/MD2/Groups and appends Current projection on blob", () => {
    const model = buildHomeForecastRaceModel({ committedMilestones: chain(), current: current(), source: "blob", resolveTeam });
    expect(model.checkpointLabels).toEqual(["Start", "MD1", "MD2", "Groups", "Current"]);
    expect(model.hasCurrentProjection).toBe(true);
    for (const t of model.teams) {
      expect(t.points.map((p) => p.label)).toEqual([
        "Tournament start", "Group matchday 1 complete", "Group matchday 2 complete", "Group stage complete", "Current projection",
      ]);
    }
  });

  it("does not append Current projection on committed-fallback (no fake current)", () => {
    const model = buildHomeForecastRaceModel({ committedMilestones: chain(), current: current(), source: "committed-fallback", resolveTeam });
    expect(model.checkpointLabels).toEqual(["Start", "MD1", "MD2", "Groups"]);
    expect(model.hasCurrentProjection).toBe(false);
  });

  it("excludes the 54 and 73 dev checkpoints from the public model even though they are in the chain", () => {
    const model = buildHomeForecastRaceModel({ committedMilestones: chain(), current: null, source: "unavailable", resolveTeam });
    expect(model.checkpointLabels).toEqual(["Start", "MD1", "MD2", "Groups"]);
    const json = JSON.stringify(model);
    for (const bad of ["After Match 54", "After Match 73", "M54", "M73", "after-match-054", "after-match-073", "54", "73"]) {
      expect(model.checkpointLabels.join(" ").includes(bad)).toBe(false);
    }
    for (const t of model.teams) for (const p of t.points) {
      expect(p.label.includes("54")).toBe(false);
      expect(p.label.includes("73")).toBe(false);
      expect(p.label.includes("After Match")).toBe(false);
    }
    void json;
  });

  it("auto-recognizes a future round milestone (Round of 32) once committed", () => {
    const model = buildHomeForecastRaceModel({ committedMilestones: [...chain(), r32()], current: null, source: "unavailable", resolveTeam });
    expect(model.checkpointLabels).toEqual(["Start", "MD1", "MD2", "Groups", "R32"]);
  });

  it("no snapshotId / provider wording leaks into the serialized model", () => {
    const model = buildHomeForecastRaceModel({ committedMilestones: chain(), current: current(), source: "blob", resolveTeam });
    const json = JSON.stringify(model);
    for (const bad of ["after-match-054", "after-match-073", "vercel-storage", "BLOB_READ_WRITE_TOKEN", "https://", "http://", "snapshotId"]) {
      expect(json.includes(bad)).toBe(false);
    }
  });
});

describe("ranking is by the selected metric, not always title chance", () => {
  it("ranks by the chosen stage at the latest point", () => {
    const cur = snap("current-x", 82, "2026-07-02T19:00:00Z", {});
    const pEntry = cur.teams.find((t) => t.teamId === "p")!;
    (pEntry as unknown as Record<string, number>).final = 0.99;
    (pEntry as unknown as Record<string, number>).winner = 0.01;
    const model = buildHomeForecastRaceModel({ committedMilestones: chain(), current: cur, source: "blob", resolveTeam });
    const byTitle = selectRaceRanking(model, "winner").map((t) => t.teamId);
    const byFinal = selectRaceRanking(model, "final").map((t) => t.teamId);
    expect(byTitle[0]).toBe("a"); // highest winner
    expect(byFinal[0]).toBe("p"); // highest final despite low title
  });

  it("colour index is stable across metrics (survivors keep colour)", () => {
    const model = buildHomeForecastRaceModel({ committedMilestones: chain(), current: current(), source: "blob", resolveTeam });
    const colourById = new Map(model.teams.map((t) => [t.teamId, t.colorIndex]));
    const finalView = selectRaceView(model, "final", 15);
    for (const s of finalView.series) expect(s.colorIndex).toBe(colourById.get(s.teamId));
    const titleView = selectRaceView(model, "winner", 15);
    for (const s of titleView.series) expect(s.colorIndex).toBe(colourById.get(s.teamId));
  });

  it("deterministic tie-breaker: equal metric → current rank then name", () => {
    const flat = snap("current-flat", 82, "2026-07-02T19:00:00Z", Object.fromEntries(IDS.map((id) => [id, 0.2])));
    const model = buildHomeForecastRaceModel({ committedMilestones: chain(), current: flat, source: "blob", resolveTeam });
    const order = selectRaceRanking(model, "winner").map((t) => t.teamId);
    expect(order).toEqual(IDS);
  });
});

describe("selectRaceView — Top-N + series", () => {
  const model = () => buildHomeForecastRaceModel({ committedMilestones: chain(), current: current(), source: "blob", resolveTeam });

  it("Top 5 / Top 10 / Top 15 return the right counts", () => {
    expect(RACE_TOP_N_OPTIONS).toEqual([5, 10, 15]);
    expect(selectRaceView(model(), "winner", 5).series).toHaveLength(5);
    expect(selectRaceView(model(), "winner", 10).series).toHaveLength(10);
    expect(selectRaceView(model(), "winner", 15).series).toHaveLength(15);
  });

  it("series values are percentages; legend carries value + delta since start + position", () => {
    const view = selectRaceView(model(), "winner", 5);
    const top = view.series[0]!;
    expect(top.points.map((p) => p.shortLabel)).toEqual(["Start", "MD1", "MD2", "Groups", "Current"]);
    expect(top.points.every((p) => p.valuePct >= 0 && p.valuePct <= 100)).toBe(true);
    expect(top.endValuePct).toBe(top.points[top.points.length - 1]!.valuePct);
    const legendTop = view.legend[0]!;
    expect(legendTop.position).toBe(1);
    expect(legendTop.currentValuePct).toBe(top.endValuePct);
    expect(typeof legendTop.deltaPpSinceStart).toBe("number");
  });

  it("aria summary names the metric, count and leader; empty model is honest", () => {
    const s = raceAriaSummary(selectRaceView(model(), "final", 10));
    expect(s).toContain("Reach final");
    expect(s).toContain("top 10");
    const empty = buildHomeForecastRaceModel({ committedMilestones: [], current: null, source: "unavailable", resolveTeam });
    expect(raceAriaSummary(selectRaceView(empty, "winner", 5))).toContain("Not enough history yet");
  });
});

describe("fallback ranking point + stage options", () => {
  it("ranks by group-stage-complete when current is unavailable", () => {
    const gscHi = snap("snapshot-2026-06-29-after-match-072", 72, "2026-06-29T07:00:00Z", {});
    (gscHi.teams.find((t) => t.teamId === "h")! as unknown as Record<string, number>).winner = 0.99;
    const model = buildHomeForecastRaceModel({ committedMilestones: [baseline(), md1(), md2(), gscHi], current: null, source: "unavailable", resolveTeam });
    expect(selectRaceRanking(model, "winner")[0]!.teamId).toBe("h"); // ranked by the latest available (Groups)
  });

  it("ranks by tournament start when only baseline exists", () => {
    const baseHi = snap("baseline-2026-06-11.pre-tournament", 0, "2026-06-11T00:00:00Z", {});
    (baseHi.teams.find((t) => t.teamId === "k")! as unknown as Record<string, number>).winner = 0.99;
    const model = buildHomeForecastRaceModel({ committedMilestones: [baseHi], current: null, source: "unavailable", resolveTeam });
    expect(model.checkpointLabels).toEqual(["Start"]);
    expect(selectRaceRanking(model, "winner")[0]!.teamId).toBe("k");
  });

  it("stage options reuse the movement labels", () => {
    expect(RACE_STAGE_OPTIONS.map((o) => o.label)).toEqual([
      "Title chance", "Reach final", "Reach semi-final", "Reach quarter-final", "Reach round of 16",
    ]);
  });
});

describe("client/server isolation (source scan)", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const importsOf = (p: string) => read(p).split("\n").filter((l) => l.trimStart().startsWith("import")).join("\n");

  it("the pure lib imports no React, runtime store, or Blob SDK", () => {
    const imports = importsOf("lib/ui/home-trajectory-comparison.ts");
    expect(imports).not.toMatch(/from "react"/);
    expect(imports).not.toMatch(/forecast-runtime-store|forecast-snapshot-store/);
    expect(imports).not.toMatch(/@vercel\/blob/);
  });

  it("the client chart component imports no server-only store or Blob SDK", () => {
    const imports = importsOf("components/home/home-forecast-race-chart.tsx");
    expect(read("components/home/home-forecast-race-chart.tsx").startsWith('"use client"')).toBe(true);
    expect(imports).not.toMatch(/forecast-runtime-store|forecast-snapshot-store/);
    expect(imports).not.toMatch(/@vercel\/blob/);
  });
});
