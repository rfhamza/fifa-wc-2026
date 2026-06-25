import { describe, expect, it } from "vitest";
import { buildOfficialReference, ingestLiveSnapshot } from "@/lib/live-state/ingest";
import type { LiveBracketMatch, LiveGroupStanding } from "@/lib/live-state/types";
import { currentResults54Snapshot } from "./fixtures/live-state/current-results-54";

/**
 * Phase 1.28I: bracket-activation audit. Ingesting the 54-match state (Groups A, B, C
 * complete; D-L incomplete) must, with NO live-state change, derive the correct Article
 * 13 placements and activate the official Round-of-32 group-position slots - notably
 * M73 (2A vs 2B) -> South Africa vs Canada - while leaving third-place and
 * incomplete-group slots safely unresolved (never forced).
 */

const reference = buildOfficialReference();
const state = ingestLiveSnapshot(currentResults54Snapshot, reference, {
  generatedAt: "2026-06-25T12:33:09Z",
  staleAfterSeconds: 365 * 24 * 60 * 60,
});

const bracket = new Map(state.bracket.matches.map((m) => [m.matchNumber, m] as const));
const m = (n: number): LiveBracketMatch => bracket.get(n)!;
const placed = (group: string): LiveGroupStanding[] =>
  state.groupStandings.filter((s) => s.group === group).sort((a, b) => a.rank - b.rank);

describe("54-match snapshot ingests cleanly", () => {
  it("has 54 completed group matches and no validation warnings", () => {
    expect(state.matches).toHaveLength(54);
    expect(state.warnings).toEqual([]);
  });
});

describe("Article 13 placements for completed groups A, B, C", () => {
  it("Group A: 1 Mexico, 2 South Africa (complete)", () => {
    const a = placed("A");
    expect(a.map((s) => s.teamId).slice(0, 2)).toEqual(["mexico", "south-africa"]);
    expect(a.every((s) => s.played === 3)).toBe(true);
    expect(a[0]!.qualificationState).toBe("qualified");
    expect(a[1]!.qualificationState).toBe("qualified");
  });

  it("Group B: 1 Switzerland, 2 Canada (Canada over Bosnia on overall GD)", () => {
    const b = placed("B");
    expect(b.map((s) => s.teamId).slice(0, 2)).toEqual(["switzerland", "canada"]);
    expect(b.every((s) => s.played === 3)).toBe(true);
  });

  it("Group C: 1 Brazil, 2 Morocco", () => {
    const c = placed("C");
    expect(c.map((s) => s.teamId).slice(0, 2)).toEqual(["brazil", "morocco"]);
    expect(c.every((s) => s.played === 3)).toBe(true);
  });

  it("other groups remain incomplete (e.g. Group D played 2, all undecided)", () => {
    const d = placed("D");
    expect(d.every((s) => s.played === 2)).toBe(true);
    expect(d.every((s) => s.qualificationState === "undecided")).toBe(true);
  });
});

describe("Round-of-32 bracket activation", () => {
  it("M73 (2A vs 2B) resolves to South Africa vs Canada", () => {
    expect(m(73).homeTeamId).toBe("south-africa");
    expect(m(73).awayTeamId).toBe("canada");
    // Participants known, but the match itself is unplayed -> winner not decided.
    expect(m(73).resolved).toBe(false);
    expect(state.bracket.unresolved).toContain(73);
  });

  it("M79 (1A vs third-place) is partially resolved: Mexico known, opponent null", () => {
    expect(m(79).homeTeamId).toBe("mexico");
    expect(m(79).awayTeamId).toBeNull();
  });

  it("other A/B/C group-position slots fill only their known side", () => {
    expect(m(85).homeTeamId).toBe("switzerland"); // 1B
    expect(m(85).awayTeamId).toBeNull(); // third-place deferred
    expect(m(76).homeTeamId).toBe("brazil"); // 1C
    expect(m(76).awayTeamId).toBeNull(); // 2F (Group F incomplete)
    expect(m(75).homeTeamId).toBeNull(); // 1F (Group F incomplete)
    expect(m(75).awayTeamId).toBe("morocco"); // 2C
  });

  it("third-place and incomplete-group slots stay unresolved (M74 both null)", () => {
    expect(m(74).homeTeamId).toBeNull(); // 1E (Group E incomplete)
    expect(m(74).awayTeamId).toBeNull(); // third-place slot deferred
  });

  it("ONLY M73 is fully participant-resolved in R32 given just A/B/C complete", () => {
    const fully = state.bracket.matches
      .filter((x) => x.stage === "roundOf32" && x.homeTeamId != null && x.awayTeamId != null)
      .map((x) => x.matchNumber);
    expect(fully).toEqual([73]);
  });

  it("no forced ties and the bracket is derived from results (not provider)", () => {
    expect(state.bracket.unresolvedTies).toEqual([]);
    expect(state.bracket.derivedFrom).toBe("results");
  });
});
