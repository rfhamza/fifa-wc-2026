import { describe, expect, it } from "vitest";
import {
  buildTeamOutlookStory,
  classifyMatchupResult,
  getTeamKeyMovementInterval,
  type TeamStrength,
} from "@/lib/ui/team-outlook";
import {
  deriveTeamHeroStatus,
  type TeamHeroModel,
  type TeamMatchContext,
  type TeamMatchHistoryRow,
  type TeamTrajectoryModel,
  type TeamTrajectoryPoint,
  type TrajectoryStage,
} from "@/lib/ui/team-trajectory";
import type { TeamLite } from "@/lib/live-client/public-safe-view.client";

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

/* ----------------------------------------------------------------------------
 * Personalized storytelling (UX-6B follow-up). Synthetic live-state result + history
 * rows; the narrative is data-driven (no hardcoded team stories), leads with the most
 * meaningful factual tournament event, and mentions probability movement only after it.
 * -------------------------------------------------------------------------- */
function teamLite(id: string, name: string): TeamLite {
  return { id, name, flag: "", countryCode: id.toUpperCase().slice(0, 3) };
}

function historyRow(over: Partial<TeamMatchHistoryRow> & { matchNumber: number }): TeamMatchHistoryRow {
  return {
    matchNumber: over.matchNumber,
    stageLabel: over.stageLabel ?? "Group stage",
    isKnockout: over.isKnockout ?? false,
    opponent: over.opponent ?? null,
    provenanceLabel: over.provenanceLabel ?? "No pre-match forecast captured",
    hasForecast: over.hasForecast ?? false,
    teamWin: over.teamWin ?? null,
    draw: over.draw ?? null,
    teamLoss: over.teamLoss ?? null,
    teamAdvance: over.teamAdvance ?? null,
  };
}

function completedContext(
  matchNumber: number,
  opponentId: string | null,
  score: string | null,
  won: boolean | null,
  next?: { matchNumber: number; opponentId: string | null },
): TeamMatchContext {
  return {
    inProgress: null,
    lastCompleted: { matchNumber, opponentId, score, won },
    nextScheduled: next ? { matchNumber: next.matchNumber, opponentId: next.opponentId, score: null, kickoff: null } : null,
  };
}

describe("buildTeamOutlookStory: story priority leads with the tournament event", () => {
  it("an eliminated team leads with elimination, naming opponent + scoreline + stage", () => {
    const s = buildTeamOutlookStory({
      teamId: "brazil",
      teamName: "Brazil",
      hero: hero({ teamId: "brazil" }),
      model: TRAJECTORY,
      status: "active", // group qualification still reads active; the knockout loss is canonical
      qualification: "qualified",
      context: completedContext(90, "norway", "2–3", false),
      matchHistory: [historyRow({ matchNumber: 90, stageLabel: "Round of 16", isKnockout: true, opponent: teamLite("norway", "Norway") })],
    });
    expect(s.storyType).toBe("eliminated");
    expect(s.primaryNarrative).toBe(
      "Brazil's tournament ended after a narrow 2–3 knockout defeat to Norway. They are now out of the title race.",
    );
    expect(s.supportingNarrative).toBeNull();
    // A lost knockout resolves the route to eliminated even though `status` is group-only.
    expect(s.routeState).toBe("eliminated");
    expect(s.nextMatchNumber).toBeNull();
    expect(s.latestTeamMatch).toEqual({
      matchNumber: 90,
      opponentId: "norway",
      opponentName: "Norway",
      stageLabel: "Round of 16",
      isKnockout: true,
      score: "2–3",
      won: false,
      opponentIsHost: false,
    });
  });

  it("a knockout winner leads with advancement, including scoreline, host context, and the next match", () => {
    const s = buildTeamOutlookStory({
      teamId: "england",
      teamName: "England",
      hero: hero({ teamId: "england" }),
      model: TRAJECTORY,
      status: "active",
      context: completedContext(79, "mexico", "3–2", true, { matchNumber: 84, opponentId: "france" }),
      matchHistory: [historyRow({ matchNumber: 79, stageLabel: "Quarter-final", isKnockout: true, opponent: teamLite("mexico", "Mexico") })],
    });
    expect(s.storyType).toBe("advanced");
    // "host nation Mexico" because the opponent is a WC2026 co-host; NO stadium/venue is claimed.
    expect(s.primaryNarrative).toBe("England advanced after a tight 3–2 knockout win over host nation Mexico.");
    expect(s.supportingNarrative).toBe("Next match: Match 84.");
    expect(s.opponentContext).toBe("host nation Mexico");
    expect(s.scorelineContext).toBe("3–2");
    expect(s.stageContext).toBe("Quarter-final");
    expect(s.relevantMatchLinks).toContainEqual({ label: "View match", href: "/bracket?match=84" });
  });

  it("adds host-nation context only for co-host opponents and never a venue/stadium", () => {
    const base = {
      teamId: "germany",
      teamName: "Germany",
      hero: hero({ teamId: "germany" }),
      model: TRAJECTORY,
      status: "active" as const,
    };
    const host = buildTeamOutlookStory({
      ...base,
      context: completedContext(80, "canada", "1–0", true),
      matchHistory: [historyRow({ matchNumber: 80, stageLabel: "Round of 16", isKnockout: true, opponent: teamLite("canada", "Canada") })],
    });
    const nonHost = buildTeamOutlookStory({
      ...base,
      context: completedContext(80, "france", "1–0", true),
      matchHistory: [historyRow({ matchNumber: 80, stageLabel: "Round of 16", isKnockout: true, opponent: teamLite("france", "France") })],
    });
    expect(host.opponentContext).toBe("host nation Canada");
    expect(nonHost.opponentContext).toBe("France");
    expect(nonHost.primaryNarrative).not.toContain("host nation");
    for (const s of [host, nonHost]) {
      const copy = `${s.primaryNarrative} ${s.supportingNarrative ?? ""}`.toLowerCase();
      expect(copy).not.toContain("stadium");
      expect(copy).not.toContain("venue");
      expect(copy).not.toContain("estadio");
    }
  });

  it("a non-decisive latest result is described factually with opponent, scoreline, and stage", () => {
    const s = buildTeamOutlookStory({
      teamId: "england",
      teamName: "England",
      hero: hero({ teamId: "england" }),
      model: TRAJECTORY,
      status: "active",
      qualification: "undecided",
      context: completedContext(40, "japan", "2–2", null),
      matchHistory: [historyRow({ matchNumber: 40, stageLabel: "Group stage", isKnockout: false, opponent: teamLite("japan", "Japan") })],
    });
    expect(s.storyType).toBe("latest-result");
    expect(s.primaryNarrative).toBe("England's latest result was a 2–2 draw with Japan in the group stage.");
  });

  it("skips higher/lower-rated opponent phrasing in the MVP (opponent strength not client-safe)", () => {
    const s = buildTeamOutlookStory({
      teamId: "england",
      teamName: "England",
      hero: hero({ teamId: "england" }),
      model: TRAJECTORY,
      status: "active",
      context: completedContext(79, "mexico", "3–2", true),
      matchHistory: [historyRow({ matchNumber: 79, stageLabel: "Quarter-final", isKnockout: true, opponent: teamLite("mexico", "Mexico") })],
    });
    const copy = `${s.primaryNarrative} ${s.supportingNarrative ?? ""}`;
    expect(copy).not.toMatch(/rated/i);
    expect(copy).not.toMatch(/stronger|weaker|small team/i);
  });

  it("never labels 0% title chance as eliminated (status stays internal-state-only)", () => {
    const status = deriveTeamHeroStatus("mexico", /* isZeroTitle */ true, new Map([["mexico", "undecided"]]));
    const s = buildTeamOutlookStory({
      teamId: "mexico",
      teamName: "Mexico",
      hero: hero({ isZeroTitle: true }),
      model: TRAJECTORY,
      status,
      context: noMatch,
    });
    expect(s.currentStatus).toBe("zero-title");
    expect(s.currentStatusLabel).toBe("0% title chance");
    expect(s.storyType).not.toBe("eliminated");
    expect(s.primaryNarrative).not.toContain("tournament ended");
    expect(s.primaryNarrative).not.toContain("out of the title race");
    expect(s.latestTeamMatch).toBeNull();
  });

  it("falls back to interval-framed forecast movement when there is no decisive result", () => {
    // Latest interval on TRAJECTORY: group stage complete (0.20) -> current projection (0.14) = -6.0 pp.
    const s = buildTeamOutlookStory({
      teamId: "england",
      teamName: "England",
      hero: hero({ teamId: "england" }),
      model: TRAJECTORY,
      status: "active",
      qualification: "undecided",
      context: noMatch,
    });
    expect(s.storyType).toBe("movement");
    expect(s.primaryNarrative).toBe(
      "Across the latest forecast interval, England's title chance moved down by 6.0 percentage points.",
    );
    // Interval-framed: no single-match causal wording.
    expect(s.primaryNarrative).toContain("latest forecast interval");
  });

  it("uses the neutral fallback with fewer than two checkpoints", () => {
    const s = buildTeamOutlookStory({
      teamId: "england",
      teamName: "England",
      hero: hero({ teamId: "england", currentTitleProbability: 0.1 }),
      model: model([point("Tournament start", 0, 0.1)]),
      status: "active",
      context: noMatch,
    });
    expect(s.storyType).toBe("neutral");
    expect(s.primaryNarrative).toBe(
      "England's tournament outlook is mostly stable across the latest forecast checkpoint.",
    );
    expect(s.fallbackReason).toBe("Trajectory data is unavailable for this checkpoint.");
  });

  it("suppresses the scoreline for a level-score (penalties/extra-time) knockout win", () => {
    // Regulation level score with a canonical winner -> decided beyond 90'; the "3–2"-style
    // scoreline would misread, so advancement is stated without it and without "tight".
    const s = buildTeamOutlookStory({
      teamId: "spain",
      teamName: "Spain",
      hero: hero({ teamId: "spain" }),
      model: TRAJECTORY,
      status: "active",
      context: completedContext(82, "italy", "1–1", true),
      matchHistory: [historyRow({ matchNumber: 82, stageLabel: "Semi-final", isKnockout: true, opponent: teamLite("italy", "Italy") })],
    });
    expect(s.storyType).toBe("advanced");
    expect(s.primaryNarrative).toBe("Spain advanced after a knockout win over Italy.");
    expect(s.primaryNarrative).not.toContain("1–1");
    expect(s.primaryNarrative).not.toContain("tight");
  });

  it("degrades to a factual latest result when a knockout row is missing (no stage/opponent known)", () => {
    // No matchHistory row for the completed match -> isKnockout is unknown (false); rather
    // than mislabel advancement, it states the result factually with no opponent/stage.
    const s = buildTeamOutlookStory({
      teamId: "portugal",
      teamName: "Portugal",
      hero: hero({ teamId: "portugal" }),
      model: TRAJECTORY,
      status: "active",
      context: completedContext(83, "wales", "2–1", true),
      matchHistory: [],
    });
    expect(s.storyType).toBe("latest-result");
    expect(s.primaryNarrative).toBe("Portugal's latest result was a narrow 2–1 win.");
    expect(s.latestTeamMatch?.isKnockout).toBe(false);
    expect(s.latestTeamMatch?.opponentName).toBeNull();
  });

  it("is data-driven: the same advancement template renders for any team/opponent", () => {
    const s = buildTeamOutlookStory({
      teamId: "argentina",
      teamName: "Argentina",
      hero: hero({ teamId: "argentina" }),
      model: TRAJECTORY,
      status: "active",
      context: completedContext(81, "croatia", "1–0", true),
      matchHistory: [historyRow({ matchNumber: 81, stageLabel: "Quarter-final", isKnockout: true, opponent: teamLite("croatia", "Croatia") })],
    });
    expect(s.storyType).toBe("advanced");
    expect(s.primaryNarrative).toBe("Argentina advanced after a tight 1–0 knockout win over Croatia.");
    expect(s.primaryNarrative).not.toContain("host nation"); // Croatia is not a co-host
  });
});

/* ----------------------------------------------------------------------------
 * Upset / strength context (UX-6B refinement). Synthetic public strength inputs
 * (FIFA rank, Elo rating/rank, squad quality); conservative thresholds. No team names
 * are hardcoded in the selector — the templates render from data.
 * -------------------------------------------------------------------------- */
function strength(over: Partial<TeamStrength> = {}): TeamStrength {
  return { fifaRank: 18, eloRating: 1850, eloRank: 18, squadQuality: 75, ...over };
}
const STRONG = strength({ fifaRank: 3, eloRating: 2050, eloRank: 2, squadQuality: 88 });
const WEAK = strength({ fifaRank: 25, eloRating: 1830, eloRank: 22, squadQuality: 70 });

describe("classifyMatchupResult", () => {
  it("flags an upset when the materially weaker side wins", () => {
    const c = classifyMatchupResult(WEAK, STRONG, /* won */ true);
    expect(c.verdict).toBe("upset");
    expect(c.teamWasStronger).toBe(false);
    expect(c.opponentDescriptor).toBe("higher-rated");
    expect(c.signalsAvailable).toBe(3);
  });

  it("flags an upset (major exit) when the materially stronger side loses", () => {
    const c = classifyMatchupResult(STRONG, WEAK, /* won */ false);
    expect(c.verdict).toBe("upset");
    expect(c.teamWasStronger).toBe(true);
    expect(c.opponentDescriptor).toBe("lower-ranked");
  });

  it("is 'expected' when the stronger side wins", () => {
    expect(classifyMatchupResult(STRONG, WEAK, true).verdict).toBe("expected");
  });

  it("is 'even' when no material strength gap exists", () => {
    const a = strength({ fifaRank: 8, eloRating: 1950, eloRank: 8, squadQuality: 80 });
    const b = strength({ fifaRank: 12, eloRating: 1935, eloRank: 11, squadQuality: 77 });
    const c = classifyMatchupResult(a, b, true);
    expect(c.verdict).toBe("even");
    expect(c.teamWasStronger).toBeNull();
  });

  it("is 'unknown' when strength inputs are missing", () => {
    expect(classifyMatchupResult(null, STRONG, true).verdict).toBe("unknown");
    const noData: TeamStrength = { fifaRank: null, eloRating: null, eloRank: null, squadQuality: null };
    expect(classifyMatchupResult(noData, noData, true).verdict).toBe("unknown");
  });

  it("requires a strong single signal when only one is available", () => {
    const wOne: TeamStrength = { fifaRank: 30, eloRating: null, eloRank: null, squadQuality: null };
    const sOne: TeamStrength = { fifaRank: 8, eloRating: null, eloRank: null, squadQuality: null };
    // Gap 22 (>= 18) is a strong single signal -> upset stands.
    expect(classifyMatchupResult(wOne, sOne, true).verdict).toBe("upset");
    // Gap 12 (>= 10 but < 18) is not strong enough on its own -> not an upset.
    const wSoft: TeamStrength = { fifaRank: 20, eloRating: null, eloRank: null, squadQuality: null };
    expect(classifyMatchupResult(wSoft, sOne, true).verdict).toBe("even");
  });
});

describe("buildTeamOutlookStory: upset-aware knockout narratives", () => {
  it("leads with an upset headline when the underdog wins a knockout", () => {
    const s = buildTeamOutlookStory({
      teamId: "norway",
      teamName: "Norway",
      hero: hero({ teamId: "norway" }),
      model: TRAJECTORY,
      status: "active",
      context: completedContext(90, "brazil", "2–1", true, { matchNumber: 96, opponentId: "france" }),
      matchHistory: [historyRow({ matchNumber: 90, stageLabel: "Round of 16", isKnockout: true, opponent: teamLite("brazil", "Brazil") })],
      strengthById: { norway: WEAK, brazil: STRONG },
    });
    expect(s.storyType).toBe("upset-win");
    expect(s.primaryNarrative).toBe("Norway upset Brazil 2–1 in the Round of 16, advancing to the quarterfinals.");
    expect(s.supportingNarrative).toBe("Next match: Match 96.");
    expect(s.matchupContext?.verdict).toBe("upset");
    expect(s.matchupContext?.teamWasStronger).toBe(false);
  });

  it("leads with a major exit when a higher-rated team is eliminated by a lower-ranked side", () => {
    const s = buildTeamOutlookStory({
      teamId: "brazil",
      teamName: "Brazil",
      hero: hero({ teamId: "brazil" }),
      model: TRAJECTORY,
      status: "active", // group qualification reads active; the knockout loss is canonical
      qualification: "qualified",
      context: completedContext(90, "norway", "1–2", false),
      matchHistory: [historyRow({ matchNumber: 90, stageLabel: "Round of 16", isKnockout: true, opponent: teamLite("norway", "Norway") })],
      strengthById: { norway: WEAK, brazil: STRONG },
    });
    expect(s.storyType).toBe("major-exit");
    expect(s.primaryNarrative).toBe(
      "Brazil exited the World Cup in the Round of 16 after a 1–2 defeat to lower-ranked Norway. They are now out of the title race.",
    );
    expect(s.routeState).toBe("eliminated");
    expect(s.matchupContext?.verdict).toBe("upset");
    expect(s.matchupContext?.teamWasStronger).toBe(true);
    // Not eliminated merely because of a 0% title probability.
    expect(s.currentStatus).not.toBe("eliminated");
    expect(s.primaryNarrative).not.toContain("because");
  });

  it("stays neutral (no upset) for a host knockout win without a strength mismatch", () => {
    const s = buildTeamOutlookStory({
      teamId: "england",
      teamName: "England",
      hero: hero({ teamId: "england" }),
      model: TRAJECTORY,
      status: "active",
      context: completedContext(79, "mexico", "3–2", true, { matchNumber: 84, opponentId: "france" }),
      matchHistory: [historyRow({ matchNumber: 79, stageLabel: "Quarter-final", isKnockout: true, opponent: teamLite("mexico", "Mexico") })],
      strengthById: {
        england: strength({ fifaRank: 8, eloRating: 1950, eloRank: 8, squadQuality: 80 }),
        mexico: strength({ fifaRank: 12, eloRating: 1935, eloRank: 11, squadQuality: 77 }),
      },
    });
    expect(s.storyType).toBe("advanced");
    expect(s.primaryNarrative).toBe("England advanced after a tight 3–2 knockout win over host nation Mexico.");
    expect(s.primaryNarrative).not.toContain("upset");
    expect(s.primaryNarrative).not.toContain("morale");
    expect(s.matchupContext?.verdict).toBe("even");
  });

  it("adds higher-rated context when a team loses a knockout to a stronger side (not an upset)", () => {
    const s = buildTeamOutlookStory({
      teamId: "wales",
      teamName: "Wales",
      hero: hero({ teamId: "wales" }),
      model: TRAJECTORY,
      status: "active",
      context: completedContext(88, "france", "0–2", false),
      matchHistory: [historyRow({ matchNumber: 88, stageLabel: "Round of 16", isKnockout: true, opponent: teamLite("france", "France") })],
      strengthById: { wales: WEAK, france: STRONG },
    });
    expect(s.storyType).toBe("eliminated");
    expect(s.primaryNarrative).toBe(
      "Wales's tournament ended after a 0–2 knockout defeat to higher-rated France. They are now out of the title race.",
    );
    expect(s.matchupContext?.verdict).toBe("expected");
  });

  it("does not label a group-stage win an upset (upset detection is knockout-only)", () => {
    const s = buildTeamOutlookStory({
      teamId: "norway",
      teamName: "Norway",
      hero: hero({ teamId: "norway" }),
      model: TRAJECTORY,
      status: "active",
      qualification: "undecided",
      context: completedContext(20, "brazil", "1–0", true),
      matchHistory: [historyRow({ matchNumber: 20, stageLabel: "Group stage", isKnockout: false, opponent: teamLite("brazil", "Brazil") })],
      strengthById: { norway: WEAK, brazil: STRONG },
    });
    expect(s.storyType).toBe("latest-result");
    expect(s.primaryNarrative).toBe("Norway's latest result was a clean-sheet 1–0 win over Brazil in the group stage.");
    expect(s.primaryNarrative).not.toContain("upset");
  });
});
