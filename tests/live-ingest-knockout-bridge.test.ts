import { describe, expect, it } from "vitest";
import {
  officialKnockoutSchedule,
  validateKnockoutSchedule,
  etDaylightToUtc,
} from "@/data/official/knockout-schedule";
import {
  buildKnockoutMatchIdMap,
  findKnockoutTeamConflicts,
} from "@/lib/live-ingest/football-data-org/knockout-bridge";
import { normalizeFootballDataMatches } from "@/lib/live-ingest/football-data-org/normalize";
import { buildOfficialReference } from "@/lib/live-state/ingest";
import type { FdMatchesResponse } from "@/lib/live-ingest/football-data-org/types";
import type { LiveBracketState, LiveMatchState } from "@/lib/live-state/types";

/**
 * Phase 1.28R: official knockout schedule + dynamic provider knockout identity bridge.
 * Pure, offline; provider `utcDate` is used only as a cross-check, never to generate
 * official `kickoffUtc`. No provider IDs are committed or exposed.
 */
const reference = buildOfficialReference();
const ASOF = "2026-06-28T12:00:00Z";

const ko = (over: Partial<FdMatchesResponse["matches"][number]>): FdMatchesResponse["matches"][number] => ({
  id: 537417,
  utcDate: "2026-06-28T19:00:00Z",
  status: "TIMED",
  stage: "LAST_32",
  group: null,
  lastUpdated: "2026-06-26T12:00:00Z",
  homeTeam: { id: null, name: null, shortName: null, tla: null },
  awayTeam: { id: null, name: null, shortName: null, tla: null },
  score: { winner: null, duration: "REGULAR", fullTime: { home: null, away: null } },
  ...over,
});
const wc = (matches: FdMatchesResponse["matches"]): FdMatchesResponse => ({ competition: { code: "WC" }, matches });
const SA = { id: 774, name: "South Africa", shortName: "South Africa", tla: "RSA" };
const CAN = { id: 828, name: "Canada", shortName: "Canada", tla: "CAN" };

describe("official knockout schedule (Component 1)", () => {
  it("has exactly M73-M104 with valid rounds + ISO-UTC kickoffs, and passes validation", () => {
    expect(officialKnockoutSchedule).toHaveLength(32);
    expect(officialKnockoutSchedule.map((r) => r.matchNumber)).toEqual(
      Array.from({ length: 32 }, (_, i) => 73 + i),
    );
    const v = validateKnockoutSchedule();
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it("(round, kickoffUtc) is unique across all 32 rows", () => {
    const keys = officialKnockoutSchedule.map((r) => `${r.round}|${r.kickoffUtc}`);
    expect(new Set(keys).size).toBe(32);
  });

  it("contains no football-data.org provider IDs (only canonical fields)", () => {
    const text = JSON.stringify(officialKnockoutSchedule);
    expect(text).not.toContain("537417"); // a provider knockout id
    expect(text.toLowerCase()).not.toContain("providerid");
    for (const r of officialKnockoutSchedule) {
      expect(Object.keys(r).sort()).toEqual(
        ["kickoffUtc", "matchId", "matchNumber", "round", "sourceDateEt", "sourceTimeEt", "sourceTimezone"].sort(),
      );
    }
  });

  it("ET -> UTC: M73 15:00 ET on 2026-06-28 = 2026-06-28T19:00:00Z", () => {
    expect(etDaylightToUtc("2026-06-28", "15:00")).toBe("2026-06-28T19:00:00Z");
    expect(officialKnockoutSchedule[0]!.kickoffUtc).toBe("2026-06-28T19:00:00Z");
  });

  it("ET -> UTC: a late 23:00 ET kickoff rolls over to the next UTC day", () => {
    expect(etDaylightToUtc("2026-07-02", "23:00")).toBe("2026-07-03T03:00:00Z"); // M85
    expect(etDaylightToUtc("2026-07-03", "21:30")).toBe("2026-07-04T01:30:00Z"); // M87
    expect(etDaylightToUtc("2026-07-01", "20:00")).toBe("2026-07-02T00:00:00Z"); // M81
  });

  it("every row preserves source ET date/time and equals ET+4h", () => {
    for (const r of officialKnockoutSchedule) {
      expect(r.sourceTimezone).toBe("ET");
      expect(r.kickoffUtc).toBe(etDaylightToUtc(r.sourceDateEt, r.sourceTimeEt));
    }
  });

  it("validator fails closed on a duplicate (round, kickoffUtc)", () => {
    const dup = [...officialKnockoutSchedule];
    dup[1] = { ...dup[1]!, round: dup[0]!.round, kickoffUtc: dup[0]!.kickoffUtc };
    const v = validateKnockoutSchedule(dup);
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.includes("duplicate (round,kickoffUtc)"))).toBe(true);
  });
});

describe("dynamic knockout bridge (Component 2)", () => {
  it("maps provider LAST_32 + 2026-06-28T19:00:00Z to canonical M73", () => {
    const r = buildKnockoutMatchIdMap(wc([ko({ id: 537417, stage: "LAST_32", utcDate: "2026-06-28T19:00:00Z" })]));
    expect(r.knockoutMatchIdMap["537417"]).toBe(73);
    expect(r.diagnostics.mapped).toBe(1);
    expect(r.diagnostics.unmatched).toBe(0);
  });

  it("maps future R16/QF/SF/third-place/final shells to M89-M104", () => {
    const r = buildKnockoutMatchIdMap(wc([
      ko({ id: 1, stage: "LAST_16", utcDate: "2026-07-04T21:00:00Z" }),
      ko({ id: 2, stage: "QUARTER_FINALS", utcDate: "2026-07-09T20:00:00Z" }),
      ko({ id: 3, stage: "SEMI_FINALS", utcDate: "2026-07-14T19:00:00Z" }),
      ko({ id: 4, stage: "THIRD_PLACE", utcDate: "2026-07-18T21:00:00Z" }),
      ko({ id: 5, stage: "FINAL", utcDate: "2026-07-19T19:00:00Z" }),
    ]));
    expect(r.knockoutMatchIdMap).toEqual({ "1": 89, "2": 97, "3": 101, "4": 103, "5": 104 });
  });

  it("fails closed on a duplicate provider (stage, utcDate)", () => {
    expect(() => buildKnockoutMatchIdMap(wc([
      ko({ id: 10, stage: "LAST_32", utcDate: "2026-06-28T19:00:00Z" }),
      ko({ id: 11, stage: "LAST_32", utcDate: "2026-06-28T19:00:00Z" }),
    ]))).toThrow(/duplicate knockout/);
  });

  it("fails closed on a duplicate official (round, kickoffUtc)", () => {
    const dup = [officialKnockoutSchedule[0]!, { ...officialKnockoutSchedule[1]!, round: officialKnockoutSchedule[0]!.round, kickoffUtc: officialKnockoutSchedule[0]!.kickoffUtc }];
    expect(() => buildKnockoutMatchIdMap(wc([ko({})]), dup)).toThrow(/duplicate \(round,kickoffUtc\)/);
  });

  it("a playable knockout kickoff with no official match is counted as unmatched-playable (will block)", () => {
    const r = buildKnockoutMatchIdMap(wc([
      ko({ id: 20, stage: "LAST_32", status: "FINISHED", utcDate: "2026-06-28T18:00:00Z", homeTeam: SA, awayTeam: CAN,
        score: { winner: "HOME_TEAM", duration: "REGULAR", fullTime: { home: 1, away: 0 } } }),
    ]));
    expect(r.knockoutMatchIdMap["20"]).toBeUndefined();
    expect(r.diagnostics.unmatchedPlayable).toBe(1);
  });

  it("a scheduled knockout kickoff with no official match does not count as playable", () => {
    const r = buildKnockoutMatchIdMap(wc([ko({ id: 21, stage: "LAST_32", status: "TIMED", utcDate: "2026-06-28T18:00:00Z" })]));
    expect(r.diagnostics.unmatched).toBe(1);
    expect(r.diagnostics.unmatchedPlayable).toBe(0);
  });

  it("ignores group-stage rows (handled by the normal mapper)", () => {
    const r = buildKnockoutMatchIdMap(wc([
      ko({ id: 30, stage: "GROUP_STAGE", group: "GROUP_A", utcDate: "2026-06-11T19:00:00Z" }),
      ko({ id: 537417, stage: "LAST_32", utcDate: "2026-06-28T19:00:00Z" }),
    ]));
    expect(r.diagnostics.providerKnockoutRows).toBe(1);
    expect(r.knockoutMatchIdMap).toEqual({ "537417": 73 });
  });
});

describe("bridge + normalize integration", () => {
  it("a FINISHED knockout that bridges resolves to canonical M{n} with no provider id leak", () => {
    const bridge = buildKnockoutMatchIdMap(wc([
      ko({ id: 537417, stage: "LAST_32", status: "FINISHED", utcDate: "2026-06-28T19:00:00Z", homeTeam: SA, awayTeam: CAN,
        score: { winner: "HOME_TEAM", duration: "REGULAR", fullTime: { home: 2, away: 1 } } }),
    ]));
    const r = normalizeFootballDataMatches(
      wc([ko({ id: 537417, stage: "LAST_32", status: "FINISHED", utcDate: "2026-06-28T19:00:00Z", homeTeam: SA, awayTeam: CAN,
        score: { winner: "HOME_TEAM", duration: "REGULAR", fullTime: { home: 2, away: 1 } } })]),
      { reference, asOf: ASOF, knockoutMatchIdMap: bridge.knockoutMatchIdMap },
    );
    const m = r.snapshot.matches.find((x) => x.matchId === "M73")!;
    expect(m).toBeTruthy();
    expect([m.teamA, m.teamB].sort()).toEqual(["canada", "south-africa"]);
    expect(m.goalsA).toBe(2);
    expect(JSON.stringify(r.snapshot.matches)).not.toContain("537417"); // no provider id in matches
  });

  it("a FINISHED knockout with NO bridge mapping blocks (knockout-mapping-unavailable)", () => {
    const r = normalizeFootballDataMatches(
      wc([ko({ id: 999, stage: "LAST_32", status: "FINISHED", utcDate: "2026-06-28T18:00:00Z", homeTeam: SA, awayTeam: CAN,
        score: { winner: "HOME_TEAM", duration: "REGULAR", fullTime: { home: 1, away: 0 } } })]),
      { reference, asOf: ASOF, knockoutMatchIdMap: {} },
    );
    expect(r.errors.map((e) => e.code)).toEqual(["knockout-mapping-unavailable"]);
  });

  it("a scheduled bridged shell with TBD teams stays advisory (unresolved-knockout)", () => {
    const bridge = buildKnockoutMatchIdMap(wc([ko({ id: 537417, stage: "LAST_32", status: "TIMED", utcDate: "2026-06-28T19:00:00Z" })]));
    const r = normalizeFootballDataMatches(
      wc([ko({ id: 537417, stage: "LAST_32", status: "TIMED", utcDate: "2026-06-28T19:00:00Z" })]),
      { reference, asOf: ASOF, knockoutMatchIdMap: bridge.knockoutMatchIdMap },
    );
    expect(r.errors.map((e) => e.code)).toEqual(["unresolved-knockout"]);
    expect(r.snapshot.matches).toHaveLength(0);
  });

  it("unknown provider knockout stage fails closed (unknown-stage)", () => {
    const r = normalizeFootballDataMatches(wc([ko({ id: 555, stage: "LAST_64", utcDate: "2026-06-28T19:00:00Z" })]), { reference, asOf: ASOF });
    expect(r.errors.some((e) => e.code === "unknown-stage")).toBe(true);
  });
});

describe("knockout team cross-check vs internal derived bracket", () => {
  const match = (matchId: string, teamA: string, teamB: string): LiveMatchState =>
    ({ matchId, stage: "roundOf32", teamA, teamB, status: "complete" } as unknown as LiveMatchState);
  const bracket = (matchNumber: number, home: string | null, away: string | null): LiveBracketState =>
    ({ matches: [{ matchNumber, stage: "roundOf32", homeTeamId: home, awayTeamId: away, winner: null }] } as unknown as LiveBracketState);

  it("flags a conflict when provider teams disagree with a resolved derived slot", () => {
    const c = findKnockoutTeamConflicts([match("M73", "france", "spain")], bracket(73, "south-africa", "canada"));
    expect(c).toHaveLength(1);
    expect(c[0]!.matchNumber).toBe(73);
  });

  it("no conflict when teams agree (order-independent)", () => {
    const c = findKnockoutTeamConflicts([match("M73", "canada", "south-africa")], bracket(73, "south-africa", "canada"));
    expect(c).toEqual([]);
  });

  it("skips the check when the derived slot is not yet resolved", () => {
    const c = findKnockoutTeamConflicts([match("M73", "france", "spain")], bracket(73, null, null));
    expect(c).toEqual([]);
  });
});

// Provider utcDate is only ever a cross-check; assert we never derive official kickoffUtc from it.
describe("source-of-truth guard", () => {
  it("official kickoffUtc is derived from ET source, matching provider utcDate as a cross-check only", () => {
    const m73 = officialKnockoutSchedule.find((r) => r.matchNumber === 73)!;
    const providerUtcDate = "2026-06-28T19:00:00Z"; // cross-check value from the provider payload
    expect(m73.kickoffUtc).toBe(etDaylightToUtc(m73.sourceDateEt, m73.sourceTimeEt));
    expect(m73.kickoffUtc).toBe(providerUtcDate); // they agree, but ET is the source
  });
});
