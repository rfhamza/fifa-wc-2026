import { describe, expect, it } from "vitest";
import {
  validateLiveSnapshot,
  computeMatchFreshness,
} from "@/lib/live-state/validate";
import {
  deriveGroupStandings,
  deriveBracketState,
  realiseBracketFromResults,
} from "@/lib/live-state/derive";
import { buildOfficialReference, ingestLiveSnapshot } from "@/lib/live-state/ingest";
import type { GroupResult } from "@/lib/simulation/bracket";
import type { GroupId } from "@/lib/types";
import type { LiveMatchState } from "@/lib/live-state/types";
import {
  SAMPLE_REFERENCE,
  validPartialGroupSnapshot,
  completeGroupSnapshot,
  duplicateMatchIdSnapshot,
  invalidTeamIdSnapshot,
  unknownMatchIdSnapshot,
  negativeScoreSnapshot,
  completeMissingScoreSnapshot,
  scheduledWithScoreSnapshot,
  inPlayFieldSnapshot,
  validKnockoutSnapshot,
  penaltyKnockoutSnapshot,
  winnerNotParticipantSnapshot,
  drawNeedsWinnerSnapshot,
  staleSnapshot,
  emptySnapshot,
} from "./fixtures/live-state/snapshots";

const FRESH = { asOf: "2026-06-20T12:00:00Z", staleAfterSeconds: 24 * 60 * 60 };
const hasCode = (issues: { code: string }[], code: string) => issues.some((i) => i.code === code);

/**
 * Phase 1.25B: the live-state validator parses manual snapshots, rejects malformed
 * input explicitly (never silently), and the deriver reuses the existing pure
 * standings/bracket helpers read-only. No model behaviour is touched.
 */
describe("live-state validator: valid input", () => {
  it("parses a valid partial group snapshot with no errors", () => {
    const r = validateLiveSnapshot(validPartialGroupSnapshot, SAMPLE_REFERENCE, FRESH);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.matches).toHaveLength(3);
  });

  it("accepts a valid knockout result and a penalty-decided knockout", () => {
    expect(validateLiveSnapshot(validKnockoutSnapshot, SAMPLE_REFERENCE, FRESH).ok).toBe(true);
    expect(validateLiveSnapshot(penaltyKnockoutSnapshot, SAMPLE_REFERENCE, FRESH).ok).toBe(true);
  });
});

describe("live-state validator: rejections (never silent)", () => {
  it("fails unknown team ids", () => {
    const r = validateLiveSnapshot(invalidTeamIdSnapshot, SAMPLE_REFERENCE, FRESH);
    expect(r.ok).toBe(false);
    expect(hasCode(r.errors, "invalid-team")).toBe(true);
  });

  it("fails unknown match ids", () => {
    const r = validateLiveSnapshot(unknownMatchIdSnapshot, SAMPLE_REFERENCE, FRESH);
    expect(r.ok).toBe(false);
    expect(hasCode(r.errors, "unknown-match-id")).toBe(true);
  });

  it("fails duplicate match ids", () => {
    const r = validateLiveSnapshot(duplicateMatchIdSnapshot, SAMPLE_REFERENCE, FRESH);
    expect(r.ok).toBe(false);
    expect(hasCode(r.errors, "duplicate-match-id")).toBe(true);
  });

  it("fails negative/impossible scores", () => {
    const r = validateLiveSnapshot(negativeScoreSnapshot, SAMPLE_REFERENCE, FRESH);
    expect(r.ok).toBe(false);
    expect(hasCode(r.errors, "impossible-score")).toBe(true);
  });

  it("fails a completed match with a missing score", () => {
    const r = validateLiveSnapshot(completeMissingScoreSnapshot, SAMPLE_REFERENCE, FRESH);
    expect(r.ok).toBe(false);
    expect(hasCode(r.errors, "complete-missing-score")).toBe(true);
  });

  it("fails a scheduled match that already carries a score", () => {
    const r = validateLiveSnapshot(scheduledWithScoreSnapshot, SAMPLE_REFERENCE, FRESH);
    expect(r.ok).toBe(false);
    expect(hasCode(r.errors, "score-on-nonplayable")).toBe(true);
  });

  it("rejects in-play fields in this phase", () => {
    const r = validateLiveSnapshot(inPlayFieldSnapshot, SAMPLE_REFERENCE, FRESH);
    expect(r.ok).toBe(false);
    expect(hasCode(r.errors, "inplay-field")).toBe(true);
  });

  it("fails a knockout winner that is not a participant", () => {
    const r = validateLiveSnapshot(winnerNotParticipantSnapshot, SAMPLE_REFERENCE, FRESH);
    expect(r.ok).toBe(false);
    expect(hasCode(r.errors, "winner-not-participant")).toBe(true);
  });

  it("fails a completed knockout drawn on goals with no winner/penalties", () => {
    const r = validateLiveSnapshot(drawNeedsWinnerSnapshot, SAMPLE_REFERENCE, FRESH);
    expect(r.ok).toBe(false);
    expect(hasCode(r.errors, "draw-needs-winner")).toBe(true);
  });

  it("marks fatal-invalid matches with freshnessStatus 'invalid' (excluded, not dropped)", () => {
    const r = validateLiveSnapshot(invalidTeamIdSnapshot, SAMPLE_REFERENCE, FRESH);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]!.freshnessStatus).toBe("invalid");
  });
});

describe("live-state freshness", () => {
  it("computes fresh vs stale from lastUpdatedAt", () => {
    expect(computeMatchFreshness("2026-06-20T11:30:00Z", FRESH)).toBe("fresh");
    expect(computeMatchFreshness("2026-06-10T00:00:00Z", FRESH)).toBe("stale");
    expect(computeMatchFreshness(undefined, FRESH)).toBe("stale");
  });

  it("represents stale data through ingest", () => {
    const state = ingestLiveSnapshot(staleSnapshot, SAMPLE_REFERENCE, {
      generatedAt: "2026-06-20T12:00:01Z",
      staleAfterSeconds: 60,
    });
    expect(state.freshness.sections.matches).toBe("stale");
    expect(state.freshness.overall).toBe("stale");
  });

  it("represents missing data for an empty snapshot", () => {
    const state = ingestLiveSnapshot(emptySnapshot, SAMPLE_REFERENCE, {
      generatedAt: "2026-06-20T12:00:01Z",
    });
    expect(state.freshness.sections.matches).toBe("missing");
  });

  it("represents fallback only with an explicit reason (never silent)", () => {
    const state = ingestLiveSnapshot(validPartialGroupSnapshot, SAMPLE_REFERENCE, {
      generatedAt: "2026-06-20T12:00:01Z",
      fallback: { reason: "primary source unavailable" },
    });
    expect(state.freshness.sections.matches).toBe("fallback");
    expect(state.freshness.fallbackReason).toBe("primary source unavailable");
    expect(state.warnings.some((w) => w.includes("fallback"))).toBe(true);
  });
});

describe("live-state derivation: group standings (reuses computeGroupStandings)", () => {
  it("derives standings from completed results, leaving qualification undecided while incomplete", () => {
    const r = validateLiveSnapshot(validPartialGroupSnapshot, SAMPLE_REFERENCE, FRESH);
    const standings = deriveGroupStandings(SAMPLE_REFERENCE, r.matches);
    const a1 = standings.find((s) => s.teamId === "a1")!;
    expect(a1.points).toBe(3);
    expect(a1.played).toBe(1);
    expect(a1.rank).toBe(1);
    expect(standings.every((s) => s.qualificationState === "undecided")).toBe(true);
    expect(standings.every((s) => s.derivedFrom === "results")).toBe(true);
  });

  it("derives qualification states once the group is complete (no overclaiming)", () => {
    const r = validateLiveSnapshot(completeGroupSnapshot, SAMPLE_REFERENCE, FRESH);
    const standings = deriveGroupStandings(SAMPLE_REFERENCE, r.matches);
    const byTeam = Object.fromEntries(standings.map((s) => [s.teamId, s]));
    expect([byTeam.a1!.rank, byTeam.a2!.rank, byTeam.a3!.rank, byTeam.a4!.rank]).toEqual([1, 2, 3, 4]);
    expect(byTeam.a1!.qualificationState).toBe("qualified");
    expect(byTeam.a2!.qualificationState).toBe("qualified");
    expect(byTeam.a3!.qualificationState).toBe("undecided"); // best-third race
    expect(byTeam.a4!.qualificationState).toBe("eliminated");
  });
});

describe("live-state derivation: bracket progression (official graph, read-only)", () => {
  const makeKo = (matchId: string, teamA: string, teamB: string, ga: number, gb: number): LiveMatchState => ({
    matchId,
    stage: "roundOf32",
    teamA,
    teamB,
    status: "complete",
    goalsA: ga,
    goalsB: gb,
    source: "test",
    freshnessStatus: "fresh",
    warnings: [],
  });

  it("propagates completed R32 winners into the dependent R16 slots, leaving the rest unresolved", () => {
    // Official graph: M90 (R16) home = winner(M73), away = winner(M75).
    const matches = [makeKo("M73", "tx", "ty", 2, 1), makeKo("M75", "tp", "tq", 0, 2)];
    const bracket = deriveBracketState(matches);

    const m73 = bracket.matches.find((m) => m.matchNumber === 73)!;
    const m90 = bracket.matches.find((m) => m.matchNumber === 90)!;
    expect(m73.winner).toBe("tx");
    expect(m73.resolved).toBe(true);
    expect(m90.homeTeamId).toBe("tx");
    expect(m90.awayTeamId).toBe("tq");
    expect(m90.resolved).toBe(false); // M90 itself not played yet
    expect(bracket.unresolved).toContain(90);
    expect(bracket.unresolvedTies).toEqual([]);
    expect(bracket.derivedFrom).toBe("results");
  });

  it("realiseBracketFromResults delegates to the official realiser read-only", () => {
    // Build a deterministic full set of group results from the official groups.
    const ref = buildOfficialReference();
    const groupResults = new Map<GroupId, GroupResult>();
    for (const g of ref.groups) {
      groupResults.set(g.id, { winner: g.teamIds[0]!, runnerUp: g.teamIds[1]!, third: g.teamIds[2]! });
    }
    const thirdGroups = ref.groups.slice(0, 8).map((g) => g.id);
    const realised = realiseBracketFromResults(groupResults, thirdGroups, (home) => home);
    expect(realised.r32Entrants).toHaveLength(32);
    expect(typeof realised.champion).toBe("string");
    expect(realised.champion.length).toBeGreaterThan(0);
  });
});

describe("live-state ingest: end-to-end against the real official reference", () => {
  it("builds the official reference and ingests a real-fixture result", () => {
    const ref = buildOfficialReference();
    expect(ref.groupMatches.length).toBe(72);
    expect(ref.knockoutMatches.length).toBe(32);

    const m1 = ref.groupMatches.find((m) => m.matchId === "M1")!;
    const state = ingestLiveSnapshot(
      {
        source: {
          sourceId: "real-ref-test",
          sourceType: "manual",
          sourceName: "test",
          lastUpdatedAt: "2026-06-20T12:00:00Z",
        },
        asOf: "2026-06-20T12:00:00Z",
        matches: [
          {
            matchId: "M1",
            stage: "group",
            group: m1.group,
            teamA: m1.homeTeamId,
            teamB: m1.awayTeamId,
            status: "complete",
            goalsA: 2,
            goalsB: 0,
            lastUpdatedAt: "2026-06-20T11:30:00Z",
          },
        ],
      },
      ref,
      { generatedAt: "2026-06-20T12:00:01Z", staleAfterSeconds: 24 * 60 * 60 },
    );
    expect(state.warnings).toEqual([]);
    const winner = state.groupStandings.find((s) => s.teamId === m1.homeTeamId)!;
    expect(winner.points).toBe(3);
    expect(state.freshness.overall).toBe("fresh");
  });
});
