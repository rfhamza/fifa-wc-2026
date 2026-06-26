import { describe, expect, it } from "vitest";
import {
  friendlyPolicyLabel,
  freshnessLabel,
  formatRelativeTime,
  selectLatestMatches,
  groupStandings,
  summariseBracket,
  deriveThirdPlaceRace,
  isLiveStateView,
  fetchPublicSafeLiveState,
  type LiveViewMatch,
  type LiveViewStanding,
  type LiveStateView,
} from "@/lib/live-client/public-safe-view.client";
import committedFixture from "@/data/live/public-safe-sample.json";

/**
 * Phase 1.28Q-A - pure live-state UI helpers. Node-env, no DOM, no network (fetch is
 * injected). Asserts behaviour + the no-leak governance boundary.
 */
const FIXTURE = committedFixture as unknown as LiveStateView;

const match = (over: Partial<LiveViewMatch>): LiveViewMatch => ({
  matchNumber: 1, matchId: "M1", stage: "group", teamA: "a", teamB: "b", status: "complete", ...over,
});
const standing = (over: Partial<LiveViewStanding>): LiveViewStanding => ({
  group: "A", position: 3, teamId: "t", played: 3, won: 1, drawn: 0, lost: 2,
  goalsFor: 2, goalsAgainst: 3, goalDifference: -1, points: 3,
  qualificationState: "undecided", derivedFrom: "results", ...over,
});

describe("labels", () => {
  it("friendlyPolicyLabel is calm and source-accurate", () => {
    expect(friendlyPolicyLabel("provider-public-delayed")).toContain("delayed");
    expect(friendlyPolicyLabel("manual-snapshot")).toBe("Manual snapshot");
    expect(friendlyPolicyLabel("provider-private-deferred")).toContain("Provider");
  });

  it("freshnessLabel maps status/freshness to calm phrases", () => {
    expect(freshnessLabel({ status: "ok", freshness: "fresh" })).toBe("Up to date");
    expect(freshnessLabel({ status: "stale", freshness: "stale" })).toBe("May be delayed");
    expect(freshnessLabel({ status: "ok", freshness: "fallback" })).toBe("May be delayed");
    expect(freshnessLabel({ status: "unavailable", freshness: "missing" })).toBe("Unavailable");
  });

  it("formatRelativeTime is deterministic from nowMs", () => {
    const base = Date.parse("2026-06-26T12:00:00Z");
    expect(formatRelativeTime("2026-06-26T12:00:00Z", base)).toBe("just now");
    expect(formatRelativeTime("2026-06-26T11:30:00Z", base)).toBe("30 min ago");
    expect(formatRelativeTime("2026-06-26T09:00:00Z", base)).toBe("3 hr ago");
    expect(formatRelativeTime("nonsense", base)).toBe("unknown");
  });
});

describe("selectLatestMatches", () => {
  const matches: LiveViewMatch[] = [
    match({ matchId: "S1", status: "scheduled", kickoff: "2026-06-30T19:00:00Z" }),
    match({ matchId: "L1", status: "in-progress", kickoff: "2026-06-26T19:00:00Z" }),
    ...Array.from({ length: 7 }, (_, i) =>
      match({ matchId: `C${i}`, status: "complete", matchNumber: i + 1, kickoff: `2026-06-2${i}T12:00:00Z` }),
    ),
  ];

  it("puts in-progress first, caps completed at 6, excludes scheduled, orders by recency", () => {
    const out = selectLatestMatches(matches);
    expect(out[0]!.status).toBe("in-progress");
    expect(out.filter((m) => m.status === "complete")).toHaveLength(6);
    expect(out.some((m) => m.status === "scheduled")).toBe(false);
    // most-recent completed first (C6 kickoff 2026-06-26 is latest)
    const firstCompleted = out.find((m) => m.status === "complete")!;
    expect(firstCompleted.matchId).toBe("C6");
  });
});

describe("groupStandings + summariseBracket (over the real fixture)", () => {
  it("groups standings by group, each sorted by position", () => {
    const groups = groupStandings(FIXTURE.standings);
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      const positions = g.rows.map((r) => r.position);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  it("summarises Round-of-32 resolution counts that add up", () => {
    const s = summariseBracket(FIXTURE.bracket, "roundOf32");
    expect(s.resolved + s.partial + s.unresolved).toBe(s.total);
    expect(s.total).toBe(16);
  });
});

describe("deriveThirdPlaceRace (cautious labels)", () => {
  it("ranks 12 third-place teams and reports 8 qualify", () => {
    const r = deriveThirdPlaceRace(FIXTURE.standings);
    expect(r.totalThirdPlace).toBe(12);
    expect(r.qualifySlots).toBe(8);
    expect(r.ranked).toHaveLength(12);
  });

  it("never overclaims: 'Clinched'/'Eliminated' only from qualificationState; ranking uses zone labels", () => {
    // 12 thirds: descending points by index, with two explicit qual states.
    const thirds: LiveViewStanding[] = Array.from({ length: 12 }, (_, i) =>
      standing({ teamId: `g${i}`, group: String.fromCharCode(65 + i), points: 30 - i }),
    );
    thirds[11] = standing({ ...thirds[11]!, qualificationState: "qualified" }); // worst rank but clinched
    thirds[0] = standing({ ...thirds[0]!, qualificationState: "eliminated" }); // best rank but eliminated
    const r = deriveThirdPlaceRace(thirds);

    const byTeam = new Map(r.ranked.map((e) => [e.teamId, e]));
    expect(byTeam.get("g11")!.status).toBe("Clinched"); // from qualificationState, not rank
    expect(byTeam.get("g0")!.status).toBe("Eliminated"); // from qualificationState, not rank
    // undecided teams get zone labels by rank, never "qualified"
    const undecided = r.ranked.filter((e) => e.qualificationState === "undecided");
    expect(undecided.every((e) => ["Top-eight zone", "On the bubble", "Still unresolved"].includes(e.status))).toBe(true);
    expect(r.ranked.some((e) => e.status === "Top-eight zone")).toBe(true);
    expect(r.ranked.some((e) => e.status === "On the bubble")).toBe(true);
    expect(r.ranked.some((e) => e.status === "Still unresolved")).toBe(true);
  });

  it("orders by points -> goalDifference -> goalsFor", () => {
    const r = deriveThirdPlaceRace([
      standing({ teamId: "low", points: 3, goalDifference: 0, goalsFor: 1 }),
      standing({ teamId: "tieGDhigh", points: 4, goalDifference: 2, goalsFor: 2 }),
      standing({ teamId: "tieGFhigh", points: 4, goalDifference: 2, goalsFor: 5 }),
    ]);
    expect(r.ranked.map((e) => e.teamId)).toEqual(["tieGFhigh", "tieGDhigh", "low"]);
  });
});

describe("fetch + guard + no-leak", () => {
  it("isLiveStateView accepts the fixture and rejects junk", () => {
    expect(isLiveStateView(FIXTURE)).toBe(true);
    expect(isLiveStateView({})).toBe(false);
    expect(isLiveStateView(null)).toBe(false);
  });

  it("fetchPublicSafeLiveState returns ok on a valid body and unavailable otherwise (injected fetch)", async () => {
    const okFetch = (async () => ({ json: async () => FIXTURE })) as unknown as typeof fetch;
    const okRes = await fetchPublicSafeLiveState(okFetch);
    expect(okRes.ok).toBe(true);

    const badFetch = (async () => ({ json: async () => ({ nope: true }) })) as unknown as typeof fetch;
    expect((await fetchPublicSafeLiveState(badFetch)).ok).toBe(false);

    const throwFetch = (async () => { throw new Error("network"); }) as unknown as typeof fetch;
    expect((await fetchPublicSafeLiveState(throwFetch)).ok).toBe(false);
  });

  it("no helper output or view exposes provider IDs / tokens / blob URLs / headers", () => {
    const FORBIDDEN = [
      "providerId", "providerMatchId", "providerTeamId", "X-Auth-Token",
      "X-Authenticated-Client", "Authorization", "BLOB_READ_WRITE_TOKEN",
      "FOOTBALL_DATA_TOKEN", "vercel-storage", "blob.vercel-storage.com", "crest", "odds", "referee",
    ];
    const serialized = JSON.stringify([
      FIXTURE,
      selectLatestMatches(FIXTURE.matches),
      groupStandings(FIXTURE.standings),
      summariseBracket(FIXTURE.bracket),
      deriveThirdPlaceRace(FIXTURE.standings),
    ]);
    for (const bad of FORBIDDEN) expect(serialized.includes(bad)).toBe(false);
  });
});
