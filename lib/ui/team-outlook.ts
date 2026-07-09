/**
 * Team Outlook Storytelling (UX-6B) — pure selectors.
 * ---------------------------------------------------
 * Consolidates data ALREADY loaded by the team trajectory surface into one compact
 * outlook story with a plain-language, upset-aware narrative: what actually happened to
 * this team (an upset win, a major exit, a routine advancement / elimination, or a
 * notable latest result), its current status and title / reach-stage chances, the single
 * biggest forecast-movement interval, and a soft "route from here".
 *
 * Story priority (most meaningful first): knockout upset / underdog advancement >
 * major-team elimination > routine knockout advancement / elimination > confirmed group
 * qualification > a notable latest result > forecast movement > neutral. Probability
 * movement is mentioned only AFTER the factual tournament story.
 *
 * Upset / strength context is derived from existing public team-strength inputs (FIFA
 * ranking, Elo rating/rank, squad quality) with conservative thresholds; when the signals
 * are unavailable or weak the copy stays neutral ("advanced after a 2–1 win").
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

/**
 * Public-facing knockout labels, keyed on the history row's `stageLabel` (from
 * match-centre). `inStage` reads mid-sentence ("in the {inStage}"); `nextRound` completes
 * "advancing to {nextRound}" for a win (null when there is no further round).
 */
const KNOCKOUT_STAGE_COPY: Record<string, { inStage: string; nextRound: string | null }> = {
  "Round of 32": { inStage: "Round of 32", nextRound: "the Round of 16" },
  "Round of 16": { inStage: "Round of 16", nextRound: "the quarterfinals" },
  "Quarter-final": { inStage: "quarterfinal", nextRound: "the semifinals" },
  "Semi-final": { inStage: "semifinal", nextRound: "the final" },
  "Third place": { inStage: "third-place match", nextRound: null },
  Final: { inStage: "final", nextRound: null },
};

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

/* ----------------------------------------------------------------------------
 * Matchup strength context — upset / mismatch detection from public inputs.
 * -------------------------------------------------------------------------- */

/** Public, already-surfaced team-strength inputs (lower rank = stronger; higher Elo/squad = stronger). */
export interface TeamStrength {
  fifaRank: number | null;
  eloRating: number | null;
  eloRank: number | null;
  squadQuality: number | null; // 0..100
}

export type MatchupVerdict = "upset" | "expected" | "even" | "unknown";

export interface TeamMatchupContext {
  verdict: MatchupVerdict;
  /** Was the viewed team the materially stronger side pre-match? null = no material gap. */
  teamWasStronger: boolean | null;
  /** Opponent relative to the viewed team, when material. */
  opponentDescriptor: "higher-rated" | "lower-ranked" | null;
  signalsAvailable: number;
}

type SignalDir = "weaker" | "stronger" | "neutral";
interface SignalEval {
  available: boolean;
  dir: SignalDir; // is `a` weaker / stronger than `b`?
  strong: boolean;
}

/** FIFA ranking: lower is stronger; `a` weaker when its rank number is materially higher. */
function fifaSignal(a: TeamStrength, b: TeamStrength): SignalEval {
  if (a.fifaRank == null || b.fifaRank == null) return { available: false, dir: "neutral", strong: false };
  const gap = a.fifaRank - b.fifaRank; // > 0 => a ranked worse (weaker)
  const dir: SignalDir = gap >= 10 ? "weaker" : gap <= -10 ? "stronger" : "neutral";
  return { available: true, dir, strong: Math.abs(gap) >= 18 };
}

/** Elo: satisfied by either a rank gap (>= 5 places) or a rating gap (>= 50 points). */
function eloSignal(a: TeamStrength, b: TeamStrength): SignalEval {
  const haveRank = a.eloRank != null && b.eloRank != null;
  const haveRating = a.eloRating != null && b.eloRating != null;
  if (!haveRank && !haveRating) return { available: false, dir: "neutral", strong: false };
  let weaker = false;
  let stronger = false;
  let strong = false;
  if (haveRank) {
    const g = a.eloRank! - b.eloRank!; // > 0 => a ranked worse
    if (g >= 5) weaker = true;
    if (g <= -5) stronger = true;
    if (Math.abs(g) >= 10) strong = true;
  }
  if (haveRating) {
    const d = a.eloRating! - b.eloRating!; // > 0 => a stronger
    if (d <= -50) weaker = true;
    if (d >= 50) stronger = true;
    if (Math.abs(d) >= 90) strong = true;
  }
  const dir: SignalDir = weaker && !stronger ? "weaker" : stronger && !weaker ? "stronger" : "neutral";
  return { available: true, dir, strong: strong && dir !== "neutral" };
}

/** Squad quality (0..100): higher is stronger; `a` weaker when materially lower. */
function squadSignal(a: TeamStrength, b: TeamStrength): SignalEval {
  if (a.squadQuality == null || b.squadQuality == null) return { available: false, dir: "neutral", strong: false };
  const gap = a.squadQuality - b.squadQuality; // > 0 => a stronger
  const dir: SignalDir = gap <= -8 ? "weaker" : gap >= 8 ? "stronger" : "neutral";
  return { available: true, dir, strong: Math.abs(gap) >= 14 };
}

interface StrengthComparison {
  available: number;
  weaker: number;
  stronger: number;
  weakerStrong: number;
  strongerStrong: number;
}

function compareStrength(a: TeamStrength, b: TeamStrength): StrengthComparison {
  const sigs = [fifaSignal(a, b), eloSignal(a, b), squadSignal(a, b)].filter((s) => s.available);
  const weaker = sigs.filter((s) => s.dir === "weaker");
  const stronger = sigs.filter((s) => s.dir === "stronger");
  return {
    available: sigs.length,
    weaker: weaker.length,
    stronger: stronger.length,
    weakerStrong: weaker.filter((s) => s.strong).length,
    strongerStrong: stronger.filter((s) => s.strong).length,
  };
}

/** Conservative "materially weaker/stronger": a signal majority, or a single strong signal. */
function materiallyWeaker(cmp: StrengthComparison): boolean {
  return (
    cmp.available > 0 &&
    cmp.weaker > cmp.stronger &&
    (cmp.weaker >= 2 || (cmp.available === 1 && cmp.weaker === 1 && cmp.weakerStrong >= 1))
  );
}
function materiallyStronger(cmp: StrengthComparison): boolean {
  return (
    cmp.available > 0 &&
    cmp.stronger > cmp.weaker &&
    (cmp.stronger >= 2 || (cmp.available === 1 && cmp.stronger === 1 && cmp.strongerStrong >= 1))
  );
}

/**
 * Classify a completed matchup from the viewed team's perspective. Pure; conservative —
 * an "upset" needs a signal majority (or one strong signal) plus a result that defied it.
 * Returns "unknown" when strength inputs are missing so callers fall back to neutral copy.
 */
export function classifyMatchupResult(
  team: TeamStrength | null,
  opponent: TeamStrength | null,
  won: boolean | null,
): TeamMatchupContext {
  if (!team || !opponent) {
    return { verdict: "unknown", teamWasStronger: null, opponentDescriptor: null, signalsAvailable: 0 };
  }
  const cmp = compareStrength(team, opponent);
  if (cmp.available === 0) {
    return { verdict: "unknown", teamWasStronger: null, opponentDescriptor: null, signalsAvailable: 0 };
  }
  const teamWasStronger = materiallyStronger(cmp) ? true : materiallyWeaker(cmp) ? false : null;
  const opponentDescriptor =
    teamWasStronger === false ? "higher-rated" : teamWasStronger === true ? "lower-ranked" : null;
  let verdict: MatchupVerdict;
  if (teamWasStronger === null || won === null) verdict = "even";
  else if (won) verdict = teamWasStronger ? "expected" : "upset"; // weaker side winning is an upset
  else verdict = teamWasStronger ? "upset" : "expected"; // stronger side losing is an upset (major exit)
  return { verdict, teamWasStronger, opponentDescriptor, signalsAvailable: cmp.available };
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
  | "upset-win"
  | "major-exit"
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
  /**
   * Strength-vs-result classification of the latest completed match. Stage-agnostic — a
   * `verdict` of "upset" means the result went against the strength gap at ANY stage; the
   * narrative only promotes it to an "upset"/"major exit" headline for KNOCKOUT matches.
   * Consumers rendering this directly should apply the same knockout gate.
   */
  matchupContext: TeamMatchupContext | null;
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

/**
 * Opponent label for headline copy: host prefix > (defeats only) "higher-rated" > plain
 * name. A win never labels the opponent "higher-rated" — beating a higher-rated side is an
 * upset, headlined separately — so routine advancement copy stays neutral by construction.
 */
function opponentLabelForCopy(
  match: TeamOutlookMatch,
  matchup: TeamMatchupContext,
  resultContext: "win" | "loss",
): string | null {
  if (!match.opponentName) return null;
  if (match.opponentIsHost) return `host nation ${match.opponentName}`;
  if (resultContext === "loss" && matchup.opponentDescriptor === "higher-rated") {
    return `higher-rated ${match.opponentName}`;
  }
  return match.opponentName;
}

/** Opponent label for the structured context field: includes the "lower-ranked" case too. */
function opponentContextLabel(match: TeamOutlookMatch, matchup: TeamMatchupContext): string | null {
  if (!match.opponentName) return null;
  if (match.opponentIsHost) return `host nation ${match.opponentName}`;
  if (matchup.opponentDescriptor) return `${matchup.opponentDescriptor} ${match.opponentName}`;
  return match.opponentName;
}

interface NarrativeInput {
  subject: string;
  status: TeamHeroStatus;
  qualification: LiveViewQualification | null;
  match: TeamOutlookMatch | null;
  matchup: TeamMatchupContext;
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
  const { subject, status, qualification, match, matchup, latestInterval, routeState, nextMatchNumber } = input;

  const plainName = match?.opponentName ?? null;
  const plainOver = plainName ? ` over ${plainName}` : "";
  const plainTo = plainName ? ` to ${plainName}` : "";
  const plainWith = plainName ? ` with ${plainName}` : "";
  const parts = parseScoreParts(match?.score ?? null);
  const scoreWord = parts && parts.margin >= 1 && match?.score ? `${match.score} ` : "";
  const stageSuffix = match?.stageLabel ? ` in the ${match.stageLabel.toLowerCase()}` : "";

  const lostKnockout = !!(match?.isKnockout && match.won === false);
  const wonKnockout = !!(match?.isKnockout && match.won === true);
  const stageInfo = match?.stageLabel
    ? KNOCKOUT_STAGE_COPY[match.stageLabel] ?? { inStage: match.stageLabel.toLowerCase(), nextRound: null }
    : null;
  const isUpsetWin = wonKnockout && matchup.verdict === "upset" && !!plainName && !!stageInfo;
  const isMajorExit = lostKnockout && matchup.verdict === "upset" && !!plainName && !!stageInfo;

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

  const opponentContext = match ? opponentContextLabel(match, matchup) : null;
  const scorelineContext = match?.score ?? null;
  const stageContext = match?.stageLabel ?? null;

  let storyType: TeamOutlookStoryType;
  let primaryNarrative: string;
  let supportingNarrative: string | null;

  if (isUpsetWin) {
    // Priority 1 — underdog knockout advancement (the result defied the strength gap).
    storyType = "upset-win";
    const advancing = stageInfo!.nextRound ? `, advancing to ${stageInfo!.nextRound}` : "";
    primaryNarrative = `${subject} upset ${plainName} ${scoreWord}in the ${stageInfo!.inStage}${advancing}.`;
    supportingNarrative = routeContext;
  } else if (isMajorExit) {
    // Priority 2 — a materially stronger side eliminated by a lower-ranked opponent.
    storyType = "major-exit";
    primaryNarrative =
      `${subject} exited the World Cup in the ${stageInfo!.inStage} after a ${scoreWord}defeat to ` +
      `lower-ranked ${plainName}. They are now out of the title race.`;
    supportingNarrative = null;
  } else if (lostKnockout) {
    // Priority 3 — routine knockout elimination (canonical: a lost knockout match).
    storyType = "eliminated";
    const narrow = parts && parts.margin === 1 ? "narrow " : "";
    const lossLabel = match ? opponentLabelForCopy(match, matchup, "loss") : null;
    const oppPhrase = lossLabel ? ` to ${lossLabel}` : "";
    primaryNarrative =
      `${subject}'s tournament ended after a ${narrow}${scoreWord}knockout defeat${oppPhrase}. ` +
      `They are now out of the title race.`;
    supportingNarrative = null;
  } else if (wonKnockout) {
    // Priority 3 — routine knockout advancement (canonical: a won knockout match).
    storyType = "advanced";
    const tight = parts && parts.margin === 1 ? "tight " : "";
    const winLabel = match ? opponentLabelForCopy(match, matchup, "win") : null;
    const oppPhrase = winLabel ? ` over ${winLabel}` : "";
    primaryNarrative = `${subject} advanced after a ${tight}${scoreWord}knockout win${oppPhrase}.`;
    supportingNarrative = routeContext;
  } else if (status === "eliminated") {
    // Priority 3 — group-stage elimination (canonical live-state qualification).
    storyType = "eliminated";
    primaryNarrative = `${subject} did not advance from the group stage and is out of the title race.`;
    supportingNarrative = null;
  } else if (qualification === "qualified") {
    // Priority 4 — confirmed group qualification, no knockout result yet.
    storyType = "qualified";
    primaryNarrative = `${subject} came through the group stage; the outlook now covers their knockout route.`;
    supportingNarrative = movementContext ?? routeContext;
  } else if (match && match.score) {
    // Priority 5 — a notable latest result (factual, non-decisive).
    storyType = "latest-result";
    if (match.won === null) {
      const adj = parts && parts.total >= 5 ? "high-scoring " : "";
      primaryNarrative = `${subject}'s latest result was a ${adj}${match.score} draw${plainWith}${stageSuffix}.`;
    } else if (match.won) {
      const adj =
        parts && parts.opp === 0
          ? "clean-sheet "
          : parts && parts.total >= 5
            ? "high-scoring "
            : parts && parts.margin === 1
              ? "narrow "
              : "";
      primaryNarrative = `${subject}'s latest result was a ${adj}${match.score} win${plainOver}${stageSuffix}.`;
    } else {
      const adj =
        parts && parts.margin === 1 ? "narrow " : parts && parts.total >= 5 ? "high-scoring " : "";
      primaryNarrative = `${subject}'s latest result was a ${adj}${match.score} defeat${plainTo}${stageSuffix}.`;
    }
    supportingNarrative = movementContext ?? routeContext;
  } else if (movementMeaningful) {
    // Priority 7 — forecast movement (interval-framed), no factual result to lead with.
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
 * live-state group qualification (or null); `strengthById` supplies public team-strength
 * inputs for upset detection (viewed team + opponents). `teamName` labels the subject.
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
  strengthById?: Record<string, TeamStrength>;
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
    strengthById = {},
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

  const matchup = classifyMatchupResult(
    strengthById[teamId] ?? null,
    latestTeamMatch?.opponentId ? strengthById[latestTeamMatch.opponentId] ?? null : null,
    latestTeamMatch?.won ?? null,
  );

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
    matchup,
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
    matchupContext: latestTeamMatch ? matchup : null,
    opponentContext: narrative.opponentContext,
    scorelineContext: narrative.scorelineContext,
    stageContext: narrative.stageContext,
    routeContext: narrative.routeContext,
    movementContext: narrative.movementContext,
  };
}
