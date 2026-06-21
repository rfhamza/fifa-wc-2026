import { describe, expect, it } from "vitest";
import {
  WC2018_PACK,
  WC2018_SOURCE,
  WC2018_NAME_TO_ID,
  WC2018_CONFEDERATION_COUNTS,
} from "@/data/historical/snapshots/wc-2018";
import {
  validateHistoricalPack,
  WC2018_EXPECTATIONS,
} from "@/lib/backtesting/validate-historical";
import { BACKTEST_FORBIDDEN_FIELDS } from "@/lib/backtesting/types";

/**
 * Phase 1.18B-4: validate the derived WC-2018 historical source-pack snapshot
 * (coverage, leakage, team mapping, result consistency, provenance/checksums) and
 * confirm Russia/UEFA host detection via the parameterized validator. No probabilities
 * change; no harness wiring.
 */
const SHA256 = /^[0-9a-f]{64}$/;
const OPENING = new Date(WC2018_PACK.identity.openingKickoff).getTime();

describe("WC-2018 historical pack validates against the contract", () => {
  const result = validateHistoricalPack(WC2018_PACK, {
    ...WC2018_EXPECTATIONS,
    confederationCounts: WC2018_CONFEDERATION_COUNTS,
  });

  it("passes the validator with no errors", () => {
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("covers 32 teams in 8 groups of 4", () => {
    expect(WC2018_PACK.identity.teamIds).toHaveLength(32);
    expect(new Set(WC2018_PACK.identity.teamIds).size).toBe(32);
    const groups = WC2018_PACK.identity.groups;
    expect(Object.keys(groups)).toHaveLength(8);
    for (const g of Object.keys(groups)) expect(groups[g]).toHaveLength(4);
    const flat = Object.values(groups).flat();
    expect(flat).toHaveLength(32);
    expect(new Set(flat)).toEqual(new Set(WC2018_PACK.identity.teamIds));
  });

  it("hosts Russia (UEFA) and Russia is in the team list", () => {
    expect(WC2018_PACK.identity.tournamentYear).toBe(2018);
    expect(WC2018_PACK.identity.hostCountries).toContain("Russia");
    expect(WC2018_PACK.identity.teamIds).toContain("russia");
    expect(WC2018_PACK.identity.confederations.russia).toBe("UEFA");
  });

  it("confederation tally matches the declared counts (UEFA 14 / CONMEBOL 5 / ...)", () => {
    const tally: Record<string, number> = {};
    for (const t of WC2018_PACK.identity.teamIds) {
      const c = WC2018_PACK.identity.confederations[t];
      expect(c).toBeDefined();
      tally[c as string] = (tally[c as string] ?? 0) + 1;
    }
    for (const [conf, n] of Object.entries(WC2018_CONFEDERATION_COUNTS)) {
      expect(tally[conf] ?? 0).toBe(n);
    }
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(32);
    expect(WC2018_CONFEDERATION_COUNTS).toMatchObject({ UEFA: 14, CONMEBOL: 5, CONCACAF: 3, CAF: 5, AFC: 5, OFC: 0 });
  });
});

describe("WC-2018 results are 64 matches (48 group + 16 knockout), outcomes only", () => {
  const results = WC2018_PACK.results;

  it("has 64 matches with unique ids", () => {
    expect(results).toHaveLength(64);
    expect(new Set(results.map((m) => m.matchId)).size).toBe(64);
  });

  it("splits 48 group and 16 knockout matches; each group has 6, each team 3", () => {
    expect(results.filter((m) => m.stage === "group")).toHaveLength(48);
    expect(results.filter((m) => m.stage !== "group")).toHaveLength(16);
    const perGroup: Record<string, number> = {};
    const perTeam: Record<string, number> = {};
    for (const m of results.filter((m) => m.stage === "group")) {
      perGroup[m.group!] = (perGroup[m.group!] ?? 0) + 1;
      perTeam[m.teamA] = (perTeam[m.teamA] ?? 0) + 1;
      perTeam[m.teamB] = (perTeam[m.teamB] ?? 0) + 1;
    }
    expect(Object.values(perGroup)).toEqual([6, 6, 6, 6, 6, 6, 6, 6]);
    expect(new Set(Object.values(perTeam))).toEqual(new Set([3]));
  });

  it("carries group only on group-stage matches", () => {
    for (const m of results) {
      if (m.stage === "group") expect(m.group).toBeDefined();
      else expect(m.group).toBeUndefined();
    }
  });

  it("resultAt90 is consistent with 90-minute goals", () => {
    for (const m of results) {
      const expected = m.goalsA > m.goalsB ? "A" : m.goalsA < m.goalsB ? "B" : "D";
      expect({ id: m.matchId, r: m.resultAt90 }).toEqual({ id: m.matchId, r: expected });
      expect(Number.isInteger(m.goalsA) && m.goalsA >= 0).toBe(true);
      expect(Number.isInteger(m.goalsB) && m.goalsB >= 0).toBe(true);
    }
  });

  it("records extra time / penalties only on knockout matches (penalties => 90' draw, not tied)", () => {
    for (const m of results) {
      if (m.afterExtraTime || m.penalties) expect(m.stage).not.toBe("group");
      if (m.penalties) {
        expect(m.resultAt90).toBe("D");
        expect(m.penalties.a).not.toBe(m.penalties.b);
      }
    }
  });

  it("represents the final correctly as France 4-2 Croatia", () => {
    const final = results.find((m) => m.matchId === "WC2018-064");
    expect(final).toMatchObject({
      stage: "final",
      teamA: "france",
      teamB: "croatia",
      goalsA: 4,
      goalsB: 2,
      resultAt90: "A",
    });
    expect(final?.afterExtraTime).toBeUndefined();
    expect(final?.penalties).toBeUndefined();
  });
});

describe("WC-2018 leakage controls (strictly before opening kickoff)", () => {
  it("opening kickoff is the 2018-06-14 cutoff", () => {
    expect(WC2018_PACK.identity.openingKickoff).toBe("2018-06-14T18:00:00+03:00");
    expect(new Date(WC2018_PACK.identity.openingKickoff).toISOString()).toBe("2018-06-14T15:00:00.000Z");
  });

  it("every Elo asOfDate (2018-06-13) is strictly before the opening kickoff", () => {
    expect(WC2018_PACK.elo).toHaveLength(32);
    for (const r of WC2018_PACK.elo) {
      expect(r.asOfDate).toBe("2018-06-13");
      expect(new Date(r.asOfDate).getTime()).toBeLessThan(OPENING);
    }
  });

  it("every FIFA rankingDate is the pre-tournament 2018-06-07 release (< cutoff)", () => {
    expect(WC2018_PACK.fifa).toHaveLength(32);
    for (const r of WC2018_PACK.fifa) {
      expect(r.rankingDate).toBe("2018-06-07");
      expect(new Date(r.rankingDate).getTime()).toBeLessThan(OPENING);
    }
  });

  it("no proprietary / forbidden fields appear anywhere in the pack", () => {
    const blob = JSON.stringify(WC2018_PACK);
    for (const field of BACKTEST_FORBIDDEN_FIELDS) {
      expect(blob.includes(`"${field}"`)).toBe(false);
    }
  });
});

describe("WC-2018 team mapping resolves in the historical id space", () => {
  it("maps exactly 32 source names to unique historical ids", () => {
    const ids = Object.values(WC2018_NAME_TO_ID);
    expect(ids).toHaveLength(32);
    expect(new Set(ids).size).toBe(32);
  });

  it("all result/elo/fifa teams resolve to identity teams", () => {
    const teamSet = new Set(WC2018_PACK.identity.teamIds);
    for (const m of WC2018_PACK.results) {
      expect(teamSet.has(m.teamA)).toBe(true);
      expect(teamSet.has(m.teamB)).toBe(true);
    }
    expect(new Set(WC2018_PACK.elo.map((r) => r.teamId))).toEqual(teamSet);
    expect(new Set(WC2018_PACK.fifa.map((r) => r.teamId))).toEqual(teamSet);
  });

  it("reuses canonical slugs for shared nations and adds only new historical slugs", () => {
    // shared canonical slugs (in 2026 field or 2022 pack) are reused
    for (const t of ["egypt", "sweden", "panama", "colombia", "uruguay", "england"]) {
      expect(WC2018_PACK.identity.teamIds).toContain(t);
    }
    // genuinely new historical slugs (no canonical id existed)
    for (const t of ["russia", "peru", "iceland", "nigeria"]) {
      expect(WC2018_PACK.identity.teamIds).toContain(t);
    }
  });
});

describe("WC-2018 provenance records checksums; optional packs deferred", () => {
  it("records a SHA-256 for every supplied source file", () => {
    const files = WC2018_SOURCE.files;
    for (const key of ["identity", "results", "elo", "fifa", "readme"]) {
      const entry = files[key];
      expect(entry).toBeDefined();
      expect(entry?.sha256).toMatch(SHA256);
    }
  });

  it("pins the exact supplied checksums", () => {
    expect(WC2018_SOURCE.files.identity?.sha256).toBe(
      "0fcbe98d61db3621832308b38c62fa8f120ddcdac799569633c532830015b21d",
    );
    expect(WC2018_SOURCE.files.results?.sha256).toBe(
      "d906b886bae109f125dc550325f86d79565046360382b442a60bddde11b35ef7",
    );
    expect(WC2018_SOURCE.files.elo?.sha256).toBe(
      "29f72ab76178be1091a66e15c187d41e6cb198cc013b8bd644fcc0e63a7a3f63",
    );
    expect(WC2018_SOURCE.files.fifa?.sha256).toBe(
      "2ad328f42832b9c6ed0b2e54f72067f2fc4032a5b2dea2f70f4c06fe1866fc6b",
    );
    expect(WC2018_SOURCE.files.readme?.sha256).toBe(
      "490dab599b81e837ea240902a13084b90a54e69d56c33c60abee8ebba37e0b1e",
    );
  });

  it("defers optional packs (macro/recentForm empty; no squads/managers)", () => {
    expect(WC2018_PACK.macro).toEqual([]);
    expect(WC2018_PACK.recentForm).toEqual([]);
    expect(WC2018_PACK.squads).toBeUndefined();
    expect(WC2018_PACK.managers).toBeUndefined();
  });
});
