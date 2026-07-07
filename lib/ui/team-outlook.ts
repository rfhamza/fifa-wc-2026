/**
 * Team Outlook Storytelling (UX-6B) — pure selectors.
 * ---------------------------------------------------
 * Consolidates data ALREADY loaded by the team trajectory surface into one compact
 * outlook story with a plain-language narrative: what actually happened to this team
 * (advanced / eliminated / a notable latest result), its current status and title /
 * reach-stage chances, the single biggest forecast-movement interval, and a soft
 * "route from here".
 *
 * Story priority (most meaningful first): a decisive knockout result (advanced /
 * eliminated) > confirmed group qualification > a notable latest result > forecast
 * movement > neutral. Probability movement is mentioned only AFTER the factual
 * tournament story.
 *
 * Honesty: elimination/advancement come only from canonical internal state — a lost or
 * won knockout match from live-state, or `deriveTeamHeroStatus` (live-state group
 * qualification) — never from a 0% probability. Movement is checkpoint-INTERVAL framed
 * (never causal). The narrative is built from data-driven templates (no hardcoded
 * team-specific stories) and names no future opponents. PURE: no React, no I/O, no
 * simulation, no snapshot regeneration, no forecast-delta or bracket-logic change.
 */
import { serializeBracketSearchParams } from "@/lib/ui/bracket-url-state";
import { movementStageLabel, type MovementStage } from "@/lib/ui/forecast-movement";
import { round } from "@/lib/utils";
import {
  teamHeroStatusLabel,
  type TeamHeroModel,
  type TeamHeroStatus,
  type TeamMatchContext,
  type TeamMatchHistoryRow,
  type TeamTrajectoryModel,
  type TrajectoryStage,
} from "@/lib/ui/team-trajectory";
import type { LiveViewQualification } from "@/lib/live-client/public-safe-view.client";

/** Movement at or below this many percentage points is "unchanged" (matches /movement). */
const OUTLOOK_NEUTRAL_PP = 0.05;
const TRAJECTORY_UNAVAILABLE = "Trajectory data is unavailable for this checkpoint.";
const ROUTE_UNRESOLVED = "Route will update when the bracket position is resolved.";
const ROUTE_UPDATES_IN_BRACKET = "The route updates in the bracket view.";
/** Compact secondary reach stages shown under the headline outlook. */
const REACH_STAGES: readonly MovementStage[] = ["final", "semiFinal", "quarterFinal"];
/**
 * WC2026 co-host nations, by team id — a public tournament fact (not a team-specific
 * story). Used only to optionally add a neutral "host nation" phrase when a completed
 * match's opponent is a co-host. No venue/stadium is claimed (not in the client data).
 */
const HOST_NATION_TEAM_IDS: ReadonlySet<string> = new Set(["usa", "canada", "mexico"]);

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

/** The most recent adjacent public-checkpoint interval (last pair), regardless of band. Pure. */
function getLatestMovementInterval(
  model: TeamTrajectoryModel,
  stage: TrajectoryStage = "winner",
): TeamKeyMovementInterval | null {
  const pts = model.points;
  if (pts.length < 2) return null;
  const from = pts[pts.length - 2]!;
  const to = pts[pts.length - 1]!;
  const deltaPp = round((to.stages[stage] - from.stages[stage]) * 100, 1);
  return { fromLabel: from.label, toLabel: to.label, deltaPp, direction: deltaPp >= 0 ? "up" : "down" };
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

/**
 * Story categories, most meaningful first. The primary narrative leads with the highest
 * category that the loaded data can support honestly.
 */
export type TeamOutlookStoryType =
  | "eliminated"
  | "advanced"
  | "qualified"
  | "latest-result"
  | "movement"
  | "neutral";

/** A team-oriented view of the latest completed match, joined from live-state + history. */
export interface TeamOutlookMatch {
  matchNumber: number;
  opponentId: string | null;
  opponentName: string | null;
  stageLabel: string | null;
  isKnockout: boolean;
  /** Team-oriented score line, e.g. "3–2" (team first); null when no goals are known. */
  score: string | null;
  /** true = win, false = defeat, null = draw / undecided (canonical from live-state). */
  won: boolean | null;
  /** true when the opponent is a WC2026 co-host nation. */
  opponentIsHost: boolean;
}

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
  /** Storytelling (UX-6B follow-up): personalized, data-driven summary. */
  storyType: TeamOutlookStoryType;
  primaryNarrative: string;
  supportingNarrative: string | null;
  latestTeamMatch: TeamOutlookMatch | null;
  opponentContext: string | null;
  scorelineContext: string | null;
  stageContext: string | null;
  routeContext: string | null;
  movementContext: string | null;
}

/** Parse a "3–2"-style team-oriented score into integers + derived shape. Pure. */
function parseScoreParts(
  score: string | null,
): { team: number; opp: number; total: number; margin: number } | null {
  if (!score) return null;
  const m = score.match(/(\d+)\D+(\d+)/);
  if (!m) return null;
  const team = Number(m[1]);
  const opp = Number(m[2]);
  return { team, opp, total: team + opp, margin: Math.abs(team - opp) };
}

/** Join the latest completed match (live-state) with its history row (stage + opponent name). */
function describeLatestMatch(
  context: TeamMatchContext | null,
  matchHistory: readonly TeamMatchHistoryRow[],
): TeamOutlookMatch | null {
  const lc = context?.lastCompleted ?? null;
  if (!lc) return null;
  const row = matchHistory.find((r) => r.matchNumber === lc.matchNumber) ?? null;
  return {
    matchNumber: lc.matchNumber,
    opponentId: lc.opponentId,
    opponentName: row?.opponent?.name ?? null,
    stageLabel: row?.stageLabel ?? null,
    isKnockout: row?.isKnockout ?? false,
    score: lc.score,
    won: lc.won,
    opponentIsHost: lc.opponentId != null && HOST_NATION_TEAM_IDS.has(lc.opponentId),
  };
}

/** Opponent phrase with an optional neutral host-nation prefix; null when unnamed. */
function opponentDescriptor(match: TeamOutlookMatch): string | null {
  if (!match.opponentName) return null;
  return match.opponentIsHost ? `host nation ${match.opponentName}` : match.opponentName;
}

interface NarrativeInput {
  subject: string;
  status: TeamHeroStatus;
  qualification: LiveViewQualification | null;
  match: TeamOutlookMatch | null;
  latestInterval: TeamKeyMovementInterval | null;
  routeState: TeamOutlookRouteState;
  nextMatchNumber: number | null;
}

interface NarrativeResult {
  storyType: TeamOutlookStoryType;
  primaryNarrative: string;
  supportingNarrative: string | null;
  opponentContext: string | null;
  scorelineContext: string | null;
  stageContext: string | null;
  movementContext: string | null;
  routeContext: string | null;
}

/**
 * The story-priority helper: pick the most meaningful category the data supports and
 * phrase it with a neutral, non-causal, data-driven template. Pure.
 */
function buildTeamStoryNarrative(input: NarrativeInput): NarrativeResult {
  const { subject, status, qualification, match, latestInterval, routeState, nextMatchNumber } = input;

  const opp = match ? opponentDescriptor(match) : null;
  const oppOver = opp ? ` over ${opp}` : "";
  const oppTo = opp ? ` to ${opp}` : "";
  const oppWith = opp ? ` with ${opp}` : "";
  const parts = parseScoreParts(match?.score ?? null);
  const stageSuffix = match?.stageLabel ? ` in the ${match.stageLabel.toLowerCase()}` : "";

  const lostKnockout = !!(match?.isKnockout && match.won === false);
  const wonKnockout = !!(match?.isKnockout && match.won === true);

  // Route (soft, non-causal) and forecast-movement supporting lines.
  const routeContext =
    routeState === "eliminated"
      ? null
      : routeState === "in-progress" && nextMatchNumber != null
        ? `A match is in progress: Match ${nextMatchNumber}.`
        : routeState === "next" && nextMatchNumber != null
          ? `Next match: Match ${nextMatchNumber}.`
          : ROUTE_UPDATES_IN_BRACKET;

  const movementMeaningful =
    latestInterval != null && Math.abs(latestInterval.deltaPp) > OUTLOOK_NEUTRAL_PP;
  const movementContext = movementMeaningful
    ? `Across the latest forecast interval, title chance moved ${latestInterval!.direction} by ` +
      `${Math.abs(latestInterval!.deltaPp).toFixed(1)} percentage points.`
    : null;

  const opponentContext = opp;
  const scorelineContext = match?.score ?? null;
  const stageContext = match?.stageLabel ?? null;

  let storyType: TeamOutlookStoryType;
  let primaryNarrative: string;
  let supportingNarrative: string | null;

  if (lostKnockout) {
    // Priority 1 — knockout elimination (canonical: a lost knockout match).
    storyType = "eliminated";
    const narrow = parts && parts.margin === 1 ? "narrow " : "";
    const scoreWord = parts && parts.margin >= 1 && match!.score ? `${match!.score} ` : "";
    primaryNarrative =
      `${subject}'s tournament ended after a ${narrow}${scoreWord}knockout defeat${oppTo}. ` +
      `They are now out of the title race.`;
    supportingNarrative = null;
  } else if (wonKnockout) {
    // Priority 2 — knockout advancement (canonical: a won knockout match).
    storyType = "advanced";
    const tight = parts && parts.margin === 1 ? "tight " : "";
    const scoreWord = parts && parts.margin >= 1 && match!.score ? `${match!.score} ` : "";
    primaryNarrative = `${subject} advanced after a ${tight}${scoreWord}knockout win${oppOver}.`;
    supportingNarrative = routeContext;
  } else if (status === "eliminated") {
    // Priority 1 — group-stage elimination (canonical live-state qualification).
    storyType = "eliminated";
    primaryNarrative = `${subject} did not advance from the group stage and is out of the title race.`;
    supportingNarrative = null;
  } else if (qualification === "qualified") {
    // Priority 3 — confirmed group qualification, no knockout result yet.
    storyType = "qualified";
    primaryNarrative = `${subject} came through the group stage; the outlook now covers their knockout route.`;
    supportingNarrative = movementContext ?? routeContext;
  } else if (match && match.score) {
    // Priority 4 — a notable latest result (factual, non-decisive).
    storyType = "latest-result";
    if (match.won === null) {
      const adj = parts && parts.total >= 5 ? "high-scoring " : "";
      primaryNarrative = `${subject}'s latest result was a ${adj}${match.score} draw${oppWith}${stageSuffix}.`;
    } else if (match.won) {
      const adj =
        parts && parts.opp === 0
          ? "clean-sheet "
          : parts && parts.total >= 5
            ? "high-scoring "
            : parts && parts.margin === 1
              ? "narrow "
              : "";
      primaryNarrative = `${subject}'s latest result was a ${adj}${match.score} win${oppOver}${stageSuffix}.`;
    } else {
      const adj =
        parts && parts.margin === 1 ? "narrow " : parts && parts.total >= 5 ? "high-scoring " : "";
      primaryNarrative = `${subject}'s latest result was a ${adj}${match.score} defeat${oppTo}${stageSuffix}.`;
    }
    supportingNarrative = movementContext ?? routeContext;
  } else if (movementMeaningful) {
    // Priority 6 — forecast movement (interval-framed), no factual result to lead with.
    storyType = "movement";
    primaryNarrative =
      `Across the latest forecast interval, ${subject}'s title chance moved ${latestInterval!.direction} by ` +
      `${Math.abs(latestInterval!.deltaPp).toFixed(1)} percentage points.`;
    supportingNarrative = routeContext;
  } else {
    // Neutral fallback — steady, or not enough checkpoints.
    storyType = "neutral";
    primaryNarrative = `${subject}'s tournament outlook is mostly stable across the latest forecast checkpoint.`;
    supportingNarrative = routeContext;
  }

  return {
    storyType,
    primaryNarrative,
    supportingNarrative,
    opponentContext,
    scorelineContext,
    stageContext,
    movementContext,
    routeContext,
  };
}

/**
 * Build the compact team outlook story from data the surface already holds. Pure.
 * `status` is the surface's `deriveTeamHeroStatus` result; `context` is
 * `deriveTeamMatchContext` (or null while live-state loads); `matchHistory` supplies the
 * opponent name + stage for the latest completed match; `qualification` is the team's own
 * live-state group qualification (or null). `teamName` labels the narrative subject.
 */
export function buildTeamOutlookStory(input: {
  teamId: string;
  teamName?: string;
  hero: TeamHeroModel;
  model: TeamTrajectoryModel;
  status: TeamHeroStatus;
  context: TeamMatchContext | null;
  matchHistory?: readonly TeamMatchHistoryRow[];
  qualification?: LiveViewQualification | null;
}): TeamOutlookStory {
  const {
    teamId,
    teamName,
    hero,
    model,
    status,
    context,
    matchHistory = [],
    qualification = null,
  } = input;
  const last = model.points.at(-1) ?? null;

  const reachStages: TeamOutlookReachStage[] = last
    ? REACH_STAGES.map((s) => ({ stage: s, label: movementStageLabel(s), probability: last.stages[s] }))
    : [];

  const biggestMovementInterval = getTeamKeyMovementInterval(model, "winner");
  const latestInterval = getLatestMovementInterval(model, "winner");
  const fallbackReason = model.points.length < 2 ? TRAJECTORY_UNAVAILABLE : null;

  const latestTeamMatch = describeLatestMatch(context, matchHistory);
  // A lost knockout match is canonical internal elimination even when group-stage
  // qualification (the only signal `status` carries) still reads "active".
  const lostKnockout = !!(latestTeamMatch?.isKnockout && latestTeamMatch.won === false);

  // Route from here — soft, non-causal; never invents an opponent.
  const bracketLink = `/bracket?${serializeBracketSearchParams({ teamId, matchNumber: null }).toString()}`;
  const relevantMatchLinks: TeamOutlookLink[] = [{ label: "Trace path in bracket", href: bracketLink }];

  let routeState: TeamOutlookRouteState;
  let routeSummary: string;
  let nextMatchNumber: number | null = null;
  if (status === "eliminated" || lostKnockout) {
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

  const narrative = buildTeamStoryNarrative({
    subject: teamName ?? teamId,
    status,
    qualification,
    match: latestTeamMatch,
    latestInterval,
    routeState,
    nextMatchNumber,
  });

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
    storyType: narrative.storyType,
    primaryNarrative: narrative.primaryNarrative,
    supportingNarrative: narrative.supportingNarrative,
    latestTeamMatch,
    opponentContext: narrative.opponentContext,
    scorelineContext: narrative.scorelineContext,
    stageContext: narrative.stageContext,
    routeContext: narrative.routeContext,
    movementContext: narrative.movementContext,
  };
}
