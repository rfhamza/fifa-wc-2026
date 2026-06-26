/**
 * Phase 1.28Q-E - pure forecast-vs-actual comparison for the /matches overlay.
 * --------------------------------------------------------------------------
 * Joins a fixture's pre-match model forecast to the sanitized public live result and
 * reports, calmly and honestly, what happened. It is PURE and display-only: it never
 * recalculates probabilities and never imports `@/lib/live-state/*`. The caller joins by
 * canonical `matchNumber`; this helper aligns scores by TEAM ID (the live `teamA/teamB`
 * order is not guaranteed to match the fixture's home/away), and FAILS CLOSED - returning
 * no overlay - whenever the live teams don't match the fixture's two teams.
 */
import type { LiveViewMatch } from "./public-safe-view.client";

export type PredictedOutcome = "home" | "draw" | "away";

/** Highest W/D/L probability wins; deterministic tie-break home -> draw -> away. */
export function predictedOutcomeOf(p: {
  homeWin: number;
  draw: number;
  awayWin: number;
}): PredictedOutcome {
  if (p.homeWin >= p.draw && p.homeWin >= p.awayWin) return "home";
  if (p.draw >= p.awayWin) return "draw";
  return "away";
}

export interface ForecastInput {
  homeTeamId: string;
  awayTeamId: string;
  /** Argmax of W/D/L, computed server-side via predictedOutcomeOf. */
  predictedOutcome: PredictedOutcome;
  /** The model's single most-likely scoreline (home/away terms). */
  mostLikely: { homeGoals: number; awayGoals: number };
}

/** Outcome correctness, kept SEPARATE from exact-scoreline correctness. */
export type WinnerVerdict = "correct" | "incorrect" | "actual-draw" | "predicted-draw";
export type ExactScoreline = "hit" | "miss";

export type ForecastComparison =
  | { kind: "none" }
  | { kind: "in-progress"; home: number; away: number }
  | { kind: "result-pending" }
  | {
      kind: "final";
      home: number;
      away: number;
      predictedOutcome: PredictedOutcome;
      actualOutcome: PredictedOutcome;
      winnerVerdict: WinnerVerdict;
      exactScoreline: ExactScoreline;
      /** Defensive only (group stage has none); oriented to home/away if present. */
      penalties?: { home: number; away: number };
    };

/** Do the live match's two teams equal the fixture's two teams (either orientation)? */
function teamsMatch(live: LiveViewMatch, homeTeamId: string, awayTeamId: string): boolean {
  return (
    (live.teamA === homeTeamId && live.teamB === awayTeamId) ||
    (live.teamA === awayTeamId && live.teamB === homeTeamId)
  );
}

/** Map live goals/penalties (teamA/teamB) onto the fixture's home/away by id; null if no score. */
function orient(
  live: LiveViewMatch,
  homeTeamId: string,
): { home: number; away: number; penalties?: { home: number; away: number } } | null {
  if (typeof live.goalsA !== "number" || typeof live.goalsB !== "number") return null;
  const aIsHome = live.teamA === homeTeamId;
  const home = aIsHome ? live.goalsA : live.goalsB;
  const away = aIsHome ? live.goalsB : live.goalsA;
  let penalties: { home: number; away: number } | undefined;
  if (live.penalties) {
    penalties = aIsHome
      ? { home: live.penalties.a, away: live.penalties.b }
      : { home: live.penalties.b, away: live.penalties.a };
  }
  return { home, away, penalties };
}

function outcomeOf(home: number, away: number): PredictedOutcome {
  if (home > away) return "home";
  if (home < away) return "away";
  return "draw";
}

function verdictOf(predicted: PredictedOutcome, actual: PredictedOutcome): WinnerVerdict {
  if (predicted === actual) return predicted === "draw" ? "predicted-draw" : "correct";
  if (actual === "draw") return "actual-draw"; // predicted a team, match drew
  return "incorrect"; // wrong team, or predicted draw but a team won
}

/**
 * Compare the model forecast to the live result. Returns `none` for no/unmatched/scheduled
 * live data, `in-progress` (score only, no verdict), `result-pending` (complete but no score),
 * or `final` (oriented score + outcome verdict + exact-scoreline hit/miss).
 */
export function compareForecastToActual(
  input: ForecastInput,
  live?: LiveViewMatch,
): ForecastComparison {
  if (!live) return { kind: "none" };
  if (!teamsMatch(live, input.homeTeamId, input.awayTeamId)) return { kind: "none" };

  if (live.status === "in-progress") {
    const o = orient(live, input.homeTeamId);
    return o ? { kind: "in-progress", home: o.home, away: o.away } : { kind: "none" };
  }

  if (live.status === "complete") {
    const o = orient(live, input.homeTeamId);
    if (!o) return { kind: "result-pending" };
    const actualOutcome = outcomeOf(o.home, o.away);
    return {
      kind: "final",
      home: o.home,
      away: o.away,
      predictedOutcome: input.predictedOutcome,
      actualOutcome,
      winnerVerdict: verdictOf(input.predictedOutcome, actualOutcome),
      exactScoreline:
        o.home === input.mostLikely.homeGoals && o.away === input.mostLikely.awayGoals
          ? "hit"
          : "miss",
      ...(o.penalties ? { penalties: o.penalties } : {}),
    };
  }

  // scheduled / postponed / cancelled / unknown
  return { kind: "none" };
}
