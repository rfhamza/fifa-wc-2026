/**
 * Dataset validation.
 *
 * The resolver uses this to decide whether a higher-priority dataset is usable.
 * Fallback is keyed on validity/completeness/availability — NEVER on a boolean
 * "verified" flag (A2 clarification).
 */
import type { Fixture, Team, Venue } from "@/lib/types";
import type { SourceDataset } from "@/data/mock";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const EXPECTED_TEAMS = 48;
const EXPECTED_GROUPS = 12;
const TEAMS_PER_GROUP = 4;

export function validateDataset(ds: SourceDataset | undefined | null): ValidationResult {
  const errors: string[] = [];
  if (!ds) return { valid: false, errors: ["dataset is missing"] };

  const { teams, venues } = ds;

  if (!Array.isArray(teams) || teams.length !== EXPECTED_TEAMS) {
    errors.push(`expected ${EXPECTED_TEAMS} teams, got ${teams?.length ?? 0}`);
  }
  if (!Array.isArray(venues) || venues.length === 0) {
    errors.push("expected at least one venue");
  }

  // Unique team ids.
  const ids = new Set<string>();
  for (const t of teams ?? []) {
    if (ids.has(t.id)) errors.push(`duplicate team id: ${t.id}`);
    ids.add(t.id);
  }

  // Exactly 12 groups of 4.
  const byGroup = new Map<string, Team[]>();
  for (const t of teams ?? []) {
    const list = byGroup.get(t.group) ?? [];
    list.push(t);
    byGroup.set(t.group, list);
  }
  if (byGroup.size !== EXPECTED_GROUPS) {
    errors.push(`expected ${EXPECTED_GROUPS} groups, got ${byGroup.size}`);
  }
  for (const [g, members] of byGroup) {
    if (members.length !== TEAMS_PER_GROUP) {
      errors.push(`group ${g} must have ${TEAMS_PER_GROUP} teams, got ${members.length}`);
    }
  }

  // If an official schedule is supplied, validate referential integrity.
  if (ds.officialFixtures) {
    errors.push(...validateFixtures(ds.officialFixtures, ids, venues ?? []));
  }

  return { valid: errors.length === 0, errors };
}

/** Validate that a fixture list references known teams/venues and covers groups. */
export function validateFixtures(
  fixtures: Fixture[],
  teamIds: Set<string>,
  venues: Venue[],
): string[] {
  const errors: string[] = [];
  const venueIds = new Set(venues.map((v) => v.id));
  const perGroup = new Map<string, number>();
  for (const f of fixtures) {
    if (!teamIds.has(f.homeTeamId)) errors.push(`fixture ${f.id}: unknown home team`);
    if (!teamIds.has(f.awayTeamId)) errors.push(`fixture ${f.id}: unknown away team`);
    if (!venueIds.has(f.venueId)) errors.push(`fixture ${f.id}: unknown venue`);
    perGroup.set(f.group, (perGroup.get(f.group) ?? 0) + 1);
  }
  for (const [g, count] of perGroup) {
    if (count !== 6) errors.push(`group ${g}: expected 6 fixtures, got ${count}`);
  }
  return errors;
}
