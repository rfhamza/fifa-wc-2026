import { describe, expect, it } from "vitest";
import {
  decideScheduledCadence,
  DEFAULT_PRE_WINDOW_MINUTES,
  DEFAULT_POST_WINDOW_MINUTES,
  DEFAULT_BASELINE_INTERVAL_MINUTES,
  DEFAULT_BASELINE_TOLERANCE_MINUTES,
  type FixtureKickoff,
} from "@/lib/live-state/scheduler-cadence";

const MIN = 60_000;
// A kickoff at minute 10 (off the baseline tolerance window) so window-boundary tests
// never accidentally pass or fail via the baseline rule.
const KICKOFF = Date.UTC(2026, 6, 4, 18, 10, 0); // 4 Jul 2026 18:10:00 UTC
const ONE_MATCH: FixtureKickoff[] = [{ matchNumber: 50, kickoffMs: KICKOFF }];
// Kickoffs far from the baseline-test clock so only the baseline rule can fire.
const FAR: FixtureKickoff[] = [{ matchNumber: 90, kickoffMs: Date.UTC(2026, 6, 20, 18, 3, 0) }];

/** now at 2026-07-04 12:<m>:00 UTC (used for baseline-only cases; no window nearby). */
const atMinute = (m: number) => Date.UTC(2026, 6, 4, 12, m, 0);

describe("decideScheduledCadence: defaults", () => {
  it("exports the conservative default window + interval + latency tolerance", () => {
    expect(DEFAULT_PRE_WINDOW_MINUTES).toBe(45);
    expect(DEFAULT_POST_WINDOW_MINUTES).toBe(240);
    expect(DEFAULT_BASELINE_INTERVAL_MINUTES).toBe(30);
    expect(DEFAULT_BASELINE_TOLERANCE_MINUTES).toBe(5);
  });
});

describe("decideScheduledCadence: match window (kickoff - 45 .. kickoff + 240)", () => {
  it("inside the window -> run", () => {
    const d = decideScheduledCadence(KICKOFF + 60 * MIN, ONE_MATCH);
    expect(d.inMatchWindow).toBe(true);
    expect(d.run).toBe(true);
    expect(d.activeMatchNumbers).toEqual([50]);
  });

  it("exactly at kickoff -> run", () => {
    const d = decideScheduledCadence(KICKOFF, ONE_MATCH);
    expect(d.inMatchWindow).toBe(true);
    expect(d.run).toBe(true);
  });

  it("kickoff - 45 min (window open, inclusive) -> run", () => {
    const d = decideScheduledCadence(KICKOFF - 45 * MIN, ONE_MATCH);
    expect(d.inMatchWindow).toBe(true);
    expect(d.run).toBe(true);
  });

  it("kickoff - 46 min (just before the window) -> not in window", () => {
    const d = decideScheduledCadence(KICKOFF - 46 * MIN, ONE_MATCH);
    expect(d.inMatchWindow).toBe(false);
  });

  it("kickoff + 240 min (window close boundary, inclusive) -> run", () => {
    const d = decideScheduledCadence(KICKOFF + 240 * MIN, ONE_MATCH);
    expect(d.inMatchWindow).toBe(true);
    expect(d.run).toBe(true);
  });

  it("kickoff + 241 min (past the window, off baseline) -> skip", () => {
    const now = KICKOFF + 241 * MIN; // 22:11 UTC -> minute 11, outside the tolerance window
    const d = decideScheduledCadence(now, ONE_MATCH);
    expect(d.inMatchWindow).toBe(false);
    expect(d.onBaselineBoundary).toBe(false);
    expect(d.run).toBe(false);
  });
});

describe("decideScheduledCadence: baseline tolerance absorbs fire-to-clock-read latency", () => {
  it("a wake within 5 min AFTER a 30-min mark still runs baseline (real CI latency)", () => {
    // The cron fires at :00/:30 but the guard reads the clock only after npm ci, so
    // it lands at minute 1..4. Those must still count as the baseline wake.
    for (const m of [1, 2, 3, 4, 31, 32, 33, 34]) {
      const d = decideScheduledCadence(atMinute(m), FAR);
      expect(d.onBaselineBoundary, `minute ${m} within tolerance should run baseline`).toBe(true);
      expect(d.run).toBe(true);
    }
  });

  it("a wake exactly at the tolerance edge (minute 5) does NOT run baseline", () => {
    const d = decideScheduledCadence(atMinute(5), FAR);
    expect(d.onBaselineBoundary).toBe(false);
    expect(d.run).toBe(false);
  });

  it("a wake past the tolerance (e.g. minute 6..29) skips", () => {
    for (const m of [6, 12, 20, 29]) {
      const d = decideScheduledCadence(atMinute(m), FAR);
      expect(d.onBaselineBoundary, `minute ${m} is past tolerance`).toBe(false);
      expect(d.run).toBe(false);
    }
  });
});

describe("decideScheduledCadence: 30-minute baseline outside match windows", () => {
  it("minute 0 -> baseline run", () => {
    const d = decideScheduledCadence(atMinute(0), FAR);
    expect(d.inMatchWindow).toBe(false);
    expect(d.onBaselineBoundary).toBe(true);
    expect(d.run).toBe(true);
  });

  it("minute 30 -> baseline run", () => {
    const d = decideScheduledCadence(atMinute(30), FAR);
    expect(d.onBaselineBoundary).toBe(true);
    expect(d.run).toBe(true);
  });

  it("every non-boundary 5-minute tick -> skip", () => {
    for (const m of [5, 10, 15, 20, 25, 35, 40, 45, 50, 55]) {
      const d = decideScheduledCadence(atMinute(m), FAR);
      expect(d.onBaselineBoundary, `minute ${m} should not be a boundary`).toBe(false);
      expect(d.run, `minute ${m} should skip`).toBe(false);
    }
  });
});

describe("decideScheduledCadence: multiple matches + no-op cases", () => {
  it("handles multiple matches in a day (now inside the second window)", () => {
    const k1 = Date.UTC(2026, 6, 4, 16, 3, 0);
    const k2 = Date.UTC(2026, 6, 4, 22, 3, 0);
    const fixtures: FixtureKickoff[] = [
      { matchNumber: 40, kickoffMs: k1 },
      { matchNumber: 41, kickoffMs: k2 },
    ];
    const d = decideScheduledCadence(k2 + 30 * MIN, fixtures);
    expect(d.activeMatchNumbers).toEqual([41]);
    expect(d.run).toBe(true);
  });

  it("reports every match whose window overlaps now", () => {
    const k1 = Date.UTC(2026, 6, 4, 18, 3, 0);
    const k2 = Date.UTC(2026, 6, 4, 18, 6, 0); // overlapping windows
    const fixtures: FixtureKickoff[] = [
      { matchNumber: 40, kickoffMs: k1 },
      { matchNumber: 41, kickoffMs: k2 },
    ];
    const d = decideScheduledCadence(k1 + 10 * MIN, fixtures);
    expect(d.activeMatchNumbers).toEqual([40, 41]);
  });

  it("no matches near now and not on a boundary -> skip", () => {
    const d = decideScheduledCadence(atMinute(7), FAR);
    expect(d.inMatchWindow).toBe(false);
    expect(d.onBaselineBoundary).toBe(false);
    expect(d.run).toBe(false);
  });

  it("empty fixtures on a boundary still runs baseline", () => {
    const d = decideScheduledCadence(atMinute(30), []);
    expect(d.run).toBe(true);
    expect(d.activeMatchNumbers).toEqual([]);
  });
});

describe("decideScheduledCadence: terminal-complete exclusion (committed data)", () => {
  it("drops a terminally-complete match from the active window", () => {
    const now = KICKOFF + 60 * MIN; // inside match 50's window, minute 3 (off boundary)
    const complete = new Set<number>([50]);
    const d = decideScheduledCadence(now, ONE_MATCH, { completedMatchNumbers: complete });
    expect(d.inMatchWindow).toBe(false);
    expect(d.activeMatchNumbers).toEqual([]);
    expect(d.run).toBe(false);
  });

  it("keeps a not-yet-complete match active even when others are complete", () => {
    const k1 = Date.UTC(2026, 6, 4, 18, 3, 0);
    const k2 = Date.UTC(2026, 6, 4, 18, 6, 0);
    const fixtures: FixtureKickoff[] = [
      { matchNumber: 40, kickoffMs: k1 },
      { matchNumber: 41, kickoffMs: k2 },
    ];
    const d = decideScheduledCadence(k1 + 10 * MIN, fixtures, {
      completedMatchNumbers: new Set([40]),
    });
    expect(d.activeMatchNumbers).toEqual([41]);
    expect(d.run).toBe(true);
  });
});

describe("decideScheduledCadence: robustness", () => {
  it("ignores non-finite kickoffs without throwing", () => {
    const fixtures: FixtureKickoff[] = [{ matchNumber: 1, kickoffMs: NaN }];
    const d = decideScheduledCadence(atMinute(7), fixtures);
    expect(d.run).toBe(false);
    expect(d.activeMatchNumbers).toEqual([]);
  });

  it("respects custom window + interval overrides", () => {
    // 10-minute post window: now at kickoff + 15 min is outside it.
    const d = decideScheduledCadence(KICKOFF + 15 * MIN, ONE_MATCH, {
      preWindowMinutes: 5,
      postWindowMinutes: 10,
    });
    expect(d.inMatchWindow).toBe(false);
  });
});
