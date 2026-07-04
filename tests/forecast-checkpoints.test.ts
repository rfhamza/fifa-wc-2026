/**
 * PR-83A — forecast checkpoint policy tests. Committed data only; no network.
 * The group-wave invariant and the knockout mapping are COMPUTED from the
 * official fixtures/graph, not merely trusted against the hard-coded constants.
 */
import { describe, expect, it } from "vitest";
import { fixtures } from "@/lib/data";
import { officialKnockoutGraph } from "@/data/official/knockout-graph";
import {
  GROUP_WAVE_BOUNDARIES,
  FORECAST_MILESTONES,
  PUBLIC_MILESTONE_LABELS,
  CURRENT_PROJECTION_MILESTONE,
  getForecastCheckpointForMatchNumber,
  getGroupWaveForMatchNumber,
  getKnockoutRoundForMatchNumber,
  getPublicMilestoneLabel,
  isForecastMilestoneMatchNumber,
  isPublicMilestoneLocked,
  isTitleProbabilityMilestone,
  listForecastMilestones,
  listTitleProbabilityMilestones,
  validateGroupWaveBoundaries,
} from "@/lib/model/forecast-checkpoints";

describe("group-wave invariant (computed from official fixtures)", () => {
  it("after M24/M48/M72 every team has played exactly 1/2/3 group matches", () => {
    expect(validateGroupWaveBoundaries(fixtures)).toEqual([]);
  });

  it("boundaries are M24/M48/M72", () => {
    expect(GROUP_WAVE_BOUNDARIES.map((b) => b.matchNumber)).toEqual([24, 48, 72]);
  });

  it("detects a violated invariant on a corrupted fixture set", () => {
    // Drop one team's matchday-1 fixture pairing to break the count at M24.
    const broken = fixtures.filter((f) => f.matchNumber !== 1);
    expect(validateGroupWaveBoundaries(broken).length).toBeGreaterThan(0);
  });
});

describe("getGroupWaveForMatchNumber", () => {
  it("maps group matches to waves 1/2/3 and returns null outside M1-72", () => {
    expect(getGroupWaveForMatchNumber(1)).toBe(1);
    expect(getGroupWaveForMatchNumber(24)).toBe(1);
    expect(getGroupWaveForMatchNumber(25)).toBe(2);
    expect(getGroupWaveForMatchNumber(48)).toBe(2);
    expect(getGroupWaveForMatchNumber(49)).toBe(3);
    expect(getGroupWaveForMatchNumber(72)).toBe(3);
    expect(getGroupWaveForMatchNumber(0)).toBeNull();
    expect(getGroupWaveForMatchNumber(73)).toBeNull();
  });
});

describe("knockout checkpoint mapping", () => {
  it("maps match numbers to the correct round", () => {
    expect(getKnockoutRoundForMatchNumber(73)).toBe("roundOf32");
    expect(getKnockoutRoundForMatchNumber(88)).toBe("roundOf32");
    expect(getKnockoutRoundForMatchNumber(89)).toBe("roundOf16");
    expect(getKnockoutRoundForMatchNumber(96)).toBe("roundOf16");
    expect(getKnockoutRoundForMatchNumber(97)).toBe("quarterFinal");
    expect(getKnockoutRoundForMatchNumber(100)).toBe("quarterFinal");
    expect(getKnockoutRoundForMatchNumber(101)).toBe("semiFinal");
    expect(getKnockoutRoundForMatchNumber(102)).toBe("semiFinal");
    expect(getKnockoutRoundForMatchNumber(103)).toBe("thirdPlace");
    expect(getKnockoutRoundForMatchNumber(104)).toBe("final");
    expect(getKnockoutRoundForMatchNumber(72)).toBeNull();
    expect(getKnockoutRoundForMatchNumber(105)).toBeNull();
  });

  it("agrees with the official knockout graph for every M73-M104 match", () => {
    for (const m of officialKnockoutGraph.matches) {
      expect(getKnockoutRoundForMatchNumber(m.matchNumber)).toBe(m.stage);
    }
    // and the graph indeed spans 73..104
    const nums = officialKnockoutGraph.matches.map((m) => m.matchNumber).sort((a, b) => a - b);
    expect(nums[0]).toBe(73);
    expect(nums[nums.length - 1]).toBe(104);
    expect(nums).toHaveLength(32);
  });
});

describe("milestones", () => {
  it("lists 9 milestones (8 title + the non-title third-place) in match order", () => {
    const all = listForecastMilestones();
    expect(all.map((m) => m.matchNumber)).toEqual([24, 48, 72, 88, 96, 100, 102, 103, 104]);
    expect(all).toEqual([...all].sort((a, b) => a.matchNumber - b.matchNumber));
  });

  it("title-probability milestones are M24/48/72/88/96/100/102/104 (M103 excluded)", () => {
    expect(listTitleProbabilityMilestones().map((m) => m.matchNumber)).toEqual([
      24, 48, 72, 88, 96, 100, 102, 104,
    ]);
    expect(isTitleProbabilityMilestone(104)).toBe(true);
    expect(isTitleProbabilityMilestone(24)).toBe(true);
    expect(isTitleProbabilityMilestone(103)).toBe(false);
  });

  it("classifies M103 as a non-title third-place milestone", () => {
    const m103 = getForecastCheckpointForMatchNumber(103);
    expect(m103).not.toBeNull();
    expect(m103!.kind).toBe("third-place");
    expect(m103!.knockoutRound).toBe("thirdPlace");
    expect(m103!.isTitleProbabilityMilestone).toBe(false);
  });

  it("isForecastMilestoneMatchNumber recognises only boundary matches", () => {
    expect(isForecastMilestoneMatchNumber(72)).toBe(true);
    expect(isForecastMilestoneMatchNumber(103)).toBe(true);
    expect(isForecastMilestoneMatchNumber(73)).toBe(false);
    expect(isForecastMilestoneMatchNumber(50)).toBe(false);
  });

  it("helpers are deterministic", () => {
    expect(listForecastMilestones()).toEqual(listForecastMilestones());
    expect(getForecastCheckpointForMatchNumber(88)).toEqual(
      getForecastCheckpointForMatchNumber(88),
    );
    // returned arrays are copies (no shared mutable state)
    const a = listForecastMilestones();
    a.pop();
    expect(listForecastMilestones()).toHaveLength(FORECAST_MILESTONES.length);
  });
});

describe("public checkpoint policy (isPublicMilestoneLocked + labels)", () => {
  it("includes baseline (0) and the eight title-probability milestones", () => {
    for (const locked of [0, 24, 48, 72, 88, 96, 100, 102, 104]) {
      expect(isPublicMilestoneLocked(locked), `locked ${locked} should be public`).toBe(true);
    }
  });

  it("excludes the manual/dev checkpoints (54, 73) and the third-place milestone (103)", () => {
    for (const locked of [54, 73, 103]) {
      expect(isPublicMilestoneLocked(locked), `locked ${locked} must NOT be public`).toBe(false);
    }
    // And arbitrary non-milestone counts.
    for (const locked of [1, 12, 60, 90, 101]) expect(isPublicMilestoneLocked(locked)).toBe(false);
  });

  it("labels every public milestone with the non-technical wording", () => {
    expect(PUBLIC_MILESTONE_LABELS[0]).toEqual({ label: "Tournament start", shortLabel: "Start" });
    expect(PUBLIC_MILESTONE_LABELS[24]).toEqual({ label: "Group matchday 1 complete", shortLabel: "MD1" });
    expect(PUBLIC_MILESTONE_LABELS[48]).toEqual({ label: "Group matchday 2 complete", shortLabel: "MD2" });
    expect(PUBLIC_MILESTONE_LABELS[72]).toEqual({ label: "Group stage complete", shortLabel: "Groups" });
    expect(PUBLIC_MILESTONE_LABELS[88]).toEqual({ label: "Round of 32 complete", shortLabel: "R32" });
    expect(PUBLIC_MILESTONE_LABELS[96]).toEqual({ label: "Round of 16 complete", shortLabel: "R16" });
    expect(PUBLIC_MILESTONE_LABELS[100]).toEqual({ label: "Quarter-finals complete", shortLabel: "QF" });
    expect(PUBLIC_MILESTONE_LABELS[102]).toEqual({ label: "Semi-finals complete", shortLabel: "SF" });
    expect(PUBLIC_MILESTONE_LABELS[104]).toEqual({ label: "Final complete", shortLabel: "Final" });
    expect(CURRENT_PROJECTION_MILESTONE).toEqual({ label: "Current projection", shortLabel: "Current" });
    // No public label exists for the excluded checkpoints.
    expect(getPublicMilestoneLabel(54)).toBeNull();
    expect(getPublicMilestoneLabel(73)).toBeNull();
    expect(getPublicMilestoneLabel(103)).toBeNull();
    // Every public locked count has a label, and vice-versa.
    for (const locked of [0, 24, 48, 72, 88, 96, 100, 102, 104]) {
      expect(getPublicMilestoneLabel(locked)).not.toBeNull();
    }
  });
});
