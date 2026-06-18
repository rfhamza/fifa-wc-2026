/**
 * Dataset validation.
 *
 * The resolver uses this to decide whether a higher-priority dataset is usable.
 * Fallback is keyed on validity/completeness/availability — NEVER on a boolean
 * "verified" flag (A2 clarification).
 */
import type {
  DrawPosition,
  Fixture,
  GroupId,
  OfficialFixture,
  Team,
  Venue,
} from "@/lib/types";
import type { SourceDataset } from "@/data/mock";
import { ARTICLE_12_4_PAIRINGS } from "./fixtures";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const EXPECTED_TEAMS = 48;
const EXPECTED_GROUPS = 12;
const TEAMS_PER_GROUP = 4;

/** Regulation host draw slots (FIFA Art. 12.3): team id -> required slot. */
const HOST_SLOTS: Record<string, string> = {
  mexico: "A1",
  canada: "B1",
  usa: "D1",
};

/** Canonical key for an ordered position pairing. */
const pairKey = (h: DrawPosition, a: DrawPosition) => `${h}v${a}`;
const EXPECTED_PAIR_KEYS = new Set(ARTICLE_12_4_PAIRINGS.map(([h, a]) => pairKey(h, a)));

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

  // Draw positions (host slots + per-group uniqueness/consistency).
  errors.push(...validateDrawPositions(teams ?? []));

  // If an official schedule is supplied, validate it (position-keyed template).
  if (ds.officialFixtures && ds.officialFixtures.length > 0) {
    errors.push(...validateOfficialFixtures(ds.officialFixtures, teams ?? [], venues ?? []));
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate draw positions/slots. Only SOURCE-BACKED positions are present today
 * (the three co-hosts); placeholder positions are never stored on a Team, so this
 * checks consistency of whatever is present rather than requiring all 48.
 */
export function validateDrawPositions(teams: Team[]): string[] {
  const errors: string[] = [];

  // Host slots are mandatory and fixed by regulation, but ONLY once a dataset
  // assigns draw positions at all (the pure-mock field has none, and that is
  // valid - it simply position-generates fixtures without host pinning).
  const usesDrawPositions = teams.some((t) => t.drawPosition);
  if (usesDrawPositions) {
    for (const t of teams) {
      const required = HOST_SLOTS[t.id];
      if (required && t.drawSlot !== required) {
        errors.push(`host ${t.id}: draw slot must be ${required}, got ${t.drawSlot ?? "none"}`);
      }
    }
  }

  const byGroup = new Map<GroupId, Team[]>();
  for (const t of teams) {
    const list = byGroup.get(t.group) ?? [];
    list.push(t);
    byGroup.set(t.group, list);
  }

  for (const [g, members] of byGroup) {
    const positioned = members.filter((t) => t.drawPosition);
    // slot string must agree with group + position.
    for (const t of positioned) {
      const expected = `${t.group}${t.drawPosition}`;
      if (t.drawSlot !== expected) {
        errors.push(`team ${t.id}: drawSlot ${t.drawSlot ?? "none"} != ${expected}`);
      }
      if (!t.drawSlotStatus) {
        errors.push(`team ${t.id}: drawSlotStatus required when drawSlot is set`);
      }
    }
    // No two positioned teams share a position.
    const seen = new Set<number>();
    for (const t of positioned) {
      if (seen.has(t.drawPosition!)) {
        errors.push(`group ${g}: duplicate draw position ${t.drawPosition}`);
      }
      seen.add(t.drawPosition!);
    }
    // If fully positioned, positions must be exactly {1,2,3,4}.
    if (positioned.length === TEAMS_PER_GROUP) {
      for (const pos of [1, 2, 3, 4]) {
        if (!seen.has(pos)) errors.push(`group ${g}: missing draw position ${pos}`);
      }
    }
  }
  return errors;
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

/**
 * Validate that generated/official fixtures honour the Article 12.4 pairings:
 * 6 fixtures per group, the exact ordered position pairing set, no duplicates.
 */
export function validatePositionPairings(fixtures: Fixture[]): string[] {
  const errors: string[] = [];
  const byGroup = new Map<string, Fixture[]>();
  for (const f of fixtures) {
    const list = byGroup.get(f.group) ?? [];
    list.push(f);
    byGroup.set(f.group, list);
  }
  for (const [g, list] of byGroup) {
    if (list.length !== 6) {
      errors.push(`group ${g}: expected 6 fixtures, got ${list.length}`);
    }
    const keys = new Set<string>();
    for (const f of list) {
      if (!f.homePosition || !f.awayPosition) {
        errors.push(`fixture ${f.id}: missing draw positions`);
        continue;
      }
      const key = pairKey(f.homePosition, f.awayPosition);
      if (!EXPECTED_PAIR_KEYS.has(key)) {
        errors.push(`group ${g}: pairing ${key} is not an Article 12.4 pairing`);
      }
      if (keys.has(key)) errors.push(`group ${g}: duplicate pairing ${key}`);
      keys.add(key);
    }
    for (const expected of EXPECTED_PAIR_KEYS) {
      if (!keys.has(expected)) errors.push(`group ${g}: missing pairing ${expected}`);
    }
  }
  return errors;
}

/**
 * Validate a position-keyed official schedule: valid refs, unique match numbers,
 * 6 rows per group, Article 12.4 pairings, and positions resolvable to teams.
 */
export function validateOfficialFixtures(
  schedule: OfficialFixture[],
  teams: Team[],
  venues: Venue[],
): string[] {
  const errors: string[] = [];
  const venueIds = new Set(venues.map((v) => v.id));
  const positionIndex = new Set<string>();
  for (const t of teams) {
    if (t.drawPosition) positionIndex.add(`${t.group}${t.drawPosition}`);
  }
  const matchNumbers = new Set<number>();
  const perGroup = new Map<string, Set<string>>();

  for (const row of schedule) {
    const tag = `match ${row.matchNumber}`;
    if (matchNumbers.has(row.matchNumber)) errors.push(`${tag}: duplicate match number`);
    matchNumbers.add(row.matchNumber);
    if (!venueIds.has(row.venueId)) errors.push(`${tag}: unknown venue ${row.venueId}`);
    if (row.matchday < 1 || row.matchday > 3) errors.push(`${tag}: invalid matchday`);
    for (const pos of [row.homePosition, row.awayPosition]) {
      if (!positionIndex.has(`${row.group}${pos}`)) {
        errors.push(`${tag}: draw position ${row.group}${pos} not assigned to a team`);
      }
    }
    const key = pairKey(row.homePosition, row.awayPosition);
    if (!EXPECTED_PAIR_KEYS.has(key)) {
      errors.push(`${tag}: pairing ${key} is not an Article 12.4 pairing`);
    }
    const set = perGroup.get(row.group) ?? new Set<string>();
    if (set.has(key)) errors.push(`${tag}: duplicate pairing ${key} in group ${row.group}`);
    set.add(key);
    perGroup.set(row.group, set);
  }
  for (const [g, keys] of perGroup) {
    if (keys.size !== 6) errors.push(`group ${g}: expected 6 official fixtures, got ${keys.size}`);
  }
  return errors;
}
