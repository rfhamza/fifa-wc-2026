/**
 * Phase 1.17B - squad roster snapshot validation (verification-only).
 * ------------------------------------------------------------------
 * Asserts the final-squad snapshot covers all 48 teams with exactly 26 players
 * each, valid player rows, recomputable aggregates, NO forbidden proprietary
 * fields, and that the LEAKAGE-RISK status is explicitly preserved (the FIFA PDF
 * version postdates tournament start). Standalone - it does not touch the active
 * model-input layer. Mirrors the `{ valid, errors, warnings }` shape.
 */
import type {
  SquadRow,
  SquadSource,
  SquadValidationResult,
  Team,
} from "@/lib/types";
import { officialTeams } from "@/data/official/teams";
import { squadSnapshot, SQUAD_SOURCE } from "@/data/model-inputs/snapshots/squad-2026-06-11";

const EXPECTED_TEAMS = 48;
const PLAYERS_PER_TEAM = 26;
const SQUAD_DATE = "2026-06-20";
const SQUAD_FREEZE_DATE = "2026-06-10";
const LEAKAGE_STATUS =
  "official_fifa_final_squad_pdf_post_tournament_start_version_leakage_risk";
const POSITIONS = new Set(["GK", "DF", "MF", "FW"]);

/** Proprietary rating/value fields that MUST NOT appear anywhere in the snapshot. */
const FORBIDDEN_KEYS = [
  "marketValue", "transferValue", "playerRating", "fifaRating", "sofifaRating",
  "eaRating", "optaRating", "overall", "potential", "wage", "contractValue",
];

const r6 = (x: number) => Number(x.toFixed(6));
const isIsoDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isNonNegInt = (x: number) => Number.isInteger(x) && x >= 0;
const hasForbidden = (o: object) =>
  FORBIDDEN_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(o, k));

export function validateSquad(
  snapshot: SquadRow[] = squadSnapshot,
  teams: Team[] = officialTeams,
  source: SquadSource = SQUAD_SOURCE,
): SquadValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const teamById = new Map(teams.map((t) => [t.id, t]));

  if (snapshot.length !== EXPECTED_TEAMS) {
    errors.push(`expected ${EXPECTED_TEAMS} squad rows, got ${snapshot.length}`);
  }

  const seen = new Set<string>();
  for (const row of snapshot) {
    const id = row.teamId;
    if (seen.has(id)) errors.push(`duplicate squad row: ${id}`);
    seen.add(id);
    const team = teamById.get(id);
    if (!team) errors.push(`squad team id not in official teams: ${id}`);
    else if (row.fifaCode !== team.countryCode) {
      errors.push(`${id}: fifaCode ${row.fifaCode} != official countryCode ${team.countryCode}`);
    }

    // Leakage metadata MUST be preserved (never silently treated as pre-start clean).
    if (row.squadType !== "final") errors.push(`${id}: squadType ${row.squadType} != final`);
    if (row.squadDate !== SQUAD_DATE) errors.push(`${id}: squadDate ${row.squadDate} != ${SQUAD_DATE}`);
    if (row.squadFreezeDate !== SQUAD_FREEZE_DATE) errors.push(`${id}: squadFreezeDate ${row.squadFreezeDate} != ${SQUAD_FREEZE_DATE}`);
    if (row.dataStatus !== LEAKAGE_STATUS) errors.push(`${id}: dataStatus must preserve the leakage-risk status`);
    if (!row.sourceRef) errors.push(`${id}: missing sourceRef`);
    if (!(row.sourcePdfPage >= 1)) errors.push(`${id}: sourcePdfPage must be >= 1`);

    for (const k of hasForbidden(row)) errors.push(`${id}: forbidden field "${k}" on row`);
    for (const k of hasForbidden(row.aggregates)) errors.push(`${id}: forbidden field "${k}" on aggregates`);

    const ps = row.players;
    if (ps.length !== PLAYERS_PER_TEAM) errors.push(`${id}: expected ${PLAYERS_PER_TEAM} players, got ${ps.length}`);

    for (const p of ps) {
      const w = `${id} #${p.playerNumber}`;
      for (const k of hasForbidden(p)) errors.push(`${w}: forbidden field "${k}"`);
      if (!p.playerName) errors.push(`${w}: missing playerName`);
      if (!p.club) errors.push(`${w}: missing club`);
      if (!p.clubCountry) errors.push(`${w}: missing clubCountry`);
      if (!p.sourceTeamPageRef) errors.push(`${w}: missing sourceTeamPageRef`);
      if (!POSITIONS.has(p.position)) errors.push(`${w}: invalid position ${p.position}`);
      if (!isIsoDay(p.dateOfBirth)) errors.push(`${w}: bad dateOfBirth ${p.dateOfBirth}`);
      if (!(p.ageAtTournamentStart >= 15 && p.ageAtTournamentStart <= 45)) errors.push(`${w}: implausible age ${p.ageAtTournamentStart}`);
      if (!(p.heightCm >= 150 && p.heightCm <= 220)) errors.push(`${w}: implausible heightCm ${p.heightCm}`);
      if (!isNonNegInt(p.caps)) errors.push(`${w}: caps not a non-negative integer (${p.caps})`);
      if (!isNonNegInt(p.goals)) errors.push(`${w}: goals not a non-negative integer (${p.goals})`);
      if (typeof p.clubInTop5AssociationCountry !== "boolean") errors.push(`${w}: clubInTop5AssociationCountry must be boolean`);
    }

    // Aggregates recompute from the player rows.
    const a = row.aggregates;
    const n = ps.length || 1;
    const ages = ps.map((p) => p.ageAtTournamentStart).sort((x, y) => x - y);
    const mid = Math.floor(ages.length / 2);
    const med = ages.length === 0
      ? 0
      : ages.length % 2
        ? (ages[mid] ?? 0)
        : ((ages[mid - 1] ?? 0) + (ages[mid] ?? 0)) / 2;
    const totalCaps = ps.reduce((s, p) => s + p.caps, 0);
    const totalGoals = ps.reduce((s, p) => s + p.goals, 0);
    const top5 = ps.filter((p) => p.clubInTop5AssociationCountry).length;
    const dist: Record<string, number> = {};
    for (const p of ps) dist[p.clubCountry] = (dist[p.clubCountry] ?? 0) + 1;
    const expect: [string, number, number][] = [
      ["playerCount", a.playerCount, ps.length],
      ["averageAge", a.averageAge, r6(ps.reduce((s, p) => s + p.ageAtTournamentStart, 0) / n)],
      ["medianAge", a.medianAge, r6(med)],
      ["averageHeightCm", a.averageHeightCm, r6(ps.reduce((s, p) => s + p.heightCm, 0) / n)],
      ["totalCaps", a.totalCaps, totalCaps],
      ["capsPerPlayer", a.capsPerPlayer, r6(totalCaps / n)],
      ["totalInternationalGoals", a.totalInternationalGoals, totalGoals],
      ["goalsPerPlayer", a.goalsPerPlayer, r6(totalGoals / n)],
      ["goalkeepersCount", a.goalkeepersCount, ps.filter((p) => p.position === "GK").length],
      ["defendersCount", a.defendersCount, ps.filter((p) => p.position === "DF").length],
      ["midfieldersCount", a.midfieldersCount, ps.filter((p) => p.position === "MF").length],
      ["forwardsCount", a.forwardsCount, ps.filter((p) => p.position === "FW").length],
      ["playersAtClubsInTop5AssociationCountries", a.playersAtClubsInTop5AssociationCountries, top5],
      ["top5AssociationCountryShare", a.top5AssociationCountryShare, r6(top5 / n)],
      ["distinctClubCountryCount", a.distinctClubCountryCount, Object.keys(dist).length],
    ];
    for (const [name, stored, rec] of expect) {
      if (Math.abs(stored - rec) > 1e-9) errors.push(`${id}: ${name} stored ${stored} != recomputed ${rec}`);
    }
    // club-country distribution must match exactly.
    for (const [cc, ct] of Object.entries(dist)) {
      if (a.clubCountryDistribution[cc] !== ct) errors.push(`${id}: clubCountryDistribution[${cc}] ${a.clubCountryDistribution[cc]} != ${ct}`);
    }
    // Deferred scores must stay null.
    if (a.clubStrengthScore !== null) errors.push(`${id}: clubStrengthScore must be null (deferred)`);
    if (a.squadDepthScore !== null) errors.push(`${id}: squadDepthScore must be null (deferred)`);
  }

  for (const t of teams) if (!seen.has(t.id)) errors.push(`missing squad row for team ${t.id}`);

  // Snapshot-level provenance + leakage flags.
  if (source.status !== "source-backed") errors.push(`squad source status must be "source-backed"`);
  if (source.leakageRisk !== true) errors.push(`squad source must be flagged leakageRisk: true`);
  if (source.dataStatus !== LEAKAGE_STATUS) errors.push(`squad source dataStatus must preserve the leakage-risk status`);
  if (source.squadType !== "final") errors.push(`squad source squadType must be final`);
  if (source.squadDate !== SQUAD_DATE) errors.push(`squad source squadDate must be ${SQUAD_DATE}`);
  if (source.squadFreezeDate !== SQUAD_FREEZE_DATE) errors.push(`squad source squadFreezeDate must be ${SQUAD_FREEZE_DATE}`);
  for (const field of ["label", "sourceName", "sourceUrl", "playerCsvSha256", "aggregateCsvSha256", "retrievedAt"] as const) {
    if (!source[field]) errors.push(`squad source missing ${field}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}
