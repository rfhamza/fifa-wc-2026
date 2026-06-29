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
import { resolveLockedResults } from "@/lib/simulation/locked-results";
import { fixtures } from "@/lib/data";

/**
 * Phase 1.29 (PR-3D) - the provider-public-delayed M72 transitional checkpoint,
 * generated from the committed sanitized provider live-state reference fixture
 * (read mode: file fixture, NOT a live Blob read). The provider already has M73
 * (R32, Canada) complete; the engine can only lock group-stage results, so M72 is
 * the latest *supported* checkpoint and knockout locking is deferred to PR-3E.
 */
const RESULTS_DIR = "data/forecast/results";
const SNAPSHOTS_DIR = "data/forecast/snapshots";
const LEDGER_FILE = "results-as-of-2026-06-29-after-match-072.json";
const SNAPSHOT_FILE = "snapshot-2026-06-29-after-match-072.json";
const FIXTURE = "tests/fixtures/live-state/provider-public-safe-2026-06-29.json";

// Parameters the committed snapshot was generated with (must match exactly).
const GENERATED_AT = "2026-06-29T07:02:22.483Z";
const SNAPSHOT_ID = "snapshot-2026-06-29-after-match-072";
const AS_OF = "2026-06-29";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const providerState = JSON.parse(read(FIXTURE)) as {
  matches: { matchNumber: number; stage: string; status: string; winner?: string }[];
};
const ledger = loadForecastResultsLedger(read(join(RESULTS_DIR, LEDGER_FILE)), fixtures);
const snapshot = loadForecastSnapshot(read(join(SNAPSHOTS_DIR, SNAPSHOT_FILE)));

describe("provider live-state reference fixture (M72 vs M73)", () => {
  const completed = providerState.matches.filter((m) => m.status === "complete");
  it("has 73 completed official matches total, 72 of them group-stage", () => {
    expect(completed).toHaveLength(73);
    expect(completed.filter((m) => m.stage === "group")).toHaveLength(72);
  });
  it("includes M73 as a completed Round of 32 with Canada as winner", () => {
    const m73 = providerState.matches.find((m) => m.matchNumber === 73);
    expect(m73?.status).toBe("complete");
    expect(m73?.stage).toBe("roundOf32");
    expect(m73?.winner).toBe("canada");
  });
});

describe("provider-public-delayed results ledger (M72)", () => {
  it("validates against schema and official fixtures, with 72 group rows", () => {
    expect(validateResultsLedger(ledger)).toEqual([]);
    expect(validateResultsLedgerAgainstFixtures(ledger, fixtures)).toEqual([]);
    expect(ledger.results).toHaveLength(72);
  });
  it("records provider-public-delayed provenance incl. the unlocked total (73)", () => {
    expect(ledger.sourcePolicy).toBe("provider-public-delayed");
    expect(ledger.asOf).toBe("2026-06-29T07:02:22.483Z");
    expect(ledger.providerCompletedMatchesTotal).toBe(73);
    expect(ledger.sourceObjectPath).toBe("live-state.provider.sanitized.json");
  });
  it("excludes the completed knockout match M73 and leaks no provider/private data", () => {
    expect(ledger.results.some((r) => r.matchNumber === 73)).toBe(false);
    expect(ledger.results.every((r) => r.stage === "group" && r.matchNumber <= 72)).toBe(true);
    expect(findForbiddenSubstrings(JSON.stringify(ledger))).toEqual([]);
  });
});

describe("PR-3E boundary: the engine cannot lock the completed knockout result", () => {
  it("rejects locking M73 (knockout) against the group fixtures", () => {
    expect(() =>
      resolveLockedResults(
        [{ matchNumber: 73, homeTeamId: "south-africa", awayTeamId: "canada", homeGoals: 0, awayGoals: 1 }],
        fixtures,
      ),
    ).toThrow(/unknown|non-group/i);
  });
});

describe("provider-public-delayed snapshot artifact (M72)", () => {
  it("validates against schema; 48 teams; probabilities in [0,1]; manager weight 0", () => {
    expect(validateForecastSnapshot(snapshot)).toEqual([]);
    expect(snapshot.teams).toHaveLength(48);
    for (const t of snapshot.teams) {
      for (const key of FORECAST_PROBABILITY_KEYS) {
        expect(t[key]).toBeGreaterThanOrEqual(0);
        expect(t[key]).toBeLessThanOrEqual(1);
      }
    }
    expect(snapshot.meta.weightsSummary.manager).toBe(0);
  });
  it("records the M72/M73 distinction and provider provenance", () => {
    const m = snapshot.meta;
    expect(m.snapshotType).toBe("post-match");
    expect(m.completedMatchesLocked).toBe(72);
    expect(m.latestCompletedSupportedMatchNumber).toBe(72);
    expect(m.providerCompletedMatchesTotal).toBe(73);
    expect(m.liveStateSource).toBe("provider-public-delayed");
    expect(m.liveStateAsOf).toBe("2026-06-29T07:02:22.483Z");
    expect(m.sourceObjectPath).toBe("live-state.provider.sanitized.json");
    expect(findForbiddenSubstrings(JSON.stringify(snapshot))).toEqual([]);
  });
  it("regenerates byte-for-byte from the committed ledger with the fixed parameters", () => {
    const lockedResults = ledgerToLockedResults(ledger);
    const latest = lockedResults.reduce((max, r) => (r.matchNumber > max ? r.matchNumber : max), 0);
    const regenerated = buildLiveAwareForecastSnapshot({
      generatedAt: GENERATED_AT,
      lockedResults,
      snapshotType: "post-match",
      asOf: AS_OF,
      snapshotId: SNAPSHOT_ID,
      liveStateSource: ledger.sourcePolicy,
      liveStateAsOf: ledger.asOf,
      providerCompletedMatchesTotal: ledger.providerCompletedMatchesTotal,
      sourceObjectPath: ledger.sourceObjectPath,
      latestCompletedSupportedMatchNumber: latest,
    });
    expect(JSON.stringify(regenerated, null, 2)).toBe(read(join(SNAPSHOTS_DIR, SNAPSHOT_FILE)).trim());
  });
});

describe("manifests chain baseline -> M54 -> M72", () => {
  it("results manifest references both the M54 manual and M72 provider ledgers", () => {
    const man = loadForecastResultsManifest(read(join(RESULTS_DIR, "manifest.json")));
    const ids = man.ledgers.map((l) => l.ledgerId);
    expect(ids).toContain("results-as-of-2026-06-25-after-match-054");
    expect(ids).toContain("results-as-of-2026-06-29-after-match-072");
    expect(man.ledgers.find((l) => l.ledgerId === "results-as-of-2026-06-29-after-match-072")!.resultCount).toBe(72);
  });
  it("snapshot manifest references baseline + M54 + M72 with the correct previous chain", () => {
    const man = loadForecastManifest(read(join(SNAPSHOTS_DIR, "manifest.json")));
    const entry = man.snapshots.find((s) => s.snapshotId === SNAPSHOT_ID);
    expect(entry).toBeDefined();
    expect(entry!.isBaseline).toBe(false);
    expect(entry!.completedMatchesLocked).toBe(72);
    expect(entry!.previousSnapshotId).toBe("snapshot-2026-06-25-after-match-054");
  });
});

describe("earlier committed snapshots stay byte-stable (no new fields leaked in)", () => {
  it("baseline + M54 snapshots carry none of the new optional provenance fields", () => {
    const baseline = loadForecastSnapshot(read(join(SNAPSHOTS_DIR, "baseline-2026-06-11.pre-tournament.json")));
    const m54 = loadForecastSnapshot(read(join(SNAPSHOTS_DIR, "snapshot-2026-06-25-after-match-054.json")));
    for (const m of [baseline.meta, m54.meta]) {
      expect(m.latestCompletedSupportedMatchNumber).toBeUndefined();
      expect(m.providerCompletedMatchesTotal).toBeUndefined();
      expect(m.sourceObjectPath).toBeUndefined();
    }
  });
});
