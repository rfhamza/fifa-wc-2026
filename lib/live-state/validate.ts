/**
 * Phase 1.25B - Live snapshot VALIDATOR (pure).
 * --------------------------------------------
 * Parses & validates manual-snapshot-style live match input against injected
 * official reference data. It NEVER throws and NEVER silently drops: every
 * exclusion is recorded as a fatal error (match marked `invalid`) and every
 * non-fatal concern is a warning. No model/simulator/prediction imports.
 *
 * This phase covers fixtures/results/status only — NO in-play event fields are
 * accepted (lineups/injuries/xG/shots/cards/subs are rejected outright).
 */
import type {
  FreshnessOptions,
  LiveMatchState,
  LiveStateReference,
  LiveValidationIssue,
  LiveValidationResult,
  RawLiveMatch,
  RawLiveSnapshot,
} from "./types";

/** Sanity ceiling for a single side's goals; anything above is "impossible". */
const MAX_GOALS = 99;

/** Keys that would smuggle in-play context into the first live phase (rejected). */
const FORBIDDEN_INPLAY_KEYS = [
  "lineup",
  "lineups",
  "injury",
  "injuries",
  "xg",
  "xG",
  "shots",
  "cards",
  "yellowCards",
  "redCards",
  "substitution",
  "substitutions",
  "subs",
  "possession",
  "events",
];

const ALLOWED_MATCH_KEYS = new Set<string>([
  "matchId",
  "stage",
  "group",
  "teamA",
  "teamB",
  "status",
  "goalsA",
  "goalsB",
  "winner",
  "penalties",
  "kickoff",
  "venueId",
  "lastUpdatedAt",
]);

function isInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n);
}

function validGoal(n: unknown): n is number {
  return isInt(n) && n >= 0 && n <= MAX_GOALS;
}

/** Pure per-match freshness from `lastUpdatedAt` vs `asOf`/`staleAfterSeconds`. */
export function computeMatchFreshness(
  lastUpdatedAt: string | undefined,
  fresh: FreshnessOptions,
): "fresh" | "stale" {
  if (!lastUpdatedAt) return "stale";
  const updated = Date.parse(lastUpdatedAt);
  const asOf = Date.parse(fresh.asOf);
  if (!Number.isFinite(updated) || !Number.isFinite(asOf)) return "stale";
  return asOf - updated <= fresh.staleAfterSeconds * 1000 ? "fresh" : "stale";
}

/**
 * Validate a raw live snapshot against the official reference.
 * @param snapshot   manual-snapshot-style input
 * @param reference  static official fixtures/bracket/teams to validate against
 * @param fresh      deterministic freshness window (caller supplies `asOf`)
 */
export function validateLiveSnapshot(
  snapshot: RawLiveSnapshot,
  reference: LiveStateReference,
  fresh: FreshnessOptions,
): LiveValidationResult {
  const errors: LiveValidationIssue[] = [];
  const warnings: LiveValidationIssue[] = [];
  const matches: LiveMatchState[] = [];

  const groupRef = new Map(reference.groupMatches.map((m) => [m.matchId, m]));
  const koRef = new Map(reference.knockoutMatches.map((m) => [m.matchId, m]));
  const validTeams = new Set(reference.validTeamIds);
  const seen = new Set<string>();

  for (const raw of snapshot.matches) {
    const id = raw.matchId;
    const localErr: LiveValidationIssue[] = [];
    const localWarn: LiveValidationIssue[] = [];
    const err = (code: string, message: string) =>
      localErr.push({ matchId: id, code, message, fatal: true });
    const warn = (code: string, message: string) =>
      localWarn.push({ matchId: id, code, message, fatal: false });

    // 0. No in-play fields (first live phase is results/standings/bracket only).
    for (const key of Object.keys(raw as unknown as Record<string, unknown>)) {
      if (FORBIDDEN_INPLAY_KEYS.includes(key)) {
        err("inplay-field", `In-play field "${key}" is not accepted in this phase.`);
      } else if (!ALLOWED_MATCH_KEYS.has(key)) {
        warn("unknown-field", `Unknown field "${key}" ignored.`);
      }
    }

    // 1. Duplicate match id.
    if (seen.has(id)) err("duplicate-match-id", `Duplicate match id "${id}".`);
    seen.add(id);

    // 2. Known match id + stage/group consistency.
    const gRef = groupRef.get(id);
    const kRef = koRef.get(id);
    if (!gRef && !kRef) {
      err("unknown-match-id", `Match id "${id}" is not in the official schedule/bracket.`);
    }

    // 3. Team ids valid + distinct.
    if (!validTeams.has(raw.teamA)) err("invalid-team", `Unknown team id "${raw.teamA}".`);
    if (!validTeams.has(raw.teamB)) err("invalid-team", `Unknown team id "${raw.teamB}".`);
    if (raw.teamA === raw.teamB) err("same-team", `teamA and teamB are identical ("${raw.teamA}").`);

    if (gRef) {
      if (raw.stage !== "group") err("stage-mismatch", `Match "${id}" is a group match; stage "${raw.stage}" invalid.`);
      if (raw.group && raw.group !== gRef.group)
        err("group-mismatch", `Match "${id}" is in group ${gRef.group}, not ${raw.group}.`);
      const pair = new Set([raw.teamA, raw.teamB]);
      if (pair.size === 2 && !(pair.has(gRef.homeTeamId) && pair.has(gRef.awayTeamId)))
        err("teams-mismatch", `Match "${id}" official pairing is ${gRef.homeTeamId} v ${gRef.awayTeamId}.`);
    } else if (kRef) {
      if (raw.stage !== kRef.stage)
        err("stage-mismatch", `Match "${id}" is ${kRef.stage}; stage "${raw.stage}" invalid.`);
      if (raw.group) warn("group-on-knockout", `Knockout match "${id}" should not carry a group.`);
    }

    // 4. Score / status consistency.
    const hasA = raw.goalsA !== undefined;
    const hasB = raw.goalsB !== undefined;
    const playableScore = raw.status === "complete" || raw.status === "in-progress";
    if (hasA && !validGoal(raw.goalsA)) err("impossible-score", `goalsA "${raw.goalsA}" is invalid.`);
    if (hasB && !validGoal(raw.goalsB)) err("impossible-score", `goalsB "${raw.goalsB}" is invalid.`);
    if (!playableScore && (hasA || hasB))
      err("score-on-nonplayable", `Status "${raw.status}" must not carry a score.`);
    if (raw.status === "complete" && (!hasA || !hasB))
      err("complete-missing-score", `Completed match "${id}" is missing a score.`);

    // 5. Winner / penalties (knockout outcome integrity).
    if (raw.winner !== undefined && raw.winner !== raw.teamA && raw.winner !== raw.teamB)
      err("winner-not-participant", `Winner "${raw.winner}" is not a participant of "${id}".`);
    if (gRef && (raw.winner !== undefined || raw.penalties !== undefined))
      warn("knockout-fields-on-group", `Group match "${id}" should not carry winner/penalties (ignored).`);

    if (kRef && raw.status === "complete" && validGoal(raw.goalsA) && validGoal(raw.goalsB)) {
      const a = raw.goalsA as number;
      const b = raw.goalsB as number;
      if (a === b) {
        // Drawn on goals: needs penalties or an explicit winner.
        if (raw.penalties) {
          const { a: pa, b: pb } = raw.penalties;
          if (!isInt(pa) || !isInt(pb) || pa < 0 || pb < 0)
            err("impossible-penalties", `Penalty score for "${id}" is invalid.`);
          else if (pa === pb) err("penalties-tied", `Penalty shootout for "${id}" cannot be tied.`);
          else {
            const penWinner = pa > pb ? raw.teamA : raw.teamB;
            if (raw.winner !== undefined && raw.winner !== penWinner)
              err("winner-penalty-mismatch", `Winner "${raw.winner}" contradicts the shootout for "${id}".`);
          }
        } else if (raw.winner === undefined) {
          err("draw-needs-winner", `Completed knockout "${id}" drawn on goals needs a winner or penalties.`);
        }
      } else {
        const goalWinner = a > b ? raw.teamA : raw.teamB;
        if (raw.winner !== undefined && raw.winner !== goalWinner)
          err("winner-score-mismatch", `Winner "${raw.winner}" contradicts the score for "${id}".`);
      }
    }
    if (raw.penalties && raw.status !== "complete")
      warn("penalties-on-incomplete", `Penalties on non-complete match "${id}" (ignored).`);

    // Assemble the match state. Fatal-invalid rows are kept but flagged `invalid`.
    const fatal = localErr.length > 0;
    const matchWarnings = [...localErr, ...localWarn].map((i) => `${i.code}: ${i.message}`);
    if (!raw.lastUpdatedAt && !fatal)
      matchWarnings.push("missing-last-updated: no lastUpdatedAt; treated as stale.");

    matches.push(toMatchState(raw, snapshot.source.sourceId, fatal ? "invalid" : computeMatchFreshness(raw.lastUpdatedAt, fresh), matchWarnings));
    errors.push(...localErr);
    warnings.push(...localWarn);
  }

  return { ok: errors.length === 0, matches, errors, warnings };
}

function toMatchState(
  raw: RawLiveMatch,
  source: string,
  freshnessStatus: LiveMatchState["freshnessStatus"],
  warnings: string[],
): LiveMatchState {
  return {
    matchId: raw.matchId,
    stage: raw.stage,
    group: raw.group,
    kickoff: raw.kickoff,
    venueId: raw.venueId,
    teamA: raw.teamA,
    teamB: raw.teamB,
    status: raw.status,
    goalsA: raw.goalsA,
    goalsB: raw.goalsB,
    winner: raw.winner,
    penalties: raw.penalties,
    lastUpdatedAt: raw.lastUpdatedAt,
    source,
    freshnessStatus,
    warnings,
  };
}
