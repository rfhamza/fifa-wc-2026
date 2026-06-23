import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  reconstructHistoricalTournament,
  type HistoricalTournamentReconstruction,
  type KnockoutMatchReconstruction,
} from "@/lib/backtesting/tournament-reconstruction";
import { allHistoricalPacks } from "@/lib/backtesting/historical-cohorts";
import type { HistoricalSourcePack } from "@/lib/backtesting/types";

/**
 * Phase 1.21B: DETERMINISTIC historical tournament reconstruction (data/structure
 * validation only). Reconstructs group standings + knockout progression from ACTUAL
 * results across all seven packs, reconciles qualifiers against the actual Round-of-16
 * participants, derives the champion where the pack encodes it, and flags ambiguity
 * (ET-decided finals; historical group tiebreakers) instead of fabricating. It emits NO
 * probabilities, NO Monte Carlo, NO calibration, NO LOTO. The pinned match-level /
 * consolidation / LOTO / stretch tests are untouched.
 */
const packByYear = new Map<number, HistoricalSourcePack>(
  allHistoricalPacks.map((p) => [p.identity.tournamentYear, p]),
);
const recon = (year: number): HistoricalTournamentReconstruction =>
  reconstructHistoricalTournament(packByYear.get(year)!);

const ALL_YEARS = [1998, 2002, 2006, 2010, 2014, 2018, 2022] as const;
/** Known champions. 2010/2014 finals were ET-decided WITHOUT penalties -> not encoded
 *  in the 90-minute-only packs, so they are verified as finalists + flagged, not derived. */
const KNOWN_CHAMPION: Record<number, string> = {
  1998: "france", 2002: "brazil", 2006: "italy", 2010: "spain",
  2014: "germany", 2018: "france", 2022: "argentina",
};
// Phase 1.21D: with the source-backed `winner` field, the 2010/2014 ET finals are now
// derivable cleanly (previously `clean-with-assumptions` / undetermined).
const ET_FINAL_NOW_SOURCE_BACKED = new Set([2010, 2014]);

const koMatch = (r: HistoricalTournamentReconstruction, id: string): KnockoutMatchReconstruction => {
  for (const round of r.knockoutProgression) {
    const m = round.matches.find((x) => x.matchId === id);
    if (m) return m;
  }
  throw new Error(`knockout match ${id} not found`);
};

describe("tournament reconstruction - structure across all seven packs", () => {
  for (const year of ALL_YEARS) {
    it(`${year}: 32 teams, 8 groups of 4, 6 matches/group, 3 matches/team`, () => {
      const r = recon(year);
      const pack = packByYear.get(year)!;
      expect(pack.identity.teamIds).toHaveLength(32);
      expect(r.groupsReconstructed).toHaveLength(8);
      const allRows = r.groupsReconstructed.flatMap((g) => g.standings);
      expect(allRows).toHaveLength(32);
      expect(new Set(allRows.map((row) => row.teamId)).size).toBe(32);
      for (const g of r.groupsReconstructed) {
        expect(g.standings).toHaveLength(4);
        for (const row of g.standings) expect(row.played).toBe(3);
      }
      // 6 matches per group derivable from the pack results.
      for (const g of r.groupsReconstructed) {
        const n = pack.results.filter((m) => m.stage === "group" && m.group === g.group).length;
        expect(n).toBe(6);
      }
    });

    it(`${year}: knockout stage counts R16 8 / QF 4 / SF 2 / 3rd 1 / final 1`, () => {
      const r = recon(year);
      const byStage = Object.fromEntries(r.knockoutProgression.map((rd) => [rd.stage, rd.matches.length]));
      expect(byStage).toEqual({
        "round-of-16": 8, "quarter-final": 4, "semi-final": 2, "third-place": 1, final: 1,
      });
    });

    it(`${year}: reconstruction status is clean or clean-with-assumptions (never mismatch); no warnings`, () => {
      const r = recon(year);
      expect(r.warnings).toEqual([]);
      expect(["clean", "clean-with-assumptions"]).toContain(r.reconstructionStatus);
    });

    it(`${year}: every group's actual qualifiers reconcile to exactly 2 Round-of-16 teams`, () => {
      const r = recon(year);
      for (const g of r.groupsReconstructed) {
        expect(g.actualQualifiers).toHaveLength(2);
        for (const q of g.actualQualifiers) expect(g.standings.some((row) => row.teamId === q)).toBe(true);
      }
    });
  }
});

describe("tournament reconstruction - champion verification (all seven derivable)", () => {
  for (const year of ALL_YEARS) {
    it(`${year}: derived champion equals the known champion (${KNOWN_CHAMPION[year]})`, () => {
      const r = recon(year);
      expect(r.championDerivable).toBe(true);
      expect(r.actualChampion).toBe(KNOWN_CHAMPION[year]);
      expect(r.finalKnownCheck!.winner).toBe(KNOWN_CHAMPION[year]);
    });
  }

  it("the 2010/2014 ET finals are now source-backed (extra-time, clean) - not undetermined", () => {
    for (const year of ET_FINAL_NOW_SOURCE_BACKED) {
      const r = recon(year);
      expect(r.reconstructionStatus).toBe("clean"); // was "clean-with-assumptions" before 1.21D
      expect(r.finalKnownCheck!.method).toBe("extra-time");
      expect(r.finalKnownCheck!.winner).toBe(KNOWN_CHAMPION[year]);
      // The champion is sourced from the pack's `winner` field, not fabricated.
      const finalMatch = packByYear.get(year)!.results.find((m) => m.stage === "final")!;
      expect(finalMatch.winner).toBe(KNOWN_CHAMPION[year]);
      expect(finalMatch.resultAt90).toBe("D"); // still a 90' draw (diagnostic convention preserved)
    }
  });
});

describe("tournament reconstruction - knockout winner derivation (regulation / ET / penalties)", () => {
  it("regulation 90-minute winner (1998 R16 Brazil 4-1 Chile)", () => {
    const m = koMatch(recon(1998), "1998-049");
    expect(m).toMatchObject({ teamA: "brazil", teamB: "chile", winner: "brazil", method: "regulation" });
  });

  it("penalty winner (1998 R16 Argentina 2-2 England, pens 4-3)", () => {
    const m = koMatch(recon(1998), "1998-055");
    expect(m).toMatchObject({ teamA: "argentina", teamB: "england", winner: "argentina", method: "penalties" });
  });

  it("penalty winner where teamB wins (1998 QF Italy 0-0 France, pens 3-4)", () => {
    const m = koMatch(recon(1998), "1998-057");
    expect(m).toMatchObject({ teamA: "italy", teamB: "france", winner: "france", method: "penalties" });
  });

  it("extra-time win resolved via next-round membership (1998 R16 France 0-0 Paraguay, golden goal)", () => {
    const m = koMatch(recon(1998), "1998-052");
    expect(m).toMatchObject({ teamA: "france", teamB: "paraguay", winner: "france", method: "extra-time" });
  });
});

describe("tournament reconstruction - golden-goal-era (1998/2002) treated as ET, not 90-minute", () => {
  it("2002 R16 South Korea 1-1 Italy (golden goal) is an extra-time win, not regulation", () => {
    const m = koMatch(recon(2002), "wc2002-56");
    expect(m.method).toBe("extra-time");
    expect(m.winner).toBe("south-korea");
    // The 90-minute result was a draw; the win is NOT recorded as a 90' (regulation) win.
    expect(packByYear.get(2002)!.results.find((x) => x.matchId === "wc2002-56")!.resultAt90).toBe("D");
  });

  it("2002 penalty shootout winner (QF Spain 0-0 South Korea, pens 3-5)", () => {
    const m = koMatch(recon(2002), "wc2002-59");
    expect(m).toMatchObject({ teamA: "spain", teamB: "south-korea", winner: "south-korea", method: "penalties" });
  });

  it("2006 final penalty winner (Italy 1-1 France, pens 5-3)", () => {
    const m = koMatch(recon(2006), "wc2006-64");
    expect(m).toMatchObject({ winner: "italy", method: "penalties" });
  });
});

describe("tournament reconstruction - ambiguity / assumptions are explicit", () => {
  it("2018 flags the Group H historical tiebreaker (fair play) while confirming qualifiers", () => {
    const r = recon(2018);
    expect(r.reconstructionStatus).toBe("clean-with-assumptions");
    expect(r.assumptions.some((a) => a.toLowerCase().includes("tiebreaker"))).toBe(true);
    // Qualifiers still reconcile to exactly the actual Round-of-16 teams.
    for (const g of r.groupsReconstructed) expect(g.actualQualifiers).toHaveLength(2);
  });

  it("clean tournaments (1998/2002/2006/2010/2014/2022) have no assumptions and derive the champion", () => {
    for (const year of [1998, 2002, 2006, 2010, 2014, 2022]) {
      const r = recon(year);
      expect(r.reconstructionStatus).toBe("clean");
      expect(r.assumptions).toEqual([]);
      expect(r.actualChampion).toBe(KNOWN_CHAMPION[year]);
    }
  });
});

describe("winner contract - source-backed knockout `winner` field on the packs", () => {
  it("group-stage matches NEVER carry a winner; knockout matches always do (valid id)", () => {
    for (const pack of allHistoricalPacks) {
      const teamSet = new Set(pack.identity.teamIds);
      for (const m of pack.results) {
        if (m.stage === "group") {
          expect(m.winner).toBeUndefined();
        } else {
          expect(typeof m.winner).toBe("string");
          expect(teamSet.has(m.winner!)).toBe(true);
          expect([m.teamA, m.teamB]).toContain(m.winner);
        }
      }
    }
  });

  it("winner is consistent with decisive 90' results and with penalty shootouts", () => {
    for (const pack of allHistoricalPacks) {
      for (const m of pack.results) {
        if (m.stage === "group" || m.winner === undefined) continue;
        if (m.resultAt90 === "A") expect(m.winner).toBe(m.teamA);
        if (m.resultAt90 === "B") expect(m.winner).toBe(m.teamB);
        if (m.penalties) expect(m.winner).toBe(m.penalties.a > m.penalties.b ? m.teamA : m.teamB);
      }
    }
  });

  it("ET-only finals are source-backed: 2010 Spain, 2014 Germany", () => {
    const final = (year: number) => packByYear.get(year)!.results.find((m) => m.stage === "final")!;
    expect(final(2010)).toMatchObject({ teamA: "netherlands", teamB: "spain", resultAt90: "D", afterExtraTime: true, winner: "spain" });
    expect(final(2010).penalties).toBeUndefined();
    expect(final(2014)).toMatchObject({ teamA: "germany", teamB: "argentina", resultAt90: "D", afterExtraTime: true, winner: "germany" });
    expect(final(2014).penalties).toBeUndefined();
  });

  it("the 90-minute diagnostic convention is preserved (winner never equals resultAt90 semantics)", () => {
    // goalsA/goalsB remain the 90' score; winner is separate metadata. For ET wins the 90'
    // result is a draw yet a winner exists - proving the two are independent.
    const f = packByYear.get(2010)!.results.find((m) => m.stage === "final")!;
    expect(f.goalsA).toBe(0);
    expect(f.goalsB).toBe(0);
    expect(f.resultAt90).toBe("D");
    expect(f.winner).toBe("spain");
  });
});

describe("winner is reconstruction-only - the evaluator must not read it", () => {
  it("match-evaluator.ts does not reference `winner`", () => {
    const src = readFileSync(join(process.cwd(), "lib", "backtesting", "match-evaluator.ts"), "utf8");
    expect(src.includes("winner")).toBe(false);
  });
});

describe("tournament reconstruction - emits NO probabilities / Monte Carlo / calibration / LOTO", () => {
  it("output has exactly the descriptive reconstruction keys (no probability fields)", () => {
    const r = recon(2010);
    expect(Object.keys(r).sort()).toEqual(
      [
        "actualChampion", "championDerivable", "assumptions", "finalKnownCheck",
        "groupsReconstructed", "knockoutProgression", "reconstructionStatus",
        "tournamentYear", "warnings",
      ].sort(),
    );
  });

  it("no probability / replay / calibration / LOTO tokens anywhere in the output", () => {
    for (const year of ALL_YEARS) {
      const blob = JSON.stringify(recon(year)).toLowerCase();
      for (const banned of ["probab", "montecarlo", "monte carlo", "calibrat", "loto", "logloss", "brier", '"rps"', "temperature"]) {
        expect(blob.includes(banned)).toBe(false);
      }
    }
  });

  it("standings carry only descriptive counting fields (points/GD/GF, no metrics)", () => {
    const row = recon(2022).groupsReconstructed[0]!.standings[0]!;
    expect(Object.keys(row).sort()).toEqual(
      [
        "computedRank", "draws", "goalDifference", "goalsAgainst", "goalsFor",
        "losses", "played", "points", "qualified", "teamId", "wins",
      ].sort(),
    );
  });
});
