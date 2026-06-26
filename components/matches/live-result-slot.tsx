"use client";

import { Badge } from "@/components/ui/badge";
import { useLiveMatch } from "./live-results-provider";
import {
  compareForecastToActual,
  type PredictedOutcome,
  type WinnerVerdict,
} from "@/lib/live-client/compare-forecast";

/**
 * Phase 1.28Q-E - the "Actual" half of a fixture card. Reads the live match from context by
 * canonical matchNumber, runs the pure comparison helper, and renders a calm result block:
 * a "Live" badge + current score for in-progress matches (no verdict), or the final score
 * with two separate chips (outcome correctness, exact-scoreline hit/miss) for completed ones.
 * Renders nothing when there is no usable live data (scheduled / unavailable / unmatched /
 * result-pending) - so the prediction card stays exactly as it was.
 */
const OUTCOME_LABEL: Record<WinnerVerdict, string> = {
  correct: "Correct",
  incorrect: "Incorrect",
  "actual-draw": "Actual draw",
  "predicted-draw": "Predicted draw",
};

function outcomeVariant(v: WinnerVerdict): "default" | "muted" | "outline" {
  if (v === "correct" || v === "predicted-draw") return "default";
  if (v === "incorrect") return "outline";
  return "muted"; // actual-draw
}

export function LiveResultSlot({
  matchNumber,
  homeTeamId,
  awayTeamId,
  homeCode,
  awayCode,
  predictedOutcome,
  mostLikely,
}: {
  matchNumber: number | undefined;
  homeTeamId: string;
  awayTeamId: string;
  homeCode: string;
  awayCode: string;
  predictedOutcome: PredictedOutcome;
  mostLikely: { homeGoals: number; awayGoals: number };
}) {
  const live = useLiveMatch(matchNumber);
  const cmp = compareForecastToActual(
    { homeTeamId, awayTeamId, predictedOutcome, mostLikely },
    live,
  );

  if (cmp.kind === "none" || cmp.kind === "result-pending") return null;

  if (cmp.kind === "in-progress") {
    return (
      <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3 text-sm">
        <Badge variant="accent">Live</Badge>
        <span className="font-semibold tabular-nums">
          {homeCode} {cmp.home}–{cmp.away} {awayCode}
        </span>
        <span className="text-xs text-muted-foreground">in progress</span>
      </div>
    );
  }

  // final
  return (
    <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Actual
        </span>
        <span className="font-semibold tabular-nums">
          {homeCode} {cmp.home}–{cmp.away} {awayCode}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant={outcomeVariant(cmp.winnerVerdict)}>
          Outcome: {OUTCOME_LABEL[cmp.winnerVerdict]}
        </Badge>
        <Badge variant="muted">
          Exact scoreline: {cmp.exactScoreline === "hit" ? "Hit" : "Miss"}
        </Badge>
      </div>
    </div>
  );
}
