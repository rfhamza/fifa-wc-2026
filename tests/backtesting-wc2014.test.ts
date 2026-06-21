import { describe, expect, it } from "vitest";
import {
  WC2014_PACK,
  WC2014_SOURCE,
  WC2014_NAME_TO_ID,
  WC2014_CONFEDERATION_COUNTS,
} from "@/data/historical/snapshots/wc-2014";
import {
  validateHistoricalPack,
  WC2014_EXPECTATIONS,
} from "@/lib/backtesting/validate-historical";
import { BACKTEST_FORBIDDEN_FIELDS } from "@/lib/backtesting/types";

/**
 * Phase 1.18B-6: validate the derived WC-2014 historical source-pack snapshot
 * (coverage, leakage, team mapping, result consistency, provenance/checksums) and
 * confirm Brazil/CONMEBOL host detection via the parameterized validator. No
 * probabilities change; no harness wiring.
 */
const SHA256 = /^[0-9a-f]{64}$/;
const OPENING = new Date(WC2014_PACK.identity.openingKickoff).getTime();

describe("WC-2014 historical pack validates against the contract", () => {
  const result = validateHistoricalPack(WC2014_PACK, WC2014_EXPECTATIONS);

  it("passes the validator with no errors", () => {
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("covers 32 teams in 8 groups of 4", () => {
    expect(WC2014_PACK.identity.teamIds).toHaveLength(32);
    expect(new Set(WC2014_PACK.identity.teamIds).size).toBe(32);
    const groups = WC2014_PACK.identity.groups;
    expect(Object.keys(groups)).toHaveLength(8);
    for (const g of Object.keys(groups)) expect(groups[g]).toHaveLength(4);
    const flat = Object.values(groups).flat();
    expect(flat).toHaveLength(32);
    expect(new Set(flat)).toEqual(new Set(WC2014_PACK.identity.teamIds));
  });

  it("hosts Brazil (CONMEBOL) and Brazil is in the team list", () => {
    expect(WC2014_PACK.identity.tournamentYear).toBe(2014);
    expect(WC2014_PACK.identity.hostCountries).toContain("Brazil");
    expect(WC2014_PACK.identity.teamIds).toContain("brazil");
    expect(WC2014_PACK.identity.confederations.brazil).toBe("CONMEBOL");
  });

  it("confederation tally matches the declared counts (UEFA 13 / CONMEBOL 6 / ...)", () => {
    const tally: Record<string, number> = {};
    for (const t of WC2014_PACK.identity.teamIds) {
      const c = WC2014_PACK.identity.confederations[t];
      expect(c).toBeDefined();
      tally[c as string] = (tally[c as string] ?? 0) + 1;
    }
    for (const [conf, n] of Object.entries(WC2014_CONFEDERATION_COUNTS)) {
      expect(tally[conf] ?? 0).toBe(n);
    }
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(32);
    expect(WC2014_CONFEDERATION_COUNTS).toMatchObject({ UEFA: 13, CONMEBOL: 6, CONCACAF: 4, CAF: 5, AFC: 4 });
  });
});

describe("WC-2014 results are 64 matches (48 group + 16 knockout), outcomes only", () => {
  const results = WC2014_PACK.results;

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

  it("derived goalsA/goalsB use the 90-minute score, not the after-ET score", () => {
    // wc2014-54 (Germany-Algeria) finished 2-1 after ET but was 0-0 at 90.
    const ger = results.find((m) => m.matchId === "wc2014-54");
    expect(ger).toMatchObject({ goalsA: 0, goalsB: 0, resultAt90: "D", afterExtraTime: true });
    expect(ger?.penalties).toBeUndefined();
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

  it("represents the final correctly: Germany 1-0 Argentina AET (0-0 at 90, resultAt90 draw)", () => {
    const final = results.find((m) => m.matchId === "wc2014-64");
    expect(final).toMatchObject({
      stage: "final",
      teamA: "germany",
      teamB: "argentina",
      goalsA: 0,
      goalsB: 0,
      resultAt90: "D",
      afterExtraTime: true,
    });
    expect(final?.penalties).toBeUndefined();
  });
});

describe("WC-2014 leakage controls (strictly before opening kickoff)", () => {
  it("opening kickoff is the 2014-06-12 cutoff", () => {
    expect(WC2014_PACK.identity.openingKickoff).toBe("2014-06-12T17:00:00-03:00");
    expect(new Date(WC2014_PACK.identity.openingKickoff).toISOString()).toBe("2014-06-12T20:00:00.000Z");
  });

  it("every Elo asOfDate (2014-06-11) is strictly before the opening kickoff", () => {
    expect(WC2014_PACK.elo).toHaveLength(32);
    for (const r of WC2014_PACK.elo) {
      expect(r.asOfDate).toBe("2014-06-11");
      expect(new Date(r.asOfDate).getTime()).toBeLessThan(OPENING);
    }
  });

  it("every FIFA rankingDate is the pre-tournament 2014-06-05 release (< cutoff)", () => {
    expect(WC2014_PACK.fifa).toHaveLength(32);
    for (const r of WC2014_PACK.fifa) {
      expect(r.rankingDate).toBe("2014-06-05");
      expect(new Date(r.rankingDate).getTime()).toBeLessThan(OPENING);
    }
  });

  it("no proprietary / forbidden fields appear anywhere in the pack", () => {
    const blob = JSON.stringify(WC2014_PACK);
    for (const field of BACKTEST_FORBIDDEN_FIELDS) {
      expect(blob.includes(`"${field}"`)).toBe(false);
    }
  });
});

describe("WC-2014 team mapping resolves in the historical id space", () => {
  it("maps source names (incl. aliases) to unique historical ids covering 32 teams", () => {
    expect(new Set(WC2014_PACK.identity.teamIds).size).toBe(32);
    // Côte d'Ivoire resolves to the canonical ivory-coast slug
    expect(WC2014_NAME_TO_ID["Côte d'Ivoire"]).toBe("ivory-coast");
    expect(WC2014_PACK.identity.teamIds).toContain("ivory-coast");
  });

  it("all result/elo/fifa teams resolve to identity teams", () => {
    const teamSet = new Set(WC2014_PACK.identity.teamIds);
    for (const m of WC2014_PACK.results) {
      expect(teamSet.has(m.teamA)).toBe(true);
      expect(teamSet.has(m.teamB)).toBe(true);
    }
    expect(new Set(WC2014_PACK.elo.map((r) => r.teamId))).toEqual(teamSet);
    expect(new Set(WC2014_PACK.fifa.map((r) => r.teamId))).toEqual(teamSet);
  });

  it("reuses canonical slugs for shared nations and adds only new historical slugs", () => {
    for (const t of ["brazil", "ivory-coast", "bosnia-herzegovina", "usa", "russia", "nigeria"]) {
      expect(WC2014_PACK.identity.teamIds).toContain(t);
    }
    for (const t of ["chile", "greece", "italy", "honduras"]) {
      expect(WC2014_PACK.identity.teamIds).toContain(t);
    }
  });
});

describe("WC-2014 provenance records checksums; optional packs deferred", () => {
  it("records a SHA-256 for every supplied source file", () => {
    const files = WC2014_SOURCE.files;
    for (const key of ["identity", "results", "elo", "fifa", "readme"]) {
      const entry = files[key];
      expect(entry).toBeDefined();
      expect(entry?.sha256).toMatch(SHA256);
    }
  });

  it("pins the exact supplied checksums", () => {
    expect(WC2014_SOURCE.files.identity?.sha256).toBe(
      "c49a6116449ac9ffdbf187bd03bf69decb590e0d7d4a8327518bac64a8fea934",
    );
    expect(WC2014_SOURCE.files.results?.sha256).toBe(
      "1d92cddda92ed6b0d9be06a4c72e3f54630760f152a19a438724780a5946f411",
    );
    expect(WC2014_SOURCE.files.elo?.sha256).toBe(
      "c6111018d1b1094b9003947af8ac83407acb96096fa84c8e8897340a41f209cc",
    );
    expect(WC2014_SOURCE.files.fifa?.sha256).toBe(
      "b542eadedb1fd7ee82935e61d3d73db5d53913318ff90ac88bff6122051b5e44",
    );
    expect(WC2014_SOURCE.files.readme?.sha256).toBe(
      "70b7a7ada2021f75df5756d44f569af6055d03bec5f437c8b9b1afac56d8be87",
    );
  });

  it("defers optional packs (macro/recentForm empty; no squads/managers)", () => {
    expect(WC2014_PACK.macro).toEqual([]);
    expect(WC2014_PACK.recentForm).toEqual([]);
    expect(WC2014_PACK.squads).toBeUndefined();
    expect(WC2014_PACK.managers).toBeUndefined();
  });
});
