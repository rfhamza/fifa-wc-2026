/**
 * Bracket selected-match DETAIL model — pure builder (UX-4B).
 * ----------------------------------------------------------
 * Assembles the rich "match intelligence" view-model shown in the /bracket detail panel
 * from a lightweight BracketNode + the serialized runtime forecast entry + the live match.
 * It orients every forecast figure to the NODE's home/away by TEAM ID (the forecast
 * entry, the live match, and the bracket node can each order the two teams differently),
 * reuses the /matches truth helpers verbatim (provenance resolution, aged-well), and never
 * invents a probability.
 *
 * PURE: no React, no I/O, no env, no Blob, no fetch. Reuses only the pure match-centre /
 * compare-forecast helpers; type-only imports from the forecast layer. Node-testable and
 * safe on server or client.
 */
import {
  agedWellVerdict,
  matchProvenanceLabel,
  provenanceTone,
  resolveCentreForecast,
  type AgedWellVerdict,
  type CentreProvenanceKind,
  type CentreRuntimeEntry,
} from "@/lib/ui/match-centre";
import type {
  BracketNode,
  BracketParticipant,
  BracketNodeState,
  BracketScore,
} from "@/lib/ui/bracket-view";
import type { LiveViewMatch } from "@/lib/live-client/public-safe-view.client";

/** Model lean oriented to the node's A(home)/B(away). */
export interface DetailLean {
  aWin: number;
  draw: number;
  bWin: number;
}
export interface DetailScoreline {
  aGoals: number;
  bGoals: number;
  probability: number;
}
export interface DetailAdvance {
  aAdv: number;
  bAdv: number;
}

export interface BracketDetailModel {
  matchNumber: number;
  stageLabel: string;
  state: BracketNodeState;
  kickoff: string | null;
  home: BracketParticipant;
  away: BracketParticipant;
  /** Actual result, already oriented to the node's home/away (reused from the node). */
  score: BracketScore | null;
  /** Both participants known (a forecast can be oriented + shown). */
  resolved: boolean;
  provenanceKind: CentreProvenanceKind;
  provenanceLabel: string;
  provenanceTone: "default" | "accent" | "muted" | "outline";
  /** Present only when the match is resolved AND a forecast with data exists. */
  lean: DetailLean | null;
  scoreline: DetailScoreline | null;
  advance: DetailAdvance | null;
  /** "called" | "missed" | null — non-null only for a genuine pre-match forecast on a completed match. */
  agedWell: AgedWellVerdict;
}

export interface BuildBracketDetailInput {
  node: BracketNode;
  runtime?: CentreRuntimeEntry;
  liveMatch?: LiveViewMatch;
  matchesObjectAvailable: boolean;
}

/**
 * Build the detail view-model for a selected bracket node. Pure; never throws. Returns an
 * unresolved model (placeholders, no forecast) when either participant is still a slot.
 */
export function buildBracketDetailModel(input: BuildBracketDetailInput): BracketDetailModel {
  const { node, runtime, liveMatch, matchesObjectAvailable } = input;
  const resolved = node.home.teamId != null && node.away.teamId != null;

  const forecast = resolveCentreForecast({
    runtime,
    matchesObjectAvailable,
    status: liveMatch?.status ?? "scheduled",
  });

  let lean: DetailLean | null = null;
  let scoreline: DetailScoreline | null = null;
  let advance: DetailAdvance | null = null;
  let agedWell: AgedWellVerdict = null;

  if (resolved && forecast.data) {
    const d = forecast.data;
    // Orient the forecast (entry's own home/away) to the NODE's home/away by team id.
    const homeIsNodeHome = d.homeTeamId === node.home.teamId;
    lean = homeIsNodeHome
      ? { aWin: d.homeWin, draw: d.draw, bWin: d.awayWin }
      : { aWin: d.awayWin, draw: d.draw, bWin: d.homeWin };
    if (d.topScoreline) {
      scoreline = homeIsNodeHome
        ? { aGoals: d.topScoreline.homeGoals, bGoals: d.topScoreline.awayGoals, probability: d.topScoreline.probability }
        : { aGoals: d.topScoreline.awayGoals, bGoals: d.topScoreline.homeGoals, probability: d.topScoreline.probability };
    }
    if (typeof d.homeAdvance === "number" && typeof d.awayAdvance === "number") {
      advance = homeIsNodeHome
        ? { aAdv: d.homeAdvance, bAdv: d.awayAdvance }
        : { aAdv: d.awayAdvance, bAdv: d.homeAdvance };
    }
    // Aged-well uses the entry's own orientation (compareForecastToActual aligns by id).
    agedWell = agedWellVerdict(forecast, liveMatch);
  }

  return {
    matchNumber: node.matchNumber,
    stageLabel: node.stageLabel,
    state: node.state,
    kickoff: node.kickoff,
    home: node.home,
    away: node.away,
    score: node.score,
    resolved,
    provenanceKind: forecast.kind,
    provenanceLabel: matchProvenanceLabel(forecast.kind),
    provenanceTone: provenanceTone(forecast.kind),
    lean,
    scoreline,
    advance,
    agedWell,
  };
}
