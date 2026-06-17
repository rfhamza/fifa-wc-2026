/**
 * Snapshot delta utility
 * ----------------------
 * Pure comparison of two simulation snapshots, producing per-team
 * `ProbabilityDelta`s for a metric. This is the seam for genuine
 * snapshot-over-snapshot "movers" once run history exists (Supabase / model-run
 * history). It is NOT wired into the phase-1.1 UI, which still shows
 * "Standout contenders" (above field baseline), because no committed baseline
 * snapshot exists yet.
 */
import type {
  ProbabilityDelta,
  SimulationSnapshot,
  TournamentStageProbability,
} from "@/lib/types";

export type StageMetric = keyof Omit<TournamentStageProbability, "teamId">;

/**
 * Compute deltas for `metric` between a previous and current snapshot, sorted by
 * descending delta. Teams missing from the previous snapshot are treated as
 * previous = 0. Optionally limit the number of rows.
 */
export function computeProbabilityDeltas(
  previous: SimulationSnapshot,
  current: SimulationSnapshot,
  metric: StageMetric = "winner",
  limit?: number,
): ProbabilityDelta[] {
  const prevByTeam = new Map(
    previous.stageProbabilities.map((p) => [p.teamId, p]),
  );

  const deltas = current.stageProbabilities.map((p) => {
    const prevValue = prevByTeam.get(p.teamId)?.[metric] ?? 0;
    return {
      teamId: p.teamId,
      metric,
      previous: prevValue,
      current: p[metric],
      delta: p[metric] - prevValue,
    } satisfies ProbabilityDelta;
  });

  deltas.sort((a, b) => b.delta - a.delta);
  return typeof limit === "number" ? deltas.slice(0, limit) : deltas;
}
