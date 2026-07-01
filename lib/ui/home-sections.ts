/**
 * Home story sections — pure data builders (UX-1 revision).
 * ---------------------------------------------------------
 * Pure mapping helpers for the story-led home page: the "Today's / Next matches"
 * selector + match-forecast/team-context indexes, and the "Top contenders" rows.
 * No React, no I/O, no env, no Blob — only TYPE imports from the forecast/live layers,
 * so this is node-testable and safe to import from server or client components.
 */
import type { ForecastSnapshot } from "@/lib/model/forecast-snapshots";
import type { ForecastComparison } from "@/lib/model/forecast-deltas";
import type { PublicSafeMatchForecasts } from "@/lib/model/forecast-public-safe";
import type { LiveViewMatch } from "@/lib/live-client/public-safe-view.client";
import type { Team } from "@/lib/types";
import type { HeroTeamRef } from "@/lib/ui/forecast-hero-data";

// --------------------------------------------------------------------------
// Team tournament-context index (from the runtime current snapshot)
// --------------------------------------------------------------------------

export interface HomeTeamContext {
  winner: number;
  final: number;
  semiFinal: number;
}
export type TeamContextIndex = Record<string, HomeTeamContext>;

export function buildTeamContextIndex(snapshot: ForecastSnapshot | null): TeamContextIndex {
  const index: TeamContextIndex = {};
  if (!snapshot) return index;
  for (const t of snapshot.teams) {
    index[t.teamId] = { winner: t.winner, final: t.final, semiFinal: t.semiFinal };
  }
  return index;
}

// --------------------------------------------------------------------------
// Match-forecast index (TRUE pre-match only — never retrospective)
// --------------------------------------------------------------------------

export interface HomeMatchForecast {
  homeTeamId: string;
  awayTeamId: string;
  homeWin: number;
  draw: number;
  awayWin: number;
  homeAdvance?: number;
  awayAdvance?: number;
  stage: string;
}
export type MatchForecastIndex = Record<number, HomeMatchForecast>;

/**
 * Index the match-forecasts object by matchNumber, keeping ONLY genuine pre-match
 * forecasts (current/archived pre-match). Retrospective model estimates are excluded
 * so a match card never presents hindsight as a pre-match forecast.
 */
export function buildMatchForecastIndex(matchForecasts: PublicSafeMatchForecasts | null): MatchForecastIndex {
  const index: MatchForecastIndex = {};
  if (!matchForecasts) return index;
  for (const e of matchForecasts.matchForecasts) {
    if (e.forecastProvenance === "retrospective-model-forecast") continue;
    const entry: HomeMatchForecast = {
      homeTeamId: e.homeTeamId,
      awayTeamId: e.awayTeamId,
      homeWin: e.homeWin,
      draw: e.draw,
      awayWin: e.awayWin,
      stage: e.stage,
    };
    if (typeof e.homeAdvance === "number") entry.homeAdvance = e.homeAdvance;
    if (typeof e.awayAdvance === "number") entry.awayAdvance = e.awayAdvance;
    index[e.matchNumber] = entry;
  }
  return index;
}

// --------------------------------------------------------------------------
// Today's / Next matches selection (from live-state matches)
// --------------------------------------------------------------------------

export interface HomeMatchesSelection {
  title: "Today's matches" | "Next matches";
  matches: LiveViewMatch[];
}

function sameUtcDay(iso: string | undefined, nowMs: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  const a = new Date(t);
  const b = new Date(nowMs);
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function byKickoffThenNumber(a: LiveViewMatch, b: LiveViewMatch): number {
  const ka = a.kickoff ? Date.parse(a.kickoff) : NaN;
  const kb = b.kickoff ? Date.parse(b.kickoff) : NaN;
  const va = Number.isNaN(ka) ? Infinity : ka;
  const vb = Number.isNaN(kb) ? Infinity : kb;
  if (va !== vb) return va - vb;
  return a.matchNumber - b.matchNumber;
}

/**
 * Pick the matches to feature on the home page: those kicking off *today* (UTC) if any
 * are scheduled/in-progress, otherwise the next upcoming ones. Completed matches are
 * excluded. `nowMs` is injected for determinism.
 */
export function selectHomeMatches(
  matches: LiveViewMatch[],
  nowMs: number,
  limit = 4,
): HomeMatchesSelection {
  const upcoming = matches
    .filter((m) => m.status === "scheduled" || m.status === "in-progress")
    .sort(byKickoffThenNumber);
  const today = upcoming.filter((m) => sameUtcDay(m.kickoff, nowMs));
  if (today.length > 0) return { title: "Today's matches", matches: today.slice(0, limit) };
  return { title: "Next matches", matches: upcoming.slice(0, limit) };
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** Deterministic UTC kickoff label, e.g. "4 Jul, 18:00 UTC"; null if unparseable. */
export function formatKickoff(iso: string | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${hh}:${mm} UTC`;
}

// --------------------------------------------------------------------------
// Top contenders (from the runtime current snapshot + baseline comparison)
// --------------------------------------------------------------------------

export interface HomeContenderRow extends HeroTeamRef {
  rank: number;
  titleProbability: number;
  /** Signed pp change vs baseline (null when the comparison is unavailable). */
  winnerDeltaPp: number | null;
  final: number;
  semiFinal: number;
}

export interface BuildContendersInput {
  snapshot: ForecastSnapshot | null;
  comparison: ForecastComparison | null;
  resolveTeam: (id: string) => Team | null;
  topN?: number;
}

/** Top-N current contenders by title probability, with movement vs baseline. */
export function buildContenders(input: BuildContendersInput): HomeContenderRow[] {
  const { snapshot, comparison, resolveTeam, topN = 5 } = input;
  if (!snapshot) return [];

  const deltaByTeam = new Map<string, number>();
  if (comparison) {
    for (const d of comparison.teamDeltas) {
      const pp = d.stages?.winner?.deltaPercentagePoints;
      if (typeof pp === "number") deltaByTeam.set(d.teamId, pp);
    }
  }

  const top = [...snapshot.teams].sort((a, b) => b.winner - a.winner).slice(0, topN);
  const rows: HomeContenderRow[] = [];
  top.forEach((t, i) => {
    const team = resolveTeam(t.teamId);
    if (!team) return;
    rows.push({
      teamId: team.id,
      name: team.name,
      flag: team.flag,
      countryCode: team.countryCode,
      rank: i + 1,
      titleProbability: t.winner,
      winnerDeltaPp: deltaByTeam.has(t.teamId) ? deltaByTeam.get(t.teamId)! : null,
      final: t.final,
      semiFinal: t.semiFinal,
    });
  });
  return rows;
}
