import { describe, expect, it } from "vitest";
import {
  OFFICIAL_SCHEDULE_SOURCE,
  stagedOfficialSchedule,
  stagedDrawPositions,
} from "@/data/official/staging/schedule";
import {
  HOST_SLOTS,
  etLocalToUtcIso,
  validateStagedSchedule,
  solveDrawPositionsFromSchedule,
  validateSolvedDrawPositions,
  dryRunActivation,
  crossCheckScheduleAgainstCandidate,
  toOfficialFixtures,
} from "@/lib/data/validate-official-schedule";
import { officialTeams } from "@/data/official/teams";
import { officialVenues } from "@/data/official/venues";
import { officialFixtures } from "@/data/official/fixtures";

const GROUP_IDS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

describe("staged official schedule - shape & provenance", () => {
  it("has 72 rows with required fields", () => {
    expect(stagedOfficialSchedule).toHaveLength(72);
    for (const f of stagedOfficialSchedule) {
      expect(f.matchNumber).toBeGreaterThanOrEqual(1);
      expect(f.matchNumber).toBeLessThanOrEqual(72);
      expect(f.group).toMatch(/^[A-L]$/);
      expect(f.matchday).toBeGreaterThanOrEqual(1);
      expect(f.matchday).toBeLessThanOrEqual(3);
      expect(f.homeTeamId).toBeTruthy();
      expect(f.awayTeamId).toBeTruthy();
      expect(Number.isNaN(Date.parse(f.kickoffUtc))).toBe(false);
      expect(f.kickoffLocalSourceTime).toMatch(/ ET$/);
      expect(f.subjectToChange).toBe(true);
      expect(f.sourceRef).toContain("v17");
    }
  });

  it("preserves the official source provenance (v17 / 10 Apr 2026 / subject to change / ET)", () => {
    expect(OFFICIAL_SCHEDULE_SOURCE.version).toBe("v17");
    expect(OFFICIAL_SCHEDULE_SOURCE.sourceDate).toBe("2026-04-10");
    expect(OFFICIAL_SCHEDULE_SOURCE.subjectToChange).toBe(true);
    expect(OFFICIAL_SCHEDULE_SOURCE.timezone).toContain("ET");
    expect(OFFICIAL_SCHEDULE_SOURCE.sourceFile).toContain("FWC26_Match_Schedule_v17");
  });
});

describe("staged official schedule - coverage & validity", () => {
  it("passes full structural validation", () => {
    expect(validateStagedSchedule(stagedOfficialSchedule)).toEqual([]);
  });

  it("has unique match numbers 1..72", () => {
    const nums = stagedOfficialSchedule.map((f) => f.matchNumber).sort((a, b) => a - b);
    expect(nums).toEqual(Array.from({ length: 72 }, (_, i) => i + 1));
  });

  it("has 6 fixtures per group and every team in exactly 3 games", () => {
    const perGroup = new Map<string, number>();
    const perTeam = new Map<string, number>();
    for (const f of stagedOfficialSchedule) {
      perGroup.set(f.group, (perGroup.get(f.group) ?? 0) + 1);
      perTeam.set(f.homeTeamId, (perTeam.get(f.homeTeamId) ?? 0) + 1);
      perTeam.set(f.awayTeamId, (perTeam.get(f.awayTeamId) ?? 0) + 1);
    }
    for (const g of GROUP_IDS) expect(perGroup.get(g)).toBe(6);
    expect(perTeam.size).toBe(48);
    for (const [, c] of perTeam) expect(c).toBe(3);
  });

  it("resolves every venue id, including multi-word labels", () => {
    const venueIds = new Set(officialVenues.map((v) => v.id));
    for (const f of stagedOfficialSchedule) expect(venueIds.has(f.venueId)).toBe(true);
    const labels = new Set(stagedOfficialSchedule.map((f) => f.venueLabelRaw));
    expect(labels.has("SAN FRANCISCO BAY AREA")).toBe(true);
    expect(labels.has("NEW YORK NEW JERSEY")).toBe(true);
  });
});

describe("ET -> UTC conversion", () => {
  it("converts ET (UTC-4) including midnight crossers", () => {
    expect(etLocalToUtcIso("2026-06-11 15:00 ET")).toBe("2026-06-11T19:00:00Z");
    expect(etLocalToUtcIso("2026-06-11 22:00 ET")).toBe("2026-06-12T02:00:00Z"); // crosses midnight
    expect(etLocalToUtcIso("2026-06-17 00:00 ET")).toBe("2026-06-17T04:00:00Z"); // M20
    expect(etLocalToUtcIso("2026-06-27 19:30 ET")).toBe("2026-06-27T23:30:00Z"); // half-hour
    expect(etLocalToUtcIso("nonsense")).toBeNull();
  });
});

describe("draw-position solver", () => {
  const solve = solveDrawPositionsFromSchedule(stagedOfficialSchedule);

  it("finds a unique solution for every group", () => {
    for (const g of GROUP_IDS) expect(solve.solutionsPerGroup[g]).toBe(1);
    expect(solve.errors).toEqual([]);
    expect(solve.positions).toHaveLength(48);
  });

  it("preserves the three verified host slots", () => {
    const slotOf = new Map(solve.positions.map((p) => [p.teamId, p.slot]));
    for (const [team, slot] of Object.entries(HOST_SLOTS)) {
      expect(slotOf.get(team)).toBe(slot);
    }
  });

  it("has positions {1,2,3,4} unique per group and agrees with staged data", () => {
    expect(validateSolvedDrawPositions(solve.positions, stagedOfficialSchedule)).toEqual([]);
  });

  it("matches the committed stagedDrawPositions", () => {
    const a = [...solve.positions].map((p) => `${p.slot}=${p.teamId}`).sort();
    const b = [...stagedDrawPositions].map((p) => `${p.slot}=${p.teamId}`).sort();
    expect(a).toEqual(b);
  });
});

describe("cross-check against candidate (Telegraph/Excel)", () => {
  it("agrees on all 72 fixtures with zero discrepancies", () => {
    const result = crossCheckScheduleAgainstCandidate();
    expect(result.matches).toBe(72);
    expect(result.discrepancies).toEqual([]);
    expect(result.drawOrderDiscrepancies).toEqual([]);
  });

  it("confirms the candidate's manual Telegraph resolution for M20 and M36", () => {
    const m20 = stagedOfficialSchedule.find((f) => f.matchNumber === 20)!;
    const m36 = stagedOfficialSchedule.find((f) => f.matchNumber === 36)!;
    expect(m20.kickoffUtc).toBe("2026-06-17T04:00:00Z");
    expect(m36.kickoffUtc).toBe("2026-06-21T04:00:00Z");
  });
});

describe("dry-run activation (Step B would pass existing validators)", () => {
  it("would activate cleanly through the existing resolver validators", () => {
    const solve = solveDrawPositionsFromSchedule(stagedOfficialSchedule);
    const result = dryRunActivation(stagedOfficialSchedule, solve.positions);
    expect(result.errors).toEqual([]);
    expect(result.wouldActivate).toBe(true);
  });

  it("produces 72 position-keyed official fixtures", () => {
    expect(toOfficialFixtures(stagedOfficialSchedule)).toHaveLength(72);
  });
});

describe("Step A safety - production is unchanged (staging only)", () => {
  it("official fixtures template is still empty (not activated)", () => {
    expect(officialFixtures).toEqual([]);
  });

  it("resolver still position-generates fixtures", async () => {
    const { resolveDataset } = await import("@/lib/data/source");
    expect(resolveDataset().fixtureSource).toBe("position-generated");
  });

  it("only the three co-hosts carry verified draw slots; non-hosts undefined", () => {
    for (const t of officialTeams) {
      if (HOST_SLOTS[t.id]) {
        expect(t.drawPosition).toBeDefined();
        expect(t.drawSlotStatus).toBe("verified");
      } else {
        expect(t.drawPosition).toBeUndefined();
        expect(t.drawSlot).toBeUndefined();
      }
    }
  });

  it("importing the staging layer does not change the resolved dataset", async () => {
    const { resolveDataset } = await import("@/lib/data/source");
    const before = resolveDataset();
    expect(stagedOfficialSchedule).toHaveLength(72);
    const after = resolveDataset();
    expect(after.fixtureSource).toBe(before.fixtureSource);
    expect(after.teams.length).toBe(before.teams.length);
  });
});
