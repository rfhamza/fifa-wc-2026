/**
 * PR-83E2 — forecast runtime read-store tests. PURE: synthetic fixtures + injected
 * fake stores only. No real Blob, no token, no env, no network, no football-data.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getTeam } from "@/lib/data";
import { loadForecastSnapshot, type ForecastSnapshot } from "@/lib/model/forecast-snapshots";
import { buildMatchForecast } from "@/lib/model/match-forecast";
import {
  buildPublicSafeMatchForecasts,
  toPublicSafeForecastCurrent,
  toPublicSafeMatchForecastEntry,
  type MatchForecastEntryMeta,
  type PublicSafeForecastCurrent,
} from "@/lib/model/forecast-public-safe";
import {
  FORECAST_CURRENT_OBJECT_PATH,
  FORECAST_MATCHES_OBJECT_PATH,
  type ForecastBlobStore,
} from "@/lib/model/forecast-blob-store";
import type { CurrentSnapshotPolicy } from "@/lib/model/forecast-deltas";
import {
  getRuntimeCurrentForecastSnapshot,
  getRuntimeCurrentSnapshotPolicy,
  getRuntimeCurrentVsBaselineComparison,
  getRuntimeCurrentVsBaselineMovers,
  getRuntimeMatchForecast,
  getRuntimeMatchForecasts,
  type RuntimeCommittedForecastStore,
} from "@/lib/model/forecast-runtime-store";

import baselineRaw from "@/data/forecast/snapshots/baseline-2026-06-11.pre-tournament.json";

const ATTR = { sourceName: "football-data.org", text: "Derived internally." };

const baselineSnapshot = loadForecastSnapshot(baselineRaw);
const blobCurrent = toPublicSafeForecastCurrent(baselineSnapshot, {
  publicSourcePolicy: "provider-public-delayed",
  attribution: ATTR,
});
// A "moved" current that differs from baseline (team[0] title prob bumped up).
const movedCurrent: PublicSafeForecastCurrent = {
  ...blobCurrent,
  snapshotId: "runtime-moved",
  teams: blobCurrent.teams.map((t, i) => (i === 0 ? { ...t, winner: Math.min(1, t.winner + 0.2) } : { ...t })),
};

const currentMeta: MatchForecastEntryMeta = {
  status: "scheduled",
  forecastAsOf: "2026-06-29",
  generatedAt: "2026-06-29T00:00:00.000Z",
  provenance: "current-pre-match-forecast",
  capturedBeforeCompletion: true,
  archived: false,
};
const archivedMeta: MatchForecastEntryMeta = {
  ...currentMeta,
  status: "complete",
  provenance: "archived-pre-match-forecast",
  capturedBeforeCompletion: true,
  archived: true,
};
const retroMeta: MatchForecastEntryMeta = {
  ...currentMeta,
  status: "complete",
  provenance: "retrospective-model-forecast",
  capturedBeforeCompletion: false,
  archived: true,
};
function entryFor(matchNumber: number, home: string, away: string, meta: MatchForecastEntryMeta) {
  return toPublicSafeMatchForecastEntry(
    buildMatchForecast({ matchNumber, stage: "group", home: getTeam(home), away: getTeam(away) }),
    meta,
  );
}
const matchesObj = buildPublicSafeMatchForecasts(
  [
    entryFor(1, "spain", "argentina", currentMeta),
    entryFor(2, "brazil", "france", archivedMeta),
    entryFor(3, "germany", "portugal", retroMeta),
  ],
  { generatedAt: "2026-06-29T00:00:00.000Z", publicSourcePolicy: "provider-public-delayed", attribution: ATTR },
);

function fakeStore(seed?: Record<string, string>): ForecastBlobStore {
  const objects: Record<string, string> = { ...(seed ?? {}) };
  return {
    put: async (pathname, body) => {
      objects[pathname] = body;
      return { pathname };
    },
    getText: async (pathname) => objects[pathname] ?? null,
  };
}
function countingStore(seed?: Record<string, string>): ForecastBlobStore & { reads: number } {
  const objects: Record<string, string> = { ...(seed ?? {}) };
  const store = {
    reads: 0,
    put: async (pathname: string, body: string) => {
      objects[pathname] = body;
      return { pathname };
    },
    getText: async (pathname: string) => {
      store.reads++;
      return objects[pathname] ?? null;
    },
  };
  return store;
}

const UNAVAILABLE_POLICY: CurrentSnapshotPolicy = {
  baselineSnapshotId: null,
  currentSnapshotId: null,
  selectionMode: "unavailable",
  chainIds: [],
  isValidChain: false,
  available: false,
  warnings: [],
};
function fakeCommitted(
  over: Partial<{ baseline: ForecastSnapshot | null; current: ForecastSnapshot | null; policy: CurrentSnapshotPolicy }>,
): RuntimeCommittedForecastStore {
  return {
    getBaselineSnapshot: () => over.baseline ?? null,
    getCurrentForecastSnapshot: () => over.current ?? null,
    getCurrentSnapshotPolicy: () => over.policy ?? UNAVAILABLE_POLICY,
  };
}

// No ambient token: keeps the no-store reads on the fail-safe missing-blob-token path.
let savedToken: string | undefined;
beforeEach(() => {
  savedToken = process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_READ_WRITE_TOKEN;
});
afterEach(() => {
  if (savedToken !== undefined) process.env.BLOB_READ_WRITE_TOKEN = savedToken;
});

describe("runtime current forecast snapshot", () => {
  it("returns the converted Blob current when available", async () => {
    const store = fakeStore({ [FORECAST_CURRENT_OBJECT_PATH]: JSON.stringify(blobCurrent) });
    const snap = await getRuntimeCurrentForecastSnapshot({ currentStore: store });
    expect(snap).not.toBeNull();
    expect(snap?.meta.snapshotId).toBe(blobCurrent.snapshotId);
    expect(snap?.meta.snapshotType).toBe("post-match"); // converter maps current → post-match
  });

  it("falls back to the committed current when the Blob is unavailable", async () => {
    const snap = await getRuntimeCurrentForecastSnapshot({
      committedStore: fakeCommitted({ current: baselineSnapshot }),
    });
    expect(snap).toBe(baselineSnapshot);
  });

  it("falls back to the committed current when the Blob is invalid", async () => {
    const store = fakeStore({ [FORECAST_CURRENT_OBJECT_PATH]: JSON.stringify({ nonsense: true }) });
    const snap = await getRuntimeCurrentForecastSnapshot({
      currentStore: store,
      committedStore: fakeCommitted({ current: baselineSnapshot }),
    });
    expect(snap).toBe(baselineSnapshot);
  });

  it("returns null when neither Blob nor committed current exist", async () => {
    const snap = await getRuntimeCurrentForecastSnapshot({ committedStore: fakeCommitted({}) });
    expect(snap).toBeNull();
  });

  it("does not throw on a malformed Blob object", async () => {
    const store = fakeStore({ [FORECAST_CURRENT_OBJECT_PATH]: "{not json" });
    await expect(
      getRuntimeCurrentForecastSnapshot({ currentStore: store, committedStore: fakeCommitted({}) }),
    ).resolves.toBeNull();
  });
});

describe("runtime current snapshot policy", () => {
  const policyWithBaseline: CurrentSnapshotPolicy = {
    ...UNAVAILABLE_POLICY,
    baselineSnapshotId: "baseline-x",
    currentSnapshotId: "committed-tail",
    selectionMode: "chain",
    chainIds: ["baseline-x", "committed-tail"],
    isValidChain: true,
    available: true,
  };

  it("currentSource = blob when the Blob current is valid", async () => {
    const store = fakeStore({ [FORECAST_CURRENT_OBJECT_PATH]: JSON.stringify(blobCurrent) });
    const policy = await getRuntimeCurrentSnapshotPolicy({
      currentStore: store,
      committedStore: fakeCommitted({ policy: policyWithBaseline }),
    });
    expect(policy.currentSource).toBe("blob");
    expect(policy.currentSnapshotId).toBe(blobCurrent.snapshotId);
    expect(policy.baselineSnapshotId).toBe("baseline-x");
    expect(policy.blobError).toBeUndefined();
  });

  it("currentSource = committed-fallback with blobError when the Blob is missing", async () => {
    const policy = await getRuntimeCurrentSnapshotPolicy({
      committedStore: fakeCommitted({ current: baselineSnapshot, policy: policyWithBaseline }),
    });
    expect(policy.currentSource).toBe("committed-fallback");
    expect(policy.blobError).toBe("missing-blob-token");
    expect(policy.currentSnapshotId).toBe(baselineSnapshot.meta.snapshotId);
    expect(policy.warnings.some((w) => w.code === "blob-current-unavailable")).toBe(true);
  });

  it("records blob-current-invalid when the Blob object is invalid", async () => {
    const store = fakeStore({ [FORECAST_CURRENT_OBJECT_PATH]: JSON.stringify({ nonsense: true }) });
    const policy = await getRuntimeCurrentSnapshotPolicy({
      currentStore: store,
      committedStore: fakeCommitted({ current: baselineSnapshot, policy: policyWithBaseline }),
    });
    expect(policy.currentSource).toBe("committed-fallback");
    expect(policy.blobError).toBe("invalid-shape");
    expect(policy.warnings.some((w) => w.code === "blob-current-invalid")).toBe(true);
  });

  it("currentSource = unavailable via an injected committed store", async () => {
    const policy = await getRuntimeCurrentSnapshotPolicy({ committedStore: fakeCommitted({}) });
    expect(policy.currentSource).toBe("unavailable");
    expect(policy.currentSnapshotId).toBeNull();
    expect(policy.warnings.some((w) => w.code === "committed-current-unavailable")).toBe(true);
    expect(policy.warnings.some((w) => w.code === "baseline-unavailable")).toBe(true);
  });

  it("embeds the committed policy unchanged (no PR-82 mutation)", async () => {
    const policy = await getRuntimeCurrentSnapshotPolicy({
      committedStore: fakeCommitted({ policy: policyWithBaseline }),
    });
    expect(policy.committedPolicy).toBe(policyWithBaseline);
  });

  it("leaks no token or Blob URL in the policy/warnings", async () => {
    const store = fakeStore({ [FORECAST_CURRENT_OBJECT_PATH]: "{not json" });
    const policy = await getRuntimeCurrentSnapshotPolicy({
      currentStore: store,
      committedStore: fakeCommitted({ current: baselineSnapshot, policy: policyWithBaseline }),
    });
    const serialized = JSON.stringify(policy);
    for (const bad of ["vercel-storage", "blob.vercel-storage", "BLOB_READ_WRITE_TOKEN", "https://", "http://"]) {
      expect(serialized.includes(bad)).toBe(false);
    }
  });
});

describe("runtime baseline-vs-current comparison + movers", () => {
  const movedStore = () => fakeStore({ [FORECAST_CURRENT_OBJECT_PATH]: JSON.stringify(movedCurrent) });

  it("comparison uses the Blob current when available", async () => {
    const comparison = await getRuntimeCurrentVsBaselineComparison({
      currentStore: movedStore(),
      committedStore: fakeCommitted({ baseline: baselineSnapshot }),
    });
    expect(comparison).not.toBeNull();
    expect(comparison?.to.snapshotId).toBe("runtime-moved");
  });

  it("comparison returns null when baseline or current is unavailable", async () => {
    const comparison = await getRuntimeCurrentVsBaselineComparison({ committedStore: fakeCommitted({}) });
    expect(comparison).toBeNull();
  });

  it("movers use the Blob current and preserve PR-82 winner/signed/top5 defaults", async () => {
    const movers = await getRuntimeCurrentVsBaselineMovers({
      runtime: { currentStore: movedStore(), committedStore: fakeCommitted({ baseline: baselineSnapshot }) },
    });
    expect(movers.stage).toBe("winner");
    expect(movers.mode).toBe("signed");
    const risers = movers.risers ?? [];
    expect(risers.length).toBeLessThanOrEqual(5);
    expect(risers.some((m) => m.teamId === movedCurrent.teams[0]!.teamId && m.delta > 0)).toBe(true);
    expect(Array.isArray(movers.fallers ?? [])).toBe(true);
  });

  it("movers return an empty result (with requested stage/mode) when unavailable", async () => {
    const movers = await getRuntimeCurrentVsBaselineMovers({
      runtime: { committedStore: fakeCommitted({}) },
      movers: { stage: "final", mode: "absolute" },
    });
    expect(movers).toEqual({ stage: "final", mode: "absolute", movers: [] });
  });
});

describe("runtime match forecasts", () => {
  it("returns the object when the Blob is available (and reads it)", async () => {
    const store = countingStore({ [FORECAST_MATCHES_OBJECT_PATH]: JSON.stringify(matchesObj) });
    const out = await getRuntimeMatchForecasts({ matchesStore: store });
    expect(out).toEqual(matchesObj);
    expect(store.reads).toBeGreaterThan(0);
  });

  it("returns null when the Blob is missing", async () => {
    const out = await getRuntimeMatchForecasts({ matchesStore: fakeStore() });
    expect(out).toBeNull();
  });

  it("preloadedMatches=null returns null and does NOT read the Blob", async () => {
    const store = countingStore({ [FORECAST_MATCHES_OBJECT_PATH]: JSON.stringify(matchesObj) });
    const out = await getRuntimeMatchForecasts({ matchesStore: store, preloadedMatches: null });
    expect(out).toBeNull();
    expect(store.reads).toBe(0);
  });

  it("validates an invalid preloadedMatches object without throwing", async () => {
    const out = await getRuntimeMatchForecasts({ preloadedMatches: { nonsense: true } as never });
    expect(out).toBeNull();
  });

  it("uses a valid preloadedMatches object without reading the Blob", async () => {
    const store = countingStore();
    const out = await getRuntimeMatchForecasts({ matchesStore: store, preloadedMatches: matchesObj });
    expect(out).toEqual(matchesObj);
    expect(store.reads).toBe(0);
  });
});

describe("runtime match forecast lookup (strict classification)", () => {
  const store = () => fakeStore({ [FORECAST_MATCHES_OBJECT_PATH]: JSON.stringify(matchesObj) });

  it("classifies a current-pre-match forecast", async () => {
    const r = await getRuntimeMatchForecast(1, { matchesStore: store() });
    expect(r).toMatchObject({
      matchNumber: 1,
      matchesAvailable: true,
      status: "current-pre-match",
      isTruePreMatchForecast: true,
      isRetrospective: false,
    });
    expect(r.entry).not.toBeNull();
  });

  it("classifies an archived-pre-match forecast as a true pre-match forecast", async () => {
    const r = await getRuntimeMatchForecast(2, { matchesStore: store() });
    expect(r.status).toBe("archived-pre-match");
    expect(r.isTruePreMatchForecast).toBe(true);
    expect(r.isRetrospective).toBe(false);
  });

  it("classifies a retrospective forecast (NOT a true pre-match forecast)", async () => {
    const r = await getRuntimeMatchForecast(3, { matchesStore: store() });
    expect(r.status).toBe("retrospective");
    expect(r.isTruePreMatchForecast).toBe(false);
    expect(r.isRetrospective).toBe(true);
  });

  it("returns missing when the object exists but has no entry for the match", async () => {
    const r = await getRuntimeMatchForecast(99, { matchesStore: store() });
    expect(r).toMatchObject({ matchesAvailable: true, status: "missing", entry: null });
    expect(r.isTruePreMatchForecast).toBe(false);
  });

  it("returns unavailable when the match-forecasts object is missing", async () => {
    const r = await getRuntimeMatchForecast(1, { matchesStore: fakeStore() });
    expect(r).toMatchObject({ matchesAvailable: false, status: "unavailable", entry: null });
  });
});

describe("server-only isolation", () => {
  const SRC_PATH = "lib/model/forecast-runtime-store.ts";

  it("imports nothing from live-state/live-ingest/simulation/provider/football-data/app/components", () => {
    const src = readFileSync(join(process.cwd(), SRC_PATH), "utf8");
    const imports = src.split("\n").filter((l) => l.trimStart().startsWith("import")).join("\n");
    expect(imports).not.toMatch(/@\/lib\/live-state|@\/lib\/live-ingest/);
    expect(imports).not.toMatch(/@\/lib\/simulation/);
    expect(imports).not.toMatch(/football-data|provider/);
    expect(imports).not.toMatch(/@\/app\/|@\/components\//);
  });

  it("does not fetch, write Blob, or import the Blob SDK directly", () => {
    const src = readFileSync(join(process.cwd(), SRC_PATH), "utf8");
    expect(/\bfetch\s*\(/.test(src)).toBe(false);
    expect(src.includes("@vercel/blob")).toBe(false);
    expect(/\.put\s*\(/.test(src)).toBe(false);
  });

  it("is not imported by any \"use client\" file under app/ or components/", () => {
    const roots = ["app", "components"].map((d) => join(process.cwd(), d));
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of walkSourceFiles(root)) {
        const s = readFileSync(file, "utf8");
        if (/^\s*["']use client["']/m.test(s) && s.includes("forecast-runtime-store")) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});

function walkSourceFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) out.push(...walkSourceFiles(full));
    else if (/\.(ts|tsx|js|jsx)$/.test(entry)) out.push(full);
  }
  return out;
}
