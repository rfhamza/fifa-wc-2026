/**
 * PR-83B — forecast Blob store tests. Injected in-memory fake store only:
 * no real Blob, no token, no env, no network.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTeam } from "@/lib/data";
import { loadForecastSnapshot } from "@/lib/model/forecast-snapshots";
import { buildMatchForecast } from "@/lib/model/match-forecast";
import {
  buildPublicSafeMatchForecasts,
  toPublicSafeForecastCurrent,
  toPublicSafeMatchForecastEntry,
  type MatchForecastEntryMeta,
} from "@/lib/model/forecast-public-safe";
import {
  FORECAST_CURRENT_OBJECT_PATH,
  FORECAST_MATCHES_OBJECT_PATH,
  getPublicSafeForecastCurrentFromBlob,
  getPublicSafeMatchForecastsFromBlob,
  putPublicSafeForecastCurrentToBlob,
  putPublicSafeMatchForecastsToBlob,
  type ForecastBlobStore,
} from "@/lib/model/forecast-blob-store";

import baselineRaw from "@/data/forecast/snapshots/baseline-2026-06-11.pre-tournament.json";

const ATTR = { sourceName: "football-data.org", text: "Derived internally." };

function fakeStore(seed?: Record<string, string>): ForecastBlobStore & { objects: Record<string, string> } {
  const objects: Record<string, string> = { ...(seed ?? {}) };
  return {
    objects,
    put: async (pathname, body) => {
      objects[pathname] = body;
      return { pathname };
    },
    getText: async (pathname) => objects[pathname] ?? null,
  };
}

const current = toPublicSafeForecastCurrent(loadForecastSnapshot(baselineRaw), {
  publicSourcePolicy: "provider-public-delayed",
  attribution: ATTR,
});

const meta: MatchForecastEntryMeta = {
  status: "scheduled",
  forecastAsOf: "2026-06-29",
  generatedAt: "2026-06-29T00:00:00.000Z",
  provenance: "current-pre-match-forecast",
  capturedBeforeCompletion: true,
  archived: false,
};
const matches = buildPublicSafeMatchForecasts(
  [
    toPublicSafeMatchForecastEntry(
      buildMatchForecast({ matchNumber: 1, stage: "group", home: getTeam("spain"), away: getTeam("argentina") }),
      meta,
    ),
  ],
  { generatedAt: "2026-06-29T00:00:00.000Z", publicSourcePolicy: "provider-public-delayed", attribution: ATTR },
);

// Ensure no ambient token leaks the missing-token branch.
let savedToken: string | undefined;
beforeEach(() => {
  savedToken = process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_READ_WRITE_TOKEN;
});
afterEach(() => {
  if (savedToken !== undefined) process.env.BLOB_READ_WRITE_TOKEN = savedToken;
});

describe("forecast-current Blob round-trip", () => {
  it("writes at the default path and reads back equal", async () => {
    const store = fakeStore();
    const { pathname } = await putPublicSafeForecastCurrentToBlob(current, { store });
    expect(pathname).toBe(FORECAST_CURRENT_OBJECT_PATH);
    const r = await getPublicSafeForecastCurrentFromBlob({ store });
    expect(r.ok).toBe(true);
    expect(r.value).toEqual(current);
  });

  it("returned metadata exposes only the pathname", async () => {
    const store = fakeStore();
    const res = await putPublicSafeForecastCurrentToBlob(current, { store });
    expect(Object.keys(res)).toEqual(["pathname"]);
  });
});

describe("match-forecasts Blob round-trip", () => {
  it("writes and reads back equal", async () => {
    const store = fakeStore();
    const { pathname } = await putPublicSafeMatchForecastsToBlob(matches, { store });
    expect(pathname).toBe(FORECAST_MATCHES_OBJECT_PATH);
    const r = await getPublicSafeMatchForecastsFromBlob({ store });
    expect(r.ok).toBe(true);
    expect(r.value).toEqual(matches);
  });
});

describe("read fail-safe (never throws)", () => {
  it("missing object → not-found", async () => {
    const r = await getPublicSafeForecastCurrentFromBlob({ store: fakeStore() });
    expect(r).toMatchObject({ value: null, ok: false, error: "not-found" });
  });

  it("malformed JSON → blob-read-error", async () => {
    const store = fakeStore({ [FORECAST_CURRENT_OBJECT_PATH]: "{not json" });
    const r = await getPublicSafeForecastCurrentFromBlob({ store });
    expect(r).toMatchObject({ value: null, ok: false, error: "blob-read-error" });
  });

  it("valid JSON wrong shape → invalid-shape", async () => {
    const store = fakeStore({ [FORECAST_CURRENT_OBJECT_PATH]: JSON.stringify({ nonsense: true }) });
    const r = await getPublicSafeForecastCurrentFromBlob({ store });
    expect(r).toMatchObject({ value: null, ok: false, error: "invalid-shape" });
  });

  it("missing token (no store) → missing-blob-token", async () => {
    const r = await getPublicSafeForecastCurrentFromBlob();
    expect(r).toMatchObject({ value: null, ok: false, error: "missing-blob-token" });
  });
});

describe("write refusal (before any Blob call)", () => {
  it("refuses an invalid object", async () => {
    const store = fakeStore();
    const bad = { ...current, teams: current.teams.slice(0, 3) };
    await expect(putPublicSafeForecastCurrentToBlob(bad, { store })).rejects.toThrow(/refusing-to-write/);
    expect(Object.keys(store.objects)).toHaveLength(0);
  });

  it("refuses a leaky object", async () => {
    const store = fakeStore();
    const leaky = { ...current, attribution: { ...ATTR, text: "providerId leak" } };
    await expect(putPublicSafeForecastCurrentToBlob(leaky, { store })).rejects.toThrow();
    expect(Object.keys(store.objects)).toHaveLength(0);
  });
});

describe("isolation", () => {
  it("forecast-blob-store imports nothing from live-state/provider/simulation", () => {
    const src = readFileSync(join(process.cwd(), "lib/model/forecast-blob-store.ts"), "utf8");
    const imports = src.split("\n").filter((l) => l.trimStart().startsWith("import")).join("\n");
    expect(imports).not.toMatch(/@\/lib\/live-state|@\/lib\/live-ingest/);
    expect(imports).not.toMatch(/@\/lib\/simulation/);
    expect(imports).not.toMatch(/football-data|provider/);
  });
});
