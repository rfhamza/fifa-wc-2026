import { describe, expect, it } from "vitest";
import {
  buildTeamOutlookStory,
  getTeamKeyMovementInterval,
} from "@/lib/ui/team-outlook";
import {
  deriveTeamHeroStatus,
  type TeamHeroModel,
  type TeamMatchContext,
  type TeamTrajectoryModel,
  type TeamTrajectoryPoint,
  type TrajectoryStage,
} from "@/lib/ui/team-trajectory";

/**
 * Team Outlook Storytelling (UX-6B) selectors — pure. Synthetic model/hero/context; no
 * real snapshots, no simulation, no live-state fetch. Exact-value pins (like the sibling
 * team-trajectory tests). Verifies interval-framed movement, internal-state status (never
 * zero-probability), and the soft route/fallback copy.
 */
const stages = (winner: number, over: Partial<Record<TrajectoryStage, number>> = {}): Record<TrajectoryStage, number> => ({
  winner,
  final: winner,
  semiFinal: winner,
  quarterFinal: winner,
  roundOf16: winner,
  ...over,
});

function point(label: string, locked: number, winner: number, over: Partial<TeamTrajectoryPoint> = {}): TeamTrajectoryPoint {
  return {
    snapshotId: `s${locked}`,
    asOf: "2026-06-29",
    asOfLabel: null,
    completedMatchesLocked: locked,
    label,
    shortLabel: label.slice(0, 3),
    isBaseline: locked === 0,
    isLatest: false,
    pointSource: "committed",
    rank: null,
    stages: stages(winner),
    ...over,
  };
}

function model(points: TeamTrajectoryPoint[]): TeamTrajectoryModel {
  return { teamId: "mexico", points, hasEnoughHistory: points.length >= 2, hasGroupStageCheckpoint: true };
}

function hero(over: Partial<TeamHeroModel> = {}): TeamHeroModel {
  return {
    teamId: "mexico",
    currentTitleProbability: 0.14,
    baselineTitleProbability: 0.1,
    titleDeltaPp: 4,
    currentRank: 5,
    isZeroTitle: false,
    source: "blob",
    asOfLabel: null,
    ...over,
  };
}

const noMatch: TeamMatchContext = { inProgress: null, lastCompleted: null, nextScheduled: null };

const TRAJECTORY = model([
  point("Tournament start", 0, 0.1),
  point("Group matchday 1 complete", 24, 0.11),
  point("Group stage complete", 72, 0.2),
  point("Current projection", 79, 0.14, {
    pointSource: "live",
    isLatest: true,
    stages: stages(0.14, { final: 0.21, semiFinal: 0.3, quarterFinal: 0.45, roundOf16: 0.6 }),
  }),
]);

describe("getTeamKeyMovementInterval", () => {
  it("selects the adjacent interval with the largest title-chance movement", () => {
    // deltas: +1.0, +9.0, -6.0 pp -> biggest magnitude is MD1 -> Groups (+9.0).
    expect(getTeamKeyMovementInterval(TRAJECTORY, "winner")).toEqual({
      fromLabel: "Group matchday 1 complete",
      toLabel: "Group stage complete",
      deltaPp: 9,
      direction: "up",
    });
  });

  it("returns null when every interval is within the neutral band", () => {
    const flat = model([point("Tournament start", 0, 0.1), point("Group stage complete", 72, 0.1003)]);
    expect(getTeamKeyMovementInterval(flat, "winner")).toBeNull();
  });

  it("returns null with fewer than two points", () => {
    expect(getTeamKeyMovementInterval(model([point("Tournament start", 0, 0.1)]), "winner")).toBeNull();
  });
});

describe("buildTeamOutlookStory: probabilities + movement", () => {
  const story = buildTeamOutlookStory({ teamId: "mexico", hero: hero(), model: TRAJECTORY, status: "active", context: noMatch });

  it("reads current title from the hero and reach stages from the last point (compact)", () => {
    expect(story.titleProbability).toBe(0.14);
    expect(story.titleDeltaPp).toBe(4);
    expect(story.reachStages).toEqual([
      { stage: "final", label: "Reach final", probability: 0.21 },
      { stage: "semiFinal", label: "Reach semi-final", probability: 0.3 },
      { stage: "quarterFinal", label: "Reach quarter-final", probability: 0.45 },
    ]);
  });

  it("attaches the biggest movement interval, checkpoint-framed", () => {
    expect(story.biggestMovementInterval).toEqual({
      fromLabel: "Group matchday 1 complete",
      toLabel: "Group stage complete",
      deltaPp: 9,
      direction: "up",
    });
    expect(story.fallbackReason).toBeNull();
  });

  it("falls back to the neutral trajectory line with fewer than two checkpoints", () => {
    const s = buildTeamOutlookStory({
      teamId: "mexico",
      hero: hero({ currentTitleProbability: 0.1 }),
      model: model([point("Tournament start", 0, 0.1)]),
      status: "active",
      context: noMatch,
    });
    expect(s.fallbackReason).toBe("Trajectory data is unavailable for this checkpoint.");
    expect(s.biggestMovementInterval).toBeNull();
    expect(s.titleProbability).toBe(0.1); // current probabilities still shown
  });
});

describe("buildTeamOutlookStory: status uses internal state, never zero probability", () => {
  it("a 0% title team that is NOT live-eliminated shows '0% title chance', not 'Eliminated'", () => {
    const status = deriveTeamHeroStatus("mexico", /* isZeroTitle */ true, new Map([["mexico", "undecided"]]));
    const s = buildTeamOutlookStory({ teamId: "mexico", hero: hero({ isZeroTitle: true }), model: TRAJECTORY, status, context: noMatch });
    expect(s.currentStatus).toBe("zero-title");
    expect(s.currentStatusLabel).toBe("0% title chance");
    expect(s.routeState).not.toBe("eliminated");
  });

  it("labels 'Eliminated' only when live-state confirms elimination", () => {
    const status = deriveTeamHeroStatus("mexico", false, new Map([["mexico", "eliminated"]]));
    const s = buildTeamOutlookStory({ teamId: "mexico", hero: hero(), model: TRAJECTORY, status, context: noMatch });
    expect(s.currentStatus).toBe("eliminated");
    expect(s.currentStatusLabel).toBe("Eliminated");
    expect(s.routeState).toBe("eliminated");
    expect(s.routeSummary).toBe("Eliminated from the tournament.");
    expect(s.nextMatchNumber).toBeNull();
  });
});

describe("buildTeamOutlookStory: route from here + links", () => {
  it("uses the unresolved fallback when no next match is known", () => {
    const s = buildTeamOutlookStory({ teamId: "mexico", hero: hero(), model: TRAJECTORY, status: "active", context: noMatch });
    expect(s.routeState).toBe("unresolved");
    expect(s.routeSummary).toBe("Route will update when the bracket position is resolved.");
    expect(s.nextMatchNumber).toBeNull();
  });

  it("surfaces the next scheduled match without naming an opponent", () => {
    const context: TeamMatchContext = {
      inProgress: null,
      lastCompleted: null,
      nextScheduled: { matchNumber: 79, opponentId: "england", score: null, kickoff: null },
    };
    const s = buildTeamOutlookStory({ teamId: "mexico", hero: hero(), model: TRAJECTORY, status: "active", context });
    expect(s.routeState).toBe("next");
    expect(s.nextMatchNumber).toBe(79);
    expect(s.relevantMatchLinks).toContainEqual({ label: "View match", href: "/bracket?match=79" });
  });

  it("builds canonical bracket + team deep-links", () => {
    const s = buildTeamOutlookStory({ teamId: "mexico", hero: hero(), model: TRAJECTORY, status: "active", context: noMatch });
    expect(s.bracketLink).toBe("/bracket?team=mexico");
    expect(s.relevantMatchLinks[0]).toEqual({ label: "Trace path in bracket", href: "/bracket?team=mexico" });
  });
});
