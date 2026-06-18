/**
 * Phase 1.6 - OFFICIAL schedule staging: validation, draw-position solving, and
 * cross-check against the candidate (Telegraph/Excel) layer.
 *
 * This is verification-only. It reads the staged transcription
 * (`data/official/staging/schedule.ts`) and proves that a future activation
 * (Step B) would pass the EXISTING resolver validators - without mutating
 * production. Nothing here is imported by `lib/data/source.ts`, so
 * `fixtureSource` stays `position-generated` until activation is approved.
 */
import type {
  DrawPosition,
  Fixture,
  GroupId,
  OfficialFixture,
  StagedDrawPosition,
  StagedOfficialFixture,
  Team,
  Venue,
} from "@/lib/types";
import { officialTeams } from "@/data/official/teams";
import { officialVenues } from "@/data/official/venues";
import { stagedOfficialSchedule } from "@/data/official/staging/schedule";
import { candidateGroupFixtures } from "@/data/candidate/group-fixtures";
import { candidateDrawOrder } from "@/data/candidate/draw-order";
import { ARTICLE_12_4_PAIRINGS } from "./fixtures";
import { validateDrawPositions, validateFixtures, validateOfficialFixtures } from "./validate";

const EXPECTED_FIXTURES = 72;
const FIXTURES_PER_GROUP = 6;
const GAMES_PER_TEAM = 3;
const GROUP_IDS: GroupId[] = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

/** Regulation host draw slots (FIFA Art. 12.3): team id -> required slot. */
export const HOST_SLOTS: Record<string, string> = { mexico: "A1", canada: "B1", usa: "D1" };

const pairKey = (h: DrawPosition, a: DrawPosition) => `${h}v${a}`;
const EXPECTED_PAIR_KEYS = new Set(ARTICLE_12_4_PAIRINGS.map(([h, a]) => pairKey(h, a)));

/** Matchday implied by an Article 12.4 position pairing. */
const MATCHDAY_BY_PAIR: Record<string, number> = {
  "1v2": 1, "3v4": 1, "1v3": 2, "4v2": 2, "4v1": 3, "2v3": 3,
};

const unorderedKey = (group: GroupId, a: string, b: string) =>
  `${group}:${[a, b].sort().join("|")}`;

/* -------------------------------------------------------------------------- */
/* Timezone                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Convert a printed ET local time ("2026-06-11 15:00 ET") to a UTC ISO string.
 * The 2026 tournament window is entirely in EDT (UTC-4), so UTC = ET + 4h.
 */
export function etLocalToUtcIso(local: string): string | null {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}) ET$/);
  if (!m) return null;
  const [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4], m[5]].map(Number);
  return new Date(Date.UTC(y!, mo! - 1, d!, h! + 4, mi!)).toISOString().replace(".000Z", "Z");
}

/* -------------------------------------------------------------------------- */
/* Staged schedule validation                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Validate the staged official schedule: 72 rows, unique match numbers 1..72,
 * 12 groups x 6, each team in exactly 3 games, no duplicate pairings, Article
 * 12.4 pairings, matchday consistent with the pairing, venues resolve, and
 * kickoffUtc equals the printed ET local time + 4h.
 */
export function validateStagedSchedule(
  staged: StagedOfficialFixture[],
  teams: Team[] = officialTeams,
  venues: Venue[] = officialVenues,
): string[] {
  const errors: string[] = [];
  const venueIds = new Set(venues.map((v) => v.id));
  const teamIds = new Set(teams.map((t) => t.id));

  if (staged.length !== EXPECTED_FIXTURES) {
    errors.push(`expected ${EXPECTED_FIXTURES} staged fixtures, got ${staged.length}`);
  }

  const matchNumbers = new Set<number>();
  const perGroup = new Map<GroupId, StagedOfficialFixture[]>();
  const gamesPerTeam = new Map<string, number>();

  for (const f of staged) {
    const tag = `M${f.matchNumber}`;
    if (f.matchNumber < 1 || f.matchNumber > EXPECTED_FIXTURES) {
      errors.push(`${tag}: match number out of range 1..${EXPECTED_FIXTURES}`);
    }
    if (matchNumbers.has(f.matchNumber)) errors.push(`${tag}: duplicate match number`);
    matchNumbers.add(f.matchNumber);

    if (!teamIds.has(f.homeTeamId)) errors.push(`${tag}: unknown home team ${f.homeTeamId}`);
    if (!teamIds.has(f.awayTeamId)) errors.push(`${tag}: unknown away team ${f.awayTeamId}`);
    if (!venueIds.has(f.venueId)) errors.push(`${tag}: unknown venue ${f.venueId}`);

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
    const utcFromLocal = etLocalToUtcIso(f.kickoffLocalSourceTime);
    if (!utcFromLocal) {
      errors.push(`${tag}: unparseable kickoffLocalSourceTime "${f.kickoffLocalSourceTime}"`);
    } else if (Date.parse(utcFromLocal) !== Date.parse(f.kickoffUtc)) {
      errors.push(`${tag}: kickoffUtc ${f.kickoffUtc} != ET+4h ${utcFromLocal}`);
    }

    for (const id of [f.homeTeamId, f.awayTeamId]) {
      gamesPerTeam.set(id, (gamesPerTeam.get(id) ?? 0) + 1);
    }
    const list = perGroup.get(f.group) ?? [];
    list.push(f);
    perGroup.set(f.group, list);
  }

  for (const g of GROUP_IDS) {
    const list = perGroup.get(g) ?? [];
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
  return errors;
}

/* -------------------------------------------------------------------------- */
/* Draw-position solver                                                        */
/* -------------------------------------------------------------------------- */

const PERMUTATIONS: DrawPosition[][] = (() => {
  const out: DrawPosition[][] = [];
  const base: DrawPosition[] = [1, 2, 3, 4];
  const permute = (arr: DrawPosition[], acc: DrawPosition[]) => {
    if (arr.length === 0) {
      out.push(acc);
      return;
    }
    arr.forEach((v, i) => permute([...arr.slice(0, i), ...arr.slice(i + 1)], [...acc, v]));
  };
  permute(base, []);
  return out;
})();

export interface DrawSolveResult {
  positions: StagedDrawPosition[];
  errors: string[];
  /** Per-group count of valid assignments (must be exactly 1 each). */
  solutionsPerGroup: Record<string, number>;
}

/**
 * Solve each group's draw positions (1..4) from the schedule's DIRECTED pairings
 * under Article 12.4, anchored by the verified host slots. Asserts a UNIQUE
 * solution per group (records an error otherwise).
 */
export function solveDrawPositionsFromSchedule(
  staged: StagedOfficialFixture[],
  hostSlots: Record<string, string> = HOST_SLOTS,
): DrawSolveResult {
  const errors: string[] = [];
  const positions: StagedDrawPosition[] = [];
  const solutionsPerGroup: Record<string, number> = {};

  for (const group of GROUP_IDS) {
    const fixtures = staged.filter((f) => f.group === group);
    const teamIds = Array.from(
      new Set(fixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId])),
    );
    if (teamIds.length !== 4) {
      errors.push(`group ${group}: expected 4 teams, got ${teamIds.length}`);
      solutionsPerGroup[group] = 0;
      continue;
    }

    const valid: Record<string, DrawPosition>[] = [];
    for (const perm of PERMUTATIONS) {
      const posOf: Record<string, DrawPosition> = {};
      teamIds.forEach((id, i) => (posOf[id] = perm[i]!));

      // Respect verified host anchors.
      let hostOk = true;
      for (const [teamId, slot] of Object.entries(hostSlots)) {
        if (posOf[teamId] !== undefined) {
          const required = Number(slot.slice(1)) as DrawPosition;
          if (posOf[teamId] !== required) { hostOk = false; break; }
        }
      }
      if (!hostOk) continue;

      // Directed pairing set must equal Article 12.4 exactly.
      const keys = new Set<string>();
      let ok = true;
      for (const f of fixtures) {
        const key = pairKey(posOf[f.homeTeamId]!, posOf[f.awayTeamId]!);
        if (!EXPECTED_PAIR_KEYS.has(key) || keys.has(key)) { ok = false; break; }
        keys.add(key);
      }
      if (ok && keys.size === EXPECTED_PAIR_KEYS.size) valid.push(posOf);
    }

    solutionsPerGroup[group] = valid.length;
    if (valid.length !== 1) {
      errors.push(`group ${group}: expected a unique draw-position solution, found ${valid.length}`);
      continue;
    }
    const posOf = valid[0]!;
    for (const teamId of teamIds) {
      const position = posOf[teamId]!;
      positions.push({ group, position, teamId, slot: `${group}${position}` });
    }
  }

  positions.sort((a, b) =>
    a.group === b.group ? a.position - b.position : a.group.localeCompare(b.group),
  );
  return { positions, errors, solutionsPerGroup };
}

/**
 * Validate solved draw positions: positions {1,2,3,4} unique per group, slot
 * strings consistent, host slots preserved, and consistent with the staged
 * fixtures' own home/away positions.
 */
export function validateSolvedDrawPositions(
  solved: StagedDrawPosition[],
  staged: StagedOfficialFixture[],
): string[] {
  const errors: string[] = [];
  const byGroup = new Map<GroupId, StagedDrawPosition[]>();
  for (const s of solved) {
    if (s.slot !== `${s.group}${s.position}`) {
      errors.push(`${s.teamId}: slot ${s.slot} != ${s.group}${s.position}`);
    }
    const list = byGroup.get(s.group) ?? [];
    list.push(s);
    byGroup.set(s.group, list);
  }

  for (const group of GROUP_IDS) {
    const list = byGroup.get(group) ?? [];
    const ps = list.map((s) => s.position).sort().join(",");
    if (ps !== "1,2,3,4") errors.push(`group ${group}: positions must be {1,2,3,4}, got {${ps}}`);
  }

  for (const [teamId, slot] of Object.entries(HOST_SLOTS)) {
    const found = solved.find((s) => s.teamId === teamId);
    if (!found || found.slot !== slot) {
      errors.push(`host ${teamId}: solved slot must be ${slot}, got ${found?.slot ?? "none"}`);
    }
  }

  // Solved positions must reproduce each staged fixture's home/away positions.
  const posOf = new Map(solved.map((s) => [s.teamId, s.position]));
  for (const f of staged) {
    if (posOf.get(f.homeTeamId) !== f.homePosition || posOf.get(f.awayTeamId) !== f.awayPosition) {
      errors.push(`M${f.matchNumber}: staged positions disagree with the solved draw order`);
    }
  }
  return errors;
}

/* -------------------------------------------------------------------------- */
/* Dry-run activation (reuse the existing resolver validators)                 */
/* -------------------------------------------------------------------------- */

/** Map staged rows into position-keyed `OfficialFixture`s (the Step-B shape). */
export function toOfficialFixtures(staged: StagedOfficialFixture[]): OfficialFixture[] {
  return staged.map((f) => ({
    matchNumber: f.matchNumber,
    group: f.group,
    matchday: f.matchday,
    homePosition: f.homePosition,
    awayPosition: f.awayPosition,
    venueId: f.venueId,
    kickoff: f.kickoffUtc,
    status: f.status ?? "scheduled",
    sourceRef: f.sourceRef,
    subjectToChange: f.subjectToChange,
    kickoffSourceTz: "America/New_York",
    kickoffLocalSourceTime: f.kickoffLocalSourceTime,
    venueLabelRaw: f.venueLabelRaw,
  }));
}

/** Apply solved draw positions onto a copy of the team list (the Step-B shape). */
export function teamsWithStagedPositions(
  solved: StagedDrawPosition[],
  teams: Team[] = officialTeams,
): Team[] {
  const bySlot = new Map(solved.map((s) => [s.teamId, s]));
  return teams.map((t) => {
    const s = bySlot.get(t.id);
    if (!s) return t;
    return { ...t, drawPosition: s.position, drawSlot: s.slot, drawSlotStatus: "verified" as const };
  });
}

function materialise(schedule: OfficialFixture[], teams: Team[]): Fixture[] | null {
  const posIndex = new Map<string, string>();
  for (const t of teams) if (t.drawPosition) posIndex.set(`${t.group}${t.drawPosition}`, t.id);
  const fixtures: Fixture[] = [];
  for (const row of schedule) {
    const homeId = posIndex.get(`${row.group}${row.homePosition}`);
    const awayId = posIndex.get(`${row.group}${row.awayPosition}`);
    if (!homeId || !awayId) return null;
    fixtures.push({
      id: `M${row.matchNumber}`, matchday: row.matchday, group: row.group,
      homeTeamId: homeId, awayTeamId: awayId, venueId: row.venueId,
      date: row.kickoff, kickoff: row.kickoff, matchNumber: row.matchNumber,
      homePosition: row.homePosition, awayPosition: row.awayPosition,
      status: row.status ?? "scheduled", source: "official",
    });
  }
  return fixtures;
}

export interface DryRunResult {
  errors: string[];
  /** True when a Step-B activation would pass every existing validator. */
  wouldActivate: boolean;
}

/**
 * Prove that activating the staged schedule (Step B) would pass the EXISTING
 * resolver validators (`validateDrawPositions`, `validateOfficialFixtures`,
 * `validateFixtures`) and materialise to 72 official fixtures - WITHOUT mutating
 * production. Pure: operates on copies only.
 */
export function dryRunActivation(
  staged: StagedOfficialFixture[],
  solved: StagedDrawPosition[],
  teams: Team[] = officialTeams,
  venues: Venue[] = officialVenues,
): DryRunResult {
  const errors: string[] = [];
  const teamsWithPos = teamsWithStagedPositions(solved, teams);
  const official = toOfficialFixtures(staged);

  errors.push(...validateDrawPositions(teamsWithPos));
  errors.push(...validateOfficialFixtures(official, teamsWithPos, venues));

  const materialised = materialise(official, teamsWithPos);
  if (!materialised) {
    errors.push("materialise failed: a draw position is not resolvable to a team");
  } else {
    const teamIds = new Set(teamsWithPos.map((t) => t.id));
    errors.push(...validateFixtures(materialised, teamIds, venues));
    if (materialised.length !== EXPECTED_FIXTURES) {
      errors.push(`materialised ${materialised.length} fixtures, expected ${EXPECTED_FIXTURES}`);
    }
  }

  return { errors, wouldActivate: errors.length === 0 };
}

/* -------------------------------------------------------------------------- */
/* Cross-check against the candidate (Telegraph/Excel) layer                   */
/* -------------------------------------------------------------------------- */

export interface ScheduleCrossCheckRow {
  matchNumber: number;
  status: "matches" | "discrepancy" | "missing-in-candidate";
  detail?: string;
}

export interface ScheduleCrossCheckResult {
  rows: ScheduleCrossCheckRow[];
  matches: number;
  discrepancies: string[];
  /** Draw-order agreement vs the candidate solved order. */
  drawOrderDiscrepancies: string[];
}

/**
 * Cross-check the OFFICIAL staged schedule against the candidate layer
 * (Telegraph/Excel). The official source WINS on any disagreement; every
 * discrepancy is reported (never hidden). Expected result: full agreement, with
 * M20/M36 confirming the candidate's manual Telegraph resolution.
 */
export function crossCheckScheduleAgainstCandidate(
  staged: StagedOfficialFixture[] = stagedOfficialSchedule,
  candidate = candidateGroupFixtures,
): ScheduleCrossCheckResult {
  const byMatch = new Map(candidate.map((c) => [c.matchNumber, c]));
  const rows: ScheduleCrossCheckRow[] = [];
  const discrepancies: string[] = [];
  let matches = 0;

  for (const f of staged) {
    const c = byMatch.get(f.matchNumber);
    if (!c) {
      rows.push({ matchNumber: f.matchNumber, status: "missing-in-candidate" });
      continue;
    }
    const reasons: string[] = [];
    if (c.group !== f.group) reasons.push(`group (official ${f.group}, candidate ${c.group})`);
    if (c.homeTeamId !== f.homeTeamId || c.awayTeamId !== f.awayTeamId) {
      reasons.push(`orientation (official ${f.homeTeamId} v ${f.awayTeamId}, candidate ${c.homeTeamId} v ${c.awayTeamId})`);
    }
    if (Date.parse(c.kickoffUtc) !== Date.parse(f.kickoffUtc)) {
      reasons.push(`kickoff (official ${f.kickoffUtc}, candidate ${c.kickoffUtc})`);
    }
    if (c.venueId !== f.venueId) {
      reasons.push(`venue (official ${f.venueId}, candidate ${c.venueId})`);
    }
    if (reasons.length === 0) {
      rows.push({ matchNumber: f.matchNumber, status: "matches" });
      matches += 1;
    } else {
      const detail = reasons.join("; ");
      rows.push({ matchNumber: f.matchNumber, status: "discrepancy", detail });
      discrepancies.push(`M${f.matchNumber}: ${detail} - official kept.`);
    }
  }

  // Draw order vs candidate.
  const drawOrderDiscrepancies: string[] = [];
  const candPos = new Map<string, string>(); // `${group}${position}` -> teamId
  for (const o of candidateDrawOrder) {
    for (const s of o.slots) candPos.set(`${o.group}${s.position}`, s.teamId);
  }
  const { positions } = solveDrawPositionsFromSchedule(staged);
  for (const p of positions) {
    const cand = candPos.get(p.slot);
    if (cand && cand !== p.teamId) {
      drawOrderDiscrepancies.push(`${p.slot}: official ${p.teamId}, candidate ${cand} - official kept.`);
    }
  }

  return { rows, matches, discrepancies, drawOrderDiscrepancies };
}
