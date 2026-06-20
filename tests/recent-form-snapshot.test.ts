import { describe, expect, it } from "vitest";
import {
  recentFormSnapshot,
  recentFormById,
  RECENT_FORM_SOURCE,
  RECENT_FORM_NAME_TO_ID,
} from "@/data/model-inputs/snapshots/recent-form-2026-06-11";
import { officialTeams } from "@/data/official/teams";
import { validateRecentForm } from "@/lib/data/validate-recent-form";
import { aggregateRecentForm } from "@/lib/recent-form/aggregate";
import type { RecentFormRow } from "@/lib/types";

const CUTOFF_DAY = "2026-06-11";

describe("recent-form snapshot - coverage & validity", () => {
  it("covers all 48 teams, one row each, 10 matches per team", () => {
    expect(recentFormSnapshot).toHaveLength(48);
    expect(new Set(recentFormSnapshot.map((r) => r.teamId)).size).toBe(48);
    const ids = new Set(officialTeams.map((t) => t.id));
    for (const r of recentFormSnapshot) {
      expect(ids.has(r.teamId)).toBe(true);
      expect(r.recentMatches).toHaveLength(10);
      expect(r.matchesConsidered10).toBe(10);
      expect(r.matchesConsidered5).toBe(5);
    }
  });

  it("has ranks 1..10 latest-first with non-increasing dates per team", () => {
    for (const r of recentFormSnapshot) {
      expect(r.recentMatches.map((m) => m.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      for (let i = 1; i < r.recentMatches.length; i++) {
        expect(r.recentMatches[i - 1]!.date >= r.recentMatches[i]!.date).toBe(true);
      }
    }
  });

  it("includes only matches strictly before the 2026-06-11 cutoff", () => {
    for (const r of recentFormSnapshot) {
      for (const m of r.recentMatches) {
        expect(m.date < CUTOFF_DAY).toBe(true);
      }
    }
  });

  it("recomputes aggregates from match rows (last-5 and last-10)", () => {
    for (const r of recentFormSnapshot) {
      const a5 = aggregateRecentForm(r.recentMatches, 5);
      const a10 = aggregateRecentForm(r.recentMatches, 10);
      expect(Number(a5.pointsPerMatch.toFixed(6))).toBe(r.last5PointsPerMatch);
      expect(Number(a10.pointsPerMatch.toFixed(6))).toBe(r.last10PointsPerMatch);
      expect(Number(a10.goalDiffPerMatch.toFixed(6))).toBe(r.last10GoalDiffPerMatch);
      expect(Number(a5.goalsAgainstPerMatch.toFixed(6))).toBe(r.last5GoalsAgainstPerMatch);
    }
  });

  it("keeps each row's perspective consistent with raw home/away score via dataset name", () => {
    for (const r of recentFormSnapshot) {
      for (const m of r.recentMatches) {
        const isHome = m.homeTeam === r.sourceDatasetName;
        const isAway = m.awayTeam === r.sourceDatasetName;
        expect(isHome !== isAway).toBe(true);
        if (isHome) {
          expect([m.goalsFor, m.goalsAgainst]).toEqual([m.homeScore, m.awayScore]);
        } else {
          expect([m.goalsFor, m.goalsAgainst]).toEqual([m.awayScore, m.homeScore]);
        }
      }
    }
  });

  it("handles the Czechia -> 'Czech Republic' dataset alias explicitly", () => {
    const cz = recentFormById.get("czechia")!;
    expect(cz.sourceTeamName).toBe("Czechia");
    expect(cz.sourceDatasetName).toBe("Czech Republic");
    expect(RECENT_FORM_NAME_TO_ID["Czechia"]).toBe("czechia");
  });

  it("resolves opponentId only for World Cup opponents", () => {
    const ids = new Set(officialTeams.map((t) => t.id));
    let resolved = 0;
    for (const r of recentFormSnapshot) {
      for (const m of r.recentMatches) {
        if (m.opponentId !== undefined) {
          expect(ids.has(m.opponentId)).toBe(true);
          resolved += 1;
        }
      }
    }
    expect(resolved).toBeGreaterThan(0); // some WC-vs-WC matchups exist
  });

  it("carries source-backed provenance with the CSV checksum anchor", () => {
    expect(RECENT_FORM_SOURCE.status).toBe("source-backed");
    expect(RECENT_FORM_SOURCE.cutoff).toBe("2026-06-11T19:00:00Z");
    expect(RECENT_FORM_SOURCE.sourceChecksumSha256).toBe(
      "0a73d73fdbc455d9a32107a4d1b10fb2bc77d312544f117bb933d9f6ef3b87bc",
    );
    expect(RECENT_FORM_SOURCE.sourceName).toMatch(/CC0/i);
    for (const r of recentFormSnapshot) expect(r.dataStatus).toBe("source-backed");
  });

  it("passes validateRecentForm with no errors", () => {
    const res = validateRecentForm();
    expect(res.errors).toEqual([]);
    expect(res.valid).toBe(true);
  });
});

describe("recent-form snapshot - validator negative cases", () => {
  it("flags a post-cutoff match date", () => {
    const bad: RecentFormRow[] = recentFormSnapshot.map((r, i) =>
      i === 0
        ? { ...r, recentMatches: r.recentMatches.map((m, j) => (j === 0 ? { ...m, date: "2026-06-15" } : m)) }
        : r,
    );
    const res = validateRecentForm(bad);
    expect(res.valid).toBe(false);
    expect(res.errors.join(" ")).toMatch(/not before cutoff/);
  });

  it("flags a perspective/score mismatch", () => {
    const bad: RecentFormRow[] = recentFormSnapshot.map((r, i) =>
      i === 0
        ? { ...r, recentMatches: r.recentMatches.map((m, j) => (j === 0 ? { ...m, goalsFor: m.goalsFor + 5 } : m)) }
        : r,
    );
    expect(validateRecentForm(bad).valid).toBe(false);
  });

  it("flags a broken aggregate", () => {
    const bad: RecentFormRow[] = recentFormSnapshot.map((r, i) =>
      i === 0 ? { ...r, last10PointsPerMatch: 9.99 } : r,
    );
    expect(validateRecentForm(bad).errors.join(" ")).toMatch(/last10PointsPerMatch/);
  });

  it("flags a missing team row", () => {
    const bad = recentFormSnapshot.filter((r) => r.teamId !== "brazil");
    expect(validateRecentForm(bad).errors.join(" ")).toMatch(/missing recent-form row for team brazil/);
  });
});
