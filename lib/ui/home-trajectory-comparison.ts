/**
 * Home forecast "race" — multi-team public checkpoint comparison (pure).
 * ----------------------------------------------------------------------
 * Builds a comparison of the top teams across the SAME public forecast checkpoints
 * introduced in UX-6 — Tournament start → Group stage complete → Current projection —
 * for a selected stage probability. Reuses the UX-6 public checkpoint policy: the
 * committed development checkpoints (54 / 73 locked matches) are never included; the
 * runtime current is appended only when it validly extends the chain.
 *
 * PURE: no React, no I/O, no env, no Blob, no runtime-store import. Type-imports from
 * model modules; value imports only from other pure modules. Node-testable.
 *
 * Ranking is by the SELECTED metric at each team's latest available public point
 * (Current projection, else Group stage complete, else Tournament start) — never
 * always by title chance. Colour is bound to the team ENTITY (a stable index from the
 * default title ordering), so changing the metric or Top-N never repaints a surviving
 * team's line.
 */
import { round } from "@/lib/utils";
import type { ForecastSnapshot } from "@/lib/model/forecast-snapshots";
import type { Team } from "@/lib/types";
import type { ForecastSourceKind } from "@/lib/ui/forecast-hero-data";
import { MOVEMENT_STAGES, MOVEMENT_STAGE_OPTIONS, type MovementStage } from "@/lib/ui/forecast-movement";
import {
  CURRENT_PROJECTION_LABEL,
  GROUP_STAGE_COMPLETE_LABEL,
  TOURNAMENT_START_LABEL,
} from "@/lib/ui/team-trajectory";

export type RaceStage = MovementStage;
/** Metric tabs reuse the movement labels ("Title chance", "Reach final", …). */
export const RACE_STAGE_OPTIONS = MOVEMENT_STAGE_OPTIONS;

export const RACE_TOP_N_OPTIONS = [5, 10, 15] as const;
export type RaceTopN = (typeof RACE_TOP_N_OPTIONS)[number];
export const RACE_DEFAULT_TOP_N: RaceTopN = 5;

interface CheckpointSpec {
  snapshot: ForecastSnapshot;
  label: string;
  shortLabel: string;
}

export interface RaceCheckpointPoint {
  label: string;
  shortLabel: string;
  /** Raw probabilities in [0,1] for all five race stages. */
  stages: Record<RaceStage, number>;
}

export interface RaceTeamModel {
  teamId: string;
  name: string;
  flag: string;
  countryCode: string;
  /** Rank (1 = best title chance) at the latest available point; null if unknown. */
  currentRank: number | null;
  /** Stable palette index bound to the team (from the default title ordering). */
  colorIndex: number;
  /** 2–3 public checkpoints, in chronological order. */
  points: RaceCheckpointPoint[];
}

export interface HomeForecastRaceModel {
  teams: RaceTeamModel[];
  /** Shared x-axis labels actually present (2 or 3). */
  checkpointLabels: string[];
  hasCurrentProjection: boolean;
  source: ForecastSourceKind;
}

const stageRecord = (t: Record<string, number>): Record<RaceStage, number> => {
  const out = {} as Record<RaceStage, number>;
  for (const s of MOVEMENT_STAGES) out[s] = t[s] ?? 0;
  return out;
};

/**
 * Assemble the ordered public checkpoints from the available snapshots. Baseline
 * (locked 0) and Group stage complete (locked 72) come from the committed chain; the
 * runtime Current projection is appended only when the source is a live Blob read and
 * it strictly extends the last selected checkpoint (more locked matches, or equal with
 * a later `asOf`) and is a distinct snapshot. Mirrors the UX-6 append rule.
 */
function resolveCheckpoints(input: {
  baseline: ForecastSnapshot | null;
  groupStageComplete: ForecastSnapshot | null;
  current: ForecastSnapshot | null;
  source: ForecastSourceKind;
}): CheckpointSpec[] {
  const specs: CheckpointSpec[] = [];
  if (input.baseline) {
    specs.push({ snapshot: input.baseline, label: TOURNAMENT_START_LABEL, shortLabel: "Start" });
  }
  if (input.groupStageComplete) {
    specs.push({ snapshot: input.groupStageComplete, label: GROUP_STAGE_COMPLETE_LABEL, shortLabel: "Groups" });
  }
  const last = specs[specs.length - 1]?.snapshot ?? null;
  if (
    input.source === "blob" &&
    input.current &&
    (!last || input.current.meta.snapshotId !== last.meta.snapshotId) &&
    (!last ||
      input.current.meta.completedMatchesLocked > last.meta.completedMatchesLocked ||
      (input.current.meta.completedMatchesLocked === last.meta.completedMatchesLocked &&
        input.current.meta.asOf > last.meta.asOf))
  ) {
    specs.push({ snapshot: input.current, label: CURRENT_PROJECTION_LABEL, shortLabel: "Current" });
  }
  return specs;
}

/**
 * Build the full comparison model over ALL teams (the client slices to the selected
 * metric + Top-N). Colour index is assigned once, by the default title ranking at the
 * latest available checkpoint, so it stays bound to each team across toggles. Pure.
 */
export function buildHomeForecastRaceModel(input: {
  baseline: ForecastSnapshot | null;
  groupStageComplete: ForecastSnapshot | null;
  current: ForecastSnapshot | null;
  source: ForecastSourceKind;
  resolveTeam: (id: string) => Team | null;
}): HomeForecastRaceModel {
  const checkpoints = resolveCheckpoints(input);
  const hasCurrentProjection = checkpoints.some((c) => c.label === CURRENT_PROJECTION_LABEL);
  if (checkpoints.length === 0) {
    return { teams: [], checkpointLabels: [], hasCurrentProjection, source: input.source };
  }

  const latest = checkpoints[checkpoints.length - 1]!.snapshot;
  const latestByTeam = new Map(latest.teams.map((t) => [t.teamId, t]));

  const built: RaceTeamModel[] = [];
  for (const latestEntry of latest.teams) {
    const team = input.resolveTeam(latestEntry.teamId);
    if (!team) continue;
    // A team must be present in every selected checkpoint to draw a full line.
    const points: RaceCheckpointPoint[] = [];
    let complete = true;
    for (const cp of checkpoints) {
      const entry = cp.snapshot.teams.find((t) => t.teamId === latestEntry.teamId);
      if (!entry) {
        complete = false;
        break;
      }
      points.push({ label: cp.label, shortLabel: cp.shortLabel, stages: stageRecord(entry as unknown as Record<string, number>) });
    }
    if (!complete) continue;
    built.push({
      teamId: team.id,
      name: team.name,
      flag: team.flag,
      countryCode: team.countryCode,
      currentRank: latestByTeam.get(latestEntry.teamId)?.rank ?? null,
      colorIndex: 0, // assigned below
      points,
    });
  }

  // Stable colour: order by the default title chance at the latest point (desc), then
  // rank, then name. This ordering is metric/Top-N independent, so a team keeps its
  // colour when the user changes the metric or Top-N.
  const colourOrder = [...built].sort((a, b) => compareByStage(a, b, "winner"));
  colourOrder.forEach((t, i) => {
    t.colorIndex = i;
  });

  return {
    teams: built,
    checkpointLabels: checkpoints.map((c) => c.shortLabel),
    hasCurrentProjection,
    source: input.source,
  };
}

const latestStageValue = (t: RaceTeamModel, stage: RaceStage): number =>
  t.points[t.points.length - 1]?.stages[stage] ?? 0;

/** Desc by metric at latest point; tie-break current rank asc (nulls last), then name. */
function compareByStage(a: RaceTeamModel, b: RaceTeamModel, stage: RaceStage): number {
  const byValue = latestStageValue(b, stage) - latestStageValue(a, stage);
  if (byValue !== 0) return byValue;
  const ra = a.currentRank ?? Number.POSITIVE_INFINITY;
  const rb = b.currentRank ?? Number.POSITIVE_INFINITY;
  if (ra !== rb) return ra - rb;
  return a.name.localeCompare(b.name);
}

/** Rank all teams by the selected metric at their latest available point. Pure. */
export function selectRaceRanking(model: HomeForecastRaceModel, metric: RaceStage): RaceTeamModel[] {
  return [...model.teams].sort((a, b) => compareByStage(a, b, metric));
}

export interface RaceSeriesPoint {
  label: string;
  shortLabel: string;
  valuePct: number;
}
export interface RaceSeries {
  teamId: string;
  name: string;
  countryCode: string;
  flag: string;
  colorIndex: number;
  points: RaceSeriesPoint[];
  /** Value at the latest point (for the end-of-line label). */
  endValuePct: number;
}
export interface RaceLegendRow {
  teamId: string;
  name: string;
  countryCode: string;
  flag: string;
  colorIndex: number;
  /** 1-based position in the current ranking. */
  position: number;
  currentValuePct: number;
  /** Signed pp change since Tournament start; null when only one point. */
  deltaPpSinceStart: number | null;
}
export interface RaceView {
  series: RaceSeries[];
  legend: RaceLegendRow[];
  checkpointLabels: string[];
  metric: RaceStage;
  topN: number;
}

/** Top-N teams by the selected metric → chart series + ranked legend rows. Pure. */
export function selectRaceView(
  model: HomeForecastRaceModel,
  metric: RaceStage,
  topN: number,
): RaceView {
  const ranked = selectRaceRanking(model, metric).slice(0, Math.max(0, topN));
  const series: RaceSeries[] = ranked.map((t) => {
    const points = t.points.map((p) => ({ label: p.label, shortLabel: p.shortLabel, valuePct: round(p.stages[metric] * 100, 1) }));
    return {
      teamId: t.teamId,
      name: t.name,
      countryCode: t.countryCode,
      flag: t.flag,
      colorIndex: t.colorIndex,
      points,
      endValuePct: points[points.length - 1]?.valuePct ?? 0,
    };
  });
  const legend: RaceLegendRow[] = ranked.map((t, i) => {
    const first = t.points[0]?.stages[metric] ?? null;
    const last = t.points[t.points.length - 1]?.stages[metric] ?? null;
    return {
      teamId: t.teamId,
      name: t.name,
      countryCode: t.countryCode,
      flag: t.flag,
      colorIndex: t.colorIndex,
      position: i + 1,
      currentValuePct: round((last ?? 0) * 100, 1),
      deltaPpSinceStart: first == null || last == null || t.points.length < 2 ? null : round((last - first) * 100, 1),
    };
  });
  return { series, legend, checkpointLabels: model.checkpointLabels, metric, topN };
}

/** Accessible summary for the chart figure. Pure. */
export function raceAriaSummary(view: RaceView): string {
  const stageLabel = RACE_STAGE_OPTIONS.find((o) => o.value === view.metric)?.label ?? "Title chance";
  if (view.series.length === 0) return `Forecast race. Not enough history yet.`;
  const leader = view.legend[0];
  return (
    `Forecast race comparing the top ${view.series.length} teams by ${stageLabel} across ` +
    `${view.checkpointLabels.join(", ")}.` +
    (leader ? ` ${leader.name} currently leads at ${leader.currentValuePct}%.` : "")
  );
}
