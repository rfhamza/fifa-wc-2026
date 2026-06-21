import { describe, expect, it } from "vitest";
import {
  WC2006_PACK,
  WC2006_SOURCE,
  WC2006_NAME_TO_ID,
  WC2006_CONFEDERATION_COUNTS,
} from "@/data/historical/snapshots/wc-2006";
import {
  validateHistoricalPack,
  WC2006_EXPECTATIONS,
} from "@/lib/backtesting/validate-historical";
import { BACKTEST_FORBIDDEN_FIELDS } from "@/lib/backtesting/types";

/**
 * Phase 1.19B (STRETCH): validate the derived WC-2006 historical source-pack snapshot
 * (coverage, leakage, team mapping, result consistency, provenance/checksums) and
 * confirm Germany/UEFA host detection, OFC=1 Australia (source-pack convention), the
 * HISTORICAL-ONLY serbia-and-montenegro slug (distinct from modern serbia), and the
 * Czech Republic -> czechia (reuse) decision. Stretch evidence only: no probabilities
 * change, no harness wiring, no primary four-tournament diagnostic headline change.
 */
const SHA256 = /^[0-9a-f]{64}$/;
const OPENING = new Date(WC2006_PACK.identity.openingKickoff).getTime();

describe("WC-2006 historical pack validates against the contract", () => {
  const result = validateHistoricalPack(WC2006_PACK, WC2006_EXPECTATIONS);

  it("passes the validator with no errors", () => {
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("covers 32 teams in 8 groups of 4", () => {
    expect(WC2006_PACK.identity.teamIds).toHaveLength(32);
    expect(new Set(WC2006_PACK.identity.teamIds).size).toBe(32);
    const groups = WC2006_PACK.identity.groups;
    expect(Object.keys(groups)).toHaveLength(8);
    for (const g of Object.keys(groups)) expect(groups[g]).toHaveLength(4);
    const flat = Object.values(groups).flat();
    expect(flat).toHaveLength(32);
    expect(new Set(flat)).toEqual(new Set(WC2006_PACK.identity.teamIds));
  });

  it("has no duplicate team slugs", () => {
    const ids = WC2006_PACK.identity.teamIds;
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("hosts Germany (UEFA) and Germany is in the team list", () => {
    expect(WC2006_PACK.identity.tournamentYear).toBe(2006);
    expect(WC2006_PACK.identity.hostCountries).toContain("Germany");
    expect(WC2006_PACK.identity.teamIds).toContain("germany");
    expect(WC2006_PACK.identity.confederations["germany"]).toBe("UEFA");
  });

  it("confederation tally matches the declared counts (UEFA 14 / CAF 5 / OFC 1 / ...)", () => {
    const tally: Record<string, number> = {};
    for (const t of WC2006_PACK.identity.teamIds) {
      const c = WC2006_PACK.identity.confederations[t];
      expect(c).toBeDefined();
      tally[c as string] = (tally[c as string] ?? 0) + 1;
    }
    for (const [conf, n] of Object.entries(WC2006_CONFEDERATION_COUNTS)) {
      expect(tally[conf] ?? 0).toBe(n);
    }
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(32);
    expect(WC2006_CONFEDERATION_COUNTS).toMatchObject({ UEFA: 14, CONMEBOL: 4, CONCACAF: 4, CAF: 5, AFC: 4, OFC: 1 });
  });

  it("pins the Australia confederation decision: OFC (source-pack allocation), sole OFC entrant", () => {
    expect(WC2006_CONFEDERATION_COUNTS.OFC).toBe(1);
    expect(WC2006_PACK.identity.teamIds).toContain("australia");
    expect(WC2006_PACK.identity.confederations["australia"]).toBe("OFC");
    const ofc = WC2006_PACK.identity.teamIds.filter(
      (t) => WC2006_PACK.identity.confederations[t] === "OFC",
    );
    expect(ofc).toEqual(["australia"]);
  });
});

describe("WC-2006 results are 64 matches (48 group + 16 knockout), outcomes only", () => {
  const results = WC2006_PACK.results;

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

  it("derived goalsA/goalsB use the 90-minute score, not the after-ET score", () => {
    // Argentina 2-1 Mexico after ET but 1-1 at 90.
    const argMex = results.find((m) => m.matchId === "wc2006-50");
    expect(argMex).toMatchObject({
      teamA: "argentina", teamB: "mexico", goalsA: 1, goalsB: 1, resultAt90: "D", afterExtraTime: true,
    });
    expect(argMex?.penalties).toBeUndefined();
    // Germany 0-2 Italy after ET but 0-0 at 90 (semi-final, no shootout).
    const gerIta = results.find((m) => m.matchId === "wc2006-61");
    expect(gerIta).toMatchObject({
      teamA: "germany", teamB: "italy", goalsA: 0, goalsB: 0, resultAt90: "D", afterExtraTime: true,
    });
    expect(gerIta?.penalties).toBeUndefined();
  });

  it("preserves the known ET / penalty cases", () => {
    // Switzerland 0-0 Ukraine, pens 0-3
    expect(results.find((m) => m.matchId === "wc2006-54")).toMatchObject({
      teamA: "switzerland", teamB: "ukraine", goalsA: 0, goalsB: 0, resultAt90: "D",
      afterExtraTime: true, penalties: { a: 0, b: 3 },
    });
    // Germany 1-1 Argentina, pens 4-2
    expect(results.find((m) => m.matchId === "wc2006-57")).toMatchObject({
      teamA: "germany", teamB: "argentina", goalsA: 1, goalsB: 1, resultAt90: "D",
      afterExtraTime: true, penalties: { a: 4, b: 2 },
    });
    // England 0-0 Portugal, pens 1-3
    expect(results.find((m) => m.matchId === "wc2006-59")).toMatchObject({
      teamA: "england", teamB: "portugal", goalsA: 0, goalsB: 0, resultAt90: "D",
      afterExtraTime: true, penalties: { a: 1, b: 3 },
    });
  });

  it("final known check: Italy 1-1 France at 90, AET, Italy win 5-3 on penalties", () => {
    const final = results.find((m) => m.matchId === "wc2006-64");
    expect(final).toMatchObject({
      stage: "final", teamA: "italy", teamB: "france",
      goalsA: 1, goalsB: 1, resultAt90: "D", afterExtraTime: true,
      penalties: { a: 5, b: 3 },
    });
  });
});

describe("WC-2006 leakage controls (strictly before opening kickoff)", () => {
  it("opening kickoff is the 2006-06-09 cutoff", () => {
    expect(WC2006_PACK.identity.openingKickoff).toBe("2006-06-09T18:00:00+02:00");
    expect(new Date(WC2006_PACK.identity.openingKickoff).toISOString()).toBe("2006-06-09T16:00:00.000Z");
  });

  it("every Elo asOfDate is the exact 2006-06-08 snapshot (< cutoff)", () => {
    expect(WC2006_PACK.elo).toHaveLength(32);
    for (const r of WC2006_PACK.elo) {
      expect(r.asOfDate).toBe("2006-06-08");
      expect(new Date(r.asOfDate).getTime()).toBeLessThan(OPENING);
    }
  });

  it("every FIFA rankingDate is the exact pre-tournament 2006-05-17 release (< cutoff)", () => {
    expect(WC2006_PACK.fifa).toHaveLength(32);
    for (const r of WC2006_PACK.fifa) {
      expect(r.rankingDate).toBe("2006-05-17");
      expect(new Date(r.rankingDate).getTime()).toBeLessThan(OPENING);
    }
  });

  it("no Elo / FIFA rows are missing for any team", () => {
    const teamSet = new Set(WC2006_PACK.identity.teamIds);
    expect(new Set(WC2006_PACK.elo.map((r) => r.teamId))).toEqual(teamSet);
    expect(new Set(WC2006_PACK.fifa.map((r) => r.teamId))).toEqual(teamSet);
  });

  it("no proprietary / forbidden fields appear anywhere in the pack", () => {
    const blob = JSON.stringify(WC2006_PACK);
    for (const field of BACKTEST_FORBIDDEN_FIELDS) {
      expect(blob.includes(`"${field}"`)).toBe(false);
    }
  });
});

describe("WC-2006 team mapping / slug governance (historical id space)", () => {
  it("maps Serbia and Montenegro to the HISTORICAL-ONLY serbia-and-montenegro slug", () => {
    expect(WC2006_NAME_TO_ID["Serbia and Montenegro"]).toBe("serbia-and-montenegro");
    expect(WC2006_PACK.identity.teamIds).toContain("serbia-and-montenegro");
    expect(WC2006_PACK.identity.confederations["serbia-and-montenegro"]).toBe("UEFA");
  });

  it("keeps serbia-and-montenegro DISTINCT from the modern serbia slug", () => {
    expect("serbia-and-montenegro").not.toBe("serbia");
    expect(WC2006_PACK.identity.teamIds).not.toContain("serbia");
    expect(Object.values(WC2006_NAME_TO_ID)).not.toContain("serbia");
  });

  it("reuses the canonical czechia slug for Czech Republic (no separate czech-republic slug)", () => {
    expect(WC2006_NAME_TO_ID["Czech Republic"]).toBe("czechia");
    expect(WC2006_PACK.identity.teamIds).toContain("czechia");
    expect(WC2006_PACK.identity.teamIds).not.toContain("czech-republic");
    expect(Object.values(WC2006_NAME_TO_ID)).not.toContain("czech-republic");
    expect(WC2006_PACK.identity.confederations["czechia"]).toBe("UEFA");
  });

  it("Côte d'Ivoire resolves to the canonical ivory-coast slug", () => {
    expect(WC2006_NAME_TO_ID["Côte d'Ivoire"]).toBe("ivory-coast");
    expect(WC2006_PACK.identity.teamIds).toContain("ivory-coast");
  });

  it("reuses canonical slugs for shared nations and adds clean new slugs", () => {
    for (const t of ["germany", "brazil", "argentina", "england", "france", "italy",
      "spain", "portugal", "netherlands", "mexico", "usa", "ghana", "south-korea",
      "saudi-arabia", "japan", "iran", "tunisia", "paraguay", "switzerland", "ecuador"]) {
      expect(WC2006_PACK.identity.teamIds).toContain(t);
    }
    for (const t of ["costa-rica", "trinidad-and-tobago", "togo", "angola", "ukraine",
      "poland", "sweden", "croatia", "serbia-and-montenegro"]) {
      expect(WC2006_PACK.identity.teamIds).toContain(t);
    }
  });

  it("all result/elo/fifa teams resolve to identity teams", () => {
    const teamSet = new Set(WC2006_PACK.identity.teamIds);
    for (const m of WC2006_PACK.results) {
      expect(teamSet.has(m.teamA)).toBe(true);
      expect(teamSet.has(m.teamB)).toBe(true);
    }
    expect(new Set(WC2006_PACK.elo.map((r) => r.teamId))).toEqual(teamSet);
    expect(new Set(WC2006_PACK.fifa.map((r) => r.teamId))).toEqual(teamSet);
  });
});

describe("WC-2006 provenance records checksums; FIFA ties allowed; optional packs deferred", () => {
  it("records a SHA-256 for every supplied source file", () => {
    const files = WC2006_SOURCE.files;
    for (const key of ["identity", "results", "elo", "fifa", "readme"]) {
      const entry = files[key];
      expect(entry).toBeDefined();
      expect(entry?.sha256).toMatch(SHA256);
    }
  });

  it("pins the exact supplied checksums", () => {
    expect(WC2006_SOURCE.files.identity?.sha256).toBe(
      "dd39530f719a2ed856916c5a8d263be0af037824acf775f8cb6bfe6f60ff36c1",
    );
    expect(WC2006_SOURCE.files.results?.sha256).toBe(
      "e3cec3f67e67b931acbdb847869bd8bfec52820010feb458244c3eceb9036b86",
    );
    expect(WC2006_SOURCE.files.elo?.sha256).toBe(
      "d1a66fd72f7f0ec4e7856ae32985fe4904b5ebfc01962842faae750e97f33223",
    );
    expect(WC2006_SOURCE.files.fifa?.sha256).toBe(
      "3f55adc620056e0c8240e6b7ad8544ce3c89ceca5ecc65db1f3c02c72e6a46f4",
    );
    expect(WC2006_SOURCE.files.readme?.sha256).toBe(
      "832713b561b57dba32e28992a6a2d019045b6b0d47e8610f5e188a715121e549",
    );
  });

  it("does NOT assert FIFA rank uniqueness (the source has tied ranks)", () => {
    const ranks = WC2006_PACK.fifa.map((r) => r.rank);
    // The 2006-05-17 release contains ties (e.g. shared ranks); confirm a tie exists.
    expect(new Set(ranks).size).toBeLessThan(ranks.length);
  });

  it("defers optional packs (macro/recentForm empty; no squads/managers)", () => {
    expect(WC2006_PACK.macro).toEqual([]);
    expect(WC2006_PACK.recentForm).toEqual([]);
    expect(WC2006_PACK.squads).toBeUndefined();
    expect(WC2006_PACK.managers).toBeUndefined();
  });
});
