/**
 * Phase 1.26B - Provider -> app alias mapping helpers (pure, fail-closed).
 * -----------------------------------------------------------------------
 * Explicit, testable mapping from a provider's native identifiers to the app's
 * canonical ones. Lessons from the Phase 1.25C real snapshot are baked in:
 *   - Map teams by NAME, not by code. Provider codes mix IOC/FIFA/ISO styles
 *     (e.g. `IRI` vs `IRN`, `DZA` vs `ALG`) and are unreliable.
 *   - FAIL CLOSED: an unknown/ambiguous input returns `null` (the caller excludes
 *     the row); never guess a mapping.
 *
 * Reads canonical team/venue/group identity from `lib/data` (the single source of
 * truth) - it does NOT redeclare or modify official team/fixture data.
 */
import { teams, venues, GROUP_IDS } from "@/lib/data";
import type { GroupId } from "@/lib/types";
import type { LiveMatchStatus, LiveStage } from "@/lib/live-state/types";

/** Normalise a label: strip diacritics/punctuation, lowercase, collapse spaces. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // strip combining diacritical marks
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Canonical app team name -> id index (built from official data). */
const TEAM_NAME_INDEX: Map<string, string> = new Map(
  teams.map((t) => [normalizeName(t.name), t.id]),
);

/**
 * Explicit team-name aliases (normalised form -> app team id). Covers display-name
 * variants a provider may use that do not match the canonical name verbatim. Map by
 * NAME; codes are intentionally NOT a mapping key.
 */
export const TEAM_ALIASES: Record<string, string> = {
  turkey: "turkiye",
  turkiye: "turkiye",
  "bosnia and herzegovina": "bosnia-herzegovina",
  "bosnia herzegovina": "bosnia-herzegovina",
  "dr congo": "congo-dr",
  "congo dr": "congo-dr",
  "democratic republic of the congo": "congo-dr",
  "united states": "usa",
  "united states of america": "usa",
  usa: "usa",
  "korea republic": "south-korea",
  "south korea": "south-korea",
  "ivory coast": "ivory-coast",
  "cote d ivoire": "ivory-coast",
  "czech republic": "czechia",
  "cape verde": "cape-verde",
  curacao: "curacao",
};

/** Resolve a provider team name/alias to an app team id, or null (fail closed). */
export function resolveTeamId(nameOrAlias: string): string | null {
  const key = normalizeName(nameOrAlias);
  return TEAM_ALIASES[key] ?? TEAM_NAME_INDEX.get(key) ?? null;
}

/** Provider status string -> internal LiveMatchStatus (`live` -> `in-progress`). */
const STATUS_ALIASES: Record<string, LiveMatchStatus> = {
  finished: "complete",
  complete: "complete",
  completed: "complete",
  ft: "complete",
  "full time": "complete",
  ended: "complete",
  live: "in-progress",
  inplay: "in-progress",
  "in play": "in-progress",
  "in progress": "in-progress",
  playing: "in-progress",
  scheduled: "scheduled",
  "not started": "scheduled",
  ns: "scheduled",
  upcoming: "scheduled",
  fixture: "scheduled",
  postponed: "postponed",
  suspended: "postponed",
  cancelled: "cancelled",
  canceled: "cancelled",
  abandoned: "cancelled",
};

/** Resolve a provider status; unknown maps to the explicit `unknown` status. */
export function resolveStatus(raw: string): LiveMatchStatus {
  return STATUS_ALIASES[normalizeName(raw)] ?? "unknown";
}

/** Provider round label -> internal LiveStage, or null (fail closed). */
const STAGE_ALIASES: Record<string, LiveStage> = {
  group: "group",
  "group stage": "group",
  "round of 32": "roundOf32",
  r32: "roundOf32",
  "round of 16": "roundOf16",
  r16: "roundOf16",
  "quarter final": "quarterFinal",
  "quarter finals": "quarterFinal",
  quarterfinal: "quarterFinal",
  quarterfinals: "quarterFinal",
  "semi final": "semiFinal",
  "semi finals": "semiFinal",
  semifinal: "semiFinal",
  semifinals: "semiFinal",
  "third place": "thirdPlace",
  "third place play off": "thirdPlace",
  "play off for third place": "thirdPlace",
  final: "final",
};

/** Resolve a provider round to an internal stage, or null (fail closed). */
export function resolveStage(raw: string): LiveStage | null {
  return STAGE_ALIASES[normalizeName(raw)] ?? null;
}

const VALID_GROUPS = new Set<string>(GROUP_IDS);

/** Parse a provider group label ("Group A" / "A") to a GroupId, or null. */
export function parseGroupId(raw: string): GroupId | null {
  const norm = normalizeName(raw);
  const m = /^(?:group )?([a-l])$/.exec(norm);
  if (!m) return null;
  const g = m[1]!.toUpperCase();
  return VALID_GROUPS.has(g) ? (g as GroupId) : null;
}

/**
 * Explicit venue aliases (normalised provider venue name -> app venue id). Venue
 * mapping is provenance-only (the snapshot omits venueId), so this is best-effort.
 */
export const VENUE_ALIASES: Record<string, string> = {
  "mexico city stadium": "mexico-city",
  "guadalajara stadium": "guadalajara",
  "monterrey stadium": "monterrey",
  "toronto stadium": "toronto",
  "vancouver stadium": "vancouver",
  "new york new jersey stadium": "new-york",
  "los angeles stadium": "los-angeles",
  "dallas stadium": "dallas",
  "atlanta stadium": "atlanta",
  "miami stadium": "miami",
  "houston stadium": "houston",
  "kansas city stadium": "kansas-city",
  "philadelphia stadium": "philadelphia",
  "seattle stadium": "seattle",
  "san francisco bay area stadium": "san-francisco",
  "boston stadium": "boston",
};

/** Resolve a provider venue name to an app venue id, or null (provenance only). */
export function resolveVenueId(name: string): string | null {
  return VENUE_ALIASES[normalizeName(name)] ?? null;
}

/** Valid app team / venue id sets (for tests/guards). */
export const APP_TEAM_IDS = new Set(teams.map((t) => t.id));
export const APP_VENUE_IDS = new Set(venues.map((v) => v.id));
