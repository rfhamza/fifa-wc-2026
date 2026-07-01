/**
 * Forecast hero data + presentational helpers (UX-1) — PURE
 * ---------------------------------------------------------
 * Pure mapping from the PR-83E2 runtime read helpers' outputs into the compact,
 * already-public-safe shape the home hero renders, plus the small label/format
 * helpers the `SourceBadge` / `MoverChip` presentational components use.
 *
 * PURE: no React, no I/O, no env, no Blob. It imports only TYPES from the forecast
 * layer (never the server-only runtime store), so it is safe to unit-test in node and
 * safe to import from either server or client components.
 */
import type { ForecastSnapshot } from "@/lib/model/forecast-snapshots";
import type { RuntimeCurrentSnapshotPolicy } from "@/lib/model/forecast-runtime-store";
import type { ForecastMover, ForecastMoversResult } from "@/lib/model/forecast-deltas";
import type { Team } from "@/lib/types";

export type ForecastSourceKind = "blob" | "committed-fallback" | "unavailable";

export interface HeroTeamRef {
  teamId: string;
  name: string;
  flag: string;
  countryCode: string;
}
export interface HeroFavourite extends HeroTeamRef {
  /** Title probability in [0,1]. */
  titleProbability: number;
}
export interface HeroMover extends HeroTeamRef {
  fromProbability: number;
  toProbability: number;
  /** Signed change in percentage points (e.g. +3.2, -1.5). */
  deltaPp: number;
}

export interface ForecastHeroData {
  source: ForecastSourceKind;
  asOfLabel: string | null;
  favourite: HeroFavourite | null;
  riser: HeroMover | null;
  faller: HeroMover | null;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** Deterministic UTC date label ("2026-06-11" → "11 Jun 2026"); null if unparseable. */
export function formatAsOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Operator-friendly forecast-source label (no tokens/URLs). */
export function sourceLabel(source: ForecastSourceKind): string {
  switch (source) {
    case "blob":
      return "Live forecast";
    case "committed-fallback":
      return "Showing last published forecast";
    default:
      return "Forecast unavailable";
  }
}

/** Badge variant tone for a forecast source. */
export function sourceTone(source: ForecastSourceKind): "default" | "muted" | "outline" {
  switch (source) {
    case "blob":
      return "default";
    case "committed-fallback":
      return "muted";
    default:
      return "outline";
  }
}

export type MoverDirection = "up" | "down" | "neutral";

/** Direction of a percentage-point delta (neutral within ±0.05 pts). */
export function moverDirection(deltaPp: number): MoverDirection {
  if (deltaPp > 0.05) return "up";
  if (deltaPp < -0.05) return "down";
  return "neutral";
}

/** Signed percentage-point label, e.g. "+3.2 pts" / "−1.5 pts" / "±0.0 pts". */
export function formatPpDelta(deltaPp: number, digits = 1): string {
  const dir = moverDirection(deltaPp);
  const magnitude = Math.abs(deltaPp).toFixed(digits);
  if (dir === "neutral") return `±${magnitude} pts`;
  return `${dir === "up" ? "+" : "−"}${magnitude} pts`;
}

/** Screen-reader text for a percentage-point delta. */
export function ppDeltaSrText(deltaPp: number, digits = 1): string {
  const dir = moverDirection(deltaPp);
  const magnitude = Math.abs(deltaPp).toFixed(digits);
  if (dir === "neutral") return `unchanged, ${magnitude} percentage points`;
  return `${dir} ${magnitude} percentage points`;
}

function teamRef(team: Team): HeroTeamRef {
  return { teamId: team.id, name: team.name, flag: team.flag, countryCode: team.countryCode };
}

function mapMover(mover: ForecastMover | undefined, resolveTeam: (id: string) => Team | null): HeroMover | null {
  if (!mover) return null;
  const team = resolveTeam(mover.teamId);
  if (!team) return null;
  return {
    ...teamRef(team),
    fromProbability: mover.fromProbability,
    toProbability: mover.toProbability,
    deltaPp: mover.deltaPercentagePoints,
  };
}

export interface BuildForecastHeroDataInput {
  /** The runtime current forecast snapshot (Blob or committed fallback), or null. */
  snapshot: ForecastSnapshot | null;
  /** The runtime source policy (drives the source badge). */
  policy: Pick<RuntimeCurrentSnapshotPolicy, "currentSource">;
  /** Biggest movers vs baseline (signed mode expected: risers/fallers). */
  movers: ForecastMoversResult;
  /** Safe team lookup that returns null (never throws) for an unknown id. */
  resolveTeam: (id: string) => Team | null;
}

/** Build the compact, public-safe hero view-model. Pure; never throws. */
export function buildForecastHeroData(input: BuildForecastHeroDataInput): ForecastHeroData {
  const { snapshot, policy, movers, resolveTeam } = input;

  let favourite: HeroFavourite | null = null;
  if (snapshot && snapshot.teams.length > 0) {
    const top = [...snapshot.teams].sort((a, b) => b.winner - a.winner)[0]!;
    const team = resolveTeam(top.teamId);
    if (team) favourite = { ...teamRef(team), titleProbability: top.winner };
  }

  return {
    source: policy.currentSource,
    asOfLabel: formatAsOf(snapshot?.meta.asOf ?? null),
    favourite,
    riser: mapMover(movers.risers?.[0], resolveTeam),
    faller: mapMover(movers.fallers?.[0], resolveTeam),
  };
}
