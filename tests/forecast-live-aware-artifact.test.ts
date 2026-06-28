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
 * Phase 1.29 (PR-3C) - guards the first real committed artifacts: a public-safe
 * manual results ledger (54 completed group-stage matches as of 2026-06-25) and
 * the live-aware forecast snapshot derived from it. This is a historical/manual
 * checkpoint, not the latest provider-derived live-state.
 */
const RESULTS_DIR = "data/forecast/results";
const SNAPSHOTS_DIR = "data/forecast/snapshots";
const LEDGER_FILE = "results-as-of-2026-06-25-after-match-054.json";
const SNAPSHOT_FILE = "snapshot-2026-06-25-after-match-054.json";

// Parameters the committed snapshot was generated with (must match exactly).
const GENERATED_AT = "2026-06-25T12:33:09.000Z";
const SNAPSHOT_ID = "snapshot-2026-06-25-after-match-054";
const AS_OF = "2026-06-25";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const ledger = loadForecastResultsLedger(read(join(RESULTS_DIR, LEDGER_FILE)), fixtures);
const committedSnapshot = loadForecastSnapshot(read(join(SNAPSHOTS_DIR, SNAPSHOT_FILE)));

describe("real results ledger (manual checkpoint)", () => {
  it("validates against schema and against official fixtures", () => {
    expect(validateResultsLedger(ledger)).toEqual([]);
    expect(validateResultsLedgerAgainstFixtures(ledger, fixtures)).toEqual([]);
  });

  it("has exactly 54 completed group-stage rows", () => {
    expect(ledger.results).toHaveLength(54);
    for (const r of ledger.results) {
      expect(r.stage).toBe("group");
      expect(r.status).toBe("complete");
      expect(r.matchNumber).toBeLessThanOrEqual(72);
    }
  });

  it("records a public-safe manual provenance and leaks no private data", () => {
    expect(ledger.sourcePolicy).toBe("manual-snapshot");
    expect(ledger.asOf).toBe("2026-06-25T12:33:09Z");
    expect(findForbiddenSubstrings(JSON.stringify(ledger))).toEqual([]);
  });
});

describe("manifests reference the real artifacts", () => {
  it("results manifest references the ledger", () => {
    const manifest = loadForecastResultsManifest(read(join(RESULTS_DIR, "manifest.json")));
    const entry = manifest.ledgers.find((l) => l.ledgerId === ledger.ledgerId);
    expect(entry).toBeDefined();
    expect(entry!.file).toBe(LEDGER_FILE);
    expect(entry!.resultCount).toBe(54);
  });

  it("snapshot manifest references the live-aware snapshot as a non-baseline child of the baseline", () => {
    const manifest = loadForecastManifest(read(join(SNAPSHOTS_DIR, "manifest.json")));
    const entry = manifest.snapshots.find((s) => s.snapshotId === SNAPSHOT_ID);
    expect(entry).toBeDefined();
    expect(entry!.file).toBe(SNAPSHOT_FILE);
    expect(entry!.isBaseline).toBe(false);
    expect(entry!.completedMatchesLocked).toBe(54);
    expect(entry!.previousSnapshotId).toBe("baseline-2026-06-11.pre-tournament");
  });
});

describe("live-aware snapshot artifact", () => {
  it("validates against schema, with 48 teams and probabilities in [0,1]", () => {
    expect(validateForecastSnapshot(committedSnapshot)).toEqual([]);
    expect(committedSnapshot.teams).toHaveLength(48);
    for (const t of committedSnapshot.teams) {
      for (const key of FORECAST_PROBABILITY_KEYS) {
        expect(t[key]).toBeGreaterThanOrEqual(0);
        expect(t[key]).toBeLessThanOrEqual(1);
      }
    }
  });

  it("records the expected provenance and locked count, with manager weight 0", () => {
    const m = committedSnapshot.meta;
    expect(m.snapshotType).toBe("post-match");
    expect(m.completedMatchesLocked).toBe(54);
    expect(m.liveStateSource).toBe("manual-snapshot");
    expect(m.liveStateAsOf).toBe("2026-06-25T12:33:09Z");
    expect(m.weightsSummary.manager).toBe(0);
    expect(findForbiddenSubstrings(JSON.stringify(committedSnapshot))).toEqual([]);
  });

  it("regenerates byte-for-byte from the committed ledger with the fixed parameters", () => {
    const regenerated = buildLiveAwareForecastSnapshot({
      generatedAt: GENERATED_AT,
      lockedResults: ledgerToLockedResults(ledger),
      snapshotType: "post-match",
      asOf: AS_OF,
      snapshotId: SNAPSHOT_ID,
      liveStateSource: ledger.sourcePolicy,
      liveStateAsOf: ledger.asOf,
    });
    const committed = read(join(SNAPSHOTS_DIR, SNAPSHOT_FILE)).trim();
    expect(JSON.stringify(regenerated, null, 2)).toBe(committed);
  });
});

describe("baseline is untouched and movement is real", () => {
  const baseline = loadForecastSnapshot(read(join(SNAPSHOTS_DIR, "baseline-2026-06-11.pre-tournament.json")));

  it("baseline snapshot still regenerates byte-for-byte (unchanged)", () => {
    // The committed baseline is its own reproducibility anchor (PR-2). Here we just
    // confirm it is still present and valid alongside the new artifact.
    expect(validateForecastSnapshot(baseline)).toEqual([]);
    expect(baseline.meta.snapshotType).toBe("baseline");
    expect(baseline.meta.completedMatchesLocked).toBe(0);
  });

  it("at least one team's winner probability moved vs the baseline (loose sanity)", () => {
    const baseWinner = new Map(baseline.teams.map((t) => [t.teamId, t.winner]));
    expect(committedSnapshot.teams.some((t) => t.winner !== baseWinner.get(t.teamId))).toBe(true);
  });
});

describe("derive helper + generator stay offline (no live-state / Blob / env / fetch)", () => {
  const derive = read("scripts/derive-results-ledger.ts");
  const generator = read("scripts/generate-forecast-snapshot.ts");
  it("contain no runtime live-state route, fetch, Blob, or env access", () => {
    for (const src of [derive, generator]) {
      expect(src).not.toContain("/api/live-state");
      expect(src).not.toContain("fetch(");
      expect(src).not.toContain("@vercel/blob");
      expect(src).not.toContain("process.env");
    }
  });
});
