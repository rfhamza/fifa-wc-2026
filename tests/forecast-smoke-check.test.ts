/**
 * PR-83E1 — forecast smoke checker tests. PURE: synthetic fixtures only, no Blob,
 * no token, no env, no network. Mirrors the live-state smoke-check test shape.
 */
import { describe, expect, it } from "vitest";
import { getTeam } from "@/lib/data";
import { loadForecastSnapshot } from "@/lib/model/forecast-snapshots";
import { buildMatchForecast } from "@/lib/model/match-forecast";
import {
  buildPublicSafeMatchForecasts,
  toPublicSafeForecastCurrent,
  toPublicSafeMatchForecastEntry,
  type MatchForecastEntryMeta,
  type PublicSafeMatchForecastEntry,
} from "@/lib/model/forecast-public-safe";
import {
  FORECAST_EXPECTED_LIVE_STATE_OBJECT_PATH,
  runForecastSmokeCheck,
} from "@/scripts/forecast/forecast-smoke-check";

import baselineRaw from "@/data/forecast/snapshots/baseline-2026-06-11.pre-tournament.json";

const ATTR = { sourceName: "football-data.org", text: "Derived internally." };

const baseCurrent = toPublicSafeForecastCurrent(loadForecastSnapshot(baselineRaw), {
  publicSourcePolicy: "provider-public-delayed",
  attribution: ATTR,
});
// The smoke check expects current to be built from the production provider live-state.
const current = { ...baseCurrent, sourceLiveStateObjectPath: FORECAST_EXPECTED_LIVE_STATE_OBJECT_PATH };

const meta: MatchForecastEntryMeta = {
  status: "scheduled",
  forecastAsOf: "2026-06-29",
  generatedAt: "2026-06-29T00:00:00.000Z",
  provenance: "current-pre-match-forecast",
  capturedBeforeCompletion: true,
  archived: false,
};
const entry = toPublicSafeMatchForecastEntry(
  buildMatchForecast({ matchNumber: 1, stage: "group", home: getTeam("spain"), away: getTeam("argentina") }),
  meta,
);
const matches = buildPublicSafeMatchForecasts([entry], {
  generatedAt: "2026-06-29T00:00:00.000Z",
  publicSourcePolicy: "provider-public-delayed",
  attribution: ATTR,
});

describe("runForecastSmokeCheck — happy path", () => {
  it("passes for a valid current + matches pair", () => {
    const r = runForecastSmokeCheck({ current, matches }, { strict: true });
    expect(r.ok).toBe(true);
    expect(r.failures).toHaveLength(0);
    expect(r.fields.currentAvailable).toBe(true);
    expect(r.fields.matchesAvailable).toBe(true);
    expect(r.fields.snapshotId).toBe(current.snapshotId);
    expect(r.fields.teams).toBe(current.teams.length);
    expect(r.fields.matchForecasts).toBe(1);
    expect(r.fields.currentPreMatch).toBe(1);
    expect(r.fields.archivedPreMatch).toBe(0);
    expect(r.fields.retrospective).toBe(0);
    expect(r.fields.leakHits).toEqual([]);
  });

  it("confirms forecast-current converts to a ForecastSnapshot", () => {
    const r = runForecastSmokeCheck({ current, matches });
    const convert = r.findings.find((f) => f.name === "forecast-current → snapshot");
    expect(convert?.pass).toBe(true);
  });

  it("checks sourceLiveStateObjectPath against the expected provider object", () => {
    const wrong = { ...current, sourceLiveStateObjectPath: "live-state.sanitized.json" };
    const r = runForecastSmokeCheck({ current: wrong, matches });
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.name === "forecast-current sourceLiveStateObjectPath")).toBe(true);
  });
});

describe("runForecastSmokeCheck — invalid inputs fail", () => {
  it("fails on an invalid forecast-current (wrong team count)", () => {
    const bad = { ...current, teams: current.teams.slice(0, 3) };
    const r = runForecastSmokeCheck({ current: bad, matches });
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.name === "forecast-current valid")).toBe(true);
  });

  it("fails on an invalid forecast-matches (bad probabilities)", () => {
    const badEntry: PublicSafeMatchForecastEntry = { ...entry, homeWin: 0.9, draw: 0.9, awayWin: 0.9 };
    const bad = { ...matches, matchForecasts: [badEntry] };
    const r = runForecastSmokeCheck({ current, matches: bad });
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.name === "forecast-matches valid")).toBe(true);
  });

  it("fails on a leaky forecast-current and records the leak", () => {
    const leaky = { ...current, attribution: { ...ATTR, text: "providerId leak" } };
    const r = runForecastSmokeCheck({ current: leaky, matches });
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.name === "forecast-current leak-scan")).toBe(true);
    expect(r.fields.leakHits.some((h) => h.startsWith("current:"))).toBe(true);
  });

  it("fails on a mislabelled provenance (archived-pre-match with archived=false)", () => {
    const mislabelled: PublicSafeMatchForecastEntry = {
      ...entry,
      forecastProvenance: "archived-pre-match-forecast",
      archived: false,
    };
    const bad = { ...matches, matchForecasts: [mislabelled] };
    const r = runForecastSmokeCheck({ current, matches: bad });
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.name === "forecast-matches entry lifecycle")).toBe(true);
  });
});

describe("runForecastSmokeCheck — missing objects", () => {
  it("warns (does not fail) on a missing object in non-strict mode", () => {
    const r = runForecastSmokeCheck({ current: null, matches: null, currentError: "not-found" }, { strict: false });
    expect(r.ok).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.fields.currentAvailable).toBe(false);
    expect(r.fields.matchesAvailable).toBe(false);
  });

  it("fails on a missing object in strict mode (with the error code reported)", () => {
    const r = runForecastSmokeCheck(
      { current: null, matches: null, currentError: "missing-blob-token", matchesError: "not-found" },
      { strict: true },
    );
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.name === "forecast-current present")).toBe(true);
    expect(r.failures.some((f) => f.detail.includes("missing-blob-token"))).toBe(true);
  });
});

describe("runForecastSmokeCheck — output safety", () => {
  it("emits no token / Blob URL in the report", () => {
    const r = runForecastSmokeCheck({ current, matches }, { strict: true });
    const serialized = JSON.stringify(r);
    for (const bad of ["vercel-storage", "blob.vercel-storage", "BLOB_READ_WRITE_TOKEN", "FOOTBALL_DATA_TOKEN", "https://", "http://"]) {
      expect(serialized.includes(bad)).toBe(false);
    }
  });
});
