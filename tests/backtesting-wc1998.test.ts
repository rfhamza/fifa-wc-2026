import { describe, expect, it } from "vitest";
import {
  WC1998_PACK,
  WC1998_SOURCE,
  WC1998_NAME_TO_ID,
  WC1998_CONFEDERATION_COUNTS,
} from "@/data/historical/snapshots/wc-1998";
import {
  validateHistoricalPack,
  WC1998_EXPECTATIONS,
} from "@/lib/backtesting/validate-historical";
import { BACKTEST_FORBIDDEN_FIELDS } from "@/lib/backtesting/types";

/**
 * Phase 1.19D (STRETCH): validate the derived WC-1998 historical source-pack snapshot
 * (coverage, leakage, team mapping, result consistency, provenance/checksums) and the
 * two era-specific risks: the FR Yugoslavia historical-only identity (distinct from
 * modern serbia and from serbia-and-montenegro) and GOLDEN-GOAL knockouts. First
 * 32-team World Cup; single host France/UEFA. Stretch evidence only: no probabilities
 * change, no harness wiring, no primary four-tournament diagnostic headline change.
 */
const SHA256 = /^[0-9a-f]{64}$/;
const OPENING = new Date(WC1998_PACK.identity.openingKickoff).getTime();

describe("WC-1998 historical pack validates against the contract", () => {
  const result = validateHistoricalPack(WC1998_PACK, WC1998_EXPECTATIONS);

  it("passes the validator with no errors", () => {
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("covers 32 teams in 8 groups of 4", () => {
    expect(WC1998_PACK.identity.teamIds).toHaveLength(32);
    expect(new Set(WC1998_PACK.identity.teamIds).size).toBe(32);
    const groups = WC1998_PACK.identity.groups;
    expect(Object.keys(groups)).toHaveLength(8);
    for (const g of Object.keys(groups)) expect(groups[g]).toHaveLength(4);
    const flat = Object.values(groups).flat();
    expect(flat).toHaveLength(32);
    expect(new Set(flat)).toEqual(new Set(WC1998_PACK.identity.teamIds));
  });

  it("has no duplicate team slugs", () => {
    const ids = WC1998_PACK.identity.teamIds;
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("hosts France (UEFA), single host", () => {
    expect(WC1998_PACK.identity.tournamentYear).toBe(1998);
    expect(WC1998_PACK.identity.hostCountries).toEqual(["France"]);
    expect(WC1998_PACK.identity.teamIds).toContain("france");
    expect(WC1998_PACK.identity.confederations["france"]).toBe("UEFA");
  });

  it("confederation tally matches the declared counts (UEFA 15 / CONMEBOL 5 / OFC 0 / ...)", () => {
    const tally: Record<string, number> = {};
    for (const t of WC1998_PACK.identity.teamIds) {
      const c = WC1998_PACK.identity.confederations[t];
      expect(c).toBeDefined();
      tally[c as string] = (tally[c as string] ?? 0) + 1;
    }
    for (const [conf, n] of Object.entries(WC1998_CONFEDERATION_COUNTS)) {
      expect(tally[conf] ?? 0).toBe(n);
    }
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(32);
    expect(WC1998_CONFEDERATION_COUNTS).toMatchObject({ UEFA: 15, CONMEBOL: 5, CONCACAF: 3, CAF: 5, AFC: 4 });
    expect(WC1998_CONFEDERATION_COUNTS.OFC ?? 0).toBe(0);
  });
});

describe("WC-1998 results are 64 matches (48 group + 16 knockout), outcomes only", () => {
  const results = WC1998_PACK.results;

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

  it("has the expected per-stage knockout counts (R16 8 / QF 4 / SF 2 / 3rd 1 / final 1)", () => {
    const byStage: Record<string, number> = {};
    for (const m of results) byStage[m.stage] = (byStage[m.stage] ?? 0) + 1;
    expect(byStage).toMatchObject({
      group: 48,
      "round-of-16": 8,
      "quarter-final": 4,
      "semi-final": 2,
      "third-place": 1,
      final: 1,
    });
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

  it("final-score goal total across raw match rows is 171 (90' + ET goals)", () => {
    // The 90' snapshot goals plus the extra-time goals scored in ET matches must equal
    // the source's final-score goal total (171). ET-only matches advanced by exactly the
    // ET goals; shootout penalties are NOT goals.
    let total = 0;
    for (const m of WC1998_PACK.results) total += m.goalsA + m.goalsB;
    // Extra-time goals (golden goals + the France-Croatia... no): sum of after-ET deltas.
    // France 1-0 Paraguay (+1), Argentina 2-2 England (0 ET goals), Italy 0-0 France (0),
    // Brazil 1-1 Netherlands (0). So 90' total + 1 = 171.
    expect(total + 1).toBe(171);
  });

  it("final known check: Brazil 0-3 France at 90 (teamA Brazil, teamB France), no ET/pens, France win", () => {
    const final = results.find((m) => m.matchId === "1998-064");
    expect(final).toMatchObject({
      stage: "final", teamA: "brazil", teamB: "france",
      goalsA: 0, goalsB: 3, resultAt90: "B",
    });
    expect(final?.afterExtraTime).toBeUndefined();
    expect(final?.penalties).toBeUndefined();
  });
});

describe("WC-1998 golden-goal & penalty exemplars", () => {
  const find = (mid: string) => WC1998_PACK.results.find((m) => m.matchId === mid);

  it("golden goal: France 0-0 Paraguay at 90 (France win 1-0 AET, no penalties)", () => {
    expect(find("1998-052")).toMatchObject({
      teamA: "france", teamB: "paraguay", goalsA: 0, goalsB: 0, resultAt90: "D", afterExtraTime: true,
    });
    expect(find("1998-052")?.penalties).toBeUndefined();
  });

  it("penalty: Argentina 2-2 England at 90; Argentina win 4-3 on penalties", () => {
    expect(find("1998-055")).toMatchObject({
      teamA: "argentina", teamB: "england", goalsA: 2, goalsB: 2, resultAt90: "D",
      afterExtraTime: true, penalties: { a: 4, b: 3 },
    });
  });

  it("penalty: Italy 0-0 France at 90; France win 4-3 on penalties", () => {
    expect(find("1998-057")).toMatchObject({
      teamA: "italy", teamB: "france", goalsA: 0, goalsB: 0, resultAt90: "D",
      afterExtraTime: true, penalties: { a: 3, b: 4 },
    });
  });

  it("penalty: Brazil 1-1 Netherlands at 90; Brazil win 4-2 on penalties", () => {
    expect(find("1998-061")).toMatchObject({
      teamA: "brazil", teamB: "netherlands", goalsA: 1, goalsB: 1, resultAt90: "D",
      afterExtraTime: true, penalties: { a: 4, b: 2 },
    });
  });
});

describe("WC-1998 leakage controls (strictly before opening kickoff)", () => {
  it("opening kickoff is the 1998-06-10 CEST cutoff", () => {
    expect(WC1998_PACK.identity.openingKickoff).toBe("1998-06-10T17:30:00+02:00");
    expect(new Date(WC1998_PACK.identity.openingKickoff).toISOString()).toBe("1998-06-10T15:30:00.000Z");
  });

  it("every Elo asOfDate is the exact 1998-06-09 snapshot (< cutoff)", () => {
    expect(WC1998_PACK.elo).toHaveLength(32);
    for (const r of WC1998_PACK.elo) {
      expect(r.asOfDate).toBe("1998-06-09");
      expect(new Date(r.asOfDate).getTime()).toBeLessThan(OPENING);
    }
  });

  it("every FIFA rankingDate is the exact pre-tournament 1998-05-20 release (< cutoff)", () => {
    expect(WC1998_PACK.fifa).toHaveLength(32);
    for (const r of WC1998_PACK.fifa) {
      expect(r.rankingDate).toBe("1998-05-20");
      expect(new Date(r.rankingDate).getTime()).toBeLessThan(OPENING);
    }
  });

  it("no Elo / FIFA rows are missing for any team", () => {
    const teamSet = new Set(WC1998_PACK.identity.teamIds);
    expect(new Set(WC1998_PACK.elo.map((r) => r.teamId))).toEqual(teamSet);
    expect(new Set(WC1998_PACK.fifa.map((r) => r.teamId))).toEqual(teamSet);
  });

  it("no proprietary / forbidden fields appear anywhere in the pack", () => {
    const blob = JSON.stringify(WC1998_PACK);
    for (const field of BACKTEST_FORBIDDEN_FIELDS) {
      expect(blob.includes(`"${field}"`)).toBe(false);
    }
  });
});

describe("WC-1998 team mapping / slug governance (historical id space)", () => {
  it("maps Yugoslavia / FR Yugoslavia to the HISTORICAL-ONLY fr-yugoslavia slug", () => {
    expect(WC1998_NAME_TO_ID["Yugoslavia"]).toBe("fr-yugoslavia");
    expect(WC1998_NAME_TO_ID["FR Yugoslavia"]).toBe("fr-yugoslavia");
    expect(WC1998_PACK.identity.teamIds).toContain("fr-yugoslavia");
    expect(WC1998_PACK.identity.confederations["fr-yugoslavia"]).toBe("UEFA");
  });

  it("keeps fr-yugoslavia DISTINCT from modern serbia and from serbia-and-montenegro", () => {
    expect("fr-yugoslavia").not.toBe("serbia");
    expect("fr-yugoslavia").not.toBe("serbia-and-montenegro");
    expect(WC1998_PACK.identity.teamIds).not.toContain("serbia");
    expect(WC1998_PACK.identity.teamIds).not.toContain("serbia-and-montenegro");
    expect(Object.values(WC1998_NAME_TO_ID)).not.toContain("serbia");
    expect(Object.values(WC1998_NAME_TO_ID)).not.toContain("serbia-and-montenegro");
  });

  it("maps South Korea / Korea Republic to south-korea and United States to usa", () => {
    expect(WC1998_NAME_TO_ID["South Korea"]).toBe("south-korea");
    expect(WC1998_NAME_TO_ID["Korea Republic"]).toBe("south-korea");
    expect(WC1998_NAME_TO_ID["United States"]).toBe("usa");
    expect(WC1998_NAME_TO_ID["USA"]).toBe("usa");
    expect(WC1998_PACK.identity.teamIds).toContain("usa");
  });

  it("reuses canonical slugs (incl. scotland/norway/austria) and adds clean new slugs", () => {
    for (const t of ["france", "brazil", "scotland", "norway", "austria", "south-korea",
      "usa", "croatia", "denmark", "paraguay", "morocco", "nigeria", "cameroon", "saudi-arabia"]) {
      expect(WC1998_PACK.identity.teamIds).toContain(t);
    }
    for (const t of ["bulgaria", "chile", "colombia", "jamaica", "romania", "fr-yugoslavia"]) {
      expect(WC1998_PACK.identity.teamIds).toContain(t);
    }
  });

  it("host France maps to france", () => {
    expect(WC1998_NAME_TO_ID["France"]).toBe("france");
  });

  it("all result/elo/fifa teams resolve to identity teams", () => {
    const teamSet = new Set(WC1998_PACK.identity.teamIds);
    for (const m of WC1998_PACK.results) {
      expect(teamSet.has(m.teamA)).toBe(true);
      expect(teamSet.has(m.teamB)).toBe(true);
    }
    expect(new Set(WC1998_PACK.elo.map((r) => r.teamId))).toEqual(teamSet);
    expect(new Set(WC1998_PACK.fifa.map((r) => r.teamId))).toEqual(teamSet);
  });
});

describe("WC-1998 provenance records checksums; FIFA uniqueness not asserted; optional packs deferred", () => {
  it("records a SHA-256 for every supplied source file", () => {
    const files = WC1998_SOURCE.files;
    for (const key of ["identity", "results", "elo", "fifa", "readme"]) {
      const entry = files[key];
      expect(entry).toBeDefined();
      expect(entry?.sha256).toMatch(SHA256);
    }
  });

  it("pins the exact supplied checksums", () => {
    expect(WC1998_SOURCE.files.identity?.sha256).toBe(
      "36f6bdfb85be90929478ae8d2e971865673a0e8df8f13eaae3697852054c32e8",
    );
    expect(WC1998_SOURCE.files.results?.sha256).toBe(
      "050dbcfef720a680a78148ae9283202de5a0b4f9562111eb4f92a659aff2d17f",
    );
    expect(WC1998_SOURCE.files.elo?.sha256).toBe(
      "1d0dda7bb5d1530517e5c03095843358c2f76961d740272b4e88db6d7f73235e",
    );
    expect(WC1998_SOURCE.files.fifa?.sha256).toBe(
      "d397577c0cc2c75752a39f56ef22c3c117ce40c3032a257a2e62240dd0d94d54",
    );
    expect(WC1998_SOURCE.files.readme?.sha256).toBe(
      "03e45912d0712cbd163d1a5a3ca25c6951da6d5669ec9513a1e0f01f901dff12",
    );
  });

  it("treats FIFA ranks as positive integers without asserting uniqueness (general rule)", () => {
    for (const r of WC1998_PACK.fifa) {
      expect(Number.isInteger(r.rank) && r.rank >= 1).toBe(true);
    }
  });

  it("defers optional packs (macro/recentForm empty; no squads/managers)", () => {
    expect(WC1998_PACK.macro).toEqual([]);
    expect(WC1998_PACK.recentForm).toEqual([]);
    expect(WC1998_PACK.squads).toBeUndefined();
    expect(WC1998_PACK.managers).toBeUndefined();
  });
});
