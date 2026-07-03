import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadForecastResultsLedger,
  loadForecastResultsManifest,
  validateResultsLedger,
  validateResultsLedgerAgainstFixtures,
  ledgerToLockedResults,
} from "@/lib/model/forecast-results-ledger";
import {
  loadForecastSnapshot,
  loadForecastManifest,
  buildLiveAwareForecastSnapshot,
  validateForecastSnapshot,
  findForbiddenSubstrings,
  FORECAST_PROBABILITY_KEYS,
} from "@/lib/model/forecast-snapshots";
import { fixtures } from "@/lib/data";

/**
 * Milestone backfill — the two public group-matchday checkpoints M24 / M48, reconstructed
 * deterministically from the committed M72 provider-public-delayed ledger truncated to the
 * first 24 / 48 completed group-stage matches. Byte-for-byte regeneration proves determinism;
 * schema + no-leak guards mirror the M54 / M72 artifact tests.
 */
const RESULTS_DIR = "data/forecast/results";
const SNAPSHOTS_DIR = "data/forecast/snapshots";
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

interface Milestone {
  n: 24 | 48;
  wave: 1 | 2;
  ledgerFile: string;
  snapshotFile: string;
  ledgerId: string;
  snapshotId: string;
  asOf: string;
  generatedAt: string;
  notes: string;
}

const MILESTONES: Milestone[] = [
  {
    n: 24,
    wave: 1,
    ledgerFile: "results-as-of-2026-06-18-after-match-024.json",
    snapshotFile: "snapshot-2026-06-18-after-match-024.json",
    ledgerId: "results-as-of-2026-06-18-after-match-024",
    snapshotId: "snapshot-2026-06-18-after-match-024",
    asOf: "2026-06-18T02:00:00Z",
    generatedAt: "2026-06-18T02:00:00.000Z",
    notes:
      "Backfilled live-aware forecast reconstructed from the committed M72 ledger truncated to the first 24 group matches (group matchday 1 complete); seed 20260611, 2000 iterations.",
  },
  {
    n: 48,
    wave: 2,
    ledgerFile: "results-as-of-2026-06-24-after-match-048.json",
    snapshotFile: "snapshot-2026-06-24-after-match-048.json",
    ledgerId: "results-as-of-2026-06-24-after-match-048",
    snapshotId: "snapshot-2026-06-24-after-match-048",
    asOf: "2026-06-24T02:00:00Z",
    generatedAt: "2026-06-24T02:00:00.000Z",
    notes:
      "Backfilled live-aware forecast reconstructed from the committed M72 ledger truncated to the first 48 group matches (group matchday 2 complete); seed 20260611, 2000 iterations.",
  },
];

// The M72 ledger is the deterministic truncation source (matchNumber 1..72 contiguous).
const sourceLedger = loadForecastResultsLedger(
  read(join(RESULTS_DIR, "results-as-of-2026-06-29-after-match-072.json")),
  fixtures,
);

for (const ms of MILESTONES) {
  describe(`milestone backfill — M${ms.n} (group matchday ${ms.wave} complete)`, () => {
    const ledger = loadForecastResultsLedger(read(join(RESULTS_DIR, ms.ledgerFile)), fixtures);
    const snapshot = loadForecastSnapshot(read(join(SNAPSHOTS_DIR, ms.snapshotFile)));

    it(`ledger truncates the M72 source to the first ${ms.n} contiguous group rows`, () => {
      expect(validateResultsLedger(ledger)).toEqual([]);
      expect(validateResultsLedgerAgainstFixtures(ledger, fixtures)).toEqual([]);
      expect(ledger.results).toHaveLength(ms.n);
      const nums = ledger.results.map((r) => r.matchNumber).sort((a, b) => a - b);
      expect(nums[0]).toBe(1);
      expect(nums[nums.length - 1]).toBe(ms.n);
      expect(nums.every((v, i) => v === i + 1)).toBe(true);
      expect(ledger.results.every((r) => r.stage === "group")).toBe(true);
      // The rows are exactly the M72 source rows for those match numbers.
      const sourceSlice = sourceLedger.results.filter((r) => r.matchNumber <= ms.n);
      expect(JSON.stringify(ledger.results)).toBe(JSON.stringify(sourceSlice));
    });

    it("every team has played exactly the matchday count; no boundary is split", () => {
      const played = new Map<string, number>();
      for (const r of ledger.results) {
        played.set(r.homeTeamId, (played.get(r.homeTeamId) ?? 0) + 1);
        played.set(r.awayTeamId, (played.get(r.awayTeamId) ?? 0) + 1);
      }
      expect(played.size).toBe(48);
      expect([...played.values()].every((c) => c === ms.wave)).toBe(true);
    });

    it("snapshot validates: 48 teams, all stage fields + ranks 1..48, no leak", () => {
      expect(validateForecastSnapshot(snapshot)).toEqual([]);
      expect(snapshot.teams).toHaveLength(48);
      for (const t of snapshot.teams) {
        for (const key of FORECAST_PROBABILITY_KEYS) {
          expect(t[key]).toBeGreaterThanOrEqual(0);
          expect(t[key]).toBeLessThanOrEqual(1);
        }
      }
      const ranks = snapshot.teams.map((t) => t.rank).sort((a, b) => a - b);
      expect(ranks).toEqual(Array.from({ length: 48 }, (_, i) => i + 1));
      expect(snapshot.meta.completedMatchesLocked).toBe(ms.n);
      expect(snapshot.meta.snapshotType).toBe("post-match");
      expect(findForbiddenSubstrings(JSON.stringify(snapshot))).toEqual([]);
    });

    it("regenerates byte-for-byte from the committed ledger with the fixed parameters", () => {
      const lockedResults = ledgerToLockedResults(ledger);
      const latest = lockedResults.reduce((max, r) => (r.matchNumber > max ? r.matchNumber : max), 0);
      const regenerated = buildLiveAwareForecastSnapshot({
        generatedAt: ms.generatedAt,
        lockedResults,
        snapshotType: "post-match",
        asOf: ms.asOf,
        snapshotId: ms.snapshotId,
        notes: ms.notes,
        liveStateSource: ledger.sourcePolicy,
        liveStateAsOf: ledger.asOf,
        providerCompletedMatchesTotal: ledger.providerCompletedMatchesTotal,
        sourceObjectPath: ledger.sourceObjectPath,
        latestCompletedSupportedMatchNumber: latest,
      });
      expect(JSON.stringify(regenerated, null, 2)).toBe(read(join(SNAPSHOTS_DIR, ms.snapshotFile)).trim());
    });
  });
}

describe("milestone backfill — manifests", () => {
  it("results manifest lists both new milestone ledgers with the right counts", () => {
    const man = loadForecastResultsManifest(read(join(RESULTS_DIR, "manifest.json")));
    const byId = new Map(man.ledgers.map((l) => [l.ledgerId, l]));
    expect(byId.get("results-as-of-2026-06-18-after-match-024")?.resultCount).toBe(24);
    expect(byId.get("results-as-of-2026-06-24-after-match-048")?.resultCount).toBe(48);
  });

  it("snapshot manifest chains baseline -> M24 -> M48 -> M54 by completedMatchesLocked", () => {
    const man = loadForecastManifest(read(join(SNAPSHOTS_DIR, "manifest.json")));
    const byId = new Map(man.snapshots.map((s) => [s.snapshotId, s]));
    expect(byId.get("snapshot-2026-06-18-after-match-024")?.previousSnapshotId).toBe(
      "baseline-2026-06-11.pre-tournament",
    );
    expect(byId.get("snapshot-2026-06-24-after-match-048")?.previousSnapshotId).toBe(
      "snapshot-2026-06-18-after-match-024",
    );
    expect(byId.get("snapshot-2026-06-25-after-match-054")?.previousSnapshotId).toBe(
      "snapshot-2026-06-24-after-match-048",
    );
    // Ordered strictly by completedMatchesLocked.
    const locked = man.snapshots.map((s) => s.completedMatchesLocked);
    expect(locked).toEqual([...locked].sort((a, b) => a - b));
    expect(locked).toEqual([0, 24, 48, 54, 72, 73]);
  });
});
