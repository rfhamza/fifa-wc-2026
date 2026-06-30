/**
 * PR-83B — public-safe forecast contract tests. Committed fixtures + synthetic
 * objects only. No network, no Blob, no provider fetch, no tokens.
 */
import { describe, expect, it } from "vitest";
import { getTeam } from "@/lib/data";
import {
  FORBIDDEN_SNAPSHOT_SUBSTRINGS,
  loadForecastSnapshot,
} from "@/lib/model/forecast-snapshots";
import { compareForecastSnapshots } from "@/lib/model/forecast-deltas";
import { buildMatchForecast } from "@/lib/model/match-forecast";
import {
  FORECAST_CURRENT_CONVERSION_NOTE,
  FORECAST_FORBIDDEN_SUBSTRINGS,
  assertForecastPublicSafe,
  buildPublicSafeMatchForecasts,
  findForecastForbiddenSubstrings,
  forecastCurrentToSnapshot,
  toPublicSafeForecastCurrent,
  toPublicSafeMatchForecastEntry,
  validateForecastCurrent,
  validateMatchForecastEntry,
  validateMatchForecasts,
  type MatchForecastEntryMeta,
  type PublicSafeMatchForecastEntry,
} from "@/lib/model/forecast-public-safe";

import baselineRaw from "@/data/forecast/snapshots/baseline-2026-06-11.pre-tournament.json";

const ATTR = { sourceName: "football-data.org", text: "Derived internally." };
const baseline = loadForecastSnapshot(baselineRaw);
const current = toPublicSafeForecastCurrent(baseline, {
  publicSourcePolicy: "provider-public-delayed",
  attribution: ATTR,
  previousSnapshotId: "baseline-2026-06-11.pre-tournament",
});

const home = getTeam("spain");
const away = getTeam("argentina");
const groupForecast = buildMatchForecast({ matchNumber: 1, stage: "group", home, away });
const koForecast = buildMatchForecast({ matchNumber: 73, stage: "roundOf32", home, away });

const entryMeta = (over: Partial<MatchForecastEntryMeta> = {}): MatchForecastEntryMeta => ({
  status: "scheduled",
  forecastAsOf: "2026-06-29",
  generatedAt: "2026-06-29T00:00:00.000Z",
  provenance: "current-pre-match-forecast",
  capturedBeforeCompletion: true,
  archived: false,
  ...over,
});

// --- forecast-current --------------------------------------------------------

describe("forecast-current contract", () => {
  it("projects a snapshot into a valid forecast-current", () => {
    expect(current.snapshotType).toBe("current");
    expect(current.teams).toHaveLength(48);
    expect(validateForecastCurrent(current)).toEqual([]);
  });

  it("is leak-clean", () => {
    expect(findForecastForbiddenSubstrings(JSON.stringify(current))).toEqual([]);
    expect(() => assertForecastPublicSafe(current)).not.toThrow();
  });

  it("rejects an invalid publicSourcePolicy", () => {
    const bad = { ...current, publicSourcePolicy: "totally-made-up" };
    expect(validateForecastCurrent(bad).join(" ")).toMatch(/publicSourcePolicy/);
  });

  it("rejects a wrong snapshotType and a wrong team count", () => {
    expect(validateForecastCurrent({ ...current, snapshotType: "baseline" }).join(" ")).toMatch(/snapshotType/);
    expect(validateForecastCurrent({ ...current, teams: current.teams.slice(0, 10) }).join(" ")).toMatch(/teams/);
  });

  it("flags forbidden substrings injected into attribution", () => {
    const leaky = { ...current, attribution: { ...ATTR, text: "leaked providerId here" } };
    expect(validateForecastCurrent(leaky).join(" ")).toMatch(/forbidden/);
    expect(() => assertForecastPublicSafe(leaky)).toThrow();
  });
});

describe("forecastCurrentToSnapshot", () => {
  const converted = forecastCurrentToSnapshot(current);

  it("converts to a snapshot that loads/validates cleanly", () => {
    expect(() => loadForecastSnapshot(converted)).not.toThrow();
    expect(converted.meta.snapshotType).toBe("post-match");
    expect(converted.teams).toHaveLength(48);
  });

  it("preserves rolling-current provenance in notes", () => {
    expect(converted.meta.notes).toContain(FORECAST_CURRENT_CONVERSION_NOTE);
  });

  it("works with compareForecastSnapshots(baseline, convertedCurrent)", () => {
    const cmp = compareForecastSnapshots(baseline, converted);
    expect(cmp.teamDeltas).toHaveLength(48);
  });

  it("does not mutate the input current", () => {
    const clone = structuredClone(current);
    forecastCurrentToSnapshot(current);
    expect(current).toEqual(clone);
  });
});

// --- match-forecasts ---------------------------------------------------------

describe("match-forecast entries", () => {
  it("group entries carry no advancement and validate", () => {
    const e = toPublicSafeMatchForecastEntry(groupForecast, entryMeta());
    expect(e.homeAdvance).toBeUndefined();
    expect(e.advancementBasis).toBeUndefined();
    expect(validateMatchForecastEntry(e)).toEqual([]);
  });

  it("knockout entries carry advancement and validate", () => {
    const e = toPublicSafeMatchForecastEntry(koForecast, entryMeta());
    expect(typeof e.homeAdvance).toBe("number");
    expect(e.advancementBasis).toBe("derived-from-90min-and-shootout-model");
    expect(validateMatchForecastEntry(e)).toEqual([]);
  });

  it("rejects a group entry that includes advancement fields", () => {
    const e = { ...toPublicSafeMatchForecastEntry(groupForecast, entryMeta()), homeAdvance: 0.6, awayAdvance: 0.4 };
    expect(validateMatchForecastEntry(e).join(" ")).toMatch(/group entries must NOT include/);
  });

  it("rejects a knockout entry missing advancement fields", () => {
    const e: PublicSafeMatchForecastEntry = { ...toPublicSafeMatchForecastEntry(koForecast, entryMeta()) };
    delete e.homeAdvance;
    delete e.awayAdvance;
    delete e.advancementBasis;
    expect(validateMatchForecastEntry(e).join(" ")).toMatch(/knockout entries must include/);
  });

  it("enforces the provenance lifecycle rules", () => {
    // current-pre-match-forecast: archived=false, capturedBeforeCompletion=true (valid)
    const current = toPublicSafeMatchForecastEntry(koForecast, entryMeta());
    expect(current.forecastProvenance).toBe("current-pre-match-forecast");
    expect(validateMatchForecastEntry(current)).toEqual([]);

    // current-pre-match-forecast with archived=true is invalid
    const currentArchived = toPublicSafeMatchForecastEntry(
      koForecast,
      entryMeta({ provenance: "current-pre-match-forecast", archived: true }),
    );
    expect(validateMatchForecastEntry(currentArchived).join(" ")).toMatch(/current-pre-match-forecast requires archived=false/);

    // archived-pre-match-forecast: archived=true + capturedBeforeCompletion=true (valid)
    const archived = toPublicSafeMatchForecastEntry(
      koForecast,
      entryMeta({ provenance: "archived-pre-match-forecast", archived: true, status: "complete" }),
    );
    expect(validateMatchForecastEntry(archived)).toEqual([]);

    // archived-pre-match-forecast with archived=false is invalid (the state we want to avoid)
    const archivedNotFrozen = toPublicSafeMatchForecastEntry(
      koForecast,
      entryMeta({ provenance: "archived-pre-match-forecast", archived: false }),
    );
    expect(validateMatchForecastEntry(archivedNotFrozen).join(" ")).toMatch(/archived-pre-match-forecast requires archived=true/);

    // archived-pre-match not captured before completion is invalid
    const archivedNotCaptured = toPublicSafeMatchForecastEntry(
      koForecast,
      entryMeta({ provenance: "archived-pre-match-forecast", archived: true, capturedBeforeCompletion: false, status: "complete" }),
    );
    expect(validateMatchForecastEntry(archivedNotCaptured).join(" ")).toMatch(/archived-pre-match-forecast requires capturedBeforeCompletion=true/);

    // retrospective-model-forecast: archived=true + capturedBeforeCompletion=false (valid)
    const retro = toPublicSafeMatchForecastEntry(
      koForecast,
      entryMeta({ provenance: "retrospective-model-forecast", capturedBeforeCompletion: false, archived: true, status: "complete" }),
    );
    expect(validateMatchForecastEntry(retro)).toEqual([]);

    // retrospective captured-before-completion is invalid
    const retroCaptured = toPublicSafeMatchForecastEntry(
      koForecast,
      entryMeta({ provenance: "retrospective-model-forecast", capturedBeforeCompletion: true, archived: true }),
    );
    expect(validateMatchForecastEntry(retroCaptured).join(" ")).toMatch(/retrospective-model-forecast requires capturedBeforeCompletion=false/);
  });
});

describe("match-forecasts object", () => {
  const obj = buildPublicSafeMatchForecasts(
    [
      toPublicSafeMatchForecastEntry(groupForecast, entryMeta()),
      toPublicSafeMatchForecastEntry(koForecast, entryMeta({ status: "resolved" })),
    ],
    { generatedAt: "2026-06-29T00:00:00.000Z", publicSourcePolicy: "provider-public-delayed", attribution: ATTR },
  );

  it("validates and is leak-clean", () => {
    expect(validateMatchForecasts(obj)).toEqual([]);
    expect(findForecastForbiddenSubstrings(JSON.stringify(obj))).toEqual([]);
  });

  it("rejects an invalid publicSourcePolicy at the top level", () => {
    expect(validateMatchForecasts({ ...obj, publicSourcePolicy: "nope" }).join(" ")).toMatch(/publicSourcePolicy/);
  });
});

// --- leak-list drift ---------------------------------------------------------

describe("leak list", () => {
  it("FORECAST_FORBIDDEN_SUBSTRINGS is a superset of FORBIDDEN_SNAPSHOT_SUBSTRINGS", () => {
    for (const s of FORBIDDEN_SNAPSHOT_SUBSTRINGS) {
      expect(FORECAST_FORBIDDEN_SUBSTRINGS).toContain(s);
    }
    expect(FORECAST_FORBIDDEN_SUBSTRINGS).toContain("lineup");
    expect(FORECAST_FORBIDDEN_SUBSTRINGS).toContain("events");
  });
});
