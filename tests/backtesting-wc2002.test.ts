import { describe, expect, it } from "vitest";
import {
  WC2002_PACK,
  WC2002_SOURCE,
  WC2002_NAME_TO_ID,
  WC2002_CONFEDERATION_COUNTS,
} from "@/data/historical/snapshots/wc-2002";
import {
  validateHistoricalPack,
  WC2002_EXPECTATIONS,
  WC2006_EXPECTATIONS,
} from "@/lib/backtesting/validate-historical";
import { buildHistoricalFeatures } from "@/lib/backtesting/feature-adapter";
import { WC2006_PACK } from "@/data/historical/snapshots/wc-2006";
import { BACKTEST_FORBIDDEN_FIELDS } from "@/lib/backtesting/types";

/**
 * Phase 1.19C (STRETCH): validate the derived WC-2002 historical source-pack snapshot
 * (coverage, leakage, team mapping, result consistency, provenance/checksums) and
 * confirm the two NEW risks for this era: AFC CO-HOSTS (South Korea + Japan) and
 * GOLDEN-GOAL knockouts. Stretch evidence only: no probabilities change, no harness
 * wiring, no primary four-tournament diagnostic headline change.
 */
const SHA256 = /^[0-9a-f]{64}$/;
const OPENING = new Date(WC2002_PACK.identity.openingKickoff).getTime();

describe("WC-2002 historical pack validates against the contract", () => {
  const result = validateHistoricalPack(WC2002_PACK, WC2002_EXPECTATIONS);

  it("passes the validator with no errors", () => {
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("covers 32 teams in 8 groups of 4", () => {
    expect(WC2002_PACK.identity.teamIds).toHaveLength(32);
    expect(new Set(WC2002_PACK.identity.teamIds).size).toBe(32);
    const groups = WC2002_PACK.identity.groups;
    expect(Object.keys(groups)).toHaveLength(8);
    for (const g of Object.keys(groups)) expect(groups[g]).toHaveLength(4);
    const flat = Object.values(groups).flat();
    expect(flat).toHaveLength(32);
    expect(new Set(flat)).toEqual(new Set(WC2002_PACK.identity.teamIds));
  });

  it("has no duplicate team slugs", () => {
    const ids = WC2002_PACK.identity.teamIds;
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("confederation tally matches the declared counts (UEFA 15 / CONMEBOL 5 / OFC 0 / ...)", () => {
    const tally: Record<string, number> = {};
    for (const t of WC2002_PACK.identity.teamIds) {
      const c = WC2002_PACK.identity.confederations[t];
      expect(c).toBeDefined();
      tally[c as string] = (tally[c as string] ?? 0) + 1;
    }
    for (const [conf, n] of Object.entries(WC2002_CONFEDERATION_COUNTS)) {
      expect(tally[conf] ?? 0).toBe(n);
    }
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(32);
    expect(WC2002_CONFEDERATION_COUNTS).toMatchObject({ UEFA: 15, CONMEBOL: 5, CONCACAF: 3, CAF: 5, AFC: 4 });
    expect(WC2002_CONFEDERATION_COUNTS.OFC ?? 0).toBe(0);
  });
});

describe("WC-2002 co-hosts (South Korea + Japan, both AFC)", () => {
  it("records both co-hosts in hostCountries", () => {
    expect(WC2002_PACK.identity.tournamentYear).toBe(2002);
    expect(WC2002_PACK.identity.hostCountries).toEqual(["South Korea", "Japan"]);
  });

  it("both hosts are present in the team list and both are AFC", () => {
    for (const h of ["south-korea", "japan"]) {
      expect(WC2002_PACK.identity.teamIds).toContain(h);
      expect(WC2002_PACK.identity.confederations[h]).toBe("AFC");
    }
  });

  it("the feature-adapter flags BOTH hosts and treats other AFC teams as regional (no adapter change needed)", () => {
    const features = buildHistoricalFeatures(WC2002_PACK);
    // Both co-hosts: isHost true, isRegional false.
    for (const h of ["south-korea", "japan"]) {
      expect(features.get(h)?.isHost).toBe(true);
      expect(features.get(h)?.isRegional).toBe(false);
    }
    // Other AFC teams (China, Saudi Arabia): not host, but regional to the AFC co-hosts.
    for (const t of ["china", "saudi-arabia"]) {
      expect(features.get(t)?.isHost).toBe(false);
      expect(features.get(t)?.isRegional).toBe(true);
    }
    // A non-AFC team is neither host nor regional.
    expect(features.get("brazil")?.isHost).toBe(false);
    expect(features.get("brazil")?.isRegional).toBe(false);
  });

  it("the multi-host validator extension stays backward-compatible with single-host packs", () => {
    // WC-2006 (single-host Germany) still validates under its unchanged single-host expectations.
    const r2006 = validateHistoricalPack(WC2006_PACK, WC2006_EXPECTATIONS);
    expect(r2006.errors).toEqual([]);
    expect(r2006.valid).toBe(true);
  });
});

describe("WC-2002 results are 64 matches (48 group + 16 knockout), outcomes only", () => {
  const results = WC2002_PACK.results;

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

  it("final known check: Germany 0-2 Brazil at 90, no extra time, no penalties, Brazil win", () => {
    const final = results.find((m) => m.matchId === "wc2002-64");
    expect(final).toMatchObject({
      stage: "final", teamA: "germany", teamB: "brazil",
      goalsA: 0, goalsB: 2, resultAt90: "B",
    });
    expect(final?.afterExtraTime).toBeUndefined();
    expect(final?.penalties).toBeUndefined();
  });
});

describe("WC-2002 golden-goal exemplars (90' draw + afterExtraTime, no penalties)", () => {
  const find = (mid: string) => WC2002_PACK.results.find((m) => m.matchId === mid);

  it("Sweden 1-1 Senegal at 90 (Senegal win 2-1 AET, golden goal, no penalties)", () => {
    expect(find("wc2002-51")).toMatchObject({
      teamA: "sweden", teamB: "senegal", goalsA: 1, goalsB: 1, resultAt90: "D", afterExtraTime: true,
    });
    expect(find("wc2002-51")?.penalties).toBeUndefined();
  });

  it("South Korea 1-1 Italy at 90 (South Korea win 2-1 AET, golden goal, no penalties)", () => {
    expect(find("wc2002-56")).toMatchObject({
      teamA: "south-korea", teamB: "italy", goalsA: 1, goalsB: 1, resultAt90: "D", afterExtraTime: true,
    });
    expect(find("wc2002-56")?.penalties).toBeUndefined();
  });

  it("Senegal 0-0 Turkey at 90 (Turkey win 1-0 AET, golden goal, no penalties)", () => {
    expect(find("wc2002-60")).toMatchObject({
      teamA: "senegal", teamB: "turkiye", goalsA: 0, goalsB: 0, resultAt90: "D", afterExtraTime: true,
    });
    expect(find("wc2002-60")?.penalties).toBeUndefined();
  });
});

describe("WC-2002 penalty exemplars (90' draw + afterExtraTime + penalties, not tied)", () => {
  const find = (mid: string) => WC2002_PACK.results.find((m) => m.matchId === mid);

  it("Spain 1-1 Republic of Ireland at 90; Spain win 3-2 on penalties", () => {
    expect(find("wc2002-52")).toMatchObject({
      teamA: "spain", teamB: "republic-of-ireland", goalsA: 1, goalsB: 1, resultAt90: "D",
      afterExtraTime: true, penalties: { a: 3, b: 2 },
    });
  });

  it("Spain 0-0 South Korea at 90; South Korea win 5-3 on penalties", () => {
    expect(find("wc2002-59")).toMatchObject({
      teamA: "spain", teamB: "south-korea", goalsA: 0, goalsB: 0, resultAt90: "D",
      afterExtraTime: true, penalties: { a: 3, b: 5 },
    });
  });
});

describe("WC-2002 leakage controls (strictly before opening kickoff)", () => {
  it("opening kickoff is the 2002-05-31 KST cutoff", () => {
    expect(WC2002_PACK.identity.openingKickoff).toBe("2002-05-31T20:30:00+09:00");
    expect(new Date(WC2002_PACK.identity.openingKickoff).toISOString()).toBe("2002-05-31T11:30:00.000Z");
  });

  it("every Elo asOfDate is the exact 2002-05-30 snapshot (< cutoff)", () => {
    expect(WC2002_PACK.elo).toHaveLength(32);
    for (const r of WC2002_PACK.elo) {
      expect(r.asOfDate).toBe("2002-05-30");
      expect(new Date(r.asOfDate).getTime()).toBeLessThan(OPENING);
    }
  });

  it("every FIFA rankingDate is the exact pre-tournament 2002-05-15 release (< cutoff)", () => {
    expect(WC2002_PACK.fifa).toHaveLength(32);
    for (const r of WC2002_PACK.fifa) {
      expect(r.rankingDate).toBe("2002-05-15");
      expect(new Date(r.rankingDate).getTime()).toBeLessThan(OPENING);
    }
  });

  it("no Elo / FIFA rows are missing for any team", () => {
    const teamSet = new Set(WC2002_PACK.identity.teamIds);
    expect(new Set(WC2002_PACK.elo.map((r) => r.teamId))).toEqual(teamSet);
    expect(new Set(WC2002_PACK.fifa.map((r) => r.teamId))).toEqual(teamSet);
  });

  it("no proprietary / forbidden fields appear anywhere in the pack", () => {
    const blob = JSON.stringify(WC2002_PACK);
    for (const field of BACKTEST_FORBIDDEN_FIELDS) {
      expect(blob.includes(`"${field}"`)).toBe(false);
    }
  });
});

describe("WC-2002 team mapping / slug governance (historical id space)", () => {
  it("maps Republic of Ireland to the HISTORICAL-ONLY republic-of-ireland slug (not ireland)", () => {
    expect(WC2002_NAME_TO_ID["Republic of Ireland"]).toBe("republic-of-ireland");
    expect(WC2002_PACK.identity.teamIds).toContain("republic-of-ireland");
    expect(WC2002_PACK.identity.teamIds).not.toContain("ireland");
    expect(Object.values(WC2002_NAME_TO_ID)).not.toContain("ireland");
    expect(WC2002_PACK.identity.confederations["republic-of-ireland"]).toBe("UEFA");
  });

  it("maps China PR / China to the new clean china slug", () => {
    expect(WC2002_NAME_TO_ID["China PR"]).toBe("china");
    expect(WC2002_NAME_TO_ID["China"]).toBe("china");
    expect(WC2002_PACK.identity.teamIds).toContain("china");
    expect(WC2002_PACK.identity.confederations["china"]).toBe("AFC");
  });

  it("reuses the canonical turkiye slug for Turkey (no separate turkey slug)", () => {
    expect(WC2002_NAME_TO_ID["Turkey"]).toBe("turkiye");
    expect(WC2002_PACK.identity.teamIds).toContain("turkiye");
    expect(WC2002_PACK.identity.teamIds).not.toContain("turkey");
    expect(Object.values(WC2002_NAME_TO_ID)).not.toContain("turkey");
  });

  it("maps South Korea / Korea Republic to south-korea and United States to usa", () => {
    expect(WC2002_NAME_TO_ID["South Korea"]).toBe("south-korea");
    expect(WC2002_NAME_TO_ID["Korea Republic"]).toBe("south-korea");
    expect(WC2002_NAME_TO_ID["United States"]).toBe("usa");
    expect(WC2002_PACK.identity.teamIds).toContain("usa");
  });

  it("all result/elo/fifa teams resolve to identity teams", () => {
    const teamSet = new Set(WC2002_PACK.identity.teamIds);
    for (const m of WC2002_PACK.results) {
      expect(teamSet.has(m.teamA)).toBe(true);
      expect(teamSet.has(m.teamB)).toBe(true);
    }
    expect(new Set(WC2002_PACK.elo.map((r) => r.teamId))).toEqual(teamSet);
    expect(new Set(WC2002_PACK.fifa.map((r) => r.teamId))).toEqual(teamSet);
  });
});

describe("WC-2002 provenance records checksums; FIFA ties allowed; optional packs deferred", () => {
  it("records a SHA-256 for every supplied source file", () => {
    const files = WC2002_SOURCE.files;
    for (const key of ["identity", "results", "elo", "fifa", "readme"]) {
      const entry = files[key];
      expect(entry).toBeDefined();
      expect(entry?.sha256).toMatch(SHA256);
    }
  });

  it("pins the exact supplied checksums", () => {
    expect(WC2002_SOURCE.files.identity?.sha256).toBe(
      "ffbee796765f082af7551833ab5b95f5c4f7b6dafb13acab7ec7586f340aca7c",
    );
    expect(WC2002_SOURCE.files.results?.sha256).toBe(
      "40105e2a8ee5a4cf9b46087848117f519da76d8a091fcc566ce9d6c83bc9318a",
    );
    expect(WC2002_SOURCE.files.elo?.sha256).toBe(
      "b9531fb353c7673231ad43aa768369c4396f1d593c8647a2b5d033f219ca70e0",
    );
    expect(WC2002_SOURCE.files.fifa?.sha256).toBe(
      "235cc03f4a5e1246e90933e87d461ab9a5267bb41ee5fca57d43bb5eb1f8a4e0",
    );
    expect(WC2002_SOURCE.files.readme?.sha256).toBe(
      "3f94d053fae18eefbcc8eeb239b7d228b8ae074c483186a753a010e718b4d878",
    );
  });

  it("treats FIFA ranks as positive integers without asserting uniqueness (ties allowed as a rule)", () => {
    // Per governance, FIFA rank uniqueness is NOT asserted (other packs, e.g. 2006, carry
    // ties). The 2002 source happens to be tie-free, but we deliberately do not depend on
    // either property - only that every rank is a positive integer.
    for (const r of WC2002_PACK.fifa) {
      expect(Number.isInteger(r.rank) && r.rank >= 1).toBe(true);
    }
  });

  it("defers optional packs (macro/recentForm empty; no squads/managers)", () => {
    expect(WC2002_PACK.macro).toEqual([]);
    expect(WC2002_PACK.recentForm).toEqual([]);
    expect(WC2002_PACK.squads).toBeUndefined();
    expect(WC2002_PACK.managers).toBeUndefined();
  });
});
