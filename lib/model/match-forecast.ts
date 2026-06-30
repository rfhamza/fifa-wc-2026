/**
 * Match-level forecast core (Phase 1.30, PR-83A) — PURE
 * -----------------------------------------------------
 * Builds a per-fixture forecast from the EXISTING prediction model only
 * (`predictMatch`). No prediction-formula / model-weight / simulation change.
 *
 * Group matches expose 90-minute W/D/L (+ expected goals + top scorelines).
 * Knockout matches additionally expose ADVANCEMENT probabilities, computed as a
 * pure post-process of the 90-minute prediction using the same shootout
 * assumption the knockout simulator already applies
 * (`P(shootout win) = xg / (xg_home + xg_away)`, see `lib/simulation/tournament.ts`
 * `knockoutWinner`). This exposes an assumption already implied by the simulator;
 * it is NOT a new model.
 *
 * Output is public-safe: only team ids, numeric probabilities, stage labels and
 * fixed basis/note strings — no provider/private data.
 *
 * Purity: no fs / env / fetch / live-state / provider / Blob / workflow imports.
 */
import type { MatchPrediction, ScorelineProbability, Team } from "@/lib/types";
import { round } from "@/lib/utils";
import { predictMatch } from "@/lib/model/predict";
import {
  getKnockoutRoundForMatchNumber,
  GROUP_STAGE_MAX_MATCH,
  type GroupWave,
} from "@/lib/model/forecast-checkpoints";
import type { KnockoutStage } from "@/lib/types";

/** Stage a match forecast can describe: the group stage or a knockout round. */
export type MatchForecastStage = "group" | KnockoutStage;

/** Whether the forecast carries advancement probabilities (knockout) or not. */
export type MatchForecastMode = "regulation" | "regulation+advancement";

/** How the advancement split of the draw mass was derived. */
export type AdvancementBasis =
  | "derived-from-90min-and-shootout-model"
  | "fallback-5050-draw-component";

/** Advancement (who progresses, incl. ET/penalties) for a knockout match. */
export interface KnockoutAdvancementForecast {
  /** P(home advances) = homeWin + draw * homeShare. */
  homeAdvance: number;
  /** P(away advances) = awayWin + draw * awayShare. homeAdvance+awayAdvance ~ 1. */
  awayAdvance: number;
  advancementBasis: AdvancementBasis;
  note: string;
}

/** Inputs needed to build a single match forecast. */
export interface MatchForecastInput {
  matchNumber: number;
  stage: MatchForecastStage;
  home: Team;
  away: Team;
}

/** A public-safe forecast for one fixture, pre-result. */
export interface MatchForecast {
  matchNumber: number;
  stage: MatchForecastStage;
  mode: MatchForecastMode;
  homeTeamId: string;
  awayTeamId: string;
  /** 90-minute regulation outcome probabilities (sum ~ 1). */
  homeWin: number;
  draw: number;
  awayWin: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  topScorelines: ScorelineProbability[];
  /** Present only for knockout stages. */
  advancement?: KnockoutAdvancementForecast;
}

/**
 * Provenance of a stored match forecast.
 *
 * IMPORTANT product rule: a TRUE pre-match archive entry only exists if it was
 * captured BEFORE the match was completed. A forecast computed for an
 * already-completed match must NOT be labelled an archived pre-match forecast —
 * it is a `retrospective-model-forecast`. PR-83A defines these contracts only; it
 * does NOT write any archive (Blob writing is a later PR).
 */
export type MatchForecastProvenance =
  | "archived-pre-match-forecast"
  | "retrospective-model-forecast";

/** Pure data contract for an archived/retrospective match forecast (no writing). */
export interface MatchForecastArchiveEntry {
  forecast: MatchForecast;
  provenance: MatchForecastProvenance;
  /** Tournament state time the forecast represents. */
  forecastAsOf: string;
  /** Wall-clock generation time. */
  generatedAt: string;
  /** Source tournament-forecast snapshot/current id, if any. */
  sourceSnapshotId?: string;
  /**
   * True only when the forecast was captured before the match completed. When
   * false the provenance MUST be `retrospective-model-forecast`.
   */
  capturedBeforeCompletion: boolean;
}

/** True for any knockout stage (i.e. not the group stage). */
export function isKnockoutStage(stage: MatchForecastStage): stage is KnockoutStage {
  return stage !== "group";
}

/** Resolve the forecast stage for a match number (group for M1-72, else round). */
export function stageForMatchNumber(matchNumber: number): MatchForecastStage | null {
  if (Number.isInteger(matchNumber) && matchNumber >= 1 && matchNumber <= GROUP_STAGE_MAX_MATCH) {
    return "group";
  }
  return getKnockoutRoundForMatchNumber(matchNumber);
}

/** Group wave for a match number, re-exported for callers (null outside M1-72). */
export type { GroupWave };

/**
 * Compute knockout advancement from a 90-minute prediction. PURE post-process;
 * mirrors the simulator's `P(shootout win)=xg/(xg_home+xg_away)`. Falls back to a
 * 50/50 split of the draw mass when both expected-goal values are zero/invalid.
 */
export function computeAdvancementProbabilities(
  prediction: Pick<
    MatchPrediction,
    "homeWin" | "draw" | "awayWin" | "expectedHomeGoals" | "expectedAwayGoals"
  >,
): KnockoutAdvancementForecast {
  const { homeWin, draw, awayWin, expectedHomeGoals, expectedAwayGoals } = prediction;
  const denom = expectedHomeGoals + expectedAwayGoals;
  const denomValid = Number.isFinite(denom) && denom > 0;

  const homeShare = denomValid ? expectedHomeGoals / denom : 0.5;
  const awayShare = 1 - homeShare;

  return {
    homeAdvance: round(homeWin + draw * homeShare, 4),
    awayAdvance: round(awayWin + draw * awayShare, 4),
    advancementBasis: denomValid
      ? "derived-from-90min-and-shootout-model"
      : "fallback-5050-draw-component",
    note: denomValid
      ? "Advancement = 90-minute win probability plus the draw mass split by each side's expected-goals share (the same shootout assumption the knockout simulator uses); not a new model."
      : "Both expected goals were zero or invalid; the draw mass was split 50/50 as a safe fallback.",
  };
}

/**
 * Build a match forecast from the existing prediction model. Group stages return
 * 90-minute probabilities only; knockout stages additionally include advancement.
 * Does not mutate inputs.
 */
export function buildMatchForecast(input: MatchForecastInput): MatchForecast {
  const { matchNumber, stage, home, away } = input;
  if (home.id === away.id) {
    throw new Error(`buildMatchForecast: home and away are the same team (${home.id})`);
  }

  const prediction = predictMatch(home, away);
  const base: MatchForecast = {
    matchNumber,
    stage,
    mode: "regulation",
    homeTeamId: prediction.homeTeamId,
    awayTeamId: prediction.awayTeamId,
    homeWin: prediction.homeWin,
    draw: prediction.draw,
    awayWin: prediction.awayWin,
    expectedHomeGoals: prediction.expectedHomeGoals,
    expectedAwayGoals: prediction.expectedAwayGoals,
    topScorelines: prediction.topScorelines.map((s) => ({ ...s })),
  };

  if (!isKnockoutStage(stage)) {
    return base;
  }

  return {
    ...base,
    mode: "regulation+advancement",
    advancement: computeAdvancementProbabilities(prediction),
  };
}
