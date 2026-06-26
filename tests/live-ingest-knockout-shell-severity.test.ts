import { describe, expect, it } from "vitest";
import { normalizeFootballDataMatches } from "@/lib/live-ingest/football-data-org/normalize";
import { buildOfficialReference } from "@/lib/live-state/ingest";
import type { FdMatchesResponse } from "@/lib/live-ingest/football-data-org/types";
import {
  unresolvedKnockout,
  partiallyResolvedKnockout,
} from "./fixtures/live-ingest/football-data-org/sample-payloads";

/**
 * Phase 1.28P-Hotfix: knockout-shell mapping severity.
 * ----------------------------------------------------
 * Fully-resolved-but-unmapped knockout shells must be classified by playability:
 *   - scheduled/future (not yet a played result) -> ADVISORY `knockout-shell-unmapped`
 *   - active/finished/ambiguous result            -> BLOCKING `knockout-mapping-unavailable`
 * Group-stage and unknown-team risks must STILL block. No knockoutMatchIdMap is supplied
 * (mirrors the scheduled fetch). No network, no token.
 */
const reference = buildOfficialReference();
const opt = { reference, asOf: "2026-06-24T14:09:06Z" };

/** A knockout (LAST_32) with BOTH sides resolved+mappable (Germany v Brazil), given status. */
const resolvedKnockout = (status: string, withScore = false): FdMatchesResponse => ({
  competition: { code: "WC" },
  matches: [
    {
      id: 9500,
      utcDate: "2026-06-30T19:00:00Z",
      status,
      stage: "LAST_32",
      group: null,
      lastUpdated: "2026-06-24T14:09:06Z",
      homeTeam: { id: 759, name: "Germany", shortName: "Germany", tla: "GER" },
      awayTeam: { id: 764, name: "Brazil", shortName: "Brazil", tla: "BRA" },
      score: withScore
        ? { winner: "HOME_TEAM", duration: "REGULAR", fullTime: { home: 2, away: 1 } }
        : { winner: null, duration: "REGULAR", fullTime: { home: null, away: null } },
    },
  ],
});

const codes = (p: FdMatchesResponse): string[] => normalizeFootballDataMatches(p, opt).errors.map((e) => e.code);

describe("scheduled/future knockout shells are ADVISORY (non-blocking)", () => {
  it("scheduled (TIMED) fully-resolved shell without map -> knockout-shell-unmapped, excluded", () => {
    const r = normalizeFootballDataMatches(resolvedKnockout("TIMED"), opt);
    expect(r.errors.map((e) => e.code)).toEqual(["knockout-shell-unmapped"]);
    expect(r.errors.some((e) => e.code === "knockout-mapping-unavailable")).toBe(false);
    expect(r.snapshot.matches).toHaveLength(0); // shell excluded; bracket derived internally
  });

  it("partially-resolved future shell stays advisory (partially-resolved-knockout)", () => {
    expect(codes(partiallyResolvedKnockout)).toEqual(["partially-resolved-knockout"]);
  });

  it("unresolved future shell stays advisory (unresolved-knockout)", () => {
    expect(codes(unresolvedKnockout)).toEqual(["unresolved-knockout"]);
  });

  it("postponed/cancelled resolved shells without map are advisory (not a played result)", () => {
    expect(codes(resolvedKnockout("POSTPONED"))).toEqual(["knockout-shell-unmapped"]);
    expect(codes(resolvedKnockout("CANCELLED"))).toEqual(["knockout-shell-unmapped"]);
  });
});

describe("active/finished/ambiguous knockout without map still BLOCKS", () => {
  it("FINISHED resolved knockout without map -> knockout-mapping-unavailable", () => {
    expect(codes(resolvedKnockout("FINISHED", true))).toEqual(["knockout-mapping-unavailable"]);
  });

  it("LIVE / IN_PLAY resolved knockout without map -> knockout-mapping-unavailable", () => {
    expect(codes(resolvedKnockout("LIVE", true))).toEqual(["knockout-mapping-unavailable"]);
    expect(codes(resolvedKnockout("IN_PLAY", true))).toEqual(["knockout-mapping-unavailable"]);
  });

  it("PAUSED resolved knockout without map -> knockout-mapping-unavailable (PAUSED is active)", () => {
    expect(codes(resolvedKnockout("PAUSED", true))).toEqual(["knockout-mapping-unavailable"]);
  });

  it("unknown/unrecognised status is treated conservatively as a result risk -> blocking", () => {
    expect(codes(resolvedKnockout("WHATEVER", true))).toEqual(["knockout-mapping-unavailable"]);
  });
});

describe("group-stage risks STILL block (guard not weakened)", () => {
  it("group-stage unknown team -> unknown-team", () => {
    const p: FdMatchesResponse = {
      competition: { code: "WC" },
      matches: [
        {
          id: 8001, utcDate: "2026-06-12T19:00:00Z", status: "FINISHED", matchday: 1,
          stage: "GROUP_STAGE", group: "GROUP_A", lastUpdated: "2026-06-24T14:09:06Z",
          homeTeam: { id: 769, name: "Mexico", shortName: "Mexico", tla: "MEX" },
          awayTeam: { id: 99999, name: "Atlantis", shortName: "Atlantis", tla: "ATL" },
          score: { winner: "HOME_TEAM", duration: "REGULAR", fullTime: { home: 1, away: 0 } },
        },
      ],
    };
    expect(codes(p)).toContain("unknown-team");
    expect(codes(p)).not.toContain("knockout-shell-unmapped");
  });

  it("group-stage match with no official fixture -> unmapped-match", () => {
    const p: FdMatchesResponse = {
      competition: { code: "WC" },
      matches: [
        {
          id: 8002, utcDate: "2026-06-12T19:00:00Z", status: "FINISHED", matchday: 1,
          stage: "GROUP_STAGE", group: "GROUP_A", lastUpdated: "2026-06-24T14:09:06Z",
          homeTeam: { id: 759, name: "Germany", shortName: "Germany", tla: "GER" },
          awayTeam: { id: 764, name: "Brazil", shortName: "Brazil", tla: "BRA" },
          score: { winner: "HOME_TEAM", duration: "REGULAR", fullTime: { home: 1, away: 0 } },
        },
      ],
    };
    expect(codes(p)).toEqual(["unmapped-match"]);
  });
});
