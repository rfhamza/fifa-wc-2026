/**
 * Phase 1.5 — CANDIDATE schedule validation + cross-source reconciliation.
 *
 * Validates the staged candidate layer (data/candidate/) against the FIFA
 * Article 12.4 pairing chart and the existing candidate field, and reconciles
 * the two third-party sources (Excel + Telegraph) against each other.
 *
 * This is verification-only. It produces NOTHING that the production resolver
 * consumes, and it never promotes candidate data to official/verified — that
 * requires an official FIFA source or user-approved authoritative JSON.
 */
import type { DrawPosition, GroupId, Team, Venue } from "@/lib/types";
import type {
  CandidateDrawOrder,
  CandidateFixture,
  CandidateGroupMembership,
  CandidateScheduleDataset,
  CandidateScheduleValidationResult,
  CandidateSourceFixture,
  SourceAgreementStatus,
} from "@/lib/types/candidate";
import { officialTeams } from "@/data/official/teams";
import { officialVenues } from "@/data/official/venues";
import { MANUAL_CONFLICT_RESOLUTIONS } from "@/data/candidate/manual-resolutions";
import type { ManualConflictResolution } from "@/data/candidate/manual-resolutions";
import { ARTICLE_12_4_PAIRINGS } from "./fixtures";

const EXPECTED_GROUPS = 12;
const EXPECTED_TEAMS = 48;
const TEAMS_PER_GROUP = 4;
const FIXTURES_PER_GROUP = 6;
const EXPECTED_FIXTURES = 72;
const GAMES_PER_TEAM = 3;

const GROUP_IDS: GroupId[] = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L",
];

/** Regulation host draw slots (FIFA Art. 12.3): team id -> required slot. */
const HOST_SLOTS: Record<string, string> = { mexico: "A1", canada: "B1", usa: "D1" };

const pairKey = (h: DrawPosition, a: DrawPosition) => `${h}v${a}`;
const EXPECTED_PAIR_KEYS = new Set(ARTICLE_12_4_PAIRINGS.map(([h, a]) => pairKey(h, a)));

/** Canonical key for an unordered team pairing within a group. */
const unorderedKey = (group: GroupId, a: string, b: string) =>
  `${group}:${[a, b].sort().join("|")}`;

/** Matchday implied by an Article 12.4 position pairing. */
const MATCHDAY_BY_PAIR: Record<string, number> = {
  "1v2": 1, "3v4": 1, "1v3": 2, "4v2": 2, "4v1": 3, "2v3": 3,
};

/* -------------------------------------------------------------------------- */
/* Group membership                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Validate candidate group membership: 12 groups, 48 teams, 4 per group, each
 * team exactly once, and membership identical to the existing candidate field.
 */
export function validateCandidateGroups(
  groups: CandidateGroupMembership[],
  teams: Team[] = officialTeams,
): string[] {
  const errors: string[] = [];
  if (groups.length !== EXPECTED_GROUPS) {
    errors.push(`expected ${EXPECTED_GROUPS} candidate groups, got ${groups.length}`);
  }

  const officialByGroup = new Map<string, Set<string>>();
  for (const t of teams) {
    const set = officialByGroup.get(t.group) ?? new Set<string>();
    set.add(t.id);
    officialByGroup.set(t.group, set);
  }

  const seen = new Set<string>();
  let total = 0;
  for (const g of groups) {
    if (g.teamIds.length !== TEAMS_PER_GROUP) {
      errors.push(`group ${g.group}: expected ${TEAMS_PER_GROUP} teams, got ${g.teamIds.length}`);
    }
    for (const id of g.teamIds) {
      total += 1;
      if (seen.has(id)) errors.push(`team ${id}: appears in more than one candidate group`);
      seen.add(id);
    }
    // Membership must match the existing candidate field exactly.
    const official = officialByGroup.get(g.group);
    if (!official) {
      errors.push(`group ${g.group}: not present in the official (candidate) field`);
    } else {
      for (const id of g.teamIds) {
        if (!official.has(id)) {
          errors.push(`group ${g.group}: candidate team ${id} not in official field`);
        }
      }
      if (official.size !== g.teamIds.length) {
        errors.push(`group ${g.group}: membership size differs from official field`);
      }
    }
  }
  if (total !== EXPECTED_TEAMS) {
    errors.push(`expected ${EXPECTED_TEAMS} candidate team slots, got ${total}`);
  }
  return errors;
}

/* -------------------------------------------------------------------------- */
/* Draw order                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Validate candidate draw order: every group has positions exactly {1,2,3,4},
 * slot strings are consistent, and the regulation host slots are preserved.
 */
export function validateCandidateDrawOrder(
  drawOrder: CandidateDrawOrder[],
  teams: Team[] = officialTeams,
): string[] {
  const errors: string[] = [];
  const groupOf = new Map(teams.map((t) => [t.id, t.group]));

  if (drawOrder.length !== EXPECTED_GROUPS) {
    errors.push(`expected ${EXPECTED_GROUPS} candidate draw orders, got ${drawOrder.length}`);
  }

  for (const order of drawOrder) {
    const positions = order.slots.map((s) => s.position).sort();
    if (positions.join(",") !== "1,2,3,4") {
      errors.push(`group ${order.group}: positions must be exactly {1,2,3,4}, got {${positions.join(",")}}`);
    }
    for (const slot of order.slots) {
      const expected = `${order.group}${slot.position}`;
      if (slot.candidateDrawSlot !== expected) {
        errors.push(`group ${order.group}: slot ${slot.candidateDrawSlot} != ${expected}`);
      }
      const g = groupOf.get(slot.teamId);
      if (g === undefined) {
        errors.push(`group ${order.group}: unknown team ${slot.teamId}`);
      } else if (g !== order.group) {
        errors.push(`team ${slot.teamId}: candidate group ${order.group} != official group ${g}`);
      }
      const required = HOST_SLOTS[slot.teamId];
      if (required && slot.candidateDrawSlot !== required) {
        errors.push(`host ${slot.teamId}: candidate slot must be ${required}, got ${slot.candidateDrawSlot}`);
      }
    }
  }

  // Every regulation host must be present in its required slot somewhere.
  const allSlots = new Map<string, string>();
  for (const order of drawOrder) {
    for (const slot of order.slots) allSlots.set(slot.teamId, slot.candidateDrawSlot);
  }
  for (const [teamId, required] of Object.entries(HOST_SLOTS)) {
    if (allSlots.get(teamId) !== required) {
      errors.push(`host ${teamId}: missing required candidate slot ${required}`);
    }
  }
  return errors;
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Validate candidate fixtures: 72 total, 6 per group, every team in exactly 3
 * group games, Article 12.4 pairings only, no duplicate pairings, unique match
 * numbers over 1..72, parseable kickoffs. Unknown/variant venues are WARNINGS.
 */
export function validateCandidateFixtures(
  fixtures: CandidateFixture[],
  venues: Venue[] = officialVenues,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const venueById = new Map(venues.map((v) => [v.id, v]));

  if (fixtures.length !== EXPECTED_FIXTURES) {
    errors.push(`expected ${EXPECTED_FIXTURES} candidate fixtures, got ${fixtures.length}`);
  }

  const matchNumbers = new Set<number>();
  const perGroup = new Map<string, CandidateFixture[]>();
  const gamesPerTeam = new Map<string, number>();

  for (const f of fixtures) {
    const tag = `M${f.matchNumber}`;
    if (f.matchNumber < 1 || f.matchNumber > EXPECTED_FIXTURES) {
      errors.push(`${tag}: match number out of range 1..${EXPECTED_FIXTURES}`);
    }
    if (matchNumbers.has(f.matchNumber)) errors.push(`${tag}: duplicate match number`);
    matchNumbers.add(f.matchNumber);

    const key = pairKey(f.homePosition, f.awayPosition);
    if (!EXPECTED_PAIR_KEYS.has(key)) {
      errors.push(`${tag}: pairing ${key} is not an Article 12.4 pairing`);
    }
    if (MATCHDAY_BY_PAIR[key] !== f.matchday) {
      errors.push(`${tag}: matchday ${f.matchday} inconsistent with pairing ${key}`);
    }

    if (Number.isNaN(Date.parse(f.kickoffUtc))) {
      errors.push(`${tag}: unparseable kickoffUtc "${f.kickoffUtc}"`);
    }

    if (f.venueId === undefined) {
      warnings.push(`${tag}: no resolved venue (raw "${f.venueRaw ?? ""}")`);
    } else {
      const venue = venueById.get(f.venueId);
      if (!venue) {
        warnings.push(`${tag}: unknown venue id ${f.venueId}`);
      } else if (f.venueRaw) {
        // Flag a venue-string variant (e.g. MetLife "NY/NJ" vs "New York / New Jersey").
        const rawCity = f.venueRaw.split(",")[1]?.replace(/[^\x20-\x7E]/g, "").trim();
        if (rawCity && rawCity.toLowerCase() !== venue.city.toLowerCase()) {
          warnings.push(`${tag}: venue city variant "${rawCity}" vs canonical "${venue.city}"`);
        }
      }
    }

    for (const id of [f.homeTeamId, f.awayTeamId]) {
      gamesPerTeam.set(id, (gamesPerTeam.get(id) ?? 0) + 1);
    }
    const list = perGroup.get(f.group) ?? [];
    list.push(f);
    perGroup.set(f.group, list);
  }

  for (const [g, list] of perGroup) {
    if (list.length !== FIXTURES_PER_GROUP) {
      errors.push(`group ${g}: expected ${FIXTURES_PER_GROUP} fixtures, got ${list.length}`);
    }
    const pairs = new Set<string>();
    for (const f of list) {
      const uk = unorderedKey(f.group, f.homeTeamId, f.awayTeamId);
      if (pairs.has(uk)) errors.push(`group ${g}: duplicate pairing ${uk}`);
      pairs.add(uk);
    }
  }

  for (const [id, count] of gamesPerTeam) {
    if (count !== GAMES_PER_TEAM) {
      errors.push(`team ${id}: expected ${GAMES_PER_TEAM} group games, got ${count}`);
    }
  }
  return { errors, warnings };
}

/* -------------------------------------------------------------------------- */
/* Article 12.4 cross-check                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Confirm the candidate fixtures are exactly what the candidate draw order
 * generates under Article 12.4 (a candidate inference, NOT an official mapping).
 */
export function crossCheckArticle124(
  drawOrder: CandidateDrawOrder[],
  fixtures: CandidateFixture[],
): string[] {
  const errors: string[] = [];
  const posByGroup = new Map<GroupId, Record<DrawPosition, string>>();
  for (const order of drawOrder) {
    const map = {} as Record<DrawPosition, string>;
    for (const slot of order.slots) map[slot.position] = slot.teamId;
    posByGroup.set(order.group, map);
  }

  const actual = new Set<string>();
  for (const f of fixtures) {
    actual.add(`${f.group}:${f.homeTeamId}>${f.awayTeamId}`);
  }

  for (const group of GROUP_IDS) {
    const map = posByGroup.get(group);
    if (!map) {
      errors.push(`group ${group}: missing candidate draw order`);
      continue;
    }
    for (const [hp, ap] of ARTICLE_12_4_PAIRINGS) {
      const home = map[hp];
      const away = map[ap];
      const expected = `${group}:${home}>${away}`;
      if (!actual.has(expected)) {
        errors.push(`group ${group}: expected Article 12.4 fixture ${home} (${hp}) v ${away} (${ap}) not found`);
      }
    }
  }
  return errors;
}

/* -------------------------------------------------------------------------- */
/* Cross-source reconciliation                                                */
/* -------------------------------------------------------------------------- */

export interface ReconciliationRow {
  group: GroupId;
  teamPair: [string, string];
  status: SourceAgreementStatus;
  /** Human-readable reason for a non-"matches" status. */
  detail?: string;
}

export interface ReconciliationResult {
  rows: ReconciliationRow[];
  agreement: Record<SourceAgreementStatus, number>;
  /** UNRESOLVED high-impact conflicts (home/away, date/time) for human review. */
  manualReview: string[];
  /** Conflicts that were inspected and deliberately settled (chosen value kept). */
  manuallyResolved: string[];
}

/** Build the set of (group, unordered pair) keys that were manually resolved. */
export function buildResolvedKeySet(
  resolutions: Pick<ManualConflictResolution, "group" | "homeTeamId" | "awayTeamId">[],
): Set<string> {
  return new Set(resolutions.map((r) => unorderedKey(r.group, r.homeTeamId, r.awayTeamId)));
}

/**
 * Reconcile the two third-party sources by (group, unordered team pair).
 *
 * The Excel source is structured (match#, venue, time); the Telegraph is the
 * visual cross-check. Conflicts are reported, never auto-resolved as official.
 * A conflict whose key is in `resolvedKeys` was inspected by a human and settled
 * (recorded in data/candidate/manual-resolutions.ts): it is tagged `resolved`
 * and listed in `manuallyResolved`. Any remaining conflict is tagged `conflict`
 * and collected into `manualReview`. Pairs present in only one source are tagged
 * `missing-in-one-source`. Nothing here makes the data official.
 */
export function reconcileSources(
  excel: CandidateSourceFixture[],
  telegraph: CandidateSourceFixture[],
  resolvedKeys: Set<string> = new Set(),
): ReconciliationResult {
  const telByKey = new Map<string, CandidateSourceFixture>();
  for (const t of telegraph) {
    telByKey.set(unorderedKey(t.group, t.homeTeamId, t.awayTeamId), t);
  }
  const excelKeys = new Set(
    excel.map((e) => unorderedKey(e.group, e.homeTeamId, e.awayTeamId)),
  );

  const rows: ReconciliationRow[] = [];
  const manualReview: string[] = [];
  const manuallyResolved: string[] = [];
  const agreement: Record<SourceAgreementStatus, number> = {
    matches: 0,
    conflict: 0,
    resolved: 0,
    "missing-in-one-source": 0,
    "not-checked": 0,
  };

  for (const e of excel) {
    const key = unorderedKey(e.group, e.homeTeamId, e.awayTeamId);
    const t = telByKey.get(key);
    const teamPair: [string, string] = [e.homeTeamId, e.awayTeamId];
    if (!t) {
      rows.push({ group: e.group, teamPair, status: "missing-in-one-source", detail: "not in Telegraph" });
      agreement["missing-in-one-source"] += 1;
      continue;
    }
    const orientationOk = e.homeTeamId === t.homeTeamId && e.awayTeamId === t.awayTeamId;
    const timeOk = Date.parse(e.kickoffUtc) === Date.parse(t.kickoffUtc);
    const label = e.matchNumber ? `M${e.matchNumber}` : `${e.group}`;
    if (orientationOk && timeOk) {
      rows.push({ group: e.group, teamPair, status: "matches" });
      agreement.matches += 1;
    } else {
      const reasons: string[] = [];
      if (!orientationOk) reasons.push(`home/away orientation (Excel ${e.homeTeamId} v ${e.awayTeamId}, Telegraph ${t.homeTeamId} v ${t.awayTeamId})`);
      if (!timeOk) reasons.push(`kickoff (Excel ${e.kickoffUtc}, Telegraph ${t.kickoffUtc})`);
      const detail = reasons.join("; ");
      if (resolvedKeys.has(key)) {
        rows.push({ group: e.group, teamPair, status: "resolved", detail });
        agreement.resolved += 1;
        manuallyResolved.push(`${label} ${e.homeTeamId} v ${e.awayTeamId}: ${detail} — Telegraph value selected as candidate after manual review.`);
      } else {
        rows.push({ group: e.group, teamPair, status: "conflict", detail });
        agreement.conflict += 1;
        manualReview.push(`${label} ${e.homeTeamId} v ${e.awayTeamId}: ${detail} — Excel value kept as candidate.`);
      }
    }
  }

  // Telegraph pairs absent from Excel.
  for (const t of telegraph) {
    const key = unorderedKey(t.group, t.homeTeamId, t.awayTeamId);
    if (!excelKeys.has(key)) {
      rows.push({
        group: t.group,
        teamPair: [t.homeTeamId, t.awayTeamId],
        status: "missing-in-one-source",
        detail: "not in Excel",
      });
      agreement["missing-in-one-source"] += 1;
    }
  }

  return { rows, agreement, manualReview, manuallyResolved };
}

/* -------------------------------------------------------------------------- */
/* Orchestrator                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Map candidate fixtures into the Excel cross-check shape. For a manually
 * resolved fixture the candidate value now holds the Telegraph kickoff, so the
 * ORIGINAL Excel value is restored here (from manual-resolutions.ts) — that way
 * reconciliation still detects the conflict and records it as resolved.
 */
function toExcelSourceFixtures(
  fixtures: CandidateFixture[],
  resolutions: ManualConflictResolution[],
): CandidateSourceFixture[] {
  const excelKickoffByMatch = new Map(
    resolutions.filter((r) => r.field === "kickoff").map((r) => [r.matchNumber, r.excelValue] as const),
  );
  return fixtures.map((f) => ({
    group: f.group,
    homeTeamId: f.homeTeamId,
    awayTeamId: f.awayTeamId,
    kickoffUtc: excelKickoffByMatch.get(f.matchNumber) ?? f.kickoffUtc,
    matchNumber: f.matchNumber,
    venueId: f.venueId,
  }));
}

/**
 * Validate the full candidate dataset and reconcile it against the Telegraph
 * cross-check. Returns errors (block promotion), warnings (venue variants etc.),
 * an agreement tally, a manual-review list of UNRESOLVED high-impact conflicts,
 * and a manually-resolved list of conflicts that were inspected and settled.
 */
export function validateCandidateSchedule(
  dataset: CandidateScheduleDataset,
  telegraph: CandidateSourceFixture[],
  teams: Team[] = officialTeams,
  venues: Venue[] = officialVenues,
): CandidateScheduleValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  errors.push(...validateCandidateGroups(dataset.groups, teams));
  errors.push(...validateCandidateDrawOrder(dataset.drawOrder, teams));
  const fx = validateCandidateFixtures(dataset.fixtures, venues);
  errors.push(...fx.errors);
  warnings.push(...fx.warnings);
  errors.push(...crossCheckArticle124(dataset.drawOrder, dataset.fixtures));

  const excel = toExcelSourceFixtures(dataset.fixtures, MANUAL_CONFLICT_RESOLUTIONS);
  const resolvedKeys = buildResolvedKeySet(MANUAL_CONFLICT_RESOLUTIONS);
  const reconciliation = reconcileSources(excel, telegraph, resolvedKeys);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    agreement: reconciliation.agreement,
    manualReview: reconciliation.manualReview,
    manuallyResolved: reconciliation.manuallyResolved,
  };
}
