/**
 * Post-tournament retrospective (PR A) - artifact validation.
 * ----------------------------------------------------------
 * Validates the read-only retrospective INPUT artifacts under `data/retrospective/`. This
 * is the trust boundary for PR B: every downstream retrospective number is computed from
 * these files, so they are checked here for coverage, score/winner consistency, the
 * shootout correction, bracket propagation against the OFFICIAL internal knockout graph,
 * Article 13 group truth, forecast-archive coverage, and terminal-forecast honesty.
 *
 * Scope: data + validation only. No analysis, no report, no production behaviour. The
 * artifacts live under `data/retrospective/` precisely so that no production loader reads
 * them and no public forecast checkpoint changes.
 *
 * Canonical-source rule enforced here: group standings, qualification, knockout
 * propagation and the champion come from INTERNAL logic (`computeGroupStandings`,
 * `officialKnockoutGraph`, the validated ledger). The provider is only a sanitized score
 * source and its `bracket` projection is deliberately NOT committed as an artifact.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isKnockoutLedgerRow,
  validateResultsLedger,
  validateResultsLedgerAgainstFixtures,
  type ForecastResultsLedger,
  type KnockoutResultLedgerRow,
  type ResultLedgerRow,
} from "@/lib/model/forecast-results-ledger";
import { officialKnockoutGraph } from "@/data/official/knockout-graph";
import { computeGroupStandings, rankThirdPlacedTeams } from "@/lib/simulation/standings";
import { fixtures, teams } from "@/lib/data";
import type { GroupId } from "@/lib/types";

const DIR = join(process.cwd(), "data", "retrospective");
const read = (f: string) => JSON.parse(readFileSync(join(DIR, f), "utf8"));

const ledger = read("results-2026-07-19-after-match-104.json") as ForecastResultsLedger;
const archive = read("match-forecasts-archive-2026-07-19.json") as {
  matchForecasts: {
    matchNumber: number;
    stage: string;
    forecastProvenance: string;
    capturedBeforeCompletion: boolean;
    archived: boolean;
  }[];
};
const current = read("forecast-current-2026-07-19-after-match-104.json") as {
  snapshotId: string;
  completedMatchesLocked: number;
  teams: Record<string, number | string>[];
};
const manifest = read("manifest.json") as Record<string, never> & {
  tournament: Record<string, unknown>;
  shootoutCorrection: { policy: string; correctedRows: { matchNumber: number }[] };
  guarantees: Record<string, boolean>;
};

const rows = ledger.results;
const knockoutRows = rows.filter(isKnockoutLedgerRow);
const byNumber = new Map<number, ResultLedgerRow>(rows.map((r) => [r.matchNumber, r]));
const CHAMPION = "spain";
const RUNNER_UP = "argentina";

/** Winner of a knockout match, from the validated ledger (never the provider bracket). */
const winnerOf = (matchNumber: number): string => {
  const row = byNumber.get(matchNumber);
  if (!row || !isKnockoutLedgerRow(row)) throw new Error(`M${matchNumber} is not a knockout row`);
  return row.winnerTeamId;
};
const loserOf = (matchNumber: number): string => {
  const row = byNumber.get(matchNumber) as KnockoutResultLedgerRow;
  return row.winnerTeamId === row.homeTeamId ? row.awayTeamId : row.homeTeamId;
};

describe("retrospective artifacts: ledger schema + official-fixture validation", () => {
  it("passes the production ledger schema validator with no errors", () => {
    expect(validateResultsLedger(ledger)).toEqual([]);
  });

  it("passes validation against the official group-stage fixtures", () => {
    expect(validateResultsLedgerAgainstFixtures(ledger, fixtures)).toEqual([]);
  });
});

describe("retrospective artifacts: coverage", () => {
  it("contains exactly 104 results", () => {
    expect(rows.length).toBe(104);
  });

  it("covers match numbers 1-104 contiguously with no duplicates and none missing", () => {
    const nums = rows.map((r) => r.matchNumber).sort((a, b) => a - b);
    expect(new Set(nums).size).toBe(104);
    expect(nums).toEqual(Array.from({ length: 104 }, (_, i) => i + 1));
  });

  it("has every match marked complete", () => {
    expect(rows.filter((r) => r.status !== "complete")).toEqual([]);
  });

  it("has all 32 knockout ties resolved with a winner", () => {
    expect(knockoutRows.length).toBe(32);
    expect(knockoutRows.filter((r) => !r.winnerTeamId)).toEqual([]);
    const knockoutNums = knockoutRows.map((r) => r.matchNumber).sort((a, b) => a - b);
    expect(knockoutNums).toEqual(Array.from({ length: 32 }, (_, i) => i + 73));
  });

  it("has the expected stage distribution", () => {
    const byStage: Record<string, number> = {};
    for (const r of rows) byStage[r.stage] = (byStage[r.stage] ?? 0) + 1;
    expect(byStage).toEqual({
      group: 72,
      roundOf32: 16,
      roundOf16: 8,
      quarterFinal: 4,
      semiFinal: 2,
      thirdPlace: 1,
      final: 1,
    });
  });

  it("has M104 complete, won by Spain - the champion", () => {
    const final = byNumber.get(104) as KnockoutResultLedgerRow;
    expect(final.stage).toBe("final");
    expect(final.status).toBe("complete");
    expect(final.winnerTeamId).toBe(CHAMPION);
    // M104 Spain 1-0 Argentina, oriented as stored.
    expect({
      home: final.homeTeamId,
      away: final.awayTeamId,
      score: `${final.homeGoals}-${final.awayGoals}`,
    }).toEqual({ home: CHAMPION, away: RUNNER_UP, score: "1-0" });
  });
});

describe("retrospective artifacts: score and winner consistency", () => {
  const teamIds = new Set(teams.map((t) => t.id));

  it("every row names two distinct, known teams", () => {
    for (const r of rows) {
      expect({ m: r.matchNumber, ok: teamIds.has(r.homeTeamId) && teamIds.has(r.awayTeamId) }).toEqual({
        m: r.matchNumber,
        ok: true,
      });
      expect(r.homeTeamId).not.toBe(r.awayTeamId);
    }
  });

  it("every row has a valid non-negative integer score", () => {
    const bad = rows.filter(
      (r) =>
        !Number.isInteger(r.homeGoals) ||
        !Number.isInteger(r.awayGoals) ||
        r.homeGoals < 0 ||
        r.awayGoals < 0,
    );
    expect(bad).toEqual([]);
  });

  it("every knockout winner is one of that match's two teams", () => {
    const bad = knockoutRows.filter(
      (r) => r.winnerTeamId !== r.homeTeamId && r.winnerTeamId !== r.awayTeamId,
    );
    expect(bad).toEqual([]);
  });

  it("every decisive knockout winner is the higher scorer", () => {
    for (const r of knockoutRows) {
      if (r.homeGoals === r.awayGoals) continue;
      const expected = r.homeGoals > r.awayGoals ? r.homeTeamId : r.awayTeamId;
      expect({ m: r.matchNumber, winner: r.winnerTeamId }).toEqual({ m: r.matchNumber, winner: expected });
    }
  });
});

describe("retrospective artifacts: shootout correction (retrospective-local)", () => {
  // The provider folds the shootout into score.fullTime. These are the corrected values:
  // stored 4-5 / 3-4 / 3-5 / 4-3 become level, with the shootout carried separately.
  const EXPECTED = [
    { matchNumber: 74, home: "germany", away: "paraguay", score: "1-1", pens: "3-4", winner: "paraguay" },
    { matchNumber: 75, home: "netherlands", away: "morocco", score: "1-1", pens: "2-3", winner: "morocco" },
    { matchNumber: 88, home: "australia", away: "egypt", score: "1-1", pens: "2-4", winner: "egypt" },
    { matchNumber: 96, home: "switzerland", away: "colombia", score: "0-0", pens: "4-3", winner: "switzerland" },
  ];

  it("corrects exactly the four shootout rows to level base scores", () => {
    const actual = knockoutRows
      .filter((r) => r.penaltiesHome !== undefined)
      .map((r) => ({
        matchNumber: r.matchNumber,
        home: r.homeTeamId,
        away: r.awayTeamId,
        score: `${r.homeGoals}-${r.awayGoals}`,
        pens: `${r.penaltiesHome}-${r.penaltiesAway}`,
        winner: r.winnerTeamId,
      }))
      .sort((a, b) => a.matchNumber - b.matchNumber);
    expect(actual).toEqual(EXPECTED);
  });

  it("stores no shootout row as an inflated decisive full-time score", () => {
    // Generic invariant, not a match allow-list: a row carrying penalties must be level,
    // and a level knockout row must carry penalties (it had to be decided somehow).
    for (const r of knockoutRows) {
      const hasPens = r.penaltiesHome !== undefined || r.penaltiesAway !== undefined;
      const level = r.homeGoals === r.awayGoals;
      expect({ m: r.matchNumber, hasPens, level }).toEqual({ m: r.matchNumber, hasPens: level, level });
    }
  });

  it("resolves each shootout winner from the shootout, consistent with winnerTeamId", () => {
    for (const r of knockoutRows) {
      if (r.penaltiesHome === undefined || r.penaltiesAway === undefined) continue;
      expect(r.penaltiesHome).not.toBe(r.penaltiesAway);
      const penWinner = r.penaltiesHome > r.penaltiesAway ? r.homeTeamId : r.awayTeamId;
      expect({ m: r.matchNumber, winner: r.winnerTeamId }).toEqual({ m: r.matchNumber, winner: penWinner });
    }
  });

  it("records the correction as retrospective-local in the manifest", () => {
    expect(manifest.shootoutCorrection.policy).toBe("retrospective-local");
    expect(manifest.shootoutCorrection.correctedRows.map((c) => c.matchNumber).sort((a, b) => a - b)).toEqual([
      74, 75, 88, 96,
    ]);
  });
});

describe("retrospective artifacts: bracket consistency with the OFFICIAL internal graph", () => {
  it("matches the official knockout graph on stage and match numbers", () => {
    for (const def of officialKnockoutGraph.matches) {
      const row = byNumber.get(def.matchNumber);
      expect({ m: def.matchNumber, present: !!row }).toEqual({ m: def.matchNumber, present: true });
      expect({ m: def.matchNumber, stage: row!.stage }).toEqual({ m: def.matchNumber, stage: def.stage });
    }
  });

  it("propagates winners and losers exactly as the official graph requires", () => {
    // Internal propagation is canonical: every matchWinner/matchLoser slot must be filled
    // by the winner/loser this ledger records for the referenced match.
    let checked = 0;
    for (const def of officialKnockoutGraph.matches) {
      const row = byNumber.get(def.matchNumber) as KnockoutResultLedgerRow;
      const participants = new Set([row.homeTeamId, row.awayTeamId]);
      for (const slot of [def.home, def.away]) {
        if (slot.kind === "matchWinner") {
          const expected = winnerOf(slot.matchNumber);
          expect({ m: def.matchNumber, from: slot.matchNumber, team: expected, present: participants.has(expected) })
            .toEqual({ m: def.matchNumber, from: slot.matchNumber, team: expected, present: true });
          checked += 1;
        } else if (slot.kind === "matchLoser") {
          const expected = loserOf(slot.matchNumber);
          expect({ m: def.matchNumber, from: slot.matchNumber, team: expected, present: participants.has(expected) })
            .toEqual({ m: def.matchNumber, from: slot.matchNumber, team: expected, present: true });
          checked += 1;
        }
      }
    }
    // R16 (16) + QF (8) + SF (4) + third place (2) + final (2) = 32 propagated slots.
    expect(checked).toBe(32);
  });

  it("has a champion chain that terminates at Spain", () => {
    expect(winnerOf(104)).toBe(CHAMPION);
    expect(winnerOf(101)).toBe(CHAMPION); // semi-final
    expect(winnerOf(98)).toBe(CHAMPION); // quarter-final
    expect(winnerOf(93)).toBe(CHAMPION); // round of 16
    expect(winnerOf(84)).toBe(CHAMPION); // round of 32
  });

  it("commits no provider bracket projection as an artifact (cross-check only, never truth)", () => {
    expect("bracket" in (ledger as unknown as Record<string, unknown>)).toBe(false);
    expect("standings" in (ledger as unknown as Record<string, unknown>)).toBe(false);
  });
});

describe("retrospective artifacts: group truth via internal Article 13 logic", () => {
  const groupRows = rows.filter((r) => r.stage === "group");
  const groupIds = [...new Set(groupRows.map((r) => (r as { group: GroupId }).group))].sort();
  const teamMeta = teams.map((t) => ({ teamId: t.id, fifaRanking: t.fifaRanking, conductScore: 0 }));

  const standingsByGroup = new Map(
    groupIds.map((g) => {
      const inGroup = groupRows.filter((r) => (r as { group: GroupId }).group === g);
      const teamIds = [...new Set(inGroup.flatMap((r) => [r.homeTeamId, r.awayTeamId]))];
      return [g, computeGroupStandings(g, teamIds, inGroup, teamMeta)];
    }),
  );

  it("resolves 12 groups of 4, each team having played 3 matches", () => {
    expect(groupIds.length).toBe(12);
    for (const [g, table] of standingsByGroup) {
      expect({ g, teams: table.length }).toEqual({ g, teams: 4 });
      for (const s of table) expect({ g, team: s.teamId, played: s.played }).toEqual({ g, team: s.teamId, played: 3 });
    }
  });

  it("derives 32 qualifiers and 16 eliminated teams (24 top-two + 8 best third)", () => {
    const topTwo = [...standingsByGroup.values()].flatMap((t) => t.slice(0, 2).map((s) => s.teamId));
    const thirds = [...standingsByGroup.values()].map((t) => t[2]!);
    const bestThirds = rankThirdPlacedTeams(thirds, teamMeta).slice(0, 8).map((s) => s.teamId);
    const qualified = new Set([...topTwo, ...bestThirds]);
    expect(topTwo.length).toBe(24);
    expect(bestThirds.length).toBe(8);
    expect(qualified.size).toBe(32);
    expect(teams.length - qualified.size).toBe(16);
  });

  it("has every Round-of-32 participant drawn from the internally derived qualifier set", () => {
    const topTwo = [...standingsByGroup.values()].flatMap((t) => t.slice(0, 2).map((s) => s.teamId));
    const thirds = [...standingsByGroup.values()].map((t) => t[2]!);
    const qualified = new Set([...topTwo, ...rankThirdPlacedTeams(thirds, teamMeta).slice(0, 8).map((s) => s.teamId)]);
    const r32Teams = new Set(
      knockoutRows.filter((r) => r.stage === "roundOf32").flatMap((r) => [r.homeTeamId, r.awayTeamId]),
    );
    expect(r32Teams.size).toBe(32);
    expect([...r32Teams].filter((t) => !qualified.has(t))).toEqual([]);
  });

  it("confirms the champion won its group (position is the sorted-table index)", () => {
    const groupH = standingsByGroup.get("H" as GroupId)!;
    expect(groupH[0]!.teamId).toBe(CHAMPION);
    expect(groupH[0]!.points).toBe(7);
  });
});

describe("retrospective artifacts: match-forecast archive coverage", () => {
  it("contains exactly 26 archived pre-match forecasts", () => {
    expect(archive.matchForecasts.length).toBe(26);
  });

  it("has every entry genuinely archived before completion", () => {
    for (const f of archive.matchForecasts) {
      expect({
        m: f.matchNumber,
        provenance: f.forecastProvenance,
        captured: f.capturedBeforeCompletion,
        archived: f.archived,
      }).toEqual({
        m: f.matchNumber,
        provenance: "archived-pre-match-forecast",
        captured: true,
        archived: true,
      });
    }
  });

  it("matches the documented per-stage coverage (partial by design)", () => {
    const byStage: Record<string, number> = {};
    for (const f of archive.matchForecasts) byStage[f.stage] = (byStage[f.stage] ?? 0) + 1;
    expect(byStage).toEqual({
      roundOf32: 11,
      roundOf16: 8,
      quarterFinal: 3,
      semiFinal: 2,
      thirdPlace: 1,
      final: 1,
    });
    // No group-stage forecast was ever archived - PR B must recompute those and label them.
    expect(archive.matchForecasts.filter((f) => f.stage === "group")).toEqual([]);
  });

  it("is missing exactly the six knockout ties recorded in the manifest", () => {
    const have = new Set(archive.matchForecasts.map((f) => f.matchNumber));
    const missing = Array.from({ length: 32 }, (_, i) => i + 73).filter((n) => !have.has(n));
    expect(missing).toEqual([73, 74, 75, 76, 78, 99]);
  });

  it("references only real, completed knockout matches", () => {
    for (const f of archive.matchForecasts) {
      const row = byNumber.get(f.matchNumber);
      expect({ m: f.matchNumber, known: !!row, stage: row?.stage }).toEqual({
        m: f.matchNumber,
        known: true,
        stage: f.stage,
      });
    }
  });
});

describe("retrospective artifacts: terminal current forecast", () => {
  it("is the final snapshot with all 104 results locked", () => {
    expect(current.snapshotId).toBe("current-2026-07-19-after-match-104");
    expect(current.completedMatchesLocked).toBe(104);
  });

  it("is degenerate: every probability is exactly 0 or 1 (an end state, not a forecast)", () => {
    const keys = ["winner", "final", "semiFinal", "quarterFinal", "roundOf16", "roundOf32", "qualifyTop2", "qualifyThird"];
    for (const t of current.teams) {
      for (const k of keys) {
        expect({ team: t.teamId, k, v: t[k] }).toEqual({ team: t.teamId, k, v: t[k] === 1 ? 1 : 0 });
      }
    }
  });

  it("locks the champion outcome to Spain and to no one else", () => {
    const winners = current.teams.filter((t) => t.winner === 1).map((t) => t.teamId);
    expect(winners).toEqual([CHAMPION]);
    const finalists = current.teams.filter((t) => t.final === 1).map((t) => t.teamId).sort();
    expect(finalists).toEqual([RUNNER_UP, CHAMPION].sort());
  });

  it("documents that no intermediate knockout probability path is recoverable", () => {
    const entry = (manifest as unknown as { artifacts: { kind: string; terminalNote?: string }[] }).artifacts.find(
      (a) => a.kind === "final-current-forecast",
    );
    expect(entry?.terminalNote).toContain("NOT recoverable");
  });
});

describe("retrospective artifacts: manifest guarantees", () => {
  it("records the tournament outcome consistently with the ledger", () => {
    expect(manifest.tournament).toMatchObject({
      champion: CHAMPION,
      runnerUp: RUNNER_UP,
      finalMatchNumber: 104,
      finalScore: "1-0",
      matchCount: 104,
      archivedMatchForecastCount: 26,
    });
  });

  it("asserts the read-only, no-production-impact guarantees", () => {
    expect(manifest.guarantees).toEqual({
      noProductionLoaderReadsThisPath: true,
      noPublicForecastSnapshotChanged: true,
      noFilesUnderDataForecast: true,
      readOnlyInputs: true,
    });
  });

  it("is not read by any production loader", () => {
    // The guarantee that keeps these artifacts inert: nothing outside tests/ and the
    // derivation script may reference the retrospective data directory.
    const roots = ["app", "components", "lib", "scripts"];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of require("node:fs").readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(entry.name)) {
          if (p.includes(join("scripts", "retrospective"))) continue;
          if (readFileSync(p, "utf8").includes("data/retrospective")) offenders.push(p);
        }
      }
    };
    for (const r of roots) walk(join(process.cwd(), r));
    expect(offenders).toEqual([]);
  });
});
