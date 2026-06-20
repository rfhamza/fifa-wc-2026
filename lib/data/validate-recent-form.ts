/**
 * Phase 1.16B - recent-form snapshot validation (verification-only).
 * -----------------------------------------------------------------
 * Asserts the recent-form snapshot covers all 48 teams with exactly 10 latest-first
 * pre-cutoff matches each, that derived aggregates recompute from the match rows,
 * that each row's perspective is consistent with the raw home/away score (using the
 * dataset name, e.g. "Czech Republic"), and that provenance is honest. Mirrors the
 * `{ valid, errors, warnings }` shape used elsewhere. Standalone - it does not touch
 * the active model-input layer.
 */
import type {
  RecentFormRow,
  RecentFormSource,
  RecentFormValidationResult,
  Team,
} from "@/lib/types";
import { officialTeams } from "@/data/official/teams";
import {
  recentFormSnapshot,
  RECENT_FORM_SOURCE,
} from "@/data/model-inputs/snapshots/recent-form-2026-06-11";
import { aggregateRecentForm, resultFromGoals } from "@/lib/recent-form/aggregate";

const EXPECTED_TEAMS = 48;
const MATCHES_PER_TEAM = 10;
/** Leakage cutoff (opening kickoff). Match dates must be strictly before this day. */
const CUTOFF_INSTANT = "2026-06-11T19:00:00Z";
const CUTOFF_DAY = "2026-06-11"; // ISO dates sort lexicographically
/** Sanity lower bound (the supplied window starts 2025-06-05). */
const MIN_DAY = "2024-01-01";

const r6 = (x: number) => Number(x.toFixed(6));
const isIsoDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isNonNegInt = (x: number) => Number.isInteger(x) && x >= 0;

export function validateRecentForm(
  snapshot: RecentFormRow[] = recentFormSnapshot,
  teams: Team[] = officialTeams,
  source: RecentFormSource = RECENT_FORM_SOURCE,
): RecentFormValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const teamIds = new Set(teams.map((t) => t.id));

  if (snapshot.length !== EXPECTED_TEAMS) {
    errors.push(`expected ${EXPECTED_TEAMS} recent-form rows, got ${snapshot.length}`);
  }

  const seen = new Set<string>();
  for (const row of snapshot) {
    const id = row.teamId;
    if (seen.has(id)) errors.push(`duplicate recent-form row: ${id}`);
    seen.add(id);
    if (!teamIds.has(id)) errors.push(`recent-form team id not in official teams: ${id}`);

    if (row.dataStatus !== "source-backed") {
      errors.push(`${id}: dataStatus must be "source-backed", got "${row.dataStatus}"`);
    }
    if (!row.sourceRef) errors.push(`${id}: missing sourceRef`);

    const ms = row.recentMatches;
    if (ms.length !== MATCHES_PER_TEAM) {
      errors.push(`${id}: expected ${MATCHES_PER_TEAM} matches, got ${ms.length}`);
    }
    if (row.matchesConsidered10 !== ms.length) {
      errors.push(`${id}: matchesConsidered10 ${row.matchesConsidered10} != rows ${ms.length}`);
    }
    if (row.matchesConsidered5 !== Math.min(5, ms.length)) {
      errors.push(`${id}: matchesConsidered5 ${row.matchesConsidered5} != ${Math.min(5, ms.length)}`);
    }

    // Ranks 1..N complete + unique; rows ordered latest-first (rank asc, dates non-increasing).
    const ranks = ms.map((m) => m.rank);
    for (let i = 0; i < ms.length; i++) {
      if (ranks[i] !== i + 1) {
        errors.push(`${id}: match[${i}] rank ${ranks[i]} != expected ${i + 1} (must be 1..N latest-first)`);
        break;
      }
    }
    for (let i = 1; i < ms.length; i++) {
      if (ms[i - 1]!.date < ms[i]!.date) {
        errors.push(`${id}: dates not latest-first at rank ${ms[i]!.rank} (${ms[i - 1]!.date} < ${ms[i]!.date})`);
        break;
      }
    }

    for (const m of ms) {
      const where = `${id} rank ${m.rank}`;
      if (!isIsoDay(m.date)) errors.push(`${where}: bad date "${m.date}"`);
      // Leakage gate: strictly before the opening day.
      if (!(m.date < CUTOFF_DAY)) {
        errors.push(`${where}: date ${m.date} is not before cutoff ${CUTOFF_DAY} (${CUTOFF_INSTANT})`);
      }
      if (m.date < MIN_DAY) errors.push(`${where}: date ${m.date} implausibly old`);
      if (!isNonNegInt(m.goalsFor) || !isNonNegInt(m.goalsAgainst)) {
        errors.push(`${where}: non-integer/negative goals ${m.goalsFor}-${m.goalsAgainst}`);
      }
      if (!isNonNegInt(m.homeScore) || !isNonNegInt(m.awayScore)) {
        errors.push(`${where}: non-integer/negative home/away score ${m.homeScore}-${m.awayScore}`);
      }
      // Result consistency with the team's perspective goals.
      if (m.result !== resultFromGoals(m.goalsFor, m.goalsAgainst)) {
        errors.push(`${where}: result ${m.result} != goals ${m.goalsFor}-${m.goalsAgainst}`);
      }
      // Perspective consistency vs raw home/away using the dataset name.
      const isHome = m.homeTeam === row.sourceDatasetName;
      const isAway = m.awayTeam === row.sourceDatasetName;
      if (isHome === isAway) {
        errors.push(`${where}: dataset name "${row.sourceDatasetName}" is neither/both of home "${m.homeTeam}" / away "${m.awayTeam}"`);
      } else if (isHome) {
        if (m.goalsFor !== m.homeScore || m.goalsAgainst !== m.awayScore) {
          errors.push(`${where}: home perspective goals ${m.goalsFor}-${m.goalsAgainst} != score ${m.homeScore}-${m.awayScore}`);
        }
        if (m.opponentName !== m.awayTeam) errors.push(`${where}: opponent "${m.opponentName}" != away "${m.awayTeam}"`);
        if (!m.neutral && m.venue !== "Home") errors.push(`${where}: venue ${m.venue} != Home`);
      } else {
        if (m.goalsFor !== m.awayScore || m.goalsAgainst !== m.homeScore) {
          errors.push(`${where}: away perspective goals ${m.goalsFor}-${m.goalsAgainst} != score ${m.awayScore}-${m.homeScore}`);
        }
        if (m.opponentName !== m.homeTeam) errors.push(`${where}: opponent "${m.opponentName}" != home "${m.homeTeam}"`);
        if (!m.neutral && m.venue !== "Away") errors.push(`${where}: venue ${m.venue} != Away`);
      }
      if (m.neutral && m.venue !== "Neutral") errors.push(`${where}: neutral match venue ${m.venue} != Neutral`);
      if (m.opponentId && !teamIds.has(m.opponentId)) {
        errors.push(`${where}: opponentId ${m.opponentId} not an official team`);
      }
    }

    // Derived aggregates must recompute from the match rows.
    const a5 = aggregateRecentForm(ms, 5);
    const a10 = aggregateRecentForm(ms, 10);
    const checks: [string, number, number][] = [
      ["last5PointsPerMatch", row.last5PointsPerMatch, a5.pointsPerMatch],
      ["last10PointsPerMatch", row.last10PointsPerMatch, a10.pointsPerMatch],
      ["last5GoalDiffPerMatch", row.last5GoalDiffPerMatch, a5.goalDiffPerMatch],
      ["last10GoalDiffPerMatch", row.last10GoalDiffPerMatch, a10.goalDiffPerMatch],
      ["last5GoalsForPerMatch", row.last5GoalsForPerMatch, a5.goalsForPerMatch],
      ["last5GoalsAgainstPerMatch", row.last5GoalsAgainstPerMatch, a5.goalsAgainstPerMatch],
      ["last10GoalsForPerMatch", row.last10GoalsForPerMatch, a10.goalsForPerMatch],
      ["last10GoalsAgainstPerMatch", row.last10GoalsAgainstPerMatch, a10.goalsAgainstPerMatch],
    ];
    for (const [name, stored, recomputed] of checks) {
      if (Math.abs(r6(recomputed) - stored) > 1e-9) {
        errors.push(`${id}: ${name} stored ${stored} != recomputed ${r6(recomputed)}`);
      }
    }
  }

  for (const t of teams) {
    if (!seen.has(t.id)) errors.push(`missing recent-form row for team ${t.id}`);
  }

  // Snapshot-level provenance.
  if (source.status !== "source-backed") {
    errors.push(`recent-form source status must be "source-backed", got "${source.status}"`);
  }
  if (source.cutoff !== CUTOFF_INSTANT) {
    errors.push(`recent-form source cutoff ${source.cutoff} != ${CUTOFF_INSTANT}`);
  }
  for (const field of ["label", "sourceName", "sourceUrl", "retrievedAt", "sourceChecksumSha256"] as const) {
    if (!source[field]) errors.push(`recent-form source missing ${field}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}
