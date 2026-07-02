/**
 * Bracket deep-link URL state — pure parse / validate / serialize (UX-4D).
 * -----------------------------------------------------------------------
 * Maps the `/bracket` selection (`selectedMatchNumber` + `selectedTeamId`) to and from
 * the URL query string (`?match=`, `?team=`). PURE: no React, no `window`, no I/O, no
 * Blob, no fetch. Validity is INJECTED (the caller supplies the valid match numbers and
 * team ids) so this stays data-free and Node-testable.
 *
 * Two distinct serializers on purpose:
 *   - `serializeBracketSearchParams` → a CANONICAL, clean share link (only `team`/`match`,
 *     nulls omitted, no unknown/noisy params). Used by the copy-link affordance.
 *   - `updateBracketSearchParams` → mirrors the selection into an EXISTING param set while
 *     PRESERVING every other (unknown) key. Used to keep the address bar in sync without
 *     clobbering params the app does not own.
 */

/** Minimal structural read view — satisfied by both `URLSearchParams` and Next's `ReadonlyURLSearchParams`. */
export interface SearchParamsLike {
  get(name: string): string | null;
}

export interface BracketSelection {
  matchNumber: number | null;
  teamId: string | null;
}

export interface BracketSelectionParseOptions {
  validMatchNumbers: ReadonlySet<number>;
  /** All valid team ids (NOT just knockout participants) — a valid team absent from the
   * bracket is still a valid selection; `notInKnockout` is resolved downstream. */
  validTeamIds: ReadonlySet<string>;
}

export interface BracketSelectionParse extends BracketSelection {
  /** A `match` param was present in the URL but failed validation (→ "Match not found"). */
  invalidMatch: boolean;
  /** A `team` param was present in the URL but is not a known team id (→ "Team not found"). */
  invalidTeam: boolean;
}

export const BRACKET_MATCH_PARAM = "match";
export const BRACKET_TEAM_PARAM = "team";

const isPresent = (value: string | null): boolean => value != null && value.trim() !== "";

/** Validate a raw `?match=` value: numeric AND an official knockout match number, else null. */
export function validateBracketMatchParam(
  value: string | null,
  validMatchNumbers: ReadonlySet<number>,
): number | null {
  if (!isPresent(value)) return null;
  const trimmed = (value as string).trim();
  if (!/^\d+$/.test(trimmed)) return null; // non-numeric → fail safe
  const n = Number(trimmed);
  return validMatchNumbers.has(n) ? n : null;
}

/** Validate a raw `?team=` value: must be a known team id (any team, not only knockout ones). */
export function validateBracketTeamParam(
  value: string | null,
  validTeamIds: ReadonlySet<string>,
): string | null {
  if (!isPresent(value)) return null;
  const trimmed = (value as string).trim();
  return validTeamIds.has(trimmed) ? trimmed : null;
}

/** Parse+validate both params, flagging present-but-invalid values for the not-found notice. */
export function parseBracketSearchParams(
  params: SearchParamsLike,
  opts: BracketSelectionParseOptions,
): BracketSelectionParse {
  const rawMatch = params.get(BRACKET_MATCH_PARAM);
  const rawTeam = params.get(BRACKET_TEAM_PARAM);
  const matchNumber = validateBracketMatchParam(rawMatch, opts.validMatchNumbers);
  const teamId = validateBracketTeamParam(rawTeam, opts.validTeamIds);
  return {
    matchNumber,
    teamId,
    invalidMatch: isPresent(rawMatch) && matchNumber == null,
    invalidTeam: isPresent(rawTeam) && teamId == null,
  };
}

/**
 * CANONICAL share params from validated selection: `team` first, then `match`; nulls
 * omitted; NO other keys. `serializeBracketSearchParams({team,match}).toString()` →
 * e.g. `team=canada&match=73` (or `""` when nothing is selected).
 */
export function serializeBracketSearchParams(selection: BracketSelection): URLSearchParams {
  const params = new URLSearchParams();
  if (selection.teamId != null) params.set(BRACKET_TEAM_PARAM, selection.teamId);
  if (selection.matchNumber != null) params.set(BRACKET_MATCH_PARAM, String(selection.matchNumber));
  return params;
}

/**
 * Mirror a selection patch into an EXISTING param set, preserving all other (unknown) keys.
 * A key present in `patch` with a `null` value deletes that param; a key omitted from
 * `patch` is left untouched. Returns a new `URLSearchParams` (never mutates the input).
 */
export function updateBracketSearchParams(
  current: SearchParamsLike | URLSearchParams,
  patch: { matchNumber?: number | null; teamId?: string | null },
): URLSearchParams {
  const next = new URLSearchParams(
    current instanceof URLSearchParams ? current.toString() : String((current as { toString(): string }).toString()),
  );
  if ("matchNumber" in patch) {
    if (patch.matchNumber == null) next.delete(BRACKET_MATCH_PARAM);
    else next.set(BRACKET_MATCH_PARAM, String(patch.matchNumber));
  }
  if ("teamId" in patch) {
    if (patch.teamId == null) next.delete(BRACKET_TEAM_PARAM);
    else next.set(BRACKET_TEAM_PARAM, patch.teamId);
  }
  return next;
}
