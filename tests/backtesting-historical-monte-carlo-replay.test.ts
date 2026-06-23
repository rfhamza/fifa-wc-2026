import { describe, expect, it } from "vitest";
import {
  computePrimaryHistoricalReplay,
  PRIMARY_REPLAY_BRACKET_TREES,
  PRIMARY_REPLAY_GOVERNANCE_FLAGS,
  PRIMARY_REPLAY_DIAGNOSTIC_LABEL,
  type PrimaryHistoricalReplayDiagnostics,
  type VariantReplay,
  type ReplayStageProbabilities,
} from "@/lib/backtesting/historical-monte-carlo-replay";
import { primaryDiagnosticPacks } from "@/lib/backtesting/historical-cohorts";
import { computeGroupStandings, type MatchResult } from "@/lib/simulation/standings";
import type { GroupId, TeamMeta } from "@/lib/types";

/**
 * Phase 1.21F - PRIMARY-ONLY Monte Carlo historical replay tests. Pinned at a low iteration
 * count for speed; supplementary/approximate and strictly primary-only (2010/2014/2018/2022).
 */
const ITERATIONS = 1000;
const SEED = 12345;
const REPLAY: PrimaryHistoricalReplayDiagnostics = computePrimaryHistoricalReplay({
  iterations: ITERATIONS,
  seed: SEED,
});
const STRETCH_YEARS = [1998, 2002, 2006];
const everyVariant = (d: PrimaryHistoricalReplayDiagnostics): VariantReplay[] =>
  d.perTournament.flatMap((t) => Object.values(t.byVariant));

describe("primary replay: cohort lock (primary-only, no stretch, no all-seven)", () => {
  it("covers exactly the four primary years", () => {
    expect(REPLAY.years).toEqual([2010, 2014, 2018, 2022]);
    expect(REPLAY.tournamentCount).toBe(4);
    expect(REPLAY.perTournament.map((t) => t.tournamentYear)).toEqual([2010, 2014, 2018, 2022]);
  });

  it("includes no stretch (1998/2002/2006) years and no all-seven roll-up", () => {
    for (const y of STRETCH_YEARS) expect(REPLAY.years).not.toContain(y);
    // No all-seven: exactly four tournaments, nothing more.
    expect(REPLAY.perTournament).toHaveLength(4);
    // Every replayed team belongs to one of the four primary packs.
    const primaryTeamIds = new Set(primaryDiagnosticPacks.flatMap((p) => p.identity.teamIds));
    for (const t of REPLAY.perTournament) {
      for (const v of Object.values(t.byVariant)) {
        for (const row of v.perTeam) expect(primaryTeamIds.has(row.teamId)).toBe(true);
      }
    }
  });

  it("consumes exactly primaryDiagnosticPacks (per-tournament team sets match the packs)", () => {
    const packByYear = new Map(primaryDiagnosticPacks.map((p) => [p.identity.tournamentYear, p]));
    for (const t of REPLAY.perTournament) {
      const pack = packByYear.get(t.tournamentYear)!;
      for (const v of Object.values(t.byVariant)) {
        expect(v.perTeam.map((r) => r.teamId).sort()).toEqual([...pack.identity.teamIds].sort());
      }
    }
  });
});

describe("primary replay: determinism", () => {
  it("same {seed, iterations} produces identical output", () => {
    const again = computePrimaryHistoricalReplay({ iterations: ITERATIONS, seed: SEED });
    expect(again).toEqual(REPLAY);
  });

  it("a different seed produces different output", () => {
    const other = computePrimaryHistoricalReplay({ iterations: ITERATIONS, seed: SEED + 1 });
    expect(other.perTournament[0]!.byVariant).not.toEqual(REPLAY.perTournament[0]!.byVariant);
  });
});

describe("primary replay: probability invariants per tournament and variant", () => {
  type NumKey = "reachR16" | "reachQF" | "reachSF" | "reachFinal" | "win";
  const sum = (rows: ReplayStageProbabilities[], key: NumKey) =>
    rows.reduce((s, r) => s + r[key], 0);

  it("stage-reach totals match the bracket structure (16/8/4/2/1)", () => {
    for (const t of REPLAY.perTournament) {
      for (const v of Object.values(t.byVariant)) {
        expect(sum(v.perTeam, "reachR16")).toBeCloseTo(16, 6);
        expect(sum(v.perTeam, "reachQF")).toBeCloseTo(8, 6);
        expect(sum(v.perTeam, "reachSF")).toBeCloseTo(4, 6);
        expect(sum(v.perTeam, "reachFinal")).toBeCloseTo(2, 6);
        expect(sum(v.perTeam, "win")).toBeCloseTo(1, 6);
      }
    }
  });

  it("every probability is within [0, 1]", () => {
    for (const v of everyVariant(REPLAY)) {
      for (const r of v.perTeam) {
        for (const p of [r.reachR16, r.reachQF, r.reachSF, r.reachFinal, r.win]) {
          expect(p).toBeGreaterThanOrEqual(0);
          expect(p).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("stage probabilities are monotonically nested per team", () => {
    for (const v of everyVariant(REPLAY)) {
      for (const r of v.perTeam) {
        expect(r.win).toBeLessThanOrEqual(r.reachFinal);
        expect(r.reachFinal).toBeLessThanOrEqual(r.reachSF);
        expect(r.reachSF).toBeLessThanOrEqual(r.reachQF);
        expect(r.reachQF).toBeLessThanOrEqual(r.reachR16);
      }
    }
  });
});

describe("primary replay: source-backed bracket trees verified against actual knockout rows", () => {
  const pair = (a: string, b: string) => [a, b].sort().join("|");

  for (const pack of primaryDiagnosticPacks) {
    const year = pack.identity.tournamentYear;
    it(`${year} encoded bracket tree reproduces the actual R16/QF/SF/final matchups`, () => {
      const tree = PRIMARY_REPLAY_BRACKET_TREES[year]!;
      const meta: TeamMeta[] = pack.fifa.map((f) => ({
        teamId: f.teamId,
        fifaRanking: f.rank,
        conductScore: 0,
      }));
      const ko = pack.results.filter((m) => m.stage !== "group");
      const r16 = ko.filter((m) => m.stage === "round-of-16");
      const qf = ko.filter((m) => m.stage === "quarter-final");
      const sf = ko.filter((m) => m.stage === "semi-final");
      const fin = ko.find((m) => m.stage === "final")!;
      const r16Teams = new Set(r16.flatMap((m) => [m.teamA, m.teamB]));

      // Slot map from the ACTUAL qualifiers (the two group teams in real R16), ordered by
      // computed standing (winner = X1, runner-up = X2).
      const slotTeam: Record<string, string> = {};
      for (const [gid, teamIds] of Object.entries(pack.identity.groups)) {
        const results: MatchResult[] = pack.results
          .filter((m) => m.stage === "group" && m.group === gid)
          .map((m) => ({ homeTeamId: m.teamA, awayTeamId: m.teamB, homeGoals: m.goalsA, awayGoals: m.goalsB }));
        const quals = computeGroupStandings(gid as GroupId, teamIds, results, meta)
          .filter((s) => r16Teams.has(s.teamId))
          .map((s) => s.teamId);
        expect(quals).toHaveLength(2);
        slotTeam[`${gid}1`] = quals[0]!;
        slotTeam[`${gid}2`] = quals[1]!;
      }

      // R16 matchups (group-cross set) reproduced.
      const mineR16 = tree.roundOf16.map(([a, b]) => pair(slotTeam[a]!, slotTeam[b]!)).sort();
      expect(mineR16).toEqual(r16.map((m) => pair(m.teamA, m.teamB)).sort());

      // Feed graph: propagate actual winners through the tree and check QF/SF/final.
      const winBy = (rows: typeof r16) => new Map(rows.map((m) => [pair(m.teamA, m.teamB), m.winner!]));
      const w16 = winBy(r16);
      const r16w = tree.roundOf16.map(([a, b]) => w16.get(pair(slotTeam[a]!, slotTeam[b]!))!);
      const mineQF = tree.quarterFinalFeeds.map(([i, j]) => pair(r16w[i]!, r16w[j]!)).sort();
      expect(mineQF).toEqual(qf.map((m) => pair(m.teamA, m.teamB)).sort());

      const wQF = winBy(qf);
      const qfw = tree.quarterFinalFeeds.map(([i, j]) => wQF.get(pair(r16w[i]!, r16w[j]!))!);
      const mineSF = tree.semiFinalFeeds.map(([i, j]) => pair(qfw[i]!, qfw[j]!)).sort();
      expect(mineSF).toEqual(sf.map((m) => pair(m.teamA, m.teamB)).sort());

      const wSF = winBy(sf);
      const sfw = tree.semiFinalFeeds.map(([i, j]) => wSF.get(pair(qfw[i]!, qfw[j]!))!);
      expect(pair(sfw[0]!, sfw[1]!)).toEqual(pair(fin.teamA, fin.teamB));
    });
  }
});

describe("primary replay: actual-outcome coverage", () => {
  it("names the actual champion and finalists from source-backed data", () => {
    const expected: Record<number, { champion: string; finalists: string[] }> = {
      2010: { champion: "spain", finalists: ["netherlands", "spain"] },
      2014: { champion: "germany", finalists: ["germany", "argentina"] },
      2018: { champion: "france", finalists: ["france", "croatia"] },
      2022: { champion: "argentina", finalists: ["argentina", "france"] },
    };
    for (const t of REPLAY.perTournament) {
      const e = expected[t.tournamentYear]!;
      expect(t.actualChampion).toBe(e.champion);
      expect([...t.actualFinalists].sort()).toEqual([...e.finalists].sort());
    }
  });

  it("reports a finite, valid win probability and rank for each actual champion", () => {
    for (const t of REPLAY.perTournament) {
      for (const v of Object.values(t.byVariant)) {
        expect(Number.isFinite(v.actualChampionWinProbability)).toBe(true);
        expect(v.actualChampionWinProbability).toBeGreaterThanOrEqual(0);
        expect(v.actualChampionWinProbability).toBeLessThanOrEqual(1);
        expect(v.actualChampionRank).toBeGreaterThanOrEqual(1);
        expect(v.actualChampionRank).toBeLessThanOrEqual(v.perTeam.length);
        // The reported champion probability equals the per-team row.
        const row = v.perTeam.find((r) => r.teamId === t.actualChampion)!;
        expect(v.actualChampionWinProbability).toBe(row.win);
      }
    }
  });

  it("reports each actual finalist with a finite final-reach probability", () => {
    for (const t of REPLAY.perTournament) {
      for (const v of Object.values(t.byVariant)) {
        expect(v.actualFinalists.map((f) => f.teamId).sort()).toEqual([...t.actualFinalists].sort());
        for (const f of v.actualFinalists) {
          expect(Number.isFinite(f.reachFinalProbability)).toBe(true);
          expect(f.reachFinalProbability).toBeGreaterThanOrEqual(0);
          expect(f.reachFinalProbability).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe("primary replay: governance and labelling", () => {
  it("pins the exact governance key set, all false except supplementaryOnly", () => {
    expect(Object.keys(REPLAY.governance).sort()).toEqual(
      [
        "calibrationEligible",
        "headlineEligible",
        "lotoEligible",
        "productionEligible",
        "supplementaryOnly",
        "tuningEligible",
      ].sort(),
    );
    expect(REPLAY.governance).toEqual(PRIMARY_REPLAY_GOVERNANCE_FLAGS);
    expect(REPLAY.governance.supplementaryOnly).toBe(true);
    expect(REPLAY.governance.headlineEligible).toBe(false);
    expect(REPLAY.governance.calibrationEligible).toBe(false);
    expect(REPLAY.governance.lotoEligible).toBe(false);
    expect(REPLAY.governance.tuningEligible).toBe(false);
    expect(REPLAY.governance.productionEligible).toBe(false);
  });

  it("labels the view as a supplementary, approximate, not-headline replay", () => {
    expect(REPLAY.cohortLabel).toBe(PRIMARY_REPLAY_DIAGNOSTIC_LABEL);
    const label = REPLAY.cohortLabel.toLowerCase();
    expect(label).toContain("primary historical replay");
    expect(label).toContain("supplementary");
    expect(label).toContain("approximate");
    expect(label).toContain("not headline");
    expect(label).toContain("not calibration");
    expect(label).toContain("not loto");
    // Not-headline status is also enforced structurally.
    expect(REPLAY.governance.headlineEligible).toBe(false);
  });

  it("emits no best-variant / recommendation / calibration / tuning fields", () => {
    const blob = JSON.stringify(REPLAY).toLowerCase();
    expect(blob).not.toContain("bestvariant");
    expect(blob).not.toContain("recommend");
    expect(blob).not.toContain("temperature");
    expect(blob).not.toContain("blended");
  });
});
