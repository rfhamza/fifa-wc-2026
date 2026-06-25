/**
 * Phase 1.28A - football-data.org -> internal mapping helpers (pure, fail-closed).
 * --------------------------------------------------------------------------------
 * Maps football-data.org's UPPER_SNAKE status/stage enums and provider team
 * spellings to the app's internal values. Teams are resolved by NAME (then
 * shortName) via the shared `resolveTeamId` + a small provider-specific alias layer;
 * provider TLAs/ids are NEVER a mapping key (they are provenance only). Unknown
 * inputs return null (the normalizer excludes the row - fail closed).
 */
import type { LiveMatchStatus, LiveStage } from "@/lib/live-state/types";
import { normalizeName, resolveTeamId } from "@/lib/live-ingest/mapping";
import type { FdTeamRef } from "./types";

/** football-data.org status -> internal LiveMatchStatus. */
const FD_STATUS_MAP: Record<string, LiveMatchStatus> = {
  TIMED: "scheduled",
  SCHEDULED: "scheduled",
  LIVE: "in-progress",
  IN_PLAY: "in-progress",
  PAUSED: "in-progress",
  FINISHED: "complete",
  POSTPONED: "postponed",
  SUSPENDED: "postponed",
  CANCELLED: "cancelled",
};

/** Map a provider status; unknown -> internal "unknown" (caller may warn). */
export function resolveFdStatus(raw: string): LiveMatchStatus {
  return FD_STATUS_MAP[(raw ?? "").toUpperCase()] ?? "unknown";
}

/** Statuses we treat as a soft exception worth a warning (kept mapping, not fatal). */
export function isFdExceptionStatus(raw: string): boolean {
  const u = (raw ?? "").toUpperCase();
  return u === "SUSPENDED" || u === "POSTPONED" || u === "CANCELLED";
}

/** football-data.org stage -> internal LiveStage; unknown -> null (fail closed). */
const FD_STAGE_MAP: Record<string, LiveStage> = {
  GROUP_STAGE: "group",
  LAST_32: "roundOf32",
  LAST_16: "roundOf16",
  QUARTER_FINALS: "quarterFinal",
  SEMI_FINALS: "semiFinal",
  THIRD_PLACE: "thirdPlace",
  FINAL: "final",
};

export function resolveFdStage(raw: string): LiveStage | null {
  return FD_STAGE_MAP[(raw ?? "").toUpperCase()] ?? null;
}

/**
 * Provider-specific team-name aliases (normalised form -> app team id) for spellings
 * the shared resolver does not already cover. Map by NAME only.
 */
export const FD_TEAM_ALIASES: Record<string, string> = {
  "cape verde islands": "cape-verde", // provider `name`; shortName "Cape Verde" already resolves
  "bosnia h": "bosnia-herzegovina", // provider `shortName` "Bosnia-H."
  "korea republic": "south-korea", // provider `shortName`
};

/**
 * Resolve a football-data.org team object to an app team id, or null (fail closed).
 * Tries `name` then `shortName` (never the TLA, which is provenance only).
 */
export function resolveFdTeamId(team: FdTeamRef | null | undefined): string | null {
  if (!team) return null;
  for (const candidate of [team.name, team.shortName]) {
    if (!candidate) continue;
    const id = FD_TEAM_ALIASES[normalizeName(candidate)] ?? resolveTeamId(candidate);
    if (id) return id;
  }
  return null;
}
