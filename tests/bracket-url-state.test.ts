import { describe, expect, it } from "vitest";
import {
  parseBracketSearchParams,
  serializeBracketSearchParams,
  updateBracketSearchParams,
  validateBracketMatchParam,
  validateBracketTeamParam,
} from "@/lib/ui/bracket-url-state";

/**
 * UX-4D: pure bracket deep-link URL state. No DOM, no window, no fetch — vitest env `node`.
 * Validity is injected: `validMatchNumbers` = the official knockout numbers M73–M104 (incl.
 * 103/104); `validTeamIds` = ALL team ids (a valid team absent from the bracket is still a
 * valid selection — `notInKnockout` is resolved by the path helper, not here).
 */
const VALID_MATCHES = new Set([73, 79, 89, 97, 101, 103, 104]);
const VALID_TEAMS = new Set(["canada", "mexico", "ecuador", "japan"]);
const sp = (q: string) => new URLSearchParams(q);
const opts = { validMatchNumbers: VALID_MATCHES, validTeamIds: VALID_TEAMS };

describe("validateBracketMatchParam", () => {
  it("accepts an in-range knockout number (incl. 103/104)", () => {
    expect(validateBracketMatchParam("73", VALID_MATCHES)).toBe(73);
    expect(validateBracketMatchParam("103", VALID_MATCHES)).toBe(103);
    expect(validateBracketMatchParam("104", VALID_MATCHES)).toBe(104);
  });
  it("rejects a non-numeric value", () => {
    expect(validateBracketMatchParam("abc", VALID_MATCHES)).toBeNull();
    expect(validateBracketMatchParam("7x", VALID_MATCHES)).toBeNull();
    expect(validateBracketMatchParam("73.5", VALID_MATCHES)).toBeNull();
  });
  it("rejects a number outside the official knockout set", () => {
    expect(validateBracketMatchParam("72", VALID_MATCHES)).toBeNull(); // group-stage number
    expect(validateBracketMatchParam("999", VALID_MATCHES)).toBeNull();
    expect(validateBracketMatchParam("0", VALID_MATCHES)).toBeNull();
  });
  it("treats null/empty as no selection (not invalid)", () => {
    expect(validateBracketMatchParam(null, VALID_MATCHES)).toBeNull();
    expect(validateBracketMatchParam("", VALID_MATCHES)).toBeNull();
    expect(validateBracketMatchParam("  ", VALID_MATCHES)).toBeNull();
  });
});

describe("validateBracketTeamParam", () => {
  it("accepts a known team id (any team, not only knockout ones)", () => {
    expect(validateBracketTeamParam("canada", VALID_TEAMS)).toBe("canada");
    expect(validateBracketTeamParam("japan", VALID_TEAMS)).toBe("japan");
  });
  it("rejects an unknown team id", () => {
    expect(validateBracketTeamParam("bad-id", VALID_TEAMS)).toBeNull();
    expect(validateBracketTeamParam("", VALID_TEAMS)).toBeNull();
    expect(validateBracketTeamParam(null, VALID_TEAMS)).toBeNull();
  });
});

describe("parseBracketSearchParams", () => {
  it("parses a valid match param", () => {
    expect(parseBracketSearchParams(sp("match=79"), opts)).toEqual({
      matchNumber: 79, teamId: null, invalidMatch: false, invalidTeam: false,
    });
  });
  it("parses a valid team param", () => {
    expect(parseBracketSearchParams(sp("team=canada"), opts)).toEqual({
      matchNumber: null, teamId: "canada", invalidMatch: false, invalidTeam: false,
    });
  });
  it("parses combined team + match", () => {
    expect(parseBracketSearchParams(sp("team=canada&match=73"), opts)).toEqual({
      matchNumber: 73, teamId: "canada", invalidMatch: false, invalidTeam: false,
    });
  });
  it("flags an invalid (present-but-bad) match without selecting", () => {
    expect(parseBracketSearchParams(sp("match=999"), opts)).toEqual({
      matchNumber: null, teamId: null, invalidMatch: true, invalidTeam: false,
    });
    expect(parseBracketSearchParams(sp("match=abc"), opts).invalidMatch).toBe(true);
  });
  it("flags an invalid (unknown) team distinctly from a valid one", () => {
    expect(parseBracketSearchParams(sp("team=bad-id"), opts)).toEqual({
      matchNumber: null, teamId: null, invalidMatch: false, invalidTeam: true,
    });
    // A valid team id is NEVER flagged invalid, even if it is not in the knockout bracket.
    expect(parseBracketSearchParams(sp("team=mexico"), opts).invalidTeam).toBe(false);
  });
  it("does not flag absent params", () => {
    expect(parseBracketSearchParams(sp(""), opts)).toEqual({
      matchNumber: null, teamId: null, invalidMatch: false, invalidTeam: false,
    });
  });
});

describe("serializeBracketSearchParams (canonical, clean share link)", () => {
  it("serializes match only", () => {
    expect(serializeBracketSearchParams({ matchNumber: 73, teamId: null }).toString()).toBe("match=73");
  });
  it("serializes team only", () => {
    expect(serializeBracketSearchParams({ matchNumber: null, teamId: "canada" }).toString()).toBe("team=canada");
  });
  it("serializes both as team then match", () => {
    expect(serializeBracketSearchParams({ matchNumber: 73, teamId: "canada" }).toString()).toBe("team=canada&match=73");
  });
  it("serializes nothing selected as an empty string", () => {
    expect(serializeBracketSearchParams({ matchNumber: null, teamId: null }).toString()).toBe("");
  });
  it("never carries unknown/noisy params (built from state only)", () => {
    // Even if the address bar had `foo=bar`, the canonical serializer ignores it.
    expect(serializeBracketSearchParams({ matchNumber: 79, teamId: "mexico" }).toString()).toBe("team=mexico&match=79");
  });
});

describe("updateBracketSearchParams (address-bar mirror, preserves unknown keys)", () => {
  it("clearing match preserves team", () => {
    const out = updateBracketSearchParams(sp("team=canada&match=79"), { matchNumber: null });
    expect(out.get("team")).toBe("canada");
    expect(out.has("match")).toBe(false);
  });
  it("clearing team preserves match", () => {
    const out = updateBracketSearchParams(sp("team=canada&match=79"), { teamId: null });
    expect(out.get("match")).toBe("79");
    expect(out.has("team")).toBe(false);
  });
  it("sets both while PRESERVING an unknown param", () => {
    const out = updateBracketSearchParams(sp("foo=bar&team=mexico"), { matchNumber: 73, teamId: "mexico" });
    expect(out.get("foo")).toBe("bar"); // documented: unknown params are preserved in the URL
    expect(out.get("team")).toBe("mexico");
    expect(out.get("match")).toBe("73");
  });
  it("omitting a key leaves that param untouched", () => {
    const out = updateBracketSearchParams(sp("team=canada&match=79"), { matchNumber: 73 });
    expect(out.get("team")).toBe("canada");
    expect(out.get("match")).toBe("73");
  });
  it("does not mutate the input", () => {
    const input = sp("team=canada");
    updateBracketSearchParams(input, { teamId: "mexico", matchNumber: 73 });
    expect(input.toString()).toBe("team=canada");
  });
});

describe("no leak in serialized URL state", () => {
  it("never emits a token / Blob URL", () => {
    const blobs = [
      JSON.stringify(parseBracketSearchParams(sp("team=canada&match=73"), opts)),
      serializeBracketSearchParams({ matchNumber: 73, teamId: "canada" }).toString(),
      updateBracketSearchParams(sp("team=canada"), { matchNumber: 73 }).toString(),
    ].join(" ");
    for (const bad of ["vercel-storage", "BLOB_READ_WRITE_TOKEN", "FOOTBALL_DATA_TOKEN", "http://", "https://"]) {
      expect(blobs.includes(bad)).toBe(false);
    }
  });
});
