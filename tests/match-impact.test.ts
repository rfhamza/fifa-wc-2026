import { describe, expect, it } from "vitest";
import {
  buildMatchImpactIntervals,
  buildMatchImpactSummary,
  findIntervalForMatch,
  shouldShowMatchImpactCta,
} from "@/lib/ui/match-impact";
import type { ForecastSnapshot, ForecastSnapshotType } from "@/lib/model/forecast-snapshots";
import type { MatchCentreRow } from "@/lib/ui/match-centre";
import type { TeamLookup } from "@/lib/live-client/public-safe-view.client";

/**
 * Match Impact selectors — pure. Uses synthetic snapshots + rows; no real forecast data,
 * no simulation, no live-state. Verifies the honesty split: per-match knockout status
 * events (advanced/eliminated) and checkpoint-INTERVAL-framed probability movement.
 */

const TEAMS: TeamLookup = Object.fromEntries(
  ["mexico", "england", "argentina", "brazil", "spain"].map((id) => [
    id,
    { id, name: id[0]!.toUpperCase() + id.slice(1), flag: "", countryCode: id.slice(0, 2).toUpperCase() },
  ]),
);

function mkSnap(
  id: string,
  locked: number,
  winners: Record<string, number>,
  opts: { supported?: number; type?: ForecastSnapshotType } = {},
): ForecastSnapshot {
  const teams = Object.entries(winners)
    .sort((a, b) => b[1] - a[1])
    .map(([teamId, w], i) => ({
      teamId,
      rank: i + 1,
      winner: w,
      final: w,
      semiFinal: w,
      quarterFinal: w,
      roundOf16: w,
      roundOf32: w,
      qualifyTop2: w,
      qualifyThird: 0,
    }));
  return {
    meta: {
      schemaVersion: "1.0.0",
      snapshotId: id,
      snapshotType: opts.type ?? "post-match",
      asOf: "2026-06-29",
      generatedAt: "2026-06-29T00:00:00.000Z",
      weightsSummary: {},
      modelConfigHash: "h",
      dataVersion: "d",
      fixtureVersion: "f",
      liveStateSource: null,
      liveStateAsOf: null,
      completedMatchesLocked: locked,
      simulationIterations: 2000,
      seed: 1,
      notes: "",
      ...(opts.supported != null ? { latestCompletedSupportedMatchNumber: opts.supported } : {}),
    },
    teams,
  };
}

function mkRow(over: Partial<MatchCentreRow>): MatchCentreRow {
  return {
    matchNumber: 79,
    stage: "roundOf32",
    status: "complete",
    teamA: "mexico",
    teamB: "england",
    forecast: { kind: "unavailable", data: null, agedWellEligible: false },
    ...over,
  };
}

// A realistic 72 -> current movement scenario for Mexico v England (match 79).
const S72 = mkSnap("s72", 72, { argentina: 0.2, brazil: 0.15, mexico: 0.1, england: 0.08, spain: 0.05 }, { supported: 72 });
const CURRENT = mkSnap(
  "current",
  79,
  { argentina: 0.22, brazil: 0.14, mexico: 0.14, england: 0.03, spain: 0.06 },
  { supported: 80 },
);
const INTERVALS = buildMatchImpactIntervals([S72], CURRENT);
const INTERVAL79 = findIntervalForMatch(INTERVALS, 79);

describe("match-impact: checkpoint pair resolution", () => {
  const s0 = mkSnap("s0", 0, { argentina: 0.2, mexico: 0.1 }, { type: "baseline" });
  const s24 = mkSnap("s24", 24, { argentina: 0.2, mexico: 0.11 }, { supported: 24 });
  const s48 = mkSnap("s48", 48, { argentina: 0.2, mexico: 0.12 }, { supported: 48 });
  const s72 = mkSnap("s72", 72, { argentina: 0.2, mexico: 0.13 }, { supported: 72 });
  const cur = mkSnap("cur", 79, { argentina: 0.2, mexico: 0.14 }, { supported: 80 });
  const intervals = buildMatchImpactIntervals([s0, s24, s48, s72], cur);

  it("builds one interval per adjacent public checkpoint (+ terminal current)", () => {
    expect(intervals.map((i) => [i.beforeSupported, i.afterSupported])).toEqual([
      [0, 24],
      [24, 48],
      [48, 72],
      [72, 80],
    ]);
    expect(intervals.at(-1)!.isTerminalCurrent).toBe(true);
  });

  it("maps a match to the interval whose pair straddles it", () => {
    expect(findIntervalForMatch(intervals, 10)!.beforeSupported).toBe(0);
    expect(findIntervalForMatch(intervals, 30)!.beforeSupported).toBe(24);
    expect(findIntervalForMatch(intervals, 79)!.beforeSupported).toBe(72);
  });

  it("returns null when no checkpoint pair straddles the match (beyond current)", () => {
    expect(findIntervalForMatch(intervals, 200)).toBeNull();
  });

  it("only public checkpoints become interval boundaries (dev checkpoints dropped)", () => {
    const withDev = buildMatchImpactIntervals([s0, mkSnap("s54", 54, { argentina: 0.2 }, { supported: 54 }), s72], cur);
    // 54 is not a public milestone -> not a boundary; intervals jump 0 -> 72 -> current.
    expect(withDev.map((i) => [i.beforeSupported, i.afterSupported])).toEqual([
      [0, 72],
      [72, 80],
    ]);
  });
});

describe("match-impact: knockout status events (per-match, exact)", () => {
  it("winner advanced, loser eliminated for an eliminating knockout round", () => {
    const s = buildMatchImpactSummary({
      row: mkRow({ stage: "roundOf32", actual: { goalsA: 2, goalsB: 1, winner: "mexico" } }),
      teams: TEAMS,
      interval: INTERVAL79,
    });
    expect(s.statusEvents).toEqual([
      { teamId: "mexico", event: "advanced", basis: "knockout-result" },
      { teamId: "england", event: "eliminated", basis: "knockout-result" },
    ]);
  });

  it("omits status events for group matches (a single group match does not resolve qualification)", () => {
    const s = buildMatchImpactSummary({
      row: mkRow({ stage: "group", matchNumber: 30, actual: { goalsA: 3, goalsB: 0, winner: "mexico" } }),
      teams: TEAMS,
      interval: INTERVAL79,
    });
    expect(s.statusEvents).toEqual([]);
  });

  it("omits status events for semi-final/final/third-place (avoid mislabelling runners-up)", () => {
    for (const stage of ["semiFinal", "final", "thirdPlace"]) {
      const s = buildMatchImpactSummary({
        row: mkRow({ stage, actual: { goalsA: 1, goalsB: 0, winner: "mexico" } }),
        teams: TEAMS,
        interval: INTERVAL79,
      });
      expect(s.statusEvents).toEqual([]);
    }
  });

  it("NEVER derives elimination from a 0% probability — only from the match result", () => {
    // England fell to 0.03 title (not zero); a group participant with 0% title gets no event.
    const zeroTitle = mkSnap("z", 79, { argentina: 0.4, mexico: 0.4, england: 0 }, { supported: 79 });
    const zInterval = buildMatchImpactIntervals([S72], zeroTitle);
    const s = buildMatchImpactSummary({
      row: mkRow({ stage: "group", matchNumber: 20, teamA: "england", teamB: "spain", actual: { goalsA: 0, goalsB: 2, winner: "spain" } }),
      teams: TEAMS,
      interval: findIntervalForMatch(zInterval, 20),
    });
    expect(s.statusEvents).toEqual([]); // group + 0% title => no "eliminated"
  });
});

describe("match-impact: probability movement (checkpoint-interval framed)", () => {
  const summary = buildMatchImpactSummary({
    row: mkRow({ actual: { goalsA: 2, goalsB: 1, winner: "mexico" } }),
    teams: TEAMS,
    interval: INTERVAL79,
  });

  it("prioritises the two match participants, in A/B order", () => {
    expect(summary.participantMovements.map((m) => m.teamId)).toEqual(["mexico", "england"]);
  });

  it("caps risers/fallers at 3 and sorts them by title-chance movement", () => {
    expect(summary.topRisers.length).toBeLessThanOrEqual(3);
    expect(summary.topFallers.length).toBeLessThanOrEqual(3);
    // Risers descending, fallers most-negative first.
    const rd = summary.topRisers.map((r) => r.deltaPp);
    const fd = summary.topFallers.map((r) => r.deltaPp);
    expect([...rd].sort((a, b) => b - a)).toEqual(rd);
    expect([...fd].sort((a, b) => a - b)).toEqual(fd);
    expect(summary.topRisers[0]!.teamId).toBe("mexico"); // +4.0 pp is the biggest riser
    expect(summary.topFallers[0]!.teamId).toBe("england"); // -5.0 pp is the biggest faller
  });

  it("frames movement by checkpoint interval, not the single match", () => {
    expect(summary.interval).toEqual({ beforeLabel: "Group stage complete", afterLabel: "Current projection" });
    expect(summary.headline).toContain("Forecast movement since Group stage complete");
    expect(summary.hasMeaningfulMovement).toBe(true);
  });

  it("builds canonical bracket + team deep-links", () => {
    const hrefs = summary.bracketLinks.map((l) => l.href);
    expect(hrefs).toContain("/bracket?match=79");
    expect(hrefs).toContain("/teams/mexico");
    expect(hrefs).toContain("/teams/england");
  });
});

describe("match-impact: fallback + CTA gating", () => {
  it("falls back to the neutral 'unavailable' line when no checkpoint pair exists", () => {
    const s = buildMatchImpactSummary({
      row: mkRow({ stage: "group", matchNumber: 300, actual: { goalsA: 1, goalsB: 1 } }),
      teams: TEAMS,
      interval: null,
    });
    expect(s.fallbackReason).toBe("Impact data is unavailable for this checkpoint.");
    expect(s.hasMeaningfulMovement).toBe(false);
  });

  it("uses the neutral 'did not materially move' line when a pair exists but nothing moved", () => {
    const flat = buildMatchImpactIntervals([S72], mkSnap("flat", 79, { argentina: 0.2, brazil: 0.15, mexico: 0.1, england: 0.08, spain: 0.05 }, { supported: 80 }));
    const s = buildMatchImpactSummary({
      row: mkRow({ stage: "group", matchNumber: 79, teamA: "brazil", teamB: "spain", actual: { goalsA: 1, goalsB: 1 } }),
      teams: TEAMS,
      interval: findIntervalForMatch(flat, 79),
    });
    expect(s.statusEvents).toEqual([]);
    expect(s.hasMeaningfulMovement).toBe(false);
    expect(s.fallbackReason).toBe("This result changed the tournament state, but did not materially move the title race.");
  });

  it("shows the CTA only for a completed match with a status event or meaningful movement", () => {
    const knockout = buildMatchImpactSummary({ row: mkRow({ actual: { goalsA: 2, goalsB: 1, winner: "mexico" } }), teams: TEAMS, interval: INTERVAL79 });
    expect(shouldShowMatchImpactCta(mkRow({ actual: { goalsA: 2, goalsB: 1, winner: "mexico" } }), knockout)).toBe(true);

    // Scheduled match: never.
    const scheduled = mkRow({ status: "scheduled", actual: undefined });
    expect(shouldShowMatchImpactCta(scheduled, buildMatchImpactSummary({ row: scheduled, teams: TEAMS, interval: null }))).toBe(false);

    // Completed but only "unavailable" would show: hide the CTA.
    const emptyRow = mkRow({ stage: "group", matchNumber: 300, teamA: "brazil", teamB: "spain", actual: { goalsA: 0, goalsB: 0 } });
    const empty = buildMatchImpactSummary({ row: emptyRow, teams: TEAMS, interval: null });
    expect(shouldShowMatchImpactCta(emptyRow, empty)).toBe(false);
  });
});
