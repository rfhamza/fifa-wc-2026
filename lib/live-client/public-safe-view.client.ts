/**
 * Phase 1.28Q-A - typed UI client + pure view helpers for the public live-state API.
 * ---------------------------------------------------------------------------------
 * This module is the UI's HTTP-contract boundary. It RE-DECLARES the public-safe wire
 * shape (it does NOT import `@/lib/live-state/*`, keeping the UI fully decoupled from the
 * server live-state layer) and exposes a no-store fetch helper plus pure, testable view
 * helpers. A type-assignability test guards the view type against the server projection.
 *
 * It surfaces ONLY canonical, sanitized fields - never provider IDs, raw payloads, tokens,
 * private Blob URLs, or headers.
 */
import { LIVE_STATE_ENDPOINT } from "./config";

/* ---- view types (mirror of the sanitized PublicSafeLiveState wire shape) ---- */

export type LiveViewStatus = "ok" | "stale" | "unavailable";
export type LiveViewFreshness = "fresh" | "stale" | "fallback" | "missing" | "invalid";
export type LiveViewMatchStatus =
  | "scheduled" | "in-progress" | "complete" | "postponed" | "cancelled" | "unknown";
export type LiveViewSourcePolicy =
  | "manual-snapshot" | "provider-private-deferred" | "provider-public-delayed";
export type LiveViewBracketResolution = "resolved" | "partial" | "unresolved";
export type LiveViewQualification = "qualified" | "eliminated" | "undecided";

export interface LiveViewAttribution {
  sourceName: string;
  sourceUrl?: string;
  text: string;
}

export interface LiveViewMatch {
  matchNumber: number;
  matchId: string;
  stage: string;
  group?: string;
  kickoff?: string;
  teamA: string;
  teamB: string;
  status: LiveViewMatchStatus;
  goalsA?: number;
  goalsB?: number;
  winner?: string;
  penalties?: { a: number; b: number };
  lastUpdatedAt?: string;
}

export interface LiveViewStanding {
  group: string;
  position: number;
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  qualificationState: LiveViewQualification;
  derivedFrom: "results";
}

export interface LiveViewBracketMatch {
  matchNumber: number;
  round: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  winner: string | null;
  resolution: LiveViewBracketResolution;
  derivedFrom: "results";
}

export interface LiveStateView {
  schemaVersion: string;
  tournamentId: string;
  asOf: string;
  generatedAt: string;
  status: LiveViewStatus;
  freshness: LiveViewFreshness;
  validationStatus: { ok: boolean; warningCount: number };
  attribution: LiveViewAttribution;
  isProviderDerived: boolean;
  publicSourcePolicy: LiveViewSourcePolicy;
  matches: LiveViewMatch[];
  standings: LiveViewStanding[];
  bracket: LiveViewBracketMatch[];
}

/** Minimal team identity the UI needs (server passes a lookup; no provider data). */
export interface TeamLite {
  id: string;
  name: string;
  flag: string;
  countryCode: string;
}
export type TeamLookup = Record<string, TeamLite>;

export type LiveFetchResult =
  | { ok: true; state: LiveStateView }
  | { ok: false; error: string };

/* ---- fetch (no-store) ---- */

/** Minimal structural guard - never trusts unexpected shapes. */
export function isLiveStateView(x: unknown): x is LiveStateView {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.schemaVersion === "string" &&
    typeof o.status === "string" &&
    typeof o.publicSourcePolicy === "string" &&
    Array.isArray(o.matches) &&
    Array.isArray(o.standings) &&
    Array.isArray(o.bracket) &&
    typeof o.attribution === "object" && o.attribution !== null
  );
}

/** Fetch the sanitized live state from the app's own API. Never throws. */
export async function fetchPublicSafeLiveState(
  fetchImpl: typeof fetch = fetch,
): Promise<LiveFetchResult> {
  try {
    const res = await fetchImpl(LIVE_STATE_ENDPOINT, { cache: "no-store" });
    const body: unknown = await res.json().catch(() => null);
    if (!isLiveStateView(body)) return { ok: false, error: "unavailable" };
    // A 503 still carries a safe "unavailable" body; treat by its own status field.
    return { ok: true, state: body };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

/* ---- pure view helpers ---- */

/** Calm, non-alarming label for the source policy. */
export function friendlyPolicyLabel(policy: LiveViewSourcePolicy): string {
  switch (policy) {
    case "provider-public-delayed":
      return "Live - provider-backed (delayed)";
    case "provider-private-deferred":
      return "Provider (private)";
    case "manual-snapshot":
    default:
      return "Manual snapshot";
  }
}

/** Short, calm freshness phrase derived from status + freshness. */
export function freshnessLabel(view: Pick<LiveStateView, "status" | "freshness">): string {
  if (view.status === "unavailable" || view.freshness === "missing" || view.freshness === "invalid") {
    return "Unavailable";
  }
  if (view.status === "stale" || view.freshness === "stale" || view.freshness === "fallback") {
    return "May be delayed";
  }
  return "Up to date";
}

/** Relative "x min ago" from an ISO instant; caller supplies `nowMs` (deterministic in tests). */
export function formatRelativeTime(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "unknown";
  const sec = Math.max(0, Math.round((nowMs - t) / 1000));
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  return `${Math.round(hr / 24)} d ago`;
}

/**
 * In-progress matches first, then the most-recent completed (by kickoff desc, then
 * matchNumber desc), capped. Scheduled matches are excluded by default.
 */
export function selectLatestMatches(
  matches: readonly LiveViewMatch[],
  completedLimit = 6,
): LiveViewMatch[] {
  const byRecency = (a: LiveViewMatch, b: LiveViewMatch): number => {
    const ka = a.kickoff ? Date.parse(a.kickoff) : 0;
    const kb = b.kickoff ? Date.parse(b.kickoff) : 0;
    if (kb !== ka) return kb - ka;
    return b.matchNumber - a.matchNumber;
  };
  const inProgress = matches.filter((m) => m.status === "in-progress").slice().sort(byRecency);
  const completed = matches.filter((m) => m.status === "complete").slice().sort(byRecency).slice(0, completedLimit);
  return [...inProgress, ...completed];
}

export interface GroupStandingView {
  group: string;
  rows: LiveViewStanding[];
}

/** Standings grouped by group id, each sorted by position. */
export function groupStandings(standings: readonly LiveViewStanding[]): GroupStandingView[] {
  const byGroup = new Map<string, LiveViewStanding[]>();
  for (const s of standings) {
    const list = byGroup.get(s.group) ?? [];
    list.push(s);
    byGroup.set(s.group, list);
  }
  return [...byGroup.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, rows]) => ({ group, rows: rows.slice().sort((x, y) => x.position - y.position) }));
}

export interface BracketSummary {
  total: number;
  resolved: number;
  partial: number;
  unresolved: number;
}

/** Resolution counts for a given round (default Round of 32). */
export function summariseBracket(
  bracket: readonly LiveViewBracketMatch[],
  round = "roundOf32",
): BracketSummary {
  const rows = bracket.filter((b) => b.round === round);
  return {
    total: rows.length,
    resolved: rows.filter((b) => b.resolution === "resolved").length,
    partial: rows.filter((b) => b.resolution === "partial").length,
    unresolved: rows.filter((b) => b.resolution === "unresolved").length,
  };
}

/* ---- third-place race (cautious labels; derived, never overclaiming) ---- */

export type ThirdPlaceStatus =
  | "Clinched" | "Eliminated" | "Top-eight zone" | "On the bubble" | "Still unresolved";

export interface ThirdPlaceEntry {
  rank: number;
  teamId: string;
  group: string;
  points: number;
  goalDifference: number;
  goalsFor: number;
  qualificationState: LiveViewQualification;
  status: ThirdPlaceStatus;
}

export interface ThirdPlaceRace {
  /** Fixed competition rule: 8 of the 12 third-place teams advance. */
  qualifySlots: number;
  totalThirdPlace: number;
  inZone: number;
  bubble: number;
  unresolved: number;
  clinched: number;
  eliminated: number;
  ranked: ThirdPlaceEntry[];
}

/**
 * Rank the position-3 teams across groups (points -> GD -> GF) and bucket them with CAUTIOUS
 * labels. "Clinched"/"Eliminated" come ONLY from the public `qualificationState`; ranking
 * never asserts final qualification - undecided teams are "Top-eight zone" / "On the bubble"
 * / "Still unresolved" by current standing only.
 */
export function deriveThirdPlaceRace(
  standings: readonly LiveViewStanding[],
  qualifySlots = 8,
): ThirdPlaceRace {
  const thirds = standings
    .filter((s) => s.position === 3)
    .slice()
    .sort((a, b) =>
      b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor,
    );

  const ranked: ThirdPlaceEntry[] = thirds.map((s, i) => {
    const rank = i + 1;
    let status: ThirdPlaceStatus;
    if (s.qualificationState === "qualified") status = "Clinched";
    else if (s.qualificationState === "eliminated") status = "Eliminated";
    else if (rank <= qualifySlots) status = "Top-eight zone";
    else if (rank <= qualifySlots + 2) status = "On the bubble";
    else status = "Still unresolved";
    return {
      rank,
      teamId: s.teamId,
      group: s.group,
      points: s.points,
      goalDifference: s.goalDifference,
      goalsFor: s.goalsFor,
      qualificationState: s.qualificationState,
      status,
    };
  });

  return {
    qualifySlots,
    totalThirdPlace: ranked.length,
    inZone: ranked.filter((r) => r.status === "Top-eight zone").length,
    bubble: ranked.filter((r) => r.status === "On the bubble").length,
    unresolved: ranked.filter((r) => r.status === "Still unresolved").length,
    clinched: ranked.filter((r) => r.status === "Clinched").length,
    eliminated: ranked.filter((r) => r.status === "Eliminated").length,
    ranked,
  };
}
