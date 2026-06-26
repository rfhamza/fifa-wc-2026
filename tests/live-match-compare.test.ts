import { describe, expect, it } from "vitest";
import {
  compareForecastToActual,
  predictedOutcomeOf,
  type ForecastInput,
} from "@/lib/live-client/compare-forecast";
import type { LiveViewMatch } from "@/lib/live-client/public-safe-view.client";

/**
 * Phase 1.28Q-E - pure forecast-vs-actual helper. Node-env, no DOM/network. Covers
 * orientation, fail-closed unmatched teams, status gating, the four outcome verdicts,
 * exact-scoreline hit/miss, result-pending, defensive penalties, and the no-leak boundary.
 */

const lvm = (over: Partial<LiveViewMatch>): LiveViewMatch => ({
  matchNumber: 1,
  matchId: "M1",
  stage: "group",
  teamA: "home",
  teamB: "away",
  status: "complete",
  ...over,
});

const input = (over: Partial<ForecastInput> = {}): ForecastInput => ({
  homeTeamId: "home",
  awayTeamId: "away",
  predictedOutcome: "home",
  mostLikely: { homeGoals: 2, awayGoals: 1 },
  ...over,
});

describe("predictedOutcomeOf", () => {
  it("returns the argmax of W/D/L", () => {
    expect(predictedOutcomeOf({ homeWin: 0.5, draw: 0.3, awayWin: 0.2 })).toBe("home");
    expect(predictedOutcomeOf({ homeWin: 0.2, draw: 0.5, awayWin: 0.3 })).toBe("draw");
    expect(predictedOutcomeOf({ homeWin: 0.2, draw: 0.3, awayWin: 0.5 })).toBe("away");
  });
  it("breaks ties deterministically home -> draw -> away", () => {
    expect(predictedOutcomeOf({ homeWin: 0.4, draw: 0.4, awayWin: 0.2 })).toBe("home");
    expect(predictedOutcomeOf({ homeWin: 0.3, draw: 0.4, awayWin: 0.4 })).toBe("draw");
  });
});

describe("no overlay (kind: none)", () => {
  it("returns none with no live match", () => {
    expect(compareForecastToActual(input()).kind).toBe("none");
  });
  it("fails closed when live teams do not match the fixture", () => {
    expect(compareForecastToActual(input(), lvm({ teamA: "x", teamB: "y", goalsA: 1, goalsB: 0 })).kind).toBe("none");
  });
  it.each(["scheduled", "postponed", "cancelled", "unknown"] as const)(
    "returns none for status %s",
    (status) => {
      expect(compareForecastToActual(input(), lvm({ status, goalsA: 1, goalsB: 0 })).kind).toBe("none");
    },
  );
});

describe("in-progress", () => {
  it("shows the oriented score with no verdict", () => {
    const r = compareForecastToActual(input(), lvm({ status: "in-progress", goalsA: 1, goalsB: 0 }));
    expect(r).toEqual({ kind: "in-progress", home: 1, away: 0 });
  });
  it("returns none if in-progress has no score yet", () => {
    expect(compareForecastToActual(input(), lvm({ status: "in-progress" })).kind).toBe("none");
  });
});

describe("orientation by team id (both ways)", () => {
  it("teamA == home", () => {
    const r = compareForecastToActual(input(), lvm({ teamA: "home", teamB: "away", goalsA: 2, goalsB: 1 }));
    expect(r).toMatchObject({ kind: "final", home: 2, away: 1, actualOutcome: "home" });
  });
  it("teamA == away (scores swapped to fixture home/away)", () => {
    const r = compareForecastToActual(input(), lvm({ teamA: "away", teamB: "home", goalsA: 1, goalsB: 2 }));
    expect(r).toMatchObject({ kind: "final", home: 2, away: 1, actualOutcome: "home" });
  });
});

describe("completed verdicts", () => {
  it("home win predicted and home wins -> correct", () => {
    const r = compareForecastToActual(input({ predictedOutcome: "home" }), lvm({ goalsA: 2, goalsB: 1 }));
    expect(r).toMatchObject({ kind: "final", winnerVerdict: "correct", actualOutcome: "home" });
  });
  it("away win predicted and away wins -> correct (with swapped orientation)", () => {
    const r = compareForecastToActual(
      input({ predictedOutcome: "away" }),
      lvm({ teamA: "away", teamB: "home", goalsA: 2, goalsB: 0 }),
    );
    expect(r).toMatchObject({ kind: "final", home: 0, away: 2, actualOutcome: "away", winnerVerdict: "correct" });
  });
  it("incorrect prediction -> incorrect", () => {
    const r = compareForecastToActual(input({ predictedOutcome: "home" }), lvm({ goalsA: 0, goalsB: 2 }));
    expect(r).toMatchObject({ kind: "final", actualOutcome: "away", winnerVerdict: "incorrect" });
  });
  it("predicted draw and actual draw -> predicted-draw", () => {
    const r = compareForecastToActual(input({ predictedOutcome: "draw" }), lvm({ goalsA: 1, goalsB: 1 }));
    expect(r).toMatchObject({ kind: "final", actualOutcome: "draw", winnerVerdict: "predicted-draw" });
  });
  it("predicted a team but actual draw -> actual-draw", () => {
    const r = compareForecastToActual(input({ predictedOutcome: "home" }), lvm({ goalsA: 1, goalsB: 1 }));
    expect(r).toMatchObject({ kind: "final", actualOutcome: "draw", winnerVerdict: "actual-draw" });
  });
  it("predicted draw but a team wins -> incorrect", () => {
    const r = compareForecastToActual(input({ predictedOutcome: "draw" }), lvm({ goalsA: 2, goalsB: 1 }));
    expect(r).toMatchObject({ kind: "final", actualOutcome: "home", winnerVerdict: "incorrect" });
  });
});

describe("exact scoreline (separate from outcome)", () => {
  it("hit when actual equals most-likely", () => {
    const r = compareForecastToActual(input({ mostLikely: { homeGoals: 2, awayGoals: 1 } }), lvm({ goalsA: 2, goalsB: 1 }));
    expect(r).toMatchObject({ exactScoreline: "hit" });
  });
  it("miss when actual differs from most-likely", () => {
    const r = compareForecastToActual(input({ mostLikely: { homeGoals: 2, awayGoals: 0 } }), lvm({ goalsA: 2, goalsB: 1 }));
    expect(r).toMatchObject({ exactScoreline: "miss" });
  });
});

describe("result-pending and penalties", () => {
  it("complete with missing goals -> result-pending", () => {
    expect(compareForecastToActual(input(), lvm({ status: "complete" })).kind).toBe("result-pending");
  });
  it("orients penalties defensively (teamA == home)", () => {
    const r = compareForecastToActual(input({ predictedOutcome: "draw" }), lvm({ goalsA: 1, goalsB: 1, penalties: { a: 4, b: 3 } }));
    expect(r).toMatchObject({ kind: "final", penalties: { home: 4, away: 3 } });
  });
  it("orients penalties defensively (teamA == away -> swapped)", () => {
    const r = compareForecastToActual(
      input({ predictedOutcome: "draw" }),
      lvm({ teamA: "away", teamB: "home", goalsA: 1, goalsB: 1, penalties: { a: 4, b: 3 } }),
    );
    expect(r).toMatchObject({ kind: "final", penalties: { home: 3, away: 4 } });
  });
});

describe("no provider/private-field leakage", () => {
  it("comparison output exposes only sanitized result fields", () => {
    const serialized = JSON.stringify([
      compareForecastToActual(input(), lvm({ goalsA: 2, goalsB: 1, penalties: { a: 4, b: 3 } })),
      compareForecastToActual(input(), lvm({ status: "in-progress", goalsA: 1, goalsB: 0 })),
    ]);
    for (const bad of [
      "providerId", "providerMatchId", "providerTeamId", "X-Auth-Token",
      "Authorization", "BLOB_READ_WRITE_TOKEN", "FOOTBALL_DATA_TOKEN",
      "vercel-storage", "crest", "odds", "referee",
    ]) {
      expect(serialized.includes(bad)).toBe(false);
    }
  });
});
