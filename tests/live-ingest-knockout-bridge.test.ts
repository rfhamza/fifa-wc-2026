import { describe, expect, it } from "vitest";
import {
  officialKnockoutSchedule,
  validateKnockoutSchedule,
  etDaylightToUtc,
} from "@/data/official/knockout-schedule";
import {
  augmentKnockoutMapByTeams,
  buildKnockoutMatchIdMap,
  findKnockoutTeamConflicts,
} from "@/lib/live-ingest/football-data-org/knockout-bridge";
import { normalizeFootballDataMatches } from "@/lib/live-ingest/football-data-org/normalize";
import { buildOfficialReference, ingestLiveSnapshot } from "@/lib/live-state/ingest";
import { runFetchLiveState, type FetchLike } from "@/scripts/football-data-org/live-state-fetch";
import { getTeam } from "@/lib/data";
import type { FdMatch, FdMatchesResponse } from "@/lib/live-ingest/football-data-org/types";
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

/**
 * Phase 1.28S: a FINISHED/active knockout whose provider kickoff DRIFTED from the
 * transcribed official kickoffUtc misses the exact (round,kickoffUtc) time-join and would
 * hard-block the write. `augmentKnockoutMapByTeams` recovers it by RESOLVED-TEAM identity
 * against the internally derived bracket, without ever weakening the fail-closed guard for
 * a genuinely unidentifiable completed result.
 */
describe("augmentKnockoutMapByTeams (team-identity recovery for drifted kickoffs)", () => {
  // A derived bracket where M73 (roundOf32) resolved to South Africa v Canada internally.
  const resolvedBracket = (home: string | null = "south-africa", away: string | null = "canada"): LiveBracketState =>
    ({
      matches: [{ matchNumber: 73, stage: "roundOf32", homeTeamId: home, awayTeamId: away, winner: null, status: "scheduled", resolved: false }],
      unresolved: [73], unresolvedTies: [], derivedFrom: "results",
    } as unknown as LiveBracketState);

  // A FINISHED LAST_32 South Africa v Canada whose kickoff drifted 7 minutes off M73's 19:00Z.
  const driftedFinished = (id = 537417): FdMatchesResponse =>
    wc([ko({ id, stage: "LAST_32", status: "FINISHED", utcDate: "2026-06-28T19:07:00Z", homeTeam: SA, awayTeam: CAN,
      score: { winner: "HOME_TEAM", duration: "REGULAR", fullTime: { home: 2, away: 1 } } })]);

  it("the exact time-join misses the drifted finished row (setup)", () => {
    const bridge = buildKnockoutMatchIdMap(driftedFinished());
    expect(bridge.knockoutMatchIdMap).toEqual({});
    expect(bridge.diagnostics.unmatchedPlayable).toBe(1);
  });

  it("recovers the drifted finished knockout by resolved team pair -> M73", () => {
    const aug = augmentKnockoutMapByTeams(driftedFinished(), {}, resolvedBracket());
    expect(aug.knockoutMatchIdMap["537417"]).toBe(73);
    expect(aug.recovered).toHaveLength(1);
    expect(aug.recovered[0]).toMatchObject({ providerId: "537417", matchNumber: 73, stage: "roundOf32" });
    expect([aug.recovered[0]!.teamA, aug.recovered[0]!.teamB].sort()).toEqual(["canada", "south-africa"]);
  });

  it("recovery -> normalize yields a mapped M73 result with score and NO blocker or id leak", () => {
    const aug = augmentKnockoutMapByTeams(driftedFinished(), {}, resolvedBracket());
    const r = normalizeFootballDataMatches(driftedFinished(), { reference, asOf: ASOF, knockoutMatchIdMap: aug.knockoutMatchIdMap });
    const m = r.snapshot.matches.find((x) => x.matchId === "M73")!;
    expect(m).toBeTruthy();
    expect([m.teamA, m.teamB].sort()).toEqual(["canada", "south-africa"]);
    expect((m.goalsA ?? 0) + (m.goalsB ?? 0)).toBe(3);
    expect(r.errors.map((e) => e.code)).not.toContain("knockout-mapping-unavailable");
    expect(JSON.stringify(r.snapshot.matches)).not.toContain("537417"); // provider id never leaks
  });

  it("does NOT recover when the provider teams match no resolved slot (still blocks)", () => {
    const GER = { id: 759, name: "Germany", shortName: "Germany", tla: "GER" };
    const BRA = { id: 764, name: "Brazil", shortName: "Brazil", tla: "BRA" };
    const p = wc([ko({ id: 40, stage: "LAST_32", status: "FINISHED", utcDate: "2026-06-28T19:07:00Z", homeTeam: GER, awayTeam: BRA,
      score: { winner: "HOME_TEAM", duration: "REGULAR", fullTime: { home: 1, away: 0 } } })]);
    const aug = augmentKnockoutMapByTeams(p, {}, resolvedBracket());
    expect(aug.recovered).toEqual([]);
    expect(aug.knockoutMatchIdMap).toEqual({});
  });

  it("does NOT recover a SCHEDULED (TIMED) drifted row (advisory shell, not a result)", () => {
    const p = wc([ko({ id: 41, stage: "LAST_32", status: "TIMED", utcDate: "2026-06-28T19:07:00Z", homeTeam: SA, awayTeam: CAN })]);
    expect(augmentKnockoutMapByTeams(p, {}, resolvedBracket()).recovered).toEqual([]);
  });

  it("does NOT recover when the matching slot is already a time-join target (no double-map)", () => {
    const aug = augmentKnockoutMapByTeams(driftedFinished(), { "999": 73 }, resolvedBracket());
    expect(aug.recovered).toEqual([]);
    expect(aug.knockoutMatchIdMap["537417"]).toBeUndefined();
  });

  it("does NOT recover against an unresolved (null-team) derived slot", () => {
    expect(augmentKnockoutMapByTeams(driftedFinished(), {}, resolvedBracket(null, null)).recovered).toEqual([]);
  });
});

describe("runFetchLiveState recovers a drifted finished knockout end-to-end (no network/Blob)", () => {
  const UPDATED = "2026-07-02T11:00:00Z";
  const ASOF_RUN = "2026-07-02T12:00:00Z";
  const matchesFetch = (payload: unknown): FetchLike => async () => ({
    status: 200, ok: true, headers: { get: () => null }, text: async () => JSON.stringify(payload),
  });
  const providerTeam = (appId: string, seq: number): FdMatch["homeTeam"] => ({
    id: 900000 + seq, name: getTeam(appId).name, shortName: getTeam(appId).name, tla: null,
  });

  it("all groups complete -> a drifted finished R32 is mapped by team identity, not blocked", async () => {
    // Emit all 72 official group fixtures FINISHED (home wins 1-0) so every R32 slot resolves.
    const groupRows: FdMatch[] = reference.groupMatches.map((gm, i) => ({
      id: 400000 + i,
      utcDate: `2026-06-${String(11 + (i % 15)).padStart(2, "0")}T${String(i % 24).padStart(2, "0")}:03:00Z`,
      status: "FINISHED", stage: "GROUP_STAGE", group: `GROUP_${gm.group}`, lastUpdated: UPDATED,
      homeTeam: providerTeam(gm.homeTeamId, i * 2), awayTeam: providerTeam(gm.awayTeamId, i * 2 + 1),
      score: { winner: "HOME_TEAM", duration: "REGULAR", fullTime: { home: 1, away: 0 } },
    }));

    // Discover a resolved R32 slot from the derived bracket (ground truth), then draft a
    // FINISHED provider row for those teams with a kickoff drifted off the official time.
    const base = normalizeFootballDataMatches(wc(groupRows), { reference, asOf: ASOF_RUN, expectFullTournament: false });
    const derived = ingestLiveSnapshot(base.snapshot, reference, { generatedAt: ASOF_RUN, staleAfterSeconds: 24 * 60 * 60 });
    const slot = derived.bracket.matches.find((m) => m.stage === "roundOf32" && m.homeTeamId && m.awayTeamId)!;
    expect(slot).toBeTruthy();
    const official = officialKnockoutSchedule.find((r) => r.matchNumber === slot.matchNumber)!;
    const driftedUtc = `${official.kickoffUtc.slice(0, 14)}07:00Z`; // minutes -> :07 (never an official time)

    const driftedRow: FdMatch = {
      id: 555001, utcDate: driftedUtc, status: "FINISHED", stage: "LAST_32", group: null, lastUpdated: UPDATED,
      homeTeam: providerTeam(slot.homeTeamId!, 9001), awayTeam: providerTeam(slot.awayTeamId!, 9002),
      score: { winner: "HOME_TEAM", duration: "REGULAR", fullTime: { home: 2, away: 1 } },
    };

    const logs: string[] = [];
    const r = await runFetchLiveState({
      token: "fd-secret", fetchImpl: matchesFetch(wc([...groupRows, driftedRow])), now: () => ASOF_RUN,
      writeArtifact: () => {}, log: (l) => logs.push(l), reference,
      options: { standings: false, dryRun: true, summaryOnly: true, expectFullTournament: false, outDir: "artifacts/test" },
    });

    expect(r.exitCode).toBe(0);
    expect(r.summary!.knockoutBridgeRecoveredByTeams).toBe(1);
    expect(r.summary!.unmappedCount).toBe(0); // the drifted finished R32 no longer hard-blocks
    expect(r.state!.matches.some((m) => m.matchId === `M${slot.matchNumber}` && m.status === "complete")).toBe(true);
    // Diagnostics name the recovery; tokens never appear in the logs.
    expect(logs.join("\n")).toContain(`-> M${slot.matchNumber}`);
    expect(logs.join("\n")).not.toContain("fd-secret");
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
