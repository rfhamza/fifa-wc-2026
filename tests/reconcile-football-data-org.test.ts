import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseCsv,
  buildSnapshotFromCsvResults,
  compareResults,
  parseStandingsCsv,
  compareStandings,
  auditBracket,
  runReconcile,
  formatReconcileReport,
  type FdComparisonMatch,
} from "@/scripts/football-data-org/reconcile";
import type { LiveBracketMatch, LiveGroupStanding, RawLiveMatch } from "@/lib/live-state/types";

/**
 * Phase 1.28I: unit tests for the local-only reconciliation reporter. Pure functions,
 * no network, no token, no committed CSV/provider payloads.
 */

const OPTS = { asOf: "2026-06-25T12:33:09Z", lastUpdatedAt: "2026-06-25T12:33:09Z" };

describe("CSV parsing", () => {
  it("parses headers and quoted fields containing commas", () => {
    const text =
      'matchNumber,teamA,note\n1,Mexico,"a, b, c"\n2,South Africa,plain\n';
    const rows = parseCsv(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ matchNumber: "1", teamA: "Mexico", note: "a, b, c" });
    expect(rows[1]!.teamA).toBe("South Africa");
  });
});

describe("CSV results -> RawLiveSnapshot", () => {
  const text = [
    "matchNumber,stage,group,teamA,teamB,status,goalsA,goalsB",
    "1,Group,A,Mexico,South Africa,complete,2,0",
    "2,Group,A,South Korea,Czechia,complete,2,1",
    "73,Round of 32,,Atlantis,Mexico,scheduled,,", // non-group + scheduled -> skipped
    "99,Group,A,Atlantis,Mexico,complete,1,0", // unknown team -> flagged + skipped
  ].join("\n");
  const built = buildSnapshotFromCsvResults(parseCsv(text), OPTS);

  it("builds completed group matches and resolves team names via resolveTeamId", () => {
    expect(built.completedRows).toBe(2);
    expect(built.snapshot.matches.map((m) => m.matchId)).toEqual(["M1", "M2"]);
    expect(built.snapshot.matches[0]).toMatchObject({ teamA: "mexico", teamB: "south-africa", goalsA: 2, goalsB: 0 });
  });

  it("flags unknown teams and never silently drops them", () => {
    expect(built.unknownTeams).toContain("Atlantis");
  });

  it("skips non-group / non-complete rows", () => {
    expect(built.skipped).toBeGreaterThanOrEqual(2);
    expect(built.snapshot.matches.some((m) => m.matchId === "M73")).toBe(false);
  });
});

describe("orientation-safe result comparison", () => {
  const csv: RawLiveMatch[] = [
    { matchId: "M1", stage: "group", group: "A", teamA: "mexico", teamB: "south-africa", status: "complete", goalsA: 2, goalsB: 0 },
    { matchId: "M3", stage: "group", group: "B", teamA: "canada", teamB: "bosnia-herzegovina", status: "complete", goalsA: 1, goalsB: 1 },
  ];

  it("matches by matchNumber regardless of team order (team->goals map)", () => {
    const fd: FdComparisonMatch[] = [
      { matchId: "M1", teamA: "south-africa", teamB: "mexico", goalsA: 0, goalsB: 2, status: "complete" }, // swapped, same result
    ];
    const p = compareResults(csv, fd);
    expect(p.matched).toBe(1);
    expect(p.scoreMismatches).toEqual([]);
    expect(p.unmatchedCsv).toEqual([3]); // M3 absent from fd
  });

  it("flags a genuine score mismatch and unmatched FD rows", () => {
    const fd: FdComparisonMatch[] = [
      { matchId: "M1", teamA: "mexico", teamB: "south-africa", goalsA: 1, goalsB: 0, status: "complete" }, // wrong score
      { matchId: "M9", teamA: "x", teamB: "y", goalsA: 0, goalsB: 0, status: "complete" }, // not in csv
    ];
    const p = compareResults(csv, fd);
    expect(p.scoreMismatches.map((s) => s.matchNumber)).toEqual([1]);
    expect(p.unmatchedFd).toContain(9);
  });
});

describe("standings comparison (core strict, ordering advisory)", () => {
  const derived: LiveGroupStanding[] = [
    { teamId: "mexico", group: "A", played: 3, won: 3, drawn: 0, lost: 0, goalsFor: 6, goalsAgainst: 0, goalDifference: 6, points: 9, rank: 1, qualificationState: "qualified", derivedFrom: "results" },
    { teamId: "south-africa", group: "A", played: 3, won: 1, drawn: 1, lost: 1, goalsFor: 2, goalsAgainst: 3, goalDifference: -1, points: 4, rank: 2, qualificationState: "qualified", derivedFrom: "results" },
  ];
  it("passes when core fields agree; flags ordering when rank differs", () => {
    const csv = parseStandingsCsv(parseCsv([
      "group,position,team,teamCode,matchesPlayed,wins,draws,losses,goalsFor,goalsAgainst,goalDifference,points",
      "A,1,Mexico,MEX,3,3,0,0,6,0,6,9",
      "A,2,South Africa,RSA,3,1,1,1,2,3,-1,4",
    ].join("\n")));
    const cmp = compareStandings(derived, csv);
    expect(cmp.coreFieldMismatches).toEqual([]);
    expect(cmp.orderingAdvisories).toEqual([]);
  });

  it("reports a core-field mismatch", () => {
    const csv = parseStandingsCsv(parseCsv([
      "group,position,team,teamCode,matchesPlayed,wins,draws,losses,goalsFor,goalsAgainst,goalDifference,points",
      "A,1,Mexico,MEX,3,3,0,0,6,0,6,8", // points wrong
    ].join("\n")));
    const cmp = compareStandings(derived, csv);
    expect(cmp.coreFieldMismatches.some((s) => s.includes("points"))).toBe(true);
  });
});

describe("bracket audit classification", () => {
  const mk = (matchNumber: number, h: string | null, a: string | null): LiveBracketMatch => ({
    matchNumber, stage: "roundOf32", homeTeamId: h, awayTeamId: a, winner: null, status: "scheduled", resolved: false,
  });
  it("classifies fully / partial / unresolved by participants", () => {
    const r = auditBracket([mk(73, "south-africa", "canada"), mk(79, "mexico", null), mk(74, null, null)]);
    expect(r.m73).toMatchObject({ homeTeamId: "south-africa", awayTeamId: "canada", fullyResolved: true });
    expect(r.fullyResolvedR32).toEqual([73]);
    expect(r.partiallyResolvedR32.map((s) => s.matchNumber)).toEqual([79]);
    expect(r.unresolvedR32Count).toBe(1);
  });
});

describe("runReconcile end-to-end on the local CSV sample", () => {
  // Use the real user-supplied CSV ONLY as a local read fixture (not committed by this repo;
  // it lives under the uploads dir). Falls back to a synthetic CSV if not present.
  const uploaded = "/root/.claude/uploads/971423e7-e454-57f5-b564-f7a26ac96282/71fc9843-wc2026currentresults.csv";
  let resultsCsvText: string;
  try {
    resultsCsvText = readFileSync(uploaded, "utf8");
  } catch {
    resultsCsvText = [
      "matchNumber,stage,group,teamA,teamB,status,goalsA,goalsB",
      "1,Group,A,Mexico,South Africa,complete,2,0",
    ].join("\n");
  }

  it("produces a report with provider-standings-comparison-only and a bracket section", () => {
    const report = runReconcile({
      resultsCsvText,
      fdSource: "none",
      resultsLabel: "wc2026-current-results.csv",
      now: "2026-06-25T12:33:09Z",
    });
    expect(report.providerStandingsComparisonOnly).toBe(true);
    expect(report.results.completedRows).toBeGreaterThanOrEqual(1);
    expect(report.bracket).toBeTruthy();
    // No token or secret can appear in the sanitized text output.
    const text = formatReconcileReport(report);
    expect(text.toLowerCase()).not.toContain("token");
    expect(text).not.toContain("FOOTBALL_DATA_TOKEN");
  });
});

describe("reporter governance / isolation", () => {
  const root = process.cwd();
  const coreSrc = readFileSync(join(root, "scripts", "football-data-org", "reconcile.ts"), "utf8");
  const runSrc = readFileSync(join(root, "scripts", "football-data-org", "reconcile-run.ts"), "utf8");

  it("the reconcile core does no env reads and no global fetch (pure)", () => {
    expect(/\bprocess\.env\b/.test(coreSrc)).toBe(false);
    expect(/\bfetch\s*\(/.test(coreSrc)).toBe(false);
  });

  it("the core imports no model / app / client code", () => {
    for (const bad of ["lib/model", "prediction-core", "@/app", "@/components"]) {
      expect(coreSrc.includes(bad)).toBe(false);
    }
  });

  it("the runner reads only FOOTBALL_DATA_TOKEN (never NEXT_PUBLIC)", () => {
    expect(runSrc.includes("process.env.FOOTBALL_DATA_TOKEN")).toBe(true);
    expect(/NEXT_PUBLIC/.test(runSrc)).toBe(false);
    // exactly one env access, and it is the token
    const envReads = runSrc.match(/process\.env\.[A-Z_]+/g) ?? [];
    expect(new Set(envReads)).toEqual(new Set(["process.env.FOOTBALL_DATA_TOKEN"]));
  });

  it("artifacts default under the git-ignored artifacts dir", () => {
    const gi = readFileSync(join(root, ".gitignore"), "utf8");
    expect(gi.includes("/artifacts/")).toBe(true);
    // runner writes only to the ignored DEFAULT_OUT_DIR (artifacts/football-data-org)
    expect(runSrc.includes("DEFAULT_OUT_DIR")).toBe(true);
  });
});
