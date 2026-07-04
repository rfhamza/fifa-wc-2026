/**
 * Team forecast trajectory — pure view models for the team detail page (UX-6).
 * ----------------------------------------------------------------------------
 * Builds the /teams/[teamId] trajectory surface models from the committed snapshot
 * chain, the runtime current snapshot, and the baseline↔current comparison.
 *
 * PUBLIC CHECKPOINT POLICY (deliberate product decision): the public trajectory
 * shows the committed milestone checkpoints — Tournament start (baseline), Group
 * matchday 1 / matchday 2 (M24 / M48), Group stage complete (M72), and the future
 * round-completion milestones (M88/M96/M100/M102/M104) once their snapshots are
 * committed — plus the runtime current snapshot ("Current projection") when it
 * validly extends the chain. The public set is `isPublicMilestoneLocked` from
 * `lib/model/forecast-checkpoints.ts`; the non-milestone committed dev checkpoints
 * (locked counts 54 and 73) and the third-place milestone are NEVER public. Other
 * committed snapshots remain in the data/manifest but are filtered out here —
 * `selectPublicPoints` is the single filter.
 *
 * The movement summary is likewise deterministic: consecutive public-milestone
 * intervals plus the anchored "since tournament start" total — never a ranking of
 * arbitrary consecutive snapshots, and never a non-public interval.
 *
 * PURE: no React, no I/O, no env, no Blob, no runtime-store import. Type-imports
 * from model modules; value imports only from other pure modules. Node-testable
 * and safe on server or client.
 */
import { round } from "@/lib/utils";
import type { ForecastSnapshot } from "@/lib/model/forecast-snapshots";
import type { ForecastComparison, TeamForecastTrajectory } from "@/lib/model/forecast-deltas";
import type { MatchForecastProvenance } from "@/lib/model/match-forecast";
import type {
  LiveViewMatch,
  LiveViewQualification,
  TeamLite,
} from "@/lib/live-client/public-safe-view.client";
import { formatAsOf, type ForecastSourceKind } from "@/lib/ui/forecast-hero-data";
import {
  MOVEMENT_STAGE_OPTIONS,
  MOVEMENT_STAGES,
  movementStageLabel,
  roundsToZeroPct,
  type MovementStage,
} from "@/lib/ui/forecast-movement";
import { matchProvenanceLabel, stageLabel } from "@/lib/ui/match-centre";
import {
  CURRENT_PROJECTION_MILESTONE,
  PUBLIC_MILESTONE_LABELS,
  getPublicMilestoneLabel,
  isPublicMilestoneLocked,
} from "@/lib/model/forecast-checkpoints";

/** The five knockout-reach stages the trajectory chart can show. */
export type TrajectoryStage = MovementStage;
/** Stage toggle options — reuses the movement labels ("Title chance", "Reach final", …). */
export const TRAJECTORY_STAGE_OPTIONS = MOVEMENT_STAGE_OPTIONS;
export const trajectoryStageLabel = movementStageLabel;

const GROUP_STAGE_COMPLETE_LOCKED = 72;

export const TOURNAMENT_START_LABEL = PUBLIC_MILESTONE_LABELS[0]!.label;
export const GROUP_STAGE_COMPLETE_LABEL = PUBLIC_MILESTONE_LABELS[72]!.label;
export const CURRENT_PROJECTION_LABEL = CURRENT_PROJECTION_MILESTONE.label;

/* ----------------------------------------------------------------------------
 * Trajectory model (the public checkpoint filter).
 * -------------------------------------------------------------------------- */

export interface TeamTrajectoryPoint {
  snapshotId: string;
  asOf: string;
  asOfLabel: string | null;
  completedMatchesLocked: number;
  /** "Tournament start" | "Group stage complete" | "Current projection". */
  label: string;
  /** Compact x-tick label ("Start" | "Groups" | "Current"). */
  shortLabel: string;
  isBaseline: boolean;
  isLatest: boolean;
  pointSource: "committed" | "live";
  rank: number | null;
  stages: Record<TrajectoryStage, number>;
}

export interface TeamTrajectoryModel {
  teamId: string;
  points: TeamTrajectoryPoint[];
  /** At least two public points → a trajectory can be drawn. */
  hasEnoughHistory: boolean;
  /** False when the group-stage-complete checkpoint is absent (surface shows a note). */
  hasGroupStageCheckpoint: boolean;
}

export interface BuildTeamTrajectoryModelInput {
  /** Full committed chain for the team (the store's trajectory; unfiltered). */
  trajectory: TeamForecastTrajectory;
  /** Runtime current snapshot (rolling Blob point) or null. */
  runtimeCurrent: ForecastSnapshot | null;
  runtimeSource: ForecastSourceKind;
}

type RawPoint = TeamForecastTrajectory["points"][number];
/** Internal selection shape — committed points plus the synthesized live point. */
interface SelectablePoint {
  snapshotId: string;
  asOf: string;
  completedMatchesLocked: number;
  rank: number | null;
  stages: Record<string, number>;
}

const pickStages = (stages: Record<string, number>): Record<TrajectoryStage, number> => {
  const out = {} as Record<TrajectoryStage, number>;
  for (const s of MOVEMENT_STAGES) out[s] = stages[s] ?? 0;
  return out;
};

interface SelectedCommittedPoint {
  raw: RawPoint;
  label: string;
  shortLabel: string;
  isBaseline: boolean;
}

/**
 * The public-point selector — the ONLY place the public checkpoint policy lives.
 * Returns the committed milestone points (baseline + title-probability milestones
 * {24,48,72,88,96,100,102,104}) in match order, each with its public label. The
 * non-milestone committed dev checkpoints (locked counts 54 and 73) and the
 * third-place milestone are excluded by `isPublicMilestoneLocked`; future round
 * milestones are picked up automatically once their snapshot is committed.
 */
function selectPublicPoints(points: RawPoint[]): SelectedCommittedPoint[] {
  return points
    .filter((p) => isPublicMilestoneLocked(p.completedMatchesLocked))
    .slice()
    .sort((a, b) => a.completedMatchesLocked - b.completedMatchesLocked)
    .map((raw) => {
      const lbl = getPublicMilestoneLabel(raw.completedMatchesLocked)!;
      return { raw, label: lbl.label, shortLabel: lbl.shortLabel, isBaseline: raw.completedMatchesLocked === 0 };
    });
}

/**
 * Build the PUBLIC trajectory for one team: Tournament start → Group matchday 1 →
 * Group matchday 2 → Group stage complete (→ future round milestones) → Current
 * projection. Committed points at non-milestone locked counts (54, 73, …) are never
 * included. The runtime current is appended only when it is a live Blob read, carries
 * this team, is not the last committed checkpoint re-served, and strictly extends the
 * selected chain (more locked matches, or equal locked with a later asOf). Pure.
 */
export function buildTeamTrajectoryModel(input: BuildTeamTrajectoryModelInput): TeamTrajectoryModel {
  const { trajectory, runtimeCurrent, runtimeSource } = input;
  const committed = selectPublicPoints(trajectory.points);

  const selected: Array<{ raw: SelectablePoint; label: string; shortLabel: string; isBaseline: boolean; pointSource: "committed" | "live" }> =
    committed.map((c) => ({
      raw: c.raw,
      label: c.label,
      shortLabel: c.shortLabel,
      isBaseline: c.isBaseline,
      pointSource: "committed" as const,
    }));

  // Current projection: append only when the runtime read is live ("blob") and it
  // strictly extends the selected public chain. A committed-fallback current is by
  // definition already the chain tail — never appended (no duplicate point).
  const last = selected[selected.length - 1]?.raw ?? null;
  const teamEntry = runtimeCurrent?.teams.find((t) => t.teamId === trajectory.teamId) ?? null;
  if (
    runtimeSource === "blob" &&
    runtimeCurrent &&
    teamEntry &&
    (!last || runtimeCurrent.meta.snapshotId !== last.snapshotId) &&
    (!last ||
      runtimeCurrent.meta.completedMatchesLocked > last.completedMatchesLocked ||
      (runtimeCurrent.meta.completedMatchesLocked === last.completedMatchesLocked &&
        runtimeCurrent.meta.asOf > last.asOf))
  ) {
    selected.push({
      raw: {
        snapshotId: runtimeCurrent.meta.snapshotId,
        asOf: runtimeCurrent.meta.asOf,
        completedMatchesLocked: runtimeCurrent.meta.completedMatchesLocked,
        rank: teamEntry.rank,
        stages: teamEntry as unknown as Record<string, number>,
      },
      label: CURRENT_PROJECTION_LABEL,
      shortLabel: "Current",
      isBaseline: false,
      pointSource: "live",
    });
  }

  const points: TeamTrajectoryPoint[] = selected.map((s, i) => ({
    snapshotId: s.raw.snapshotId,
    asOf: s.raw.asOf,
    asOfLabel: formatAsOf(s.raw.asOf),
    completedMatchesLocked: s.raw.completedMatchesLocked,
    label: s.label,
    shortLabel: s.shortLabel,
    isBaseline: s.isBaseline,
    isLatest: i === selected.length - 1 && selected.length > 1,
    pointSource: s.pointSource,
    rank: s.raw.rank,
    stages: pickStages(s.raw.stages),
  }));

  return {
    teamId: trajectory.teamId,
    points,
    hasEnoughHistory: points.length >= 2,
    hasGroupStageCheckpoint: committed.some((c) => c.raw.completedMatchesLocked === GROUP_STAGE_COMPLETE_LOCKED),
  };
}

/* ----------------------------------------------------------------------------
 * Hero model + status.
 * -------------------------------------------------------------------------- */

export interface TeamHeroModel {
  teamId: string;
  /** Runtime current title probability in [0,1]; null when unavailable. */
  currentTitleProbability: number | null;
  baselineTitleProbability: number | null;
  /** Signed change in percentage points since tournament start; null when underivable. */
  titleDeltaPp: number | null;
  currentRank: number | null;
  /** Current title chance rounds to 0% (a forecast fact, NOT elimination). */
  isZeroTitle: boolean;
  source: ForecastSourceKind;
  asOfLabel: string | null;
}

export interface BuildTeamHeroModelInput {
  teamId: string;
  current: ForecastSnapshot | null;
  baseline: ForecastSnapshot | null;
  comparison: ForecastComparison | null;
  source: ForecastSourceKind;
}

/** Null-safe hero numbers: current vs baseline title chance + pp movement. Pure. */
export function buildTeamHeroModel(input: BuildTeamHeroModelInput): TeamHeroModel {
  const { teamId, current, baseline, comparison, source } = input;
  const cur = current?.teams.find((t) => t.teamId === teamId) ?? null;
  const base = baseline?.teams.find((t) => t.teamId === teamId) ?? null;
  const delta = comparison?.teamDeltas.find((d) => d.teamId === teamId) ?? null;

  const titleDeltaPp =
    delta?.stages.winner?.deltaPercentagePoints ??
    (cur && base ? round((cur.winner - base.winner) * 100, 1) : null);

  return {
    teamId,
    currentTitleProbability: cur?.winner ?? null,
    baselineTitleProbability: base?.winner ?? null,
    titleDeltaPp,
    currentRank: cur?.rank ?? null,
    isZeroTitle: cur ? roundsToZeroPct(cur.winner) : false,
    source,
    asOfLabel: formatAsOf(current?.meta.asOf ?? null),
  };
}

/** Status priority mirrors the Forecast Board: eliminated (live-state ONLY) →
 * 0% title chance (forecast fact) → active → unknown. A zero Monte-Carlo
 * probability is NEVER labelled eliminated. */
export type TeamHeroStatus = "eliminated" | "zero-title" | "active" | "unknown";

export function deriveTeamHeroStatus(
  teamId: string,
  isZeroTitle: boolean,
  qualByTeam: Map<string, LiveViewQualification> | null,
): TeamHeroStatus {
  const qual = qualByTeam?.get(teamId);
  if (qual === "eliminated") return "eliminated";
  if (isZeroTitle) return "zero-title";
  if (qualByTeam) return "active";
  return "unknown";
}

export function teamHeroStatusLabel(status: TeamHeroStatus): string {
  switch (status) {
    case "eliminated":
      return "Eliminated";
    case "zero-title":
      return "0% title chance";
    case "active":
      return "Active";
    default:
      return "Status unavailable";
  }
}

/* ----------------------------------------------------------------------------
 * Chart series + accessible summary.
 * -------------------------------------------------------------------------- */

export interface TrajectoryChartPoint {
  label: string;
  shortLabel: string;
  asOfLabel: string | null;
  /** Probability as a display percentage, rounded to 1 decimal. */
  valuePct: number;
  /** Signed pp change vs the Tournament-start point; null when baseline absent. */
  deltaPpSinceBaseline: number | null;
  isBaseline: boolean;
  isLatest: boolean;
}

/** Chart-ready series for one stage over the public points. Pure. */
export function selectTrajectorySeries(
  model: TeamTrajectoryModel,
  stage: TrajectoryStage,
): TrajectoryChartPoint[] {
  const baselineValue = model.points.find((p) => p.isBaseline)?.stages[stage] ?? null;
  return model.points.map((p) => ({
    label: p.label,
    shortLabel: p.shortLabel,
    asOfLabel: p.asOfLabel,
    valuePct: round(p.stages[stage] * 100, 1),
    deltaPpSinceBaseline:
      baselineValue == null ? null : round((p.stages[stage] - baselineValue) * 100, 1),
    isBaseline: p.isBaseline,
    isLatest: p.isLatest,
  }));
}

/** Plain-language figure summary for screen readers. Pure. */
export function trajectoryAriaSummary(
  teamName: string,
  stage: TrajectoryStage,
  series: TrajectoryChartPoint[],
): string {
  const label = trajectoryStageLabel(stage);
  if (series.length < 2) return `Forecast trajectory for ${teamName}. Not enough history yet.`;
  const first = series[0]!;
  const lastPoint = series[series.length - 1]!;
  return (
    `Forecast trajectory for ${teamName}. ${label} moved from ${first.valuePct}% at ` +
    `${first.label} to ${lastPoint.valuePct}% at ${lastPoint.label}.`
  );
}

/* ----------------------------------------------------------------------------
 * Movement summary — deterministic public intervals only.
 * -------------------------------------------------------------------------- */

export interface TeamMovementRow {
  stage: TrajectoryStage;
  fromLabel: string;
  toLabel: string;
  /** Interval sentence, e.g. "Changed between tournament start and group stage complete". */
  sentence: string;
  fromProbability: number;
  toProbability: number;
  /** Signed change in percentage points across the interval. */
  deltaPp: number;
}

/**
 * The public movement summary: one row per adjacent pair of retained public
 * checkpoints (Tournament start → Group matchday 1 → Group matchday 2 → Group stage
 * complete → … → Current projection), plus an anchored "since tournament start"
 * total when there are three or more points. Built ONLY from the filtered public
 * points — never a ranking of arbitrary consecutive snapshots, and never a 54/73
 * interval (those points are not in the model). Pure.
 */
export function selectKeyMovements(
  model: TeamTrajectoryModel,
  stage: TrajectoryStage,
): TeamMovementRow[] {
  const points = model.points;

  const row = (
    from: TeamTrajectoryPoint,
    to: TeamTrajectoryPoint,
    sentence: string,
  ): TeamMovementRow => ({
    stage,
    fromLabel: from.label,
    toLabel: to.label,
    sentence,
    fromProbability: from.stages[stage],
    toProbability: to.stages[stage],
    deltaPp: round((to.stages[stage] - from.stages[stage]) * 100, 1),
  });

  const rows: TeamMovementRow[] = [];
  // Adjacent public-checkpoint intervals, in order.
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]!;
    const to = points[i + 1]!;
    rows.push(row(from, to, `Changed between ${from.label.toLowerCase()} and ${to.label.toLowerCase()}`));
  }
  // Anchored total (distinct from a single interval only when there are 3+ points).
  const baseline = points.find((p) => p.isBaseline) ?? null;
  const lastPoint = points[points.length - 1] ?? null;
  if (baseline && lastPoint && lastPoint !== baseline && points.length >= 3) {
    rows.push(row(baseline, lastPoint, "Changed since tournament start"));
  }
  return rows;
}

/* ----------------------------------------------------------------------------
 * Match forecast history (team-oriented rows).
 * -------------------------------------------------------------------------- */

/** Page-side public-safe projection of one match-forecast entry (no provider data). */
export interface TeamMatchForecastInput {
  matchNumber: number;
  stage: string;
  forecastProvenance: MatchForecastProvenance;
  homeTeamId: string;
  awayTeamId: string;
  homeWin: number;
  draw: number;
  awayWin: number;
  homeAdvance?: number;
  awayAdvance?: number;
}

export interface TeamMatchHistoryRow {
  matchNumber: number;
  /** Human stage label ("Group stage", "Round of 32", …). */
  stageLabel: string;
  isKnockout: boolean;
  opponent: TeamLite | null;
  /** Shared provenance label; honest fallback when no forecast entry exists. */
  provenanceLabel: string;
  hasForecast: boolean;
  /** Forecast oriented to THIS team (win = this team wins). Null without a forecast. */
  teamWin: number | null;
  draw: number | null;
  teamLoss: number | null;
  teamAdvance: number | null;
}

export interface BuildTeamMatchHistoryRowsInput {
  teamId: string;
  /** The team's known group fixtures (always defined pre-tournament). */
  fixtures: Array<{ matchNumber: number; homeTeamId: string; awayTeamId: string }>;
  /** Public-safe match-forecast entries involving the team; null when unavailable. */
  entries: TeamMatchForecastInput[] | null;
  resolveTeam: (id: string) => TeamLite | null;
}

const provenanceKind = (p: MatchForecastProvenance): "pre-match-captured" | "retrospective" =>
  p === "retrospective-model-forecast" ? "retrospective" : "pre-match-captured";

/**
 * Team-oriented match history: the union of the team's group fixtures and any
 * match-forecast entries involving the team (knockout rows arrive only via entries),
 * sorted by match number. Rows without a forecast entry stay honest
 * ("No pre-match forecast captured"). Pure.
 */
export function buildTeamMatchHistoryRows(input: BuildTeamMatchHistoryRowsInput): TeamMatchHistoryRow[] {
  const { teamId, fixtures, entries, resolveTeam } = input;
  const entryByMatch = new Map((entries ?? []).map((e) => [e.matchNumber, e]));

  const rowFor = (
    matchNumber: number,
    stage: string,
    homeTeamId: string,
    awayTeamId: string,
  ): TeamMatchHistoryRow => {
    const entry = entryByMatch.get(matchNumber) ?? null;
    const teamIsHome = homeTeamId === teamId;
    const opponentId = teamIsHome ? awayTeamId : homeTeamId;
    return {
      matchNumber,
      stageLabel: stageLabel(stage),
      isKnockout: stage !== "group",
      opponent: resolveTeam(opponentId),
      provenanceLabel: entry
        ? matchProvenanceLabel(provenanceKind(entry.forecastProvenance))
        : matchProvenanceLabel("no-pre-match-captured"),
      hasForecast: entry != null,
      teamWin: entry ? (teamIsHome ? entry.homeWin : entry.awayWin) : null,
      draw: entry ? entry.draw : null,
      teamLoss: entry ? (teamIsHome ? entry.awayWin : entry.homeWin) : null,
      teamAdvance: entry
        ? (teamIsHome ? entry.homeAdvance : entry.awayAdvance) ?? null
        : null,
    };
  };

  const rows = new Map<number, TeamMatchHistoryRow>();
  for (const f of fixtures) {
    rows.set(f.matchNumber, rowFor(f.matchNumber, "group", f.homeTeamId, f.awayTeamId));
  }
  for (const e of entries ?? []) {
    if (e.homeTeamId !== teamId && e.awayTeamId !== teamId) continue;
    rows.set(e.matchNumber, rowFor(e.matchNumber, e.stage, e.homeTeamId, e.awayTeamId));
  }
  return [...rows.values()].sort((a, b) => a.matchNumber - b.matchNumber);
}

/* ----------------------------------------------------------------------------
 * Live match context (fed client-side from the public-safe live-state).
 * -------------------------------------------------------------------------- */

export interface TeamMatchContextEntry {
  matchNumber: number;
  opponentId: string | null;
  /** Team-oriented score line, e.g. "2–1" (team first); null when no goals known. */
  score: string | null;
}

export interface TeamMatchContext {
  inProgress: TeamMatchContextEntry | null;
  lastCompleted: (TeamMatchContextEntry & { won: boolean | null }) | null;
  nextScheduled: (TeamMatchContextEntry & { kickoff: string | null }) | null;
}

/** Current / last / next match for one team, from public-safe live matches. Pure. */
export function deriveTeamMatchContext(
  matches: readonly LiveViewMatch[],
  teamId: string,
): TeamMatchContext {
  const mine = matches.filter((m) => m.teamA === teamId || m.teamB === teamId);
  const orient = (m: LiveViewMatch): TeamMatchContextEntry => {
    const isA = m.teamA === teamId;
    const teamGoals = isA ? m.goalsA : m.goalsB;
    const oppGoals = isA ? m.goalsB : m.goalsA;
    return {
      matchNumber: m.matchNumber,
      opponentId: (isA ? m.teamB : m.teamA) || null,
      score:
        typeof teamGoals === "number" && typeof oppGoals === "number"
          ? `${teamGoals}–${oppGoals}`
          : null,
    };
  };

  const inProgress = mine.find((m) => m.status === "in-progress") ?? null;

  const completed = mine
    .filter((m) => m.status === "complete")
    .sort((a, b) => b.matchNumber - a.matchNumber)[0] ?? null;
  let lastCompleted: TeamMatchContext["lastCompleted"] = null;
  if (completed) {
    const isA = completed.teamA === teamId;
    let won: boolean | null = null;
    if (completed.winner) won = completed.winner === teamId;
    else if (typeof completed.goalsA === "number" && typeof completed.goalsB === "number") {
      const t = isA ? completed.goalsA : completed.goalsB;
      const o = isA ? completed.goalsB : completed.goalsA;
      won = t === o ? null : t > o;
    }
    lastCompleted = { ...orient(completed), won };
  }

  const upcoming = mine
    .filter((m) => m.status === "scheduled")
    .sort((a, b) => a.matchNumber - b.matchNumber)[0] ?? null;

  return {
    inProgress: inProgress ? orient(inProgress) : null,
    lastCompleted,
    nextScheduled: upcoming ? { ...orient(upcoming), kickoff: upcoming.kickoff ?? null } : null,
  };
}
