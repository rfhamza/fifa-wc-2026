/**
 * Team Outlook Storytelling (UX-6B) — pure selectors.
 * ---------------------------------------------------
 * Consolidates data ALREADY loaded by the team trajectory surface into one compact
 * outlook story: current status (from canonical live-state), current title / reach-stage
 * chances, the single biggest forecast-movement interval, and a soft "route from here".
 *
 * Honesty: status comes only from `deriveTeamHeroStatus` (live-state qualification), never
 * from a 0% probability; probability movement is checkpoint-INTERVAL framed (never causal);
 * the route names no future opponents. PURE: no React, no I/O, no simulation, no snapshot
 * regeneration, no forecast-delta or bracket-logic change.
 */
import { serializeBracketSearchParams } from "@/lib/ui/bracket-url-state";
import { movementStageLabel, type MovementStage } from "@/lib/ui/forecast-movement";
import { round } from "@/lib/utils";
import {
  teamHeroStatusLabel,
  type TeamHeroModel,
  type TeamHeroStatus,
  type TeamMatchContext,
  type TeamTrajectoryModel,
  type TrajectoryStage,
} from "@/lib/ui/team-trajectory";

/** Movement at or below this many percentage points is "unchanged" (matches /movement). */
const OUTLOOK_NEUTRAL_PP = 0.05;
const TRAJECTORY_UNAVAILABLE = "Trajectory data is unavailable for this checkpoint.";
const ROUTE_UNRESOLVED = "Route will update when the bracket position is resolved.";
/** Compact secondary reach stages shown under the headline outlook. */
const REACH_STAGES: readonly MovementStage[] = ["final", "semiFinal", "quarterFinal"];

export interface TeamKeyMovementInterval {
  fromLabel: string;
  toLabel: string;
  deltaPp: number; // signed percentage points
  direction: "up" | "down";
}

/**
 * The single adjacent public-checkpoint interval with the largest title-chance movement
 * (magnitude), ignoring moves within the neutral band. Null when there is no such interval.
 * Computed directly from the model's public points (never a 54/73 dev interval). Pure.
 */
export function getTeamKeyMovementInterval(
  model: TeamTrajectoryModel,
  stage: TrajectoryStage = "winner",
): TeamKeyMovementInterval | null {
  const pts = model.points;
  let best: TeamKeyMovementInterval | null = null;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const from = pts[i]!;
    const to = pts[i + 1]!;
    const deltaPp = round((to.stages[stage] - from.stages[stage]) * 100, 1);
    if (Math.abs(deltaPp) <= OUTLOOK_NEUTRAL_PP) continue;
    if (!best || Math.abs(deltaPp) > Math.abs(best.deltaPp)) {
      best = { fromLabel: from.label, toLabel: to.label, deltaPp, direction: deltaPp >= 0 ? "up" : "down" };
    }
  }
  return best;
}

export interface TeamOutlookReachStage {
  stage: MovementStage;
  label: string;
  probability: number; // [0,1]
}
export interface TeamOutlookLink {
  label: string;
  href: string;
}
export type TeamOutlookRouteState = "eliminated" | "in-progress" | "next" | "unresolved";

export interface TeamOutlookStory {
  teamId: string;
  currentStatus: TeamHeroStatus;
  currentStatusLabel: string;
  titleProbability: number | null;
  titleDeltaPp: number | null;
  currentRank: number | null;
  reachStages: TeamOutlookReachStage[];
  biggestMovementInterval: TeamKeyMovementInterval | null;
  routeState: TeamOutlookRouteState;
  routeSummary: string;
  nextMatchNumber: number | null;
  bracketLink: string;
  relevantMatchLinks: TeamOutlookLink[];
  fallbackReason: string | null;
}

/**
 * Build the compact team outlook story from data the surface already holds. Pure.
 * `status` is the surface's `deriveTeamHeroStatus` result; `context` is
 * `deriveTeamMatchContext` (or null while live-state loads).
 */
export function buildTeamOutlookStory(input: {
  teamId: string;
  hero: TeamHeroModel;
  model: TeamTrajectoryModel;
  status: TeamHeroStatus;
  context: TeamMatchContext | null;
}): TeamOutlookStory {
  const { teamId, hero, model, status, context } = input;
  const last = model.points.at(-1) ?? null;

  const reachStages: TeamOutlookReachStage[] = last
    ? REACH_STAGES.map((s) => ({ stage: s, label: movementStageLabel(s), probability: last.stages[s] }))
    : [];

  const biggestMovementInterval = getTeamKeyMovementInterval(model, "winner");
  const fallbackReason = model.points.length < 2 ? TRAJECTORY_UNAVAILABLE : null;

  // Route from here — soft, non-causal; never invents an opponent.
  const bracketLink = `/bracket?${serializeBracketSearchParams({ teamId, matchNumber: null }).toString()}`;
  const relevantMatchLinks: TeamOutlookLink[] = [{ label: "Trace path in bracket", href: bracketLink }];

  let routeState: TeamOutlookRouteState;
  let routeSummary: string;
  let nextMatchNumber: number | null = null;
  if (status === "eliminated") {
    routeState = "eliminated";
    routeSummary = "Eliminated from the tournament.";
  } else if (context?.inProgress) {
    routeState = "in-progress";
    routeSummary = "A match is in progress.";
    nextMatchNumber = context.inProgress.matchNumber;
  } else if (context?.nextScheduled) {
    routeState = "next";
    routeSummary = "Next match ahead.";
    nextMatchNumber = context.nextScheduled.matchNumber;
  } else {
    routeState = "unresolved";
    routeSummary = ROUTE_UNRESOLVED;
  }
  if (nextMatchNumber != null) {
    relevantMatchLinks.push({
      label: "View match",
      href: `/bracket?${serializeBracketSearchParams({ teamId: null, matchNumber: nextMatchNumber }).toString()}`,
    });
  }

  return {
    teamId,
    currentStatus: status,
    currentStatusLabel: teamHeroStatusLabel(status),
    titleProbability: hero.currentTitleProbability ?? (last ? last.stages.winner : null),
    titleDeltaPp: hero.titleDeltaPp,
    currentRank: hero.currentRank,
    reachStages,
    biggestMovementInterval,
    routeState,
    routeSummary,
    nextMatchNumber,
    bracketLink,
    relevantMatchLinks,
    fallbackReason,
  };
}
