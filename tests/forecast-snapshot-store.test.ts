/**
 * PR-82 — forecast-snapshot store tests (committed data + fail-safe policy).
 * Committed snapshots only. No network, Blob, provider fetch, or simulation rerun.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  loadForecastSnapshot,
  validateForecastSnapshot,
  type ForecastManifest,
  type ForecastManifestEntry,
} from "@/lib/model/forecast-snapshots";
import {
  COMMITTED_SNAPSHOT_REGISTRY,
  getBaselineSnapshot,
  getCurrentForecastSnapshot,
  getCurrentSnapshotPolicy,
  getCurrentVsBaselineMovers,
  getForecastSnapshotManifest,
  getSnapshotTimeline,
  getStageForecastTrajectory,
  getTeamForecastTrajectory,
  listForecastSnapshots,
  loadForecastData,
  type SnapshotRegistry,
} from "@/lib/model/forecast-snapshot-store";

import baselineRaw from "@/data/forecast/snapshots/baseline-2026-06-11.pre-tournament.json";

const BASELINE_ID = "baseline-2026-06-11.pre-tournament";
const CURRENT_ID = "snapshot-2026-06-29-after-match-073";

const entry = (
  snapshotId: string,
  file: string,
  locked: number,
  isBaseline: boolean,
  prev: string | null,
): ForecastManifestEntry => ({
  snapshotId,
  file,
  snapshotType: isBaseline ? "baseline" : "post-match",
  asOf: "2026-06-11",
  label: snapshotId,
  completedMatchesLocked: locked,
  isBaseline,
  previousSnapshotId: prev,
  notes: "",
});

const manifest = (snapshots: ForecastManifestEntry[]): ForecastManifest => ({
  schemaVersion: "1.0.0",
  snapshots,
});

// --- committed data ----------------------------------------------------------

describe("committed forecast store", () => {
  it("resolves a clean policy from committed data (zero warnings)", () => {
    const p = getCurrentSnapshotPolicy();
    expect(p.warnings).toEqual([]);
    expect(p.isValidChain).toBe(true);
    expect(p.available).toBe(true);
    expect(p.selectionMode).toBe("chain");
    expect(p.baselineSnapshotId).toBe(BASELINE_ID);
    expect(p.currentSnapshotId).toBe(CURRENT_ID);
  });

  it("selects baseline and current snapshots", () => {
    expect(getBaselineSnapshot()?.meta.snapshotId).toBe(BASELINE_ID);
    const current = getCurrentForecastSnapshot();
    expect(current?.meta.snapshotId).toBe(CURRENT_ID);
    expect(current?.meta.completedMatchesLocked).toBe(73);
  });

  it("lists snapshots and a timeline in chain order", () => {
    expect(listForecastSnapshots().map((s) => s.meta.snapshotId)).toEqual([
      BASELINE_ID,
      "snapshot-2026-06-25-after-match-054",
      "snapshot-2026-06-29-after-match-072",
      CURRENT_ID,
    ]);
    const timeline = getSnapshotTimeline();
    expect(timeline.map((t) => t.index)).toEqual([0, 1, 2, 3]);
    expect(timeline.filter((t) => t.isCurrent).map((t) => t.snapshotId)).toEqual([CURRENT_ID]);
    expect(timeline[0]!.isBaseline).toBe(true);
  });

  it("produces baseline->current movers and trajectories", () => {
    const movers = getCurrentVsBaselineMovers();
    expect(movers.stage).toBe("winner");
    expect(movers.mode).toBe("signed");
    expect(Array.isArray(movers.risers)).toBe(true);
    expect(Array.isArray(movers.fallers)).toBe(true);

    const traj = getTeamForecastTrajectory("spain");
    expect(traj.points).toHaveLength(4);
    const stageTraj = getStageForecastTrajectory("winner");
    expect(stageTraj.teams[0]!.series).toHaveLength(4);
  });

  it("the manifest and every committed snapshot validate", () => {
    expect(getForecastSnapshotManifest()?.snapshots).toHaveLength(4);
    for (const raw of COMMITTED_SNAPSHOT_REGISTRY.values()) {
      expect(validateForecastSnapshot(loadForecastSnapshot(raw))).toEqual([]);
    }
  });

  it("every manifest entry has a registry file (no drift)", () => {
    const m = getForecastSnapshotManifest()!;
    for (const e of m.snapshots) {
      expect(COMMITTED_SNAPSHOT_REGISTRY.has(e.file)).toBe(true);
    }
  });
});

// --- fail-safe (injected manifest + registry) --------------------------------

describe("loadForecastData fail-safe", () => {
  it("warns missing-snapshot-file and degrades when a file is absent", () => {
    const reg: SnapshotRegistry = new Map([["b.json", baselineRaw]]);
    const d = loadForecastData(
      manifest([entry("b", "b.json", 0, true, null), entry("c", "c.json", 54, false, "b")]),
      reg,
    );
    expect(d.policy.warnings.map((w) => w.code)).toContain("missing-snapshot-file");
    expect(d.policy.available).toBe(false); // current `c` not loaded
    expect(d.byId.has("b")).toBe(true);
  });

  it("warns malformed-snapshot when a body is invalid", () => {
    const reg: SnapshotRegistry = new Map<string, unknown>([
      ["b.json", baselineRaw],
      ["c.json", { not: "a snapshot" }],
    ]);
    const d = loadForecastData(
      manifest([entry("b", "b.json", 0, true, null), entry("c", "c.json", 54, false, "b")]),
      reg,
    );
    expect(d.policy.warnings.map((w) => w.code)).toContain("malformed-snapshot");
    expect(d.policy.available).toBe(false);
  });

  it("returns an unavailable policy on a malformed manifest (never throws)", () => {
    const d = loadForecastData({ not: "a manifest" }, new Map());
    expect(d.manifest).toBeNull();
    expect(d.policy.available).toBe(false);
    expect(d.policy.selectionMode).toBe("unavailable");
    expect(d.policy.warnings.map((w) => w.code)).toContain("malformed-snapshot");
  });

  it("loads a clean injected chain with zero warnings", () => {
    const reg: SnapshotRegistry = new Map<string, unknown>([
      ["b.json", baselineRaw],
      ["c.json", baselineRaw],
    ]);
    const d = loadForecastData(
      manifest([entry("b", "b.json", 0, true, null), entry("c", "c.json", 54, false, "b")]),
      reg,
    );
    expect(d.policy.warnings).toEqual([]);
    expect(d.policy.available).toBe(true);
    expect(d.policy.currentSnapshotId).toBe("c");
  });
});

// --- isolation ---------------------------------------------------------------

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function importLines(src: string): string {
  return src
    .split("\n")
    .filter((l) => l.trimStart().startsWith("import"))
    .join("\n");
}

function codeWithoutComments(src: string): string {
  return src
    .split("\n")
    .filter((l) => {
      const t = l.trimStart();
      return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
    })
    .join("\n");
}

describe("isolation", () => {
  const root = process.cwd();
  const deltasSrc = readFileSync(join(root, "lib/model/forecast-deltas.ts"), "utf8");
  const storeSrc = readFileSync(join(root, "lib/model/forecast-snapshot-store.ts"), "utf8");

  it("the pure delta module imports nothing forbidden", () => {
    const imports = importLines(deltasSrc);
    expect(imports).not.toMatch(/from "(node:)?fs"/);
    expect(imports).not.toMatch(/@\/lib\/live-state|@\/lib\/live-ingest/);
    expect(imports).not.toMatch(/@vercel\/blob/);
    expect(imports).not.toMatch(/@\/lib\/simulation/);
    expect(imports).not.toMatch(/@\/lib\/data\b/); // no team registry in the pure layer
    const code = codeWithoutComments(deltasSrc);
    expect(code).not.toMatch(/process\.env/);
    expect(code).not.toMatch(/\bfetch\s*\(/);
  });

  it("the store module avoids live-state/provider/Blob/simulation and fs/env/fetch", () => {
    const imports = importLines(storeSrc);
    expect(imports).not.toMatch(/from "(node:)?fs"/);
    expect(imports).not.toMatch(/@\/lib\/live-state|@\/lib\/live-ingest/);
    expect(imports).not.toMatch(/@vercel\/blob/);
    expect(imports).not.toMatch(/@\/lib\/simulation/);
    const code = codeWithoutComments(storeSrc);
    expect(code).not.toMatch(/process\.env/);
    expect(code).not.toMatch(/\bfetch\s*\(/);
  });

  it("no client component imports the server-only store", () => {
    const dirs = ["app", "components"].map((d) => join(root, d));
    const offenders: string[] = [];
    for (const dir of dirs) {
      for (const file of walk(dir)) {
        const src = readFileSync(file, "utf8");
        const isClient = /^\s*["']use client["']/m.test(src);
        if (isClient && src.includes("forecast-snapshot-store")) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
