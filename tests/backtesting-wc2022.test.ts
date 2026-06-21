import { describe, expect, it } from "vitest";
import {
  WC2022_PACK,
  WC2022_SOURCE,
  WC2022_NAME_TO_ID,
  WC2022_CONFEDERATION_COUNTS,
} from "@/data/historical/snapshots/wc-2022";
import {
  validateHistoricalPack,
  WC2022_EXPECTATIONS,
} from "@/lib/backtesting/validate-historical";
import { BACKTEST_FORBIDDEN_FIELDS } from "@/lib/backtesting/types";

/**
 * Phase 1.18B-2: validate the derived WC-2022 historical source-pack snapshot
 * (coverage, leakage, team mapping, result consistency, provenance/checksums) and
 * confirm it stays isolated from production. No probabilities change; no harness.
 */
const SHA256 = /^[0-9a-f]{64}$/;
const OPENING = new Date(WC2022_PACK.identity.openingKickoff).getTime();

describe("WC-2022 historical pack validates against the contract", () => {
  const result = validateHistoricalPack(WC2022_PACK, {
    ...WC2022_EXPECTATIONS,
    confederationCounts: WC2022_CONFEDERATION_COUNTS,
  });

  it("passes the validator with no errors", () => {
    expect(result).toEqual({ valid: true, errors: [], warnings: result.warnings });
    expect(result.errors).toEqual([]);
  });

  it("covers 32 teams in 8 groups of 4", () => {
    expect(WC2022_PACK.identity.teamIds).toHaveLength(32);
    expect(new Set(WC2022_PACK.identity.teamIds).size).toBe(32);
    const groups = WC2022_PACK.identity.groups;
    expect(Object.keys(groups)).toHaveLength(8);
    for (const g of Object.keys(groups)) expect(groups[g]).toHaveLength(4);
    const flat = Object.values(groups).flat();
    expect(flat).toHaveLength(32);
    expect(new Set(flat)).toEqual(new Set(WC2022_PACK.identity.teamIds));
  });

  it("hosts Qatar and Qatar is in the team list", () => {
    expect(WC2022_PACK.identity.hostCountries).toContain("Qatar");
    expect(WC2022_PACK.identity.teamIds).toContain("qatar");
  });

  it("confederation tally matches the declared counts (6/5/4/4/13/0)", () => {
    const tally: Record<string, number> = {};
    for (const t of WC2022_PACK.identity.teamIds) {
      const c = WC2022_PACK.identity.confederations[t];
      expect(c).toBeDefined();
      tally[c as string] = (tally[c as string] ?? 0) + 1;
    }
    for (const [conf, n] of Object.entries(WC2022_CONFEDERATION_COUNTS)) {
      expect(tally[conf] ?? 0).toBe(n);
    }
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(32);
  });
});

describe("WC-2022 results are 64 matches (48 group + 16 knockout), outcomes only", () => {
  const results = WC2022_PACK.results;

  it("has 64 matches with unique ids", () => {
    expect(results).toHaveLength(64);
    expect(new Set(results.map((m) => m.matchId)).size).toBe(64);
  });

  it("splits 48 group and 16 knockout matches", () => {
    expect(results.filter((m) => m.stage === "group")).toHaveLength(48);
    expect(results.filter((m) => m.stage !== "group")).toHaveLength(16);
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

  it("records extra time / penalties only on knockout matches", () => {
    for (const m of results) {
      if (m.afterExtraTime || m.penalties) expect(m.stage).not.toBe("group");
      if (m.penalties) {
        expect(m.resultAt90).toBe("D");
        expect(m.penalties.a).not.toBe(m.penalties.b);
      }
    }
  });

  it("normalizes the final (Argentina 2-2 France at 90', won on penalties)", () => {
    const final = results.find((m) => m.matchId === "WC2022-064");
    expect(final).toMatchObject({
      stage: "final",
      teamA: "argentina",
      teamB: "france",
      goalsA: 2,
      goalsB: 2,
      resultAt90: "D",
      afterExtraTime: true,
      penalties: { a: 4, b: 2 },
    });
  });
});

describe("WC-2022 leakage controls (everything strictly before opening kickoff)", () => {
  it("opening kickoff is the 2022-11-20 cutoff", () => {
    expect(WC2022_PACK.identity.openingKickoff).toBe("2022-11-20T19:00:00+03:00");
    expect(new Date(WC2022_PACK.identity.openingKickoff).toISOString()).toBe("2022-11-20T16:00:00.000Z");
  });

  it("every Elo asOfDate is strictly before the opening kickoff", () => {
    expect(WC2022_PACK.elo).toHaveLength(32);
    for (const r of WC2022_PACK.elo) {
      expect(new Date(r.asOfDate).getTime()).toBeLessThan(OPENING);
    }
  });

  it("every FIFA rankingDate is the pre-tournament 2022-10-06 release (< cutoff)", () => {
    expect(WC2022_PACK.fifa).toHaveLength(32);
    for (const r of WC2022_PACK.fifa) {
      expect(r.rankingDate).toBe("2022-10-06");
      expect(new Date(r.rankingDate).getTime()).toBeLessThan(OPENING);
      // explicitly NOT the post-tournament release
      expect(r.rankingDate).not.toBe("2022-12-22");
    }
  });

  it("Qatar Elo is the unadjusted 1680 (not the host-adjusted 1780)", () => {
    const qatar = WC2022_PACK.elo.find((r) => r.teamId === "qatar");
    expect(qatar?.rating).toBe(1680);
    expect(qatar?.asOfDate).toBe("2022-11-09");
  });

  it("no proprietary / forbidden fields appear anywhere in the pack", () => {
    const blob = JSON.stringify(WC2022_PACK);
    for (const field of BACKTEST_FORBIDDEN_FIELDS) {
      expect(blob.includes(`"${field}"`)).toBe(false);
    }
  });
});

describe("WC-2022 team mapping resolves in the historical id space", () => {
  it("maps exactly 32 source names to unique historical ids", () => {
    const ids = Object.values(WC2022_NAME_TO_ID);
    expect(ids).toHaveLength(32);
    expect(new Set(ids).size).toBe(32);
  });

  it("all result/elo/fifa teams resolve to identity teams", () => {
    const teamSet = new Set(WC2022_PACK.identity.teamIds);
    for (const m of WC2022_PACK.results) {
      expect(teamSet.has(m.teamA)).toBe(true);
      expect(teamSet.has(m.teamB)).toBe(true);
    }
    expect(new Set(WC2022_PACK.elo.map((r) => r.teamId))).toEqual(teamSet);
    expect(new Set(WC2022_PACK.fifa.map((r) => r.teamId))).toEqual(teamSet);
  });

  it("includes nations absent from the 2026 field (historical id space)", () => {
    for (const t of ["wales", "poland", "denmark", "costa-rica", "serbia", "cameroon"]) {
      expect(WC2022_PACK.identity.teamIds).toContain(t);
    }
  });
});

describe("WC-2022 provenance records checksums; optional packs deferred", () => {
  it("records a SHA-256 for every supplied source file", () => {
    const files = WC2022_SOURCE.files;
    for (const key of ["identity", "results", "elo", "fifa", "readme"]) {
      const entry = files[key];
      expect(entry).toBeDefined();
      expect(entry?.sha256).toMatch(SHA256);
    }
  });

  it("pins the exact supplied checksums", () => {
    expect(WC2022_SOURCE.files.identity?.sha256).toBe(
      "1c5ea230b3877366e4cd0ee83ae7e79e68f15561c2318651b2eac36f4e969fd1",
    );
    expect(WC2022_SOURCE.files.results?.sha256).toBe(
      "2c3de1d9326fe5529e7fa912f99d750e5fefb6bf2cea76ca8c3c6f57ed3f9d44",
    );
    expect(WC2022_SOURCE.files.elo?.sha256).toBe(
      "6599fe082c5f3a4d941ded16f87bb2a853f43625139a86ee94c28663d4e9df91",
    );
    expect(WC2022_SOURCE.files.fifa?.sha256).toBe(
      "36faaf7e4c77cda3890abfb9615c64d2d6cc94ff98c2e0b237d409b8cd00895e",
    );
    expect(WC2022_SOURCE.files.readme?.sha256).toBe(
      "076375c1bd66f74713a4ffec06c5615df1edf1598e949177ea5a9f204460f1c6",
    );
  });

  it("defers optional packs (macro/recentForm empty; no squads/managers)", () => {
    expect(WC2022_PACK.macro).toEqual([]);
    expect(WC2022_PACK.recentForm).toEqual([]);
    expect(WC2022_PACK.squads).toBeUndefined();
    expect(WC2022_PACK.managers).toBeUndefined();
  });
});
