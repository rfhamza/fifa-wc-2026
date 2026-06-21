/**
 * Phase 1.18B-2 - historical source-pack validator (backtesting layer).
 * --------------------------------------------------------------------
 * Pure, import-light validation of a `HistoricalSourcePack` against the contract and
 * the leakage rules. Part of the ISOLATED backtesting layer: NOT imported by the
 * production 2026 app, does NOT change any probability, and ingests nothing on its own.
 *
 * Enforces (errors fail the pack):
 *  - identity: unique teamIds; groups = 8 x 4 covering exactly the team set; host
 *    present in the team list; every team has a valid confederation.
 *  - results: matchId unique; teams resolve to identity; `group` present only for
 *    group-stage matches; goals are non-negative integers; resultAt90 matches the
 *    90-minute goals; knockout draws-at-90 carry ET + penalties; extra-time/penalty
 *    fields are internally consistent and confined to knockout matches.
 *  - elo/fifa: cover exactly the 32 teams, unique, resolve to identity; every dated
 *    field is STRICTLY BEFORE the opening kickoff (leakage cutoff).
 *  - no BACKTEST_FORBIDDEN_FIELDS anywhere; no result-derived data on feature packs.
 */
import {
  BACKTEST_FORBIDDEN_FIELDS,
  type BacktestValidationResult,
  type HistoricalSourcePack,
  type HistoricalMatchResult,
  type MatchStage,
} from "./types";

const VALID_CONFEDERATIONS = new Set(["AFC", "CAF", "CONCACAF", "CONMEBOL", "OFC", "UEFA"]);
const GROUP_STAGES: ReadonlySet<MatchStage> = new Set<MatchStage>(["group"]);
const isNonNegInt = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= 0;

/** Expected counts for the canonical 32-team / 8-group format (WC-2022 pilot). */
export interface HistoricalPackExpectations {
  teamCount: number;
  groupCount: number;
  teamsPerGroup: number;
  matchCount: number;
  groupMatchCount: number;
  knockoutMatchCount: number;
  /** Optional declared per-confederation entrant counts to cross-check. */
  confederationCounts?: Record<string, number>;
  /** Optional tournament identity expectations (parameterize the host check). */
  expectedTournamentYear?: number;
  /** Host team id that must be present in the team list (e.g. "qatar", "russia"). */
  expectedHostId?: string;
  /** Host country name that must appear in hostCountries (case-insensitive). */
  expectedHostName?: string;
  /** Confederation the host must belong to (e.g. "AFC", "UEFA"). */
  expectedHostConfederation?: string;
}

export const WC2022_EXPECTATIONS: HistoricalPackExpectations = {
  teamCount: 32,
  groupCount: 8,
  teamsPerGroup: 4,
  matchCount: 64,
  groupMatchCount: 48,
  knockoutMatchCount: 16,
  expectedTournamentYear: 2022,
  expectedHostId: "qatar",
  expectedHostName: "Qatar",
  expectedHostConfederation: "AFC",
};

export const WC2018_EXPECTATIONS: HistoricalPackExpectations = {
  teamCount: 32,
  groupCount: 8,
  teamsPerGroup: 4,
  matchCount: 64,
  groupMatchCount: 48,
  knockoutMatchCount: 16,
  expectedTournamentYear: 2018,
  expectedHostId: "russia",
  expectedHostName: "Russia",
  expectedHostConfederation: "UEFA",
};

export const WC2014_EXPECTATIONS: HistoricalPackExpectations = {
  teamCount: 32,
  groupCount: 8,
  teamsPerGroup: 4,
  matchCount: 64,
  groupMatchCount: 48,
  knockoutMatchCount: 16,
  expectedTournamentYear: 2014,
  expectedHostId: "brazil",
  expectedHostName: "Brazil",
  expectedHostConfederation: "CONMEBOL",
  confederationCounts: { UEFA: 13, CONMEBOL: 6, CONCACAF: 4, CAF: 5, AFC: 4, OFC: 0 },
};

export const WC2010_EXPECTATIONS: HistoricalPackExpectations = {
  teamCount: 32,
  groupCount: 8,
  teamsPerGroup: 4,
  matchCount: 64,
  groupMatchCount: 48,
  knockoutMatchCount: 16,
  expectedTournamentYear: 2010,
  expectedHostId: "south-africa",
  expectedHostName: "South Africa",
  expectedHostConfederation: "CAF",
  confederationCounts: { UEFA: 13, CONMEBOL: 5, CONCACAF: 3, CAF: 6, AFC: 4, OFC: 1 },
};

/** Parse an ISO instant; returns NaN-bearing flag for unparseable input. */
const instant = (iso: string): number => new Date(iso).getTime();

/** Scan a plain object graph for any forbidden (proprietary) field name. */
const findForbiddenField = (value: unknown): string | null => {
  if (Array.isArray(value)) {
    for (const v of value) {
      const hit = findForbiddenField(v);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if ((BACKTEST_FORBIDDEN_FIELDS as readonly string[]).includes(key)) return key;
      const hit = findForbiddenField((value as Record<string, unknown>)[key]);
      if (hit) return hit;
    }
  }
  return null;
};

export function validateHistoricalPack(
  pack: HistoricalSourcePack,
  expected: HistoricalPackExpectations = WC2022_EXPECTATIONS,
): BacktestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => errors.push(m);

  const { identity, results, elo, fifa } = pack;
  const cutoff = instant(identity.openingKickoff);
  if (Number.isNaN(cutoff)) err(`identity.openingKickoff is not a valid instant: "${identity.openingKickoff}"`);

  // --- identity: teams -------------------------------------------------------
  const teamSet = new Set(identity.teamIds);
  if (identity.teamIds.length !== expected.teamCount) {
    err(`expected ${expected.teamCount} teams, got ${identity.teamIds.length}`);
  }
  if (teamSet.size !== identity.teamIds.length) err("duplicate teamIds in identity");

  // --- identity: groups (8 x 4 covering exactly the team set) ----------------
  const groupIds = Object.keys(identity.groups);
  if (groupIds.length !== expected.groupCount) {
    err(`expected ${expected.groupCount} groups, got ${groupIds.length}`);
  }
  const grouped = new Set<string>();
  for (const g of groupIds) {
    const members = identity.groups[g] ?? [];
    if (members.length !== expected.teamsPerGroup) {
      err(`group ${g} has ${members.length} teams (expected ${expected.teamsPerGroup})`);
    }
    for (const t of members) {
      if (!teamSet.has(t)) err(`group ${g} references unknown team "${t}"`);
      if (grouped.has(t)) err(`team "${t}" appears in more than one group`);
      grouped.add(t);
    }
  }
  for (const t of identity.teamIds) if (!grouped.has(t)) err(`team "${t}" is not assigned to any group`);

  // --- identity: host + confederations --------------------------------------
  for (const host of identity.hostCountries) {
    const hostId = host.toLowerCase().replace(/\s+/g, "-");
    if (!teamSet.has(hostId)) {
      warnings.push(`host "${host}" did not match a teamId by slug ("${hostId}")`);
    }
  }
  // Parameterized host expectations (replaces the former hardcoded Qatar check).
  if (expected.expectedTournamentYear !== undefined &&
      identity.tournamentYear !== expected.expectedTournamentYear) {
    err(`expected tournamentYear ${expected.expectedTournamentYear}, got ${identity.tournamentYear}`);
  }
  if (expected.expectedHostId !== undefined && !teamSet.has(expected.expectedHostId)) {
    err(`host "${expected.expectedHostId}" is not present in the team list`);
  }
  if (expected.expectedHostName !== undefined &&
      !identity.hostCountries.some((h) => h.toLowerCase() === expected.expectedHostName!.toLowerCase())) {
    err(`hostCountries does not include "${expected.expectedHostName}"`);
  }
  if (expected.expectedHostConfederation !== undefined && expected.expectedHostId !== undefined) {
    const hostConf = identity.confederations[expected.expectedHostId];
    if (hostConf !== expected.expectedHostConfederation) {
      err(`host "${expected.expectedHostId}" confederation is "${hostConf}", expected "${expected.expectedHostConfederation}"`);
    }
  }
  const confTally: Record<string, number> = {};
  for (const t of identity.teamIds) {
    const conf = identity.confederations[t];
    if (!conf) { err(`team "${t}" has no confederation`); continue; }
    if (!VALID_CONFEDERATIONS.has(conf)) err(`team "${t}" has invalid confederation "${conf}"`);
    confTally[conf] = (confTally[conf] ?? 0) + 1;
  }
  if (expected.confederationCounts) {
    for (const [conf, n] of Object.entries(expected.confederationCounts)) {
      const got = confTally[conf] ?? 0;
      if (got !== n) err(`confederation ${conf}: tallied ${got} teams, declared ${n}`);
    }
  }

  // --- results ---------------------------------------------------------------
  if (results.length !== expected.matchCount) {
    err(`expected ${expected.matchCount} matches, got ${results.length}`);
  }
  const matchIds = new Set<string>();
  let groupMatches = 0;
  let knockoutMatches = 0;
  const checkOutcome = (m: HistoricalMatchResult) => {
    if (m.resultAt90 === undefined) return;
    const expectedOutcome = m.goalsA > m.goalsB ? "A" : m.goalsA < m.goalsB ? "B" : "D";
    if (m.resultAt90 !== expectedOutcome) {
      err(`${m.matchId}: resultAt90 "${m.resultAt90}" inconsistent with 90' goals ${m.goalsA}-${m.goalsB}`);
    }
  };
  for (const m of results) {
    if (matchIds.has(m.matchId)) err(`duplicate matchId "${m.matchId}"`);
    matchIds.add(m.matchId);
    const isGroup = GROUP_STAGES.has(m.stage);
    if (isGroup) groupMatches++; else knockoutMatches++;
    if (!teamSet.has(m.teamA)) err(`${m.matchId}: unknown teamA "${m.teamA}"`);
    if (!teamSet.has(m.teamB)) err(`${m.matchId}: unknown teamB "${m.teamB}"`);
    if (m.teamA === m.teamB) err(`${m.matchId}: teamA === teamB`);
    if (isGroup && m.group === undefined) err(`${m.matchId}: group-stage match missing group`);
    if (!isGroup && m.group !== undefined) err(`${m.matchId}: non-group match must not carry a group`);
    if (!isNonNegInt(m.goalsA) || !isNonNegInt(m.goalsB)) {
      err(`${m.matchId}: goals must be non-negative integers (${m.goalsA}-${m.goalsB})`);
    }
    checkOutcome(m);

    // extra-time / penalties: knockout-only and internally consistent.
    if (m.afterExtraTime && isGroup) err(`${m.matchId}: group-stage match cannot go to extra time`);
    if (m.penalties) {
      if (isGroup) err(`${m.matchId}: group-stage match cannot have penalties`);
      if (m.resultAt90 !== "D") err(`${m.matchId}: penalties present but 90' was not a draw`);
      if (!isNonNegInt(m.penalties.a) || !isNonNegInt(m.penalties.b)) {
        err(`${m.matchId}: penalty scores must be non-negative integers`);
      } else if (m.penalties.a === m.penalties.b) {
        err(`${m.matchId}: penalty shootout cannot be tied`);
      }
    }
    // A knockout match drawn at 90' must resolve via ET and/or penalties.
    if (!isGroup && m.resultAt90 === "D" && !m.afterExtraTime && !m.penalties) {
      err(`${m.matchId}: knockout drawn at 90' but no extra time / penalties recorded`);
    }
  }
  if (groupMatches !== expected.groupMatchCount) {
    err(`expected ${expected.groupMatchCount} group matches, got ${groupMatches}`);
  }
  if (knockoutMatches !== expected.knockoutMatchCount) {
    err(`expected ${expected.knockoutMatchCount} knockout matches, got ${knockoutMatches}`);
  }

  // --- pre-tournament Elo (leakage: asOfDate < openingKickoff) ---------------
  const eloTeams = new Set<string>();
  for (const r of elo) {
    if (!teamSet.has(r.teamId)) err(`elo references unknown team "${r.teamId}"`);
    if (eloTeams.has(r.teamId)) err(`duplicate elo row for "${r.teamId}"`);
    eloTeams.add(r.teamId);
    if (!Number.isFinite(r.rating)) err(`elo rating for "${r.teamId}" is not finite`);
    const t = instant(r.asOfDate);
    if (Number.isNaN(t)) err(`elo asOfDate for "${r.teamId}" is invalid ("${r.asOfDate}")`);
    else if (!(t < cutoff)) err(`LEAKAGE: elo asOfDate ${r.asOfDate} for "${r.teamId}" is not before opening kickoff`);
  }
  for (const t of identity.teamIds) if (!eloTeams.has(t)) err(`elo missing team "${t}"`);

  // --- pre-tournament FIFA ranking (leakage: rankingDate < openingKickoff) ---
  const fifaTeams = new Set<string>();
  for (const r of fifa) {
    if (!teamSet.has(r.teamId)) err(`fifa references unknown team "${r.teamId}"`);
    if (fifaTeams.has(r.teamId)) err(`duplicate fifa row for "${r.teamId}"`);
    fifaTeams.add(r.teamId);
    if (!Number.isInteger(r.rank) || r.rank < 1) err(`fifa rank for "${r.teamId}" must be a positive integer`);
    const t = instant(r.rankingDate);
    if (Number.isNaN(t)) err(`fifa rankingDate for "${r.teamId}" is invalid ("${r.rankingDate}")`);
    else if (!(t < cutoff)) err(`LEAKAGE: fifa rankingDate ${r.rankingDate} for "${r.teamId}" is not before opening kickoff`);
  }
  for (const t of identity.teamIds) if (!fifaTeams.has(t)) err(`fifa missing team "${t}"`);

  // --- forbidden (proprietary) fields anywhere in the pack -------------------
  const forbidden = findForbiddenField(pack);
  if (forbidden) err(`forbidden proprietary field present: "${forbidden}"`);

  return { valid: errors.length === 0, errors, warnings };
}
