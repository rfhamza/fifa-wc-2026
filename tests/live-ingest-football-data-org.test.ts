import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizeFootballDataMatches,
  extractFootballDataStandings,
} from "@/lib/live-ingest/football-data-org/normalize";
import {
  resolveFdStatus,
  resolveFdStage,
  resolveFdTeamId,
  FD_TEAM_ALIASES,
} from "@/lib/live-ingest/football-data-org/mapping";
import { APP_TEAM_IDS, parseGroupId } from "@/lib/live-ingest/mapping";
import { buildOfficialReference, ingestLiveSnapshot } from "@/lib/live-state/ingest";
import { validateLiveSnapshot } from "@/lib/live-state/validate";
import type { FdMatchesResponse } from "@/lib/live-ingest/football-data-org/types";
import type { RawLiveMatch } from "@/lib/live-state/types";
import {
  finishedGroupWin,
  finishedGroupDraw,
  scheduledMatch,
  unresolvedKnockout,
  syntheticPenaltyKnockout,
  SYNTHETIC_PENALTY_KO_MAP,
  groupStageSample,
  standingsComparison,
} from "./fixtures/live-ingest/football-data-org/sample-payloads";

/**
 * Phase 1.28A: football-data.org provider-specific adapter scaffold. Mock/sanitized
 * payloads only - no network, no token. Proves normalization to the EXISTING
 * RawLiveSnapshot contract, canonical M{n} mapping, provenance-only provider ids,
 * comparison-only provider standings, and integration through lib/live-state.
 */

const ASOF = "2026-06-24T14:09:06Z";
const FRESH = { asOf: ASOF, staleAfterSeconds: 24 * 60 * 60 };
const reference = buildOfficialReference();
const opt = { reference, asOf: ASOF };
const byId = (r: { snapshot: { matches: RawLiveMatch[] } }): Map<string, RawLiveMatch> =>
  new Map(r.snapshot.matches.map((m) => [m.matchId, m]));

const wc = (matches: FdMatchesResponse["matches"]): FdMatchesResponse => ({
  competition: { code: "WC" },
  matches,
});

describe("A. basic normalization", () => {
  const result = normalizeFootballDataMatches(groupStageSample, opt);
  const m = byId(result);

  it("normalizes the WC payload into a RawLiveSnapshot with no errors", () => {
    expect(result.errors).toEqual([]);
    expect(result.snapshot.matches).toHaveLength(3);
    expect(result.snapshot.source.sourceId).toBe("football-data-org");
    expect(result.snapshot.source.sourceType).toBe("api");
  });

  it("validates cleanly through the existing live-state validator", () => {
    const v = validateLiveSnapshot(result.snapshot, reference, FRESH);
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
  });

  it("finished group win maps to canonical M1 with correct fields", () => {
    const m1 = m.get("M1")!;
    expect(m1.stage).toBe("group");
    expect(m1.group).toBe("A");
    expect(m1.status).toBe("complete");
    expect(m1.teamA).toBe("mexico");
    expect(m1.teamB).toBe("south-africa");
    expect(m1.goalsA).toBe(2);
    expect(m1.goalsB).toBe(0);
    expect(m1.kickoff).toBe("2026-06-11T19:00:00Z");
    expect(m1.lastUpdatedAt).toBe(ASOF);
  });

  it("provider ids are provenance-only, never the canonical key", () => {
    for (const mm of result.snapshot.matches) {
      expect("providerId" in (mm as unknown as Record<string, unknown>)).toBe(false);
      expect(mm.matchId).toMatch(/^M\d+$/);
    }
    const prov1 = result.provenance.matches.find((p) => p.matchId === "M1")!;
    expect(prov1.providerId).toBe("1001");
    expect(prov1.matchNumber).toBe(1);
  });

  it("supports the resultSet 104 assertion (throws on a partial payload when required)", () => {
    expect(() => normalizeFootballDataMatches(finishedGroupWin, { ...opt, expectFullTournament: true })).toThrow();
    // Small fixture payloads normalize fine when the assertion is not requested.
    expect(normalizeFootballDataMatches(finishedGroupWin, opt).snapshot.matches).toHaveLength(1);
  });

  it("rejects a non-WC competition payload", () => {
    expect(() => normalizeFootballDataMatches({ competition: { code: "PL" }, matches: [] }, opt)).toThrow();
  });

  it("works with the default reference (buildOfficialReference)", () => {
    const r = normalizeFootballDataMatches(finishedGroupWin, { asOf: ASOF });
    expect(r.snapshot.matches[0]!.matchId).toBe("M1");
  });
});

describe("B. status mapping", () => {
  it("maps football-data.org statuses to internal statuses", () => {
    expect(resolveFdStatus("TIMED")).toBe("scheduled");
    expect(resolveFdStatus("SCHEDULED")).toBe("scheduled");
    expect(resolveFdStatus("LIVE")).toBe("in-progress");
    expect(resolveFdStatus("IN_PLAY")).toBe("in-progress");
    expect(resolveFdStatus("PAUSED")).toBe("in-progress");
    expect(resolveFdStatus("FINISHED")).toBe("complete");
    expect(resolveFdStatus("POSTPONED")).toBe("postponed");
    expect(resolveFdStatus("SUSPENDED")).toBe("postponed");
    expect(resolveFdStatus("CANCELLED")).toBe("cancelled");
    expect(resolveFdStatus("WHATEVER")).toBe("unknown");
  });

  it("TIMED becomes a scheduled match carrying no scores", () => {
    const r = normalizeFootballDataMatches(scheduledMatch, opt);
    const m32 = byId(r).get("M32")!;
    expect(m32.status).toBe("scheduled");
    expect(m32.goalsA).toBeUndefined();
    expect(m32.goalsB).toBeUndefined();
  });
});

describe("C. stage / group mapping", () => {
  it("maps all supported stages; unknown fails closed", () => {
    expect(resolveFdStage("GROUP_STAGE")).toBe("group");
    expect(resolveFdStage("LAST_32")).toBe("roundOf32");
    expect(resolveFdStage("LAST_16")).toBe("roundOf16");
    expect(resolveFdStage("QUARTER_FINALS")).toBe("quarterFinal");
    expect(resolveFdStage("SEMI_FINALS")).toBe("semiFinal");
    expect(resolveFdStage("THIRD_PLACE")).toBe("thirdPlace");
    expect(resolveFdStage("FINAL")).toBe("final");
    expect(resolveFdStage("NONSENSE")).toBeNull();
  });

  it("maps GROUP_A..GROUP_L to internal group ids", () => {
    expect(parseGroupId("GROUP_A")).toBe("A");
    expect(parseGroupId("GROUP_L")).toBe("L");
    expect(parseGroupId("GROUP_Z")).toBeNull();
  });

  it("unknown stage / group fails closed (excluded + recorded)", () => {
    const badStage = normalizeFootballDataMatches(
      wc([{ ...finishedGroupWin.matches[0]!, stage: "PRELIM" }]),
      opt,
    );
    expect(badStage.snapshot.matches).toHaveLength(0);
    expect(badStage.errors.some((e) => e.code === "unknown-stage")).toBe(true);

    const badGroup = normalizeFootballDataMatches(
      wc([{ ...finishedGroupWin.matches[0]!, group: "GROUP_Z" }]),
      opt,
    );
    expect(badGroup.snapshot.matches).toHaveLength(0);
    expect(badGroup.errors.some((e) => e.code === "unknown-group")).toBe(true);
  });
});

describe("D. team mapping (by name; TLA is provenance only)", () => {
  it("resolves provider team spellings to app team ids", () => {
    expect(resolveFdTeamId({ id: 1, name: "Bosnia-Herzegovina", shortName: "Bosnia-H.", tla: "BIH" })).toBe("bosnia-herzegovina");
    expect(resolveFdTeamId({ id: 2, name: null, shortName: "Bosnia-H.", tla: "BIH" })).toBe("bosnia-herzegovina");
    expect(resolveFdTeamId({ id: 3, name: "South Korea", shortName: "Korea Republic", tla: "KOR" })).toBe("south-korea");
    expect(resolveFdTeamId({ id: 4, name: "Iran", tla: "IRN" })).toBe("iran");
    expect(resolveFdTeamId({ id: 5, name: "Algeria", tla: "ALG" })).toBe("algeria");
    expect(resolveFdTeamId({ id: 6, name: "Curaçao", tla: "CUW" })).toBe("curacao");
    expect(resolveFdTeamId({ id: 7, name: "Cape Verde Islands", shortName: "Cape Verde", tla: "CPV" })).toBe("cape-verde");
    expect(resolveFdTeamId({ id: 8, name: "Ivory Coast", tla: "CIV" })).toBe("ivory-coast");
    expect(resolveFdTeamId({ id: 9, name: "United States", shortName: "USA", tla: "USA" })).toBe("usa");
    expect(resolveFdTeamId({ id: 10, name: "Congo DR", tla: "COD" })).toBe("congo-dr");
    expect(resolveFdTeamId({ id: 11, name: "Turkey", tla: "TUR" })).toBe("turkiye");
  });

  it("unknown team fails closed", () => {
    expect(resolveFdTeamId({ id: 99, name: "Atlantis", tla: "ATL" })).toBeNull();
    const r = normalizeFootballDataMatches(
      wc([{ ...finishedGroupWin.matches[0]!, homeTeam: { id: 99, name: "Atlantis", tla: "ATL" } }]),
      opt,
    );
    expect(r.snapshot.matches).toHaveLength(0);
    expect(r.errors.some((e) => e.code === "unknown-team")).toBe(true);
  });

  it("all provider alias targets are valid app team ids", () => {
    for (const id of Object.values(FD_TEAM_ALIASES)) expect(APP_TEAM_IDS.has(id)).toBe(true);
  });
});

describe("E. match-number mapping", () => {
  it("maps group + unordered pair to the official fixture (reversed order too)", () => {
    const reversed = wc([
      {
        ...finishedGroupWin.matches[0]!,
        homeTeam: { id: 774, name: "South Africa", tla: "RSA" },
        awayTeam: { id: 769, name: "Mexico", tla: "MEX" },
        score: { winner: "AWAY_TEAM", duration: "REGULAR", fullTime: { home: 0, away: 2 } },
      },
    ]);
    const r = normalizeFootballDataMatches(reversed, opt);
    const m1 = byId(r).get("M1")!;
    expect(m1.matchId).toBe("M1");
    // Goals stay attached to the supplied teamA/teamB; the deriver orients to official home/away.
    expect(m1.teamA).toBe("south-africa");
    expect(m1.goalsA).toBe(0);
    expect(m1.teamB).toBe("mexico");
    expect(m1.goalsB).toBe(2);
  });

  it("ambiguous / non-existent pairing fails closed", () => {
    const bad = wc([
      {
        ...finishedGroupWin.matches[0]!,
        awayTeam: { id: 764, name: "Brazil", tla: "BRA" }, // Mexico v Brazil is not an official Group A fixture
      },
    ]);
    const r = normalizeFootballDataMatches(bad, opt);
    expect(r.snapshot.matches).toHaveLength(0);
    expect(r.errors.some((e) => e.code === "unmapped-match")).toBe(true);
  });

  it("future unresolved knockout shell is excluded, not corrupted into canonical state", () => {
    const r = normalizeFootballDataMatches(unresolvedKnockout, opt);
    expect(r.snapshot.matches).toHaveLength(0);
    expect(r.errors.some((e) => e.code === "unresolved-knockout")).toBe(true);
  });

  it("resolved knockout without a mapping fails closed", () => {
    const r = normalizeFootballDataMatches(syntheticPenaltyKnockout, opt); // no knockoutMatchIdMap
    expect(r.snapshot.matches).toHaveLength(0);
    expect(r.errors.some((e) => e.code === "knockout-mapping-unavailable")).toBe(true);
  });
});

describe("F. score / winner / penalties mapping", () => {
  it("winner HOME_TEAM -> teamA, AWAY_TEAM -> teamB, DRAW -> no winner", () => {
    const draw = byId(normalizeFootballDataMatches(finishedGroupDraw, opt)).get("M3")!;
    expect(draw.winner).toBeUndefined();
    expect(draw.goalsA).toBe(1);
    expect(draw.goalsB).toBe(1);

    const away = wc([
      {
        ...syntheticPenaltyKnockout.matches[0]!,
        id: 9101,
        score: { winner: "AWAY_TEAM", duration: "REGULAR", fullTime: { home: 0, away: 1 } },
      },
    ]);
    const r = normalizeFootballDataMatches(away, { ...opt, knockoutMatchIdMap: { "9101": 90 } });
    const m90 = byId(r).get("M90")!;
    expect(m90.winner).toBe("brazil"); // away team
    expect(m90.goalsA).toBe(0);
    expect(m90.goalsB).toBe(1);
  });

  it("synthetic penalty shootout maps winner + penalties and validates", () => {
    const r = normalizeFootballDataMatches(syntheticPenaltyKnockout, {
      ...opt,
      knockoutMatchIdMap: SYNTHETIC_PENALTY_KO_MAP,
    });
    const m89 = byId(r).get("M89")!;
    expect(m89.stage).toBe("roundOf16");
    expect(m89.winner).toBe("germany");
    expect(m89.penalties).toEqual({ a: 4, b: 2 });
    const v = validateLiveSnapshot(r.snapshot, reference, FRESH);
    expect(v.ok).toBe(true);
  });
});

describe("G. standings comparison (comparison-only)", () => {
  it("extracts the overall TOTAL table as comparison rows", () => {
    const rows = extractFootballDataStandings(standingsComparison);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ group: "OVERALL", position: 1, teamName: "Switzerland", points: 7 });
  });

  it("provider standings do not feed app-derived standings", () => {
    const r = normalizeFootballDataMatches(groupStageSample, opt);
    const state = ingestLiveSnapshot(r.snapshot, reference, { generatedAt: "2026-06-24T15:00:00Z", staleAfterSeconds: 24 * 60 * 60 });
    expect(state.groupStandings.every((s) => s.derivedFrom === "results")).toBe(true);
    // The matches-normalizer comparison carries no standings (separate endpoint/extractor).
    expect(r.comparison.standings).toEqual([]);
  });
});

describe("H. integration with the existing live-state layer", () => {
  it("normalized snapshot ingests; standings/bracket derive from results", () => {
    const r = normalizeFootballDataMatches(groupStageSample, opt);
    const state = ingestLiveSnapshot(r.snapshot, reference, { generatedAt: "2026-06-24T15:00:00Z", staleAfterSeconds: 24 * 60 * 60 });
    expect(state.groupStandings).toHaveLength(48);
    expect(state.bracket.derivedFrom).toBe("results");
    const mexico = state.groupStandings.find((s) => s.teamId === "mexico")!;
    expect(mexico.points).toBe(3); // beat South Africa in the sample
    expect(mexico.played).toBe(1);
  });
});

describe("I. isolation / governance", () => {
  const dir = join(process.cwd(), "lib", "live-ingest", "football-data-org");
  const files = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith(".ts")).map((f) => join(dir, f))
    : [];

  it("provider files contain no network / secrets / model surface", () => {
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const re of [/\bfetch\s*\(/, /\bprocess\.env\b/, /\baxios\b/, /XMLHttpRequest/, /require\s*\(/, /https?:\/\//]) {
        expect({ file, pattern: String(re), hit: re.test(src) }).toEqual({ file, pattern: String(re), hit: false });
      }
      for (const term of ["MODEL_WEIGHTS", "calibrat", "prediction-core", "lib/model"]) {
        expect({ file, term, present: src.includes(term) }).toEqual({ file, term, present: false });
      }
    }
  });

  it("committed fixtures carry no crest URLs or raw http(s) links", () => {
    const fdir = join(process.cwd(), "tests", "fixtures", "live-ingest", "football-data-org");
    for (const f of readdirSync(fdir).filter((x) => x.endsWith(".ts"))) {
      const src = readFileSync(join(fdir, f), "utf8");
      expect(src.includes("crest")).toBe(false);
      expect(/https?:\/\//.test(src)).toBe(false);
    }
  });
});
