/**
 * Match Forecast Centre — pure merge / order / filter / provenance logic (UX-2A).
 * -----------------------------------------------------------------------------
 * Merges the three read-only sources the /matches page uses — the live-state
 * schedule (actual result / status / resolved knockout teams), the runtime
 * match-forecast archive (provenance-tracked), and the pre-tournament simulation
 * (group-only baseline) — into one ordered, filterable, honestly-labelled row model.
 *
 * PURE: no React, no I/O, no env, no Blob. Type-imports only (+ the pure
 * compare-forecast helpers), so it is node-testable and safe on server or client.
 *
 * Labelling is strict: runtime provenance always wins; a retrospective model
 * estimate is NEVER labelled a pre-match forecast; the simulation is only ever a
 * "Baseline model estimate"; nothing is invented.
 */
import type { LiveViewMatch } from "@/lib/live-client/public-safe-view.client";
import { compareForecastToActual, predictedOutcomeOf } from "@/lib/live-client/compare-forecast";
import type { MatchForecastProvenance } from "@/lib/model/match-forecast";

export interface CentreTopScoreline {
  homeGoals: number;
  awayGoals: number;
  probability: number;
}

/** A forecast's probabilities in the entry's own home/away orientation. */
export interface CentreForecastData {
  homeTeamId: string;
  awayTeamId: string;
  homeWin: number;
  draw: number;
  awayWin: number;
  topScoreline?: CentreTopScoreline;
  homeAdvance?: number;
  awayAdvance?: number;
}

/** Runtime match-forecast entry (carries provenance). */
export type CentreRuntimeEntry = CentreForecastData & { provenance: MatchForecastProvenance };

/** Pre-tournament simulation estimate (group only) + up to two key edges. */
export type CentreSimEntry = CentreForecastData & {
  favoursHome?: string;
  favoursAway?: string;
};

export type CentreRuntimeIndex = Record<number, CentreRuntimeEntry>;
export type CentreSimIndex = Record<number, CentreSimEntry>;

/** Server-built base match (from static group fixtures). */
export interface CentreBaseMatch {
  matchNumber: number;
  stage: string;
  group?: string;
  kickoff?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  status?: LiveViewMatch["status"];
}

export type CentreProvenanceKind =
  | "pre-match-captured"
  | "retrospective"
  | "baseline-model-estimate"
  | "no-pre-match-captured"
  | "coming-soon"
  | "unavailable";

export interface CentreForecast {
  kind: CentreProvenanceKind;
  data: CentreForecastData | null;
  keyEdges?: { favoursHome?: string; favoursAway?: string };
  /** True only for a genuine captured pre-match forecast (aged-well eligible). */
  agedWellEligible: boolean;
}

export interface MatchCentreRow {
  matchNumber: number;
  stage: string;
  group?: string;
  kickoff?: string;
  status: LiveViewMatch["status"];
  teamA?: string;
  teamB?: string;
  actual?: { goalsA: number; goalsB: number; winner?: string; penalties?: { a: number; b: number } };
  forecast: CentreForecast;
}

// --------------------------------------------------------------------------
// Index builders
// --------------------------------------------------------------------------

/**
 * Index runtime match-forecasts by matchNumber, KEEPING retrospective entries
 * (they are shown, clearly labelled — never as pre-match). Returns null-safe empty
 * index when the object is unavailable.
 */
export function buildCentreRuntimeIndex(
  matchForecasts:
    | { matchForecasts: Array<CentreForecastData & { matchNumber: number; forecastProvenance: MatchForecastProvenance }> }
    | null,
): CentreRuntimeIndex {
  const index: CentreRuntimeIndex = {};
  if (!matchForecasts) return index;
  for (const e of matchForecasts.matchForecasts) {
    const entry: CentreRuntimeEntry = {
      provenance: e.forecastProvenance,
      homeTeamId: e.homeTeamId,
      awayTeamId: e.awayTeamId,
      homeWin: e.homeWin,
      draw: e.draw,
      awayWin: e.awayWin,
    };
    if (e.topScoreline) entry.topScoreline = e.topScoreline;
    if (typeof e.homeAdvance === "number") entry.homeAdvance = e.homeAdvance;
    if (typeof e.awayAdvance === "number") entry.awayAdvance = e.awayAdvance;
    index[e.matchNumber] = entry;
  }
  return index;
}

// --------------------------------------------------------------------------
// Forecast resolution (runtime wins → simulation baseline → honest empty)
// --------------------------------------------------------------------------

export function resolveCentreForecast(args: {
  runtime?: CentreRuntimeEntry;
  sim?: CentreSimEntry;
  matchesObjectAvailable: boolean;
  status: LiveViewMatch["status"];
}): CentreForecast {
  const { runtime, sim, matchesObjectAvailable, status } = args;
  if (runtime) {
    if (runtime.provenance === "retrospective-model-forecast") {
      return { kind: "retrospective", data: runtime, agedWellEligible: false };
    }
    return { kind: "pre-match-captured", data: runtime, agedWellEligible: true };
  }
  if (sim) {
    return {
      kind: "baseline-model-estimate",
      data: sim,
      keyEdges: { favoursHome: sim.favoursHome, favoursAway: sim.favoursAway },
      agedWellEligible: false,
    };
  }
  if (!matchesObjectAvailable) return { kind: "unavailable", data: null, agedWellEligible: false };
  if (status === "complete") return { kind: "no-pre-match-captured", data: null, agedWellEligible: false };
  return { kind: "coming-soon", data: null, agedWellEligible: false };
}

export function matchProvenanceLabel(kind: CentreProvenanceKind): string {
  switch (kind) {
    case "pre-match-captured":
      return "Pre-match forecast captured before kickoff";
    case "retrospective":
      return "Retrospective model estimate";
    case "baseline-model-estimate":
      return "Baseline model estimate";
    case "no-pre-match-captured":
      return "No pre-match forecast captured";
    case "coming-soon":
      return "Pre-match forecast coming soon";
    default:
      return "Forecast unavailable";
  }
}

export function provenanceTone(kind: CentreProvenanceKind): "default" | "accent" | "muted" | "outline" {
  switch (kind) {
    case "pre-match-captured":
      return "default";
    case "retrospective":
      return "accent";
    case "baseline-model-estimate":
      return "outline";
    default:
      return "muted";
  }
}

const KNOCKOUT_STAGE_LABELS: Record<string, string> = {
  group: "Group stage",
  roundOf32: "Round of 32",
  roundOf16: "Round of 16",
  quarterFinal: "Quarter-final",
  semiFinal: "Semi-final",
  thirdPlace: "Third place",
  final: "Final",
};
export function stageLabel(stage: string): string {
  return KNOCKOUT_STAGE_LABELS[stage] ?? stage;
}

// --------------------------------------------------------------------------
// Merge + order + filter
// --------------------------------------------------------------------------

export interface BuildMatchCentreInput {
  liveMatches: LiveViewMatch[];
  baseMatches: CentreBaseMatch[];
  simIndex: CentreSimIndex;
  runtimeIndex: CentreRuntimeIndex;
  matchesObjectAvailable: boolean;
}

/** Merge the three sources into one row per matchNumber. Pure; never throws. */
export function buildMatchCentreModel(input: BuildMatchCentreInput): MatchCentreRow[] {
  const { liveMatches, baseMatches, simIndex, runtimeIndex, matchesObjectAvailable } = input;
  const merged = new Map<number, { live?: LiveViewMatch; base?: CentreBaseMatch }>();
  for (const b of baseMatches) merged.set(b.matchNumber, { base: b });
  for (const lv of liveMatches) {
    const e = merged.get(lv.matchNumber) ?? {};
    e.live = lv;
    merged.set(lv.matchNumber, e);
  }

  const rows: MatchCentreRow[] = [];
  for (const [matchNumber, { live, base }] of merged) {
    const stage = live?.stage ?? base?.stage ?? "group";
    const status: LiveViewMatch["status"] = live?.status ?? base?.status ?? "scheduled";
    const teamA = live?.teamA ?? base?.homeTeamId;
    const teamB = live?.teamB ?? base?.awayTeamId;
    const kickoff = live?.kickoff ?? base?.kickoff;
    const actual =
      live && live.status === "complete" && typeof live.goalsA === "number" && typeof live.goalsB === "number"
        ? { goalsA: live.goalsA, goalsB: live.goalsB, winner: live.winner, penalties: live.penalties }
        : undefined;

    const forecast = resolveCentreForecast({
      runtime: runtimeIndex[matchNumber],
      sim: simIndex[matchNumber],
      matchesObjectAvailable,
      status,
    });

    const row: MatchCentreRow = { matchNumber, stage, status, forecast };
    if (base?.group ?? live?.group) row.group = base?.group ?? live?.group;
    if (kickoff) row.kickoff = kickoff;
    if (teamA) row.teamA = teamA;
    if (teamB) row.teamB = teamB;
    if (actual) row.actual = actual;
    rows.push(row);
  }
  return rows;
}

function statusRank(status: LiveViewMatch["status"]): number {
  if (status === "in-progress") return 0;
  if (status === "scheduled") return 1;
  if (status === "complete") return 2;
  return 3;
}

/** Order: Live → Upcoming (kickoff asc) → Completed (kickoff desc) → other. */
export function orderMatches(rows: MatchCentreRow[]): MatchCentreRow[] {
  const t = (k?: string) => (k ? Date.parse(k) : NaN);
  return [...rows].sort((a, b) => {
    const ra = statusRank(a.status);
    const rb = statusRank(b.status);
    if (ra !== rb) return ra - rb;
    const ka = t(a.kickoff);
    const kb = t(b.kickoff);
    if (a.status === "complete") {
      const va = Number.isNaN(ka) ? -Infinity : ka;
      const vb = Number.isNaN(kb) ? -Infinity : kb;
      if (va !== vb) return vb - va; // most recent first
    } else {
      const va = Number.isNaN(ka) ? Infinity : ka;
      const vb = Number.isNaN(kb) ? Infinity : kb;
      if (va !== vb) return va - vb; // soonest first
    }
    return a.matchNumber - b.matchNumber;
  });
}

export type MatchCentreFilter = "all" | "upcoming" | "live" | "completed" | "group" | "knockout";

export function filterMatches(rows: MatchCentreRow[], filter: MatchCentreFilter): MatchCentreRow[] {
  switch (filter) {
    case "upcoming":
      return rows.filter((r) => r.status === "scheduled");
    case "live":
      return rows.filter((r) => r.status === "in-progress");
    case "completed":
      return rows.filter((r) => r.status === "complete");
    case "group":
      return rows.filter((r) => r.stage === "group");
    case "knockout":
      return rows.filter((r) => r.stage !== "group" && r.stage.length > 0);
    default:
      return rows;
  }
}

// --------------------------------------------------------------------------
// Aged-well verdict (only for genuine captured pre-match forecasts)
// --------------------------------------------------------------------------

export type AgedWellVerdict = "called" | "missed" | null;

/** "Did the pre-match forecast age well?" — never for retrospective/baseline. */
export function agedWellVerdict(forecast: CentreForecast, live: LiveViewMatch | undefined): AgedWellVerdict {
  if (!forecast.agedWellEligible || !forecast.data || !live) return null;
  const cmp = compareForecastToActual(
    {
      homeTeamId: forecast.data.homeTeamId,
      awayTeamId: forecast.data.awayTeamId,
      predictedOutcome: predictedOutcomeOf(forecast.data),
      mostLikely: forecast.data.topScoreline
        ? { homeGoals: forecast.data.topScoreline.homeGoals, awayGoals: forecast.data.topScoreline.awayGoals }
        : { homeGoals: -1, awayGoals: -1 },
    },
    live,
  );
  if (cmp.kind !== "final") return null;
  return cmp.winnerVerdict === "correct" || cmp.winnerVerdict === "predicted-draw" ? "called" : "missed";
}
