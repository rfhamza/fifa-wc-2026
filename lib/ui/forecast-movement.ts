/**
 * Runtime Probability Movement — pure row-building, stage selection, sorting, status,
 * and safe explanation logic (UX-3).
 * ---------------------------------------------------------------------------------
 * Builds the /movement surface rows from the runtime current snapshot, the committed
 * baseline, and the baseline↔current comparison; selects biggest risers/fallers per
 * stage; derives per-stage status (elimination strictly from live-state; "0% for the
 * selected stage" strictly from the forecast); and produces a SAFE, non-overclaiming
 * "why it moved" line (only elimination / 0% are surfaced — otherwise a neutral
 * sentence; never an invented causal reason).
 *
 * PURE: no React, no I/O, no env, no Blob. Type-imports only, so it is node-testable and
 * safe on server or client. Kept independent of the /teams board module on purpose.
 */
import { round } from "@/lib/utils";
import type { ForecastSnapshot } from "@/lib/model/forecast-snapshots";
import type { ForecastComparison } from "@/lib/model/forecast-deltas";
import type { LiveViewQualification } from "@/lib/live-client/public-safe-view.client";
import type { Team } from "@/lib/types";

/** The five knockout-reach stages the movement surface can rank by. */
export type MovementStage = "winner" | "final" | "semiFinal" | "quarterFinal" | "roundOf16";
/** Balanced (risers + fallers) is the default; the other three narrow the view. */
export type MovementMode = "balanced" | "risers" | "fallers" | "biggest";
/** Status priority: eliminated → 0% for the selected stage → active → unknown. */
export type MovementStatus = "eliminated" | "zero-stage" | "active" | "unknown";

export const MOVEMENT_STAGES: readonly MovementStage[] = [
  "winner",
  "final",
  "semiFinal",
  "quarterFinal",
  "roundOf16",
];

export const MOVEMENT_STAGE_OPTIONS: ReadonlyArray<{ value: MovementStage; label: string }> = [
  { value: "winner", label: "Title chance" },
  { value: "final", label: "Reach final" },
  { value: "semiFinal", label: "Reach semi-final" },
  { value: "quarterFinal", label: "Reach quarter-final" },
  { value: "roundOf16", label: "Reach round of 16" },
];

export const MOVEMENT_MODE_OPTIONS: ReadonlyArray<{ value: MovementMode; label: string }> = [
  { value: "balanced", label: "Balanced" },
  { value: "risers", label: "Risers" },
  { value: "fallers", label: "Fallers" },
  { value: "biggest", label: "Biggest moves" },
];

/** Full stage label ("Title chance", "Reach final", …). */
export function movementStageLabel(stage: MovementStage): string {
  return MOVEMENT_STAGE_OPTIONS.find((o) => o.value === stage)?.label ?? "Title chance";
}

/**
 * The neutral, safe "why it moved" sentence used whenever no specific fact
 * (elimination / 0% for the stage) is safely derivable. Verbatim per UX-3.
 */
export const MOVEMENT_NEUTRAL_EXPLANATION =
  "Probability moved as results were locked and tournament paths changed.";

/** True when a probability rounds to 0.0% at one-decimal display precision. */
export function roundsToZeroPct(value: number): boolean {
  return Math.round(value * 1000) / 10 === 0;
}

export interface MovementStageCell {
  /** Pre-tournament baseline probability in [0,1]. */
  from: number;
  /** Current forecast probability in [0,1]. */
  to: number;
  /** Signed change in percentage points (current − baseline). */
  deltaPp: number;
}

export interface MovementRow {
  teamId: string;
  name: string;
  flag: string;
  countryCode: string;
  /** Current rank (1-based by title chance). */
  rank: number;
  stages: Record<MovementStage, MovementStageCell>;
  fromRank: number | null;
  toRank: number | null;
  rankDelta: number | null;
  /** Current title chance rounds to 0% (a forecast fact, NOT elimination). */
  isZeroTitle: boolean;
}

export interface BuildMovementRowsInput {
  current: ForecastSnapshot | null;
  baseline: ForecastSnapshot | null;
  comparison: ForecastComparison | null;
  resolveTeam: (id: string) => Team | null;
}

/**
 * Build one movement row per current team (all five stages). Prefers the comparison's
 * per-stage from/to/Δpp; falls back to the current + baseline snapshots when the
 * comparison is unavailable (e.g. no Blob token → committed fallback). Returns [] when
 * the current snapshot is unavailable. Pure; never throws.
 */
export function buildMovementRows(input: BuildMovementRowsInput): MovementRow[] {
  const { current, baseline, comparison, resolveTeam } = input;
  if (!current) return [];

  const baselineByTeam = new Map(baseline?.teams.map((t) => [t.teamId, t]) ?? []);
  const deltaByTeam = new Map(comparison?.teamDeltas.map((d) => [d.teamId, d]) ?? []);

  const rows: MovementRow[] = [];
  for (const t of current.teams) {
    const team = resolveTeam(t.teamId);
    if (!team) continue;
    const b = baselineByTeam.get(t.teamId) ?? null;
    const d = deltaByTeam.get(t.teamId);

    const stages = {} as Record<MovementStage, MovementStageCell>;
    for (const s of MOVEMENT_STAGES) {
      const sd = d?.stages[s];
      const to = sd ? sd.toProbability : t[s];
      const from = sd ? sd.fromProbability : b ? b[s] : 0;
      const deltaPp = sd ? sd.deltaPercentagePoints : round((to - from) * 100, 1);
      stages[s] = { from, to, deltaPp };
    }

    rows.push({
      teamId: team.id,
      name: team.name,
      flag: team.flag,
      countryCode: team.countryCode,
      rank: t.rank,
      stages,
      fromRank: d?.fromRank ?? b?.rank ?? null,
      toRank: d?.toRank ?? t.rank,
      rankDelta: d?.rankDelta ?? null,
      isZeroTitle: roundsToZeroPct(t.winner),
    });
  }
  return rows;
}

/** Neutral band: |Δpp| within this is "unchanged" (matches `moverDirection`). */
const NEUTRAL_PP = 0.05;

export interface MovementSelection {
  /** Positive movers for the stage, largest gain first. */
  risers: MovementRow[];
  /** Negative movers for the stage, largest drop first. */
  fallers: MovementRow[];
  /** Largest absolute movers for the stage, mixed direction. */
  biggest: MovementRow[];
}

const stageDeltaPp = (row: MovementRow, stage: MovementStage): number => row.stages[stage].deltaPp;

/**
 * Select the biggest movers for a stage: risers (Δpp desc), fallers (Δpp asc, i.e.
 * largest drop first), and absolute biggest (|Δpp| desc). Each list is capped at `topN`.
 * Neutral moves (|Δpp| ≤ 0.05) are excluded from all lists.
 */
export function selectMovers(rows: MovementRow[], stage: MovementStage, topN = 6): MovementSelection {
  const risers = rows
    .filter((r) => stageDeltaPp(r, stage) > NEUTRAL_PP)
    .sort((a, b) => stageDeltaPp(b, stage) - stageDeltaPp(a, stage))
    .slice(0, topN);
  const fallers = rows
    .filter((r) => stageDeltaPp(r, stage) < -NEUTRAL_PP)
    .sort((a, b) => stageDeltaPp(a, stage) - stageDeltaPp(b, stage))
    .slice(0, topN);
  const biggest = rows
    .filter((r) => Math.abs(stageDeltaPp(r, stage)) > NEUTRAL_PP)
    .sort((a, b) => Math.abs(stageDeltaPp(b, stage)) - Math.abs(stageDeltaPp(a, stage)))
    .slice(0, topN);
  return { risers, fallers, biggest };
}

/**
 * Status for the selected stage. Priority: Eliminated (live-state `qualificationState`
 * only) → 0% for the selected stage (forecast fact) → Active (live-state present, not
 * eliminated) → unknown (live-state unavailable). A zero Monte-Carlo probability is
 * NEVER labelled eliminated.
 */
export function deriveMovementStatus(
  row: MovementRow,
  stage: MovementStage,
  qualByTeam: Map<string, LiveViewQualification> | null,
): MovementStatus {
  const qual = qualByTeam?.get(row.teamId);
  if (qual === "eliminated") return "eliminated";
  if (roundsToZeroPct(row.stages[stage].to)) return "zero-stage";
  if (qualByTeam) return "active";
  return "unknown";
}

/** Stage-aware status label ("0% title chance" only for the Title stage). */
export function movementStatusLabel(status: MovementStatus, stage: MovementStage): string {
  switch (status) {
    case "eliminated":
      return "Eliminated";
    case "zero-stage":
      return stage === "winner" ? "0% title chance" : "Currently 0% for this stage";
    case "active":
      return "Active";
    default:
      return "Status unavailable";
  }
}

/**
 * SAFE "why it moved" line. Only surfaces facts we can derive: elimination (live-state)
 * and 0% for the stage (forecast). Everything else uses the neutral sentence. It never
 * fabricates a causal reason — attributing a move to a specific match/opponent/path is
 * not derivable from aggregate snapshot deltas, so it is never asserted.
 */
export function movementExplanation(
  row: MovementRow,
  stage: MovementStage,
  qualByTeam: Map<string, LiveViewQualification> | null,
): string {
  const status = deriveMovementStatus(row, stage, qualByTeam);
  if (status === "eliminated") return "Eliminated";
  if (status === "zero-stage") {
    return stage === "winner" ? "Now at 0% title chance" : "Currently 0% for this stage";
  }
  return MOVEMENT_NEUTRAL_EXPLANATION;
}

/** Rank-move label ("#4 → #2"); "—" when unavailable or unchanged. */
export function movementRankMove(row: MovementRow): string {
  if (row.fromRank == null || row.toRank == null || row.rankDelta == null || row.rankDelta === 0) {
    return "—";
  }
  return `#${row.fromRank} → #${row.toRank}`;
}
