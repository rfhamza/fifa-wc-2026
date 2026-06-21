import { describe, expect, it } from "vitest";
import {
  WC2010_PACK,
  WC2010_SOURCE,
  WC2010_NAME_TO_ID,
  WC2010_CONFEDERATION_COUNTS,
} from "@/data/historical/snapshots/wc-2010";
import {
  validateHistoricalPack,
  WC2010_EXPECTATIONS,
} from "@/lib/backtesting/validate-historical";
import { BACKTEST_FORBIDDEN_FIELDS } from "@/lib/backtesting/types";

/**
 * Phase 1.18B-8: validate the derived WC-2010 historical source-pack snapshot
 * (coverage, leakage, team mapping, result consistency, provenance/checksums) and
 * confirm South Africa/CAF host detection, OFC=1 New Zealand, and a DISTINCT
 * north-korea / south-korea mapping. No probabilities change; no harness wiring.
 */
const SHA256 = /^[0-9a-f]{64}$/;
const OPENING = new Date(WC2010_PACK.identity.openingKickoff).getTime();

describe("WC-2010 historical pack validates against the contract", () => {
  const result = validateHistoricalPack(WC2010_PACK, WC2010_EXPECTATIONS);

  it("passes the validator with no errors", () => {
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("covers 32 teams in 8 groups of 4", () => {
    expect(WC2010_PACK.identity.teamIds).toHaveLength(32);
    expect(new Set(WC2010_PACK.identity.teamIds).size).toBe(32);
    const groups = WC2010_PACK.identity.groups;
    expect(Object.keys(groups)).toHaveLength(8);
    for (const g of Object.keys(groups)) expect(groups[g]).toHaveLength(4);
    const flat = Object.values(groups).flat();
    expect(flat).toHaveLength(32);
    expect(new Set(flat)).toEqual(new Set(WC2010_PACK.identity.teamIds));
  });

  it("hosts South Africa (CAF) and South Africa is in the team list", () => {
    expect(WC2010_PACK.identity.tournamentYear).toBe(2010);
    expect(WC2010_PACK.identity.hostCountries).toContain("South Africa");
    expect(WC2010_PACK.identity.teamIds).toContain("south-africa");
    expect(WC2010_PACK.identity.confederations["south-africa"]).toBe("CAF");
  });

  it("confederation tally matches the declared counts (UEFA 13 / CAF 6 / OFC 1 / ...)", () => {
    const tally: Record<string, number> = {};
    for (const t of WC2010_PACK.identity.teamIds) {
      const c = WC2010_PACK.identity.confederations[t];
      expect(c).toBeDefined();
      tally[c as string] = (tally[c as string] ?? 0) + 1;
    }
    for (const [conf, n] of Object.entries(WC2010_CONFEDERATION_COUNTS)) {
      expect(tally[conf] ?? 0).toBe(n);
    }
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(32);
    expect(WC2010_CONFEDERATION_COUNTS).toMatchObject({ UEFA: 13, CONMEBOL: 5, CONCACAF: 3, CAF: 6, AFC: 4, OFC: 1 });
  });

  it("OFC count is 1 and New Zealand maps to OFC", () => {
    expect(WC2010_CONFEDERATION_COUNTS.OFC).toBe(1);
    expect(WC2010_PACK.identity.teamIds).toContain("new-zealand");
    expect(WC2010_PACK.identity.confederations["new-zealand"]).toBe("OFC");
  });
});

describe("WC-2010 results are 64 matches (48 group + 16 knockout), outcomes only", () => {
  const results = WC2010_PACK.results;

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

  it("resultAt90 is consistent with the 90-minute goals", () => {
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
        expect(Number.isInteger(m.penalties.a) && Number.isInteger(m.penalties.b)).toBe(true);
      }
    }
  });

  it("derived goalsA/goalsB use the 90-minute score, not the after-ET score", () => {
    // USA-Ghana finished 1-2 after ET but was 1-1 at 90.
    const usaGhana = results.find((m) => m.matchId === "wc2010-50");
    expect(usaGhana).toMatchObject({
      teamA: "usa", teamB: "ghana", goalsA: 1, goalsB: 1, resultAt90: "D", afterExtraTime: true,
    });
    expect(usaGhana?.penalties).toBeUndefined();
  });

  it("preserves the known ET / penalty cases", () => {
    // Paraguay 0-0 Japan, pens 5-3
    expect(results.find((m) => m.matchId === "wc2010-55")).toMatchObject({
      teamA: "paraguay", teamB: "japan", goalsA: 0, goalsB: 0, resultAt90: "D",
      afterExtraTime: true, penalties: { a: 5, b: 3 },
    });
    // Uruguay 1-1 Ghana, pens 4-2
    expect(results.find((m) => m.matchId === "wc2010-58")).toMatchObject({
      teamA: "uruguay", teamB: "ghana", goalsA: 1, goalsB: 1, resultAt90: "D",
      afterExtraTime: true, penalties: { a: 4, b: 2 },
    });
  });

  it("represents the final correctly: Netherlands 0-1 Spain AET (0-0 at 90, resultAt90 draw)", () => {
    const final = results.find((m) => m.matchId === "wc2010-64");
    expect(final).toMatchObject({
      stage: "final", teamA: "netherlands", teamB: "spain",
      goalsA: 0, goalsB: 0, resultAt90: "D", afterExtraTime: true,
    });
    expect(final?.penalties).toBeUndefined();
  });
});

describe("WC-2010 leakage controls (strictly before opening kickoff)", () => {
  it("opening kickoff is the 2010-06-11 cutoff", () => {
    expect(WC2010_PACK.identity.openingKickoff).toBe("2010-06-11T16:00:00+02:00");
    expect(new Date(WC2010_PACK.identity.openingKickoff).toISOString()).toBe("2010-06-11T14:00:00.000Z");
  });

  it("every Elo asOfDate (2010-06-10) is strictly before the opening kickoff", () => {
    expect(WC2010_PACK.elo).toHaveLength(32);
    for (const r of WC2010_PACK.elo) {
      expect(r.asOfDate).toBe("2010-06-10");
      expect(new Date(r.asOfDate).getTime()).toBeLessThan(OPENING);
    }
  });

  it("every FIFA rankingDate is the exact pre-tournament 2010-05-26 release (< cutoff)", () => {
    expect(WC2010_PACK.fifa).toHaveLength(32);
    for (const r of WC2010_PACK.fifa) {
      expect(r.rankingDate).toBe("2010-05-26");
      expect(new Date(r.rankingDate).getTime()).toBeLessThan(OPENING);
    }
  });

  it("no proprietary / forbidden fields appear anywhere in the pack", () => {
    const blob = JSON.stringify(WC2010_PACK);
    for (const field of BACKTEST_FORBIDDEN_FIELDS) {
      expect(blob.includes(`"${field}"`)).toBe(false);
    }
  });
});

describe("WC-2010 team mapping resolves in the historical id space", () => {
  it("maps North Korea and South Korea to DISTINCT slugs", () => {
    expect(WC2010_NAME_TO_ID["North Korea"]).toBe("north-korea");
    expect(WC2010_NAME_TO_ID["South Korea"]).toBe("south-korea");
    expect(WC2010_NAME_TO_ID["Korea DPR"]).toBe("north-korea");
    expect(WC2010_NAME_TO_ID["Korea Republic"]).toBe("south-korea");
    expect(WC2010_PACK.identity.teamIds).toContain("north-korea");
    expect(WC2010_PACK.identity.teamIds).toContain("south-korea");
    expect(WC2010_PACK.identity.confederations["north-korea"]).toBe("AFC");
    expect(WC2010_PACK.identity.confederations["south-korea"]).toBe("AFC");
  });

  it("Côte d'Ivoire resolves to the canonical ivory-coast slug", () => {
    expect(WC2010_NAME_TO_ID["Côte d'Ivoire"]).toBe("ivory-coast");
    expect(WC2010_PACK.identity.teamIds).toContain("ivory-coast");
  });

  it("all result/elo/fifa teams resolve to identity teams", () => {
    const teamSet = new Set(WC2010_PACK.identity.teamIds);
    for (const m of WC2010_PACK.results) {
      expect(teamSet.has(m.teamA)).toBe(true);
      expect(teamSet.has(m.teamB)).toBe(true);
    }
    expect(new Set(WC2010_PACK.elo.map((r) => r.teamId))).toEqual(teamSet);
    expect(new Set(WC2010_PACK.fifa.map((r) => r.teamId))).toEqual(teamSet);
  });

  it("reuses canonical slugs for shared nations and adds only new historical slugs", () => {
    for (const t of ["south-africa", "new-zealand", "ivory-coast", "usa", "ghana", "brazil"]) {
      expect(WC2010_PACK.identity.teamIds).toContain(t);
    }
    for (const t of ["slovenia", "slovakia", "north-korea"]) {
      expect(WC2010_PACK.identity.teamIds).toContain(t);
    }
  });
});

describe("WC-2010 provenance records checksums; optional packs deferred", () => {
  it("records a SHA-256 for every supplied source file", () => {
    const files = WC2010_SOURCE.files;
    for (const key of ["identity", "results", "elo", "fifa", "readme"]) {
      const entry = files[key];
      expect(entry).toBeDefined();
      expect(entry?.sha256).toMatch(SHA256);
    }
  });

  it("pins the exact supplied checksums", () => {
    expect(WC2010_SOURCE.files.identity?.sha256).toBe(
      "8d3ad67b4036a70d119f6a9ccfc8369bf110bf839f93a7b2ccae9f58e8fe1d83",
    );
    expect(WC2010_SOURCE.files.results?.sha256).toBe(
      "5a81a98909e6a2779056702966efe805aa5bb3e671cadc7841e01ef77b1d018a",
    );
    expect(WC2010_SOURCE.files.elo?.sha256).toBe(
      "90f6f9524f41a407c6bb8005addecde81ab223872f14f33d4dec8e40f67a640f",
    );
    expect(WC2010_SOURCE.files.fifa?.sha256).toBe(
      "9d7d4cddbb14efc741f47347674d3d8221c391175fd2da4b97d9dff8c8593c1d",
    );
    expect(WC2010_SOURCE.files.readme?.sha256).toBe(
      "d70777bcbe9ff7da9715d643f68bfc0fb88a82300e0183351b427db611aa342a",
    );
  });

  it("defers optional packs (macro/recentForm empty; no squads/managers)", () => {
    expect(WC2010_PACK.macro).toEqual([]);
    expect(WC2010_PACK.recentForm).toEqual([]);
    expect(WC2010_PACK.squads).toBeUndefined();
    expect(WC2010_PACK.managers).toBeUndefined();
  });
});
