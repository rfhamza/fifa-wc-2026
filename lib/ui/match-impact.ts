/**
 * Match Impact / "What changed after a match" — pure selectors (progressive disclosure).
 * -----------------------------------------------------------------------------------
 * Builds a small, UI-friendly summary of what a COMPLETED match changed, using only
 * existing snapshots + the match's own (canonical) result. Two clearly separated parts:
 *
 *   1. STATUS EVENTS — per-match EXACT, canonical. For a completed knockout match in an
 *      eliminating round (R32/R16/QF), the winner advanced and the loser was eliminated
 *      (basis: the match's own decisive result). Group matches get NO status events (a
 *      single group match does not resolve qualification), and later rounds (SF/final/
 *      third-place) are omitted to avoid mislabelling runners-up / third place. A 0%
 *      probability is NEVER treated as elimination.
 *
 *   2. PROBABILITY MOVEMENT — checkpoint-INTERVAL framed. Movement is attributed to the
 *      committed public checkpoint interval that contains the match ("since {checkpoint}"),
 *      NEVER to the single match alone. Shown only when a genuine before/after checkpoint
 *      pair exists and moves beyond the neutral band; otherwise a neutral fallback.
 *
 * PURE: no React, no I/O, no env, no Blob. Safe on server or client. The server resolves
 * the committed snapshots and precomputes the intervals; the client assembles the summary.
 */
import type { ForecastSnapshot } from "@/lib/model/forecast-snapshots";
import { compareForecastSnapshots, getBiggestForecastMovers } from "@/lib/model/forecast-deltas";
import {
  MOVEMENT_STAGES,
  MOVEMENT_NEUTRAL_EXPLANATION,
  movementStageLabel,
  type MovementStage,
} from "@/lib/ui/forecast-movement";
import {
  getPublicMilestoneLabel,
  isPublicMilestoneLocked,
  CURRENT_PROJECTION_MILESTONE,
} from "@/lib/model/forecast-checkpoints";
import { serializeBracketSearchParams } from "@/lib/ui/bracket-url-state";
import type { MatchCentreRow } from "@/lib/ui/match-centre";
import type { TeamLookup } from "@/lib/live-client/public-safe-view.client";
import { round } from "@/lib/utils";

/** Movement at or below this many percentage points is "unchanged" (matches /movement). */
export const IMPACT_NEUTRAL_PP = 0.05;
/** Knockout rounds where losing eliminates the team outright (safe, unambiguous). */
const ELIMINATING_KNOCKOUT_STAGES: ReadonlySet<string> = new Set([
  "roundOf32",
  "roundOf16",
  "quarterFinal",
]);
const NEUTRAL_MOVEMENT_LINE =
  "This result changed the tournament state, but did not materially move the title race.";
const NO_CHECKPOINT_LINE = "Impact data is unavailable for this checkpoint.";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ImpactStageMove {
  stage: MovementStage;
  label: string;
  fromPct: number; // percentage, one decimal
  toPct: number;
  deltaPp: number; // signed percentage points, one decimal
}
export interface ImpactMoverRow {
  teamId: string;
  deltaPp: number; // title-chance movement, signed pp
}
export interface ImpactMovement {
  teamId: string;
  stages: ImpactStageMove[];
}
export type ImpactStatus = "advanced" | "eliminated";
export interface ImpactStatusEvent {
  teamId: string;
  event: ImpactStatus;
  basis: "knockout-result";
}
export interface ImpactLink {
  kind: "bracket-match" | "team";
  label: string;
  href: string;
}
export interface MatchImpactSummary {
  matchNumber: number;
  teamA?: string;
  teamB?: string;
  interval: { beforeLabel: string; afterLabel: string } | null;
  participantMovements: ImpactMovement[];
  topRisers: ImpactMoverRow[];
  topFallers: ImpactMoverRow[];
  statusEvents: ImpactStatusEvent[];
  bracketLinks: ImpactLink[];
  hasMeaningfulMovement: boolean;
  fallbackReason: string | null;
  headline: string;
}

/** A committed public checkpoint interval, precomputed on the server. */
export interface MatchImpactInterval {
  beforeId: string;
  beforeLabel: string;
  beforeSupported: number;
  afterId: string;
  afterLabel: string;
  afterSupported: number;
  isTerminalCurrent: boolean;
  /** teamId -> per-stage movement across this interval (the 5 reach stages). */
  teamStages: Record<string, ImpactStageMove[]>;
  /** Title-chance (winner) risers/fallers across this interval, neutral-band filtered. */
  titleRisers: ImpactMoverRow[];
  titleFallers: ImpactMoverRow[];
}

// ---------------------------------------------------------------------------
// Server-side interval builder (pure; called with committed snapshots)
// ---------------------------------------------------------------------------
const supportedOf = (s: ForecastSnapshot): number =>
  s.meta.latestCompletedSupportedMatchNumber ?? s.meta.completedMatchesLocked;

function checkpointLabel(s: ForecastSnapshot, isCurrent: boolean): string {
  if (isCurrent) return CURRENT_PROJECTION_MILESTONE.label;
  return getPublicMilestoneLabel(s.meta.completedMatchesLocked)?.label ?? `match ${supportedOf(s)}`;
}

function intervalTeamStages(from: ForecastSnapshot, to: ForecastSnapshot): Record<string, ImpactStageMove[]> {
  const comparison = compareForecastSnapshots(from, to);
  const out: Record<string, ImpactStageMove[]> = {};
  for (const td of comparison.teamDeltas) {
    out[td.teamId] = MOVEMENT_STAGES.map((stage) => {
      const sd = td.stages[stage];
      return {
        stage,
        label: movementStageLabel(stage),
        fromPct: round(sd.fromProbability * 100, 1),
        toPct: round(sd.toProbability * 100, 1),
        deltaPp: round(sd.deltaPercentagePoints, 1),
      };
    });
  }
  return out;
}

function titleMovers(from: ForecastSnapshot, to: ForecastSnapshot): { risers: ImpactMoverRow[]; fallers: ImpactMoverRow[] } {
  const result = getBiggestForecastMovers(from, to, { stage: "winner", mode: "signed", topN: 6 });
  const toRow = (m: { teamId: string; deltaPercentagePoints: number }): ImpactMoverRow => ({
    teamId: m.teamId,
    deltaPp: round(m.deltaPercentagePoints, 1),
  });
  const keep = (r: ImpactMoverRow) => Math.abs(r.deltaPp) > IMPACT_NEUTRAL_PP;
  return {
    risers: (result.risers ?? []).map(toRow).filter(keep),
    fallers: (result.fallers ?? []).map(toRow).filter(keep),
  };
}

/**
 * Precompute the committed PUBLIC checkpoint intervals (baseline + title milestones,
 * plus the runtime current as a terminal node). Adjacent public checkpoints only, so an
 * arbitrary match maps to the interval that contains it. Pure.
 */
export function buildMatchImpactIntervals(
  allSnapshots: readonly ForecastSnapshot[],
  current: ForecastSnapshot | null,
): MatchImpactInterval[] {
  const nodes = allSnapshots.filter((s) => isPublicMilestoneLocked(s.meta.completedMatchesLocked));
  let terminalCurrent = false;
  if (current && !nodes.some((s) => s.meta.snapshotId === current.meta.snapshotId)) {
    nodes.push(current);
    terminalCurrent = true;
  }
  const intervals: MatchImpactInterval[] = [];
  for (let i = 0; i + 1 < nodes.length; i += 1) {
    const from = nodes[i]!;
    const to = nodes[i + 1]!;
    const isCurrent = terminalCurrent && i + 1 === nodes.length - 1;
    const movers = titleMovers(from, to);
    intervals.push({
      beforeId: from.meta.snapshotId,
      beforeLabel: checkpointLabel(from, false),
      beforeSupported: supportedOf(from),
      afterId: to.meta.snapshotId,
      afterLabel: checkpointLabel(to, isCurrent),
      afterSupported: supportedOf(to),
      isTerminalCurrent: isCurrent,
      teamStages: intervalTeamStages(from, to),
      titleRisers: movers.risers,
      titleFallers: movers.fallers,
    });
  }
  return intervals;
}

/** The interval whose checkpoint pair straddles the completed match, or null. */
export function findIntervalForMatch(
  intervals: readonly MatchImpactInterval[],
  matchNumber: number,
): MatchImpactInterval | null {
  return (
    intervals.find((iv) => iv.beforeSupported < matchNumber && iv.afterSupported >= matchNumber) ?? null
  );
}

// ---------------------------------------------------------------------------
// Client-side summary assembly (pure)
// ---------------------------------------------------------------------------
function statusEventsFor(row: MatchCentreRow): ImpactStatusEvent[] {
  if (row.status !== "complete") return [];
  if (!ELIMINATING_KNOCKOUT_STAGES.has(row.stage)) return []; // group / SF / final / 3rd-place: omit
  const winner = row.actual?.winner;
  if (!winner || !row.teamA || !row.teamB) return [];
  const loser = winner === row.teamA ? row.teamB : winner === row.teamB ? row.teamA : undefined;
  if (!loser) return [];
  return [
    { teamId: winner, event: "advanced", basis: "knockout-result" },
    { teamId: loser, event: "eliminated", basis: "knockout-result" },
  ];
}

function movementIsMeaningful(participants: ImpactMovement[], risers: ImpactMoverRow[], fallers: ImpactMoverRow[]): boolean {
  if (risers.length > 0 || fallers.length > 0) return true;
  return participants.some((p) => p.stages.some((s) => Math.abs(s.deltaPp) > IMPACT_NEUTRAL_PP));
}

/**
 * Assemble the compact impact summary for one completed match. `interval` is the
 * server-precomputed checkpoint interval that contains the match (or null). Pure.
 */
export function buildMatchImpactSummary(input: {
  row: MatchCentreRow;
  teams: TeamLookup;
  interval: MatchImpactInterval | null;
}): MatchImpactSummary {
  const { row, teams, interval } = input;
  const name = (id?: string) => (id ? teams[id]?.name ?? id : "");

  const statusEvents = statusEventsFor(row);

  const participantIds = [row.teamA, row.teamB].filter((x): x is string => Boolean(x));
  const participantMovements: ImpactMovement[] = interval
    ? participantIds
        .filter((id) => interval.teamStages[id])
        .map((id) => ({ teamId: id, stages: interval.teamStages[id]! }))
    : [];
  const topRisers = interval ? interval.titleRisers.slice(0, 3) : [];
  const topFallers = interval ? interval.titleFallers.slice(0, 3) : [];
  const hasMeaningfulMovement = Boolean(interval) && movementIsMeaningful(participantMovements, topRisers, topFallers);

  // Lightweight deep-links (canonical bracket params; team outlook pages).
  const bracketLinks: ImpactLink[] = [];
  if (row.stage !== "group") {
    bracketLinks.push({
      kind: "bracket-match",
      label: "View bracket path",
      href: `/bracket?${serializeBracketSearchParams({ teamId: null, matchNumber: row.matchNumber }).toString()}`,
    });
  }
  for (const id of participantIds) {
    bracketLinks.push({ kind: "team", label: `${name(id)} outlook`, href: `/teams/${id}` });
  }

  // Headline: status events (per-match exact) then interval-framed movement note.
  const parts: string[] = [];
  const advanced = statusEvents.find((e) => e.event === "advanced");
  const eliminated = statusEvents.find((e) => e.event === "eliminated");
  if (advanced) parts.push(`${name(advanced.teamId)} advanced.`);
  if (eliminated) parts.push(`${name(eliminated.teamId)} were eliminated.`);
  if (hasMeaningfulMovement && interval) {
    parts.push(`Forecast movement since ${interval.beforeLabel}.`);
  }

  let fallbackReason: string | null = null;
  if (parts.length === 0) {
    if (!interval) {
      fallbackReason = NO_CHECKPOINT_LINE;
    } else {
      fallbackReason = NEUTRAL_MOVEMENT_LINE;
    }
    parts.push(fallbackReason);
  }

  return {
    matchNumber: row.matchNumber,
    ...(row.teamA ? { teamA: row.teamA } : {}),
    ...(row.teamB ? { teamB: row.teamB } : {}),
    interval: interval ? { beforeLabel: interval.beforeLabel, afterLabel: interval.afterLabel } : null,
    participantMovements,
    topRisers,
    topFallers,
    statusEvents,
    bracketLinks,
    hasMeaningfulMovement,
    fallbackReason,
    headline: parts.join(" "),
  };
}

/**
 * CTA gate: show "What changed?" ONLY for a completed match whose summary carries real
 * content — at least one status event or meaningful interval movement. If the only
 * outcome would be "Impact data is unavailable", the CTA is hidden (clean default).
 */
export function shouldShowMatchImpactCta(row: MatchCentreRow, summary: MatchImpactSummary): boolean {
  if (row.status !== "complete") return false;
  return summary.statusEvents.length > 0 || summary.hasMeaningfulMovement;
}

/** Reuse the neutral movement sentence where a caller wants the /movement wording. */
export { MOVEMENT_NEUTRAL_EXPLANATION };
