/**
 * Forecast Board — pure row-building, sorting, filtering, status logic (UX-2B).
 * ---------------------------------------------------------------------------
 * Builds the /teams board rows from the runtime current snapshot, the committed
 * baseline, and the baseline↔current comparison; derives per-team status (elimination
 * strictly from live-state; "0% title chance" strictly from the forecast); and provides
 * view sorting + search/status filtering.
 *
 * PURE: no React, no I/O, no env, no Blob. Type-imports only, so it is node-testable and
 * safe on server or client.
 */
import type { ForecastSnapshot } from "@/lib/model/forecast-snapshots";
import type { ForecastComparison } from "@/lib/model/forecast-deltas";
import type { LiveViewQualification } from "@/lib/live-client/public-safe-view.client";
import type { Team } from "@/lib/types";

export type BoardView = "current" | "movement" | "baseline" | "progression";
export type BoardStatusFilter = "all" | "active" | "eliminated" | "zero-title";
export type BoardStatus = "active" | "eliminated" | "zero-title" | "unknown";

export const BOARD_VIEW_OPTIONS: ReadonlyArray<{ value: BoardView; label: string }> = [
  { value: "current", label: "Current" },
  { value: "movement", label: "Movement" },
  { value: "baseline", label: "Baseline" },
  { value: "progression", label: "Progression" },
];

export const BOARD_STATUS_OPTIONS: ReadonlyArray<{ value: BoardStatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "eliminated", label: "Eliminated" },
  { value: "zero-title", label: "0% title chance" },
];

export interface BoardStageProbs {
  winner: number;
  final: number;
  semiFinal: number;
  quarterFinal: number;
  roundOf16: number;
}

export interface BoardRow {
  teamId: string;
  name: string;
  flag: string;
  countryCode: string;
  rank: number;
  current: BoardStageProbs;
  baselineRank: number | null;
  baseline: BoardStageProbs | null;
  /** Signed pp change in title chance vs baseline (null when comparison unavailable). */
  winnerDeltaPp: number | null;
  fromRank: number | null;
  toRank: number | null;
  rankDelta: number | null;
  /** Current title chance is zero or rounds to 0% (a forecast fact, NOT elimination). */
  isZeroTitle: boolean;
}

function stageProbs(t: {
  winner: number;
  final: number;
  semiFinal: number;
  quarterFinal: number;
  roundOf16: number;
}): BoardStageProbs {
  return {
    winner: t.winner,
    final: t.final,
    semiFinal: t.semiFinal,
    quarterFinal: t.quarterFinal,
    roundOf16: t.roundOf16,
  };
}

/** True when the title chance rounds to 0.0% at one-decimal display precision. */
export function roundsToZeroTitle(winner: number): boolean {
  return Math.round(winner * 1000) / 10 === 0;
}

export interface BuildBoardRowsInput {
  current: ForecastSnapshot | null;
  baseline: ForecastSnapshot | null;
  comparison: ForecastComparison | null;
  resolveTeam: (id: string) => Team | null;
}

export function buildBoardRows(input: BuildBoardRowsInput): BoardRow[] {
  const { current, baseline, comparison, resolveTeam } = input;
  if (!current) return [];

  const baselineByTeam = new Map(baseline?.teams.map((t) => [t.teamId, t]) ?? []);
  const deltaByTeam = new Map(comparison?.teamDeltas.map((d) => [d.teamId, d]) ?? []);

  const rows: BoardRow[] = [];
  for (const t of current.teams) {
    const team = resolveTeam(t.teamId);
    if (!team) continue;
    const b = baselineByTeam.get(t.teamId) ?? null;
    const d = deltaByTeam.get(t.teamId);
    rows.push({
      teamId: team.id,
      name: team.name,
      flag: team.flag,
      countryCode: team.countryCode,
      rank: t.rank,
      current: stageProbs(t),
      baselineRank: b?.rank ?? null,
      baseline: b ? stageProbs(b) : null,
      winnerDeltaPp: d?.stages.winner.deltaPercentagePoints ?? null,
      fromRank: d?.fromRank ?? null,
      toRank: d?.toRank ?? null,
      rankDelta: d?.rankDelta ?? null,
      isZeroTitle: roundsToZeroTitle(t.winner),
    });
  }
  return rows;
}

/**
 * Status priority: Eliminated (live-state only) → 0% title chance (forecast) → Active
 * (live-state present, not eliminated) → unknown (live-state unavailable). A zero
 * Monte-Carlo probability is NEVER labelled eliminated.
 */
export function deriveStatus(
  row: BoardRow,
  qualByTeam: Map<string, LiveViewQualification> | null,
): BoardStatus {
  const qual = qualByTeam?.get(row.teamId);
  if (qual === "eliminated") return "eliminated";
  if (row.isZeroTitle) return "zero-title";
  if (qualByTeam) return "active";
  return "unknown";
}

export function statusLabel(status: BoardStatus): string {
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

export function matchesSearch(row: BoardRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return row.name.toLowerCase().includes(q);
}

export function matchesStatusFilter(status: BoardStatus, filter: BoardStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "zero-title") return status === "zero-title";
  return status === filter;
}

const num = (v: number | null, fallback: number) => (v == null ? fallback : v);

export function sortBoard(rows: BoardRow[], view: BoardView): BoardRow[] {
  const copy = [...rows];
  switch (view) {
    case "movement":
      // Biggest absolute movement first; unknown movement last; then current rank.
      return copy.sort(
        (a, b) =>
          Math.abs(num(b.winnerDeltaPp, -Infinity)) - Math.abs(num(a.winnerDeltaPp, -Infinity)) ||
          a.rank - b.rank,
      );
    case "baseline":
      // Pre-tournament order: baseline title chance desc (missing baseline last).
      return copy.sort(
        (a, b) =>
          num(b.baseline?.winner ?? null, -1) - num(a.baseline?.winner ?? null, -1) ||
          num(a.baselineRank, Infinity) - num(b.baselineRank, Infinity),
      );
    case "current":
    case "progression":
    default:
      // Current title chance desc (rank is 1-based by winner).
      return copy.sort((a, b) => a.rank - b.rank);
  }
}
