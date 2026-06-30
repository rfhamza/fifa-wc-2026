import { describe, expect, it } from "vitest";
import { validateLiveSnapshot } from "@/lib/live-state/validate";
import { deriveBracketState } from "@/lib/live-state/derive";
import { toPublicSafeLiveState } from "@/lib/live-state/public-safe";
import { findForbiddenSubstrings } from "@/lib/model/forecast-snapshots";
import type { LiveMatchState, LiveTournamentState } from "@/lib/live-state/types";
import { SAMPLE_REFERENCE, drawNeedsWinnerSnapshot } from "./fixtures/live-state/snapshots";

/**
 * PR-81 - fail-safe regression coverage for a completed knockout whose winner cannot be
 * determined (level on goals, no winner, no penalties). Two layers:
 *   1) the validator REJECTS such a raw snapshot (draw-needs-winner) and excludes the
 *      match, so it never reaches derivation via the real pipeline;
 *   2) if such a match reaches `deriveBracketState` directly, the deriver does NOT force
 *      a winner - it names the participants, leaves winner null, and surfaces the match in
 *      `unresolvedTies` (never silently decided, never propagated downstream).
 * The public-safe projection of that state stays shape-valid and leak-free.
 * (Production logic is unchanged; this is read-only test coverage of existing behaviour.)
 */
const FRESH = { asOf: "2026-06-20T12:00:00Z", staleAfterSeconds: 24 * 60 * 60 };
const matchNumberOf = (matchId: string): number => Number(matchId.replace(/^M/, ""));

const koLive = (over: Partial<LiveMatchState> = {}): LiveMatchState => ({
  matchId: "M73",
  stage: "roundOf32",
  teamA: "south-africa",
  teamB: "canada",
  status: "complete",
  goalsA: 1,
  goalsB: 1, // level, and intentionally no winner / no penalties below
  source: "test",
  freshnessStatus: "fresh",
  warnings: [],
  ...over,
});

describe("deriver fail-safe: completed knockout with an indeterminate winner", () => {
  const bracket = deriveBracketState([koLive()]);
  const m73 = bracket.matches.find((b) => b.matchNumber === 73)!;

  it("names both participants but does NOT force a winner", () => {
    expect(new Set([m73.homeTeamId, m73.awayTeamId])).toEqual(new Set(["south-africa", "canada"]));
    expect(m73.winner).toBeNull();
    expect(m73.resolved).toBe(false);
  });

  it("surfaces the match in unresolvedTies and unresolved (never silently decided)", () => {
    expect(bracket.unresolvedTies.some((s) => s.includes("M73"))).toBe(true);
    expect(bracket.unresolved).toContain(73);
  });

  it("does not propagate a phantom winner into the downstream R16 slot (M90 home)", () => {
    const m90 = bracket.matches.find((b) => b.matchNumber === 90)!; // home = winner of M73
    expect(m90.homeTeamId).toBeNull();
  });

  it("a decisive or penalty-decided knockout still resolves normally (control)", () => {
    const decisive = deriveBracketState([koLive({ goalsA: 2, goalsB: 1 })]);
    expect(decisive.matches.find((b) => b.matchNumber === 73)!.winner).toBe("south-africa");
    expect(decisive.unresolvedTies).toEqual([]);
    const pens = deriveBracketState([koLive({ penalties: { a: 4, b: 2 } })]);
    expect(pens.matches.find((b) => b.matchNumber === 73)!.winner).toBe("south-africa");
    expect(pens.unresolvedTies).toEqual([]);
  });
});

describe("validator fail-safe: malformed completed knockout is rejected and excluded", () => {
  const result = validateLiveSnapshot(drawNeedsWinnerSnapshot, SAMPLE_REFERENCE, FRESH);

  it("rejects with draw-needs-winner and never silently forces a winner", () => {
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "draw-needs-winner")).toBe(true);
    expect(result.matches.some((m) => m.freshnessStatus === "invalid")).toBe(true);
  });

  it("the invalid knockout is excluded from derivation (no forced winner downstream)", () => {
    const invalidKnockoutNumbers = result.matches
      .filter((m) => m.freshnessStatus === "invalid" && matchNumberOf(m.matchId) >= 73)
      .map((m) => matchNumberOf(m.matchId));
    const bracket = deriveBracketState(result.matches);
    for (const n of invalidKnockoutNumbers) {
      const row = bracket.matches.find((b) => b.matchNumber === n);
      if (row) expect(row.winner).toBeNull();
    }
  });
});

describe("public-safe projection of an unresolved-tie bracket stays valid + leak-free", () => {
  it("exposes winner=null with a participant-derived resolution and leaks nothing", () => {
    const live = koLive();
    const bracket = deriveBracketState([live]);
    const state: LiveTournamentState = {
      sourceVersion: "test",
      generatedAt: "2026-06-20T12:00:00Z",
      asOf: "2026-06-20T12:00:00Z",
      matches: [live],
      groupStandings: [],
      bracket,
      warnings: [],
      freshness: {
        asOf: "2026-06-20T12:00:00Z",
        generatedAt: "2026-06-20T12:00:00Z",
        sourceLastUpdatedAt: "2026-06-20T12:00:00Z",
        overall: "fresh",
        sections: { matches: "fresh", standings: "fresh", bracket: "fresh" },
        warnings: [],
      },
    };
    const pub = toPublicSafeLiveState(state, {
      attribution: { sourceName: "test", text: "test" },
      isProviderDerived: false,
      publicSourcePolicy: "manual-snapshot",
    });
    const m73 = pub.bracket.find((b) => b.matchNumber === 73)!;
    expect(m73.winner).toBeNull();
    expect(m73.resolution).toBe("resolved"); // both participants known, winner undecided
    expect(findForbiddenSubstrings(JSON.stringify(pub))).toEqual([]);
  });
});
