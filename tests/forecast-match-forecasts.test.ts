/**
 * PR-83D — match-forecast current/archive orchestrator tests. Committed sample +
 * injected fakes only: no network, no real Blob, no token, no football-data fetch,
 * no Monte Carlo (uses predictMatch via buildMatchForecast).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTeam } from "@/lib/data";
import { MODEL_WEIGHTS } from "@/lib/model/config";
import { buildMatchForecast } from "@/lib/model/match-forecast";
import { getPublicSafeLiveStateFromBlob } from "@/lib/live-state/public-safe-blob-store";
import {
  buildPublicSafeMatchForecasts,
  findForecastForbiddenSubstrings,
  toPublicSafeMatchForecastEntry,
  validateMatchForecasts,
  type ForecastAttribution,
  type MatchForecastEntryMeta,
  type PublicSafeMatchForecastEntry,
  type PublicSafeMatchForecasts,
} from "@/lib/model/forecast-public-safe";
import {
  putPublicSafeMatchForecastsToBlob,
  type ForecastBlobStore,
  type ForecastLoadResult,
} from "@/lib/model/forecast-blob-store";
import {
  computeMatchForecastsFingerprint,
  resolveForecastableFixtures,
  runRefreshMatchForecasts,
  type MatchForecastLiveStateInput,
  type MatchRefreshInput,
  type MatchRefreshOptions,
  type MatchRefreshSource,
} from "@/scripts/forecast/refresh-match-forecasts";

const ATTR: ForecastAttribution = { sourceName: "football-data.org", text: "Derived internally." };
const LIVE_PATH = "live-state.provider.sanitized.json";
const MATCHES_PATH = "forecast-matches.provider.sanitized.json";
const CURRENT_PATH = "forecast-current.provider.sanitized.json";

const sampleRaw = readFileSync(join(process.cwd(), "data/live/public-safe-sample.json"), "utf8");
const sampleState = JSON.parse(sampleRaw) as MatchForecastLiveStateInput;

const liveOpts = (over: Partial<MatchRefreshOptions> = {}): MatchRefreshOptions => ({
  attribution: ATTR,
  dryRun: false,
  force: false,
  writeAllowed: true,
  includeRetrospective: false,
  forceRebuild: false,
  ...over,
});

const notFound = async (): Promise<ForecastLoadResult<PublicSafeMatchForecasts>> => ({
  value: null,
  ok: false,
  fallback: true,
  error: "not-found",
});
const existingWith =
  (obj: PublicSafeMatchForecasts) => async (): Promise<ForecastLoadResult<PublicSafeMatchForecasts>> => ({
    value: obj,
    ok: true,
    fallback: false,
  });

function source(state: MatchForecastLiveStateInput = sampleState): MatchRefreshSource {
  return { ok: true, state, objectPath: LIVE_PATH, liveStateGeneratedAt: state.generatedAt ?? null };
}

function makeInput(over: Partial<MatchRefreshInput> = {}): { input: MatchRefreshInput; writes: PublicSafeMatchForecasts[] } {
  const writes: PublicSafeMatchForecasts[] = [];
  const input: MatchRefreshInput = {
    source: source(),
    generatedAt: "2026-06-30T00:00:00.000Z",
    matchesObjectPath: MATCHES_PATH,
    forecastCurrentObjectPath: CURRENT_PATH,
    sourceSnapshotId: "current-2026-06-29-after-match-073",
    readExistingMatchForecasts: notFound,
    writeMatchForecasts: async (m) => {
      writes.push(m);
      return { pathname: MATCHES_PATH };
    },
    options: liveOpts(),
    ...over,
  };
  return { input, writes };
}

const entryFor = (
  matchNumber: number,
  stage: PublicSafeMatchForecastEntry["stage"],
  homeId: string,
  awayId: string,
  meta: MatchForecastEntryMeta,
): PublicSafeMatchForecastEntry =>
  toPublicSafeMatchForecastEntry(
    buildMatchForecast({ matchNumber, stage, home: getTeam(homeId), away: getTeam(awayId) }),
    meta,
  );

const existingObj = (entries: PublicSafeMatchForecastEntry[]): PublicSafeMatchForecasts =>
  buildPublicSafeMatchForecasts(entries, {
    generatedAt: "2026-06-20T00:00:00.000Z",
    publicSourcePolicy: "provider-public-delayed",
    attribution: ATTR,
  });

// --- default + retrospective counts -----------------------------------------

describe("sample default vs retrospective", () => {
  it("default dry-run: 15 current, 73 missing, 0 retrospective, writes nothing", async () => {
    const { input, writes } = makeInput({ options: liveOpts({ dryRun: true }) });
    const res = await runRefreshMatchForecasts(input);
    expect(res.decision).toBe("would-write");
    expect(res.totalResolvedFixtures).toBe(88);
    expect(res.createdCurrent).toBe(15);
    expect(res.missingPreMatchArchive).toBe(73);
    expect(res.retrospectiveCreated).toBe(0);
    expect(res.totalForecastEntries).toBe(15);
    expect(res.unresolvedKnockoutSkipped).toBe(16);
    expect(writes).toHaveLength(0);
  });

  it("with --include-retrospective: 88 entries, 73 retrospective, 15 current", async () => {
    const { input } = makeInput({ options: liveOpts({ dryRun: true, includeRetrospective: true }) });
    const res = await runRefreshMatchForecasts(input);
    expect(res.totalForecastEntries).toBe(88);
    expect(res.retrospectiveCreated).toBe(73);
    expect(res.createdCurrent).toBe(15);
    const m1 = res.matchForecasts!.matchForecasts.find((e) => e.matchNumber === 1)!;
    expect(m1.forecastProvenance).toBe("retrospective-model-forecast");
    expect(m1.capturedBeforeCompletion).toBe(false);
    expect(m1.archived).toBe(true);
  });
});

// --- write safety + source/blob ---------------------------------------------

describe("source loading + write safety", () => {
  it("blocks a file-source write when writeAllowed is false", async () => {
    const { input, writes } = makeInput({ options: liveOpts({ writeAllowed: false }) });
    const res = await runRefreshMatchForecasts(input);
    expect(res.decision).toBe("blocked");
    expect(res.reason).toBe("file-write-not-allowed");
    expect(res.exitCode).toBe(1);
    expect(writes).toHaveLength(0);
  });

  it("blocks when the source is unavailable", async () => {
    const { input } = makeInput({
      source: { ok: false, objectPath: LIVE_PATH, liveStateGeneratedAt: null, error: "not-found" },
    });
    const res = await runRefreshMatchForecasts(input);
    expect(res.decision).toBe("blocked");
    expect(res.reason).toBe("source-unavailable");
  });

  it("reads a blob-source live-state via an injected fake store", async () => {
    const store: ForecastBlobStore = { put: async (p) => ({ pathname: p }), getText: async () => sampleRaw };
    const read = await getPublicSafeLiveStateFromBlob({ store, objectPath: LIVE_PATH });
    expect(read.ok).toBe(true);
    const { input } = makeInput({
      source: {
        ok: true,
        state: read.state as unknown as MatchForecastLiveStateInput,
        objectPath: LIVE_PATH,
        liveStateGeneratedAt: (read.state as { generatedAt?: string }).generatedAt ?? null,
      },
      options: liveOpts({ dryRun: true }),
    });
    const res = await runRefreshMatchForecasts(input);
    expect(res.decision).toBe("would-write");
    expect(res.totalResolvedFixtures).toBe(88);
  });
});

// --- existing archive read/merge --------------------------------------------

describe("existing archive read", () => {
  it("missing existing starts empty and creates current forecasts", async () => {
    const { input } = makeInput({ options: liveOpts({ dryRun: true }) });
    const res = await runRefreshMatchForecasts(input);
    expect(res.reason).toBe("no-existing-matches");
    expect(res.createdCurrent).toBe(15);
  });

  it("malformed existing blocks unless --force-rebuild", async () => {
    const malformed = async (): Promise<ForecastLoadResult<PublicSafeMatchForecasts>> => ({
      value: null,
      ok: false,
      fallback: true,
      error: "invalid-shape",
    });
    const blocked = await runRefreshMatchForecasts(makeInput({ readExistingMatchForecasts: malformed }).input);
    expect(blocked.decision).toBe("blocked");
    expect(blocked.reason).toBe("existing-archive-unreadable");

    const rebuilt = await runRefreshMatchForecasts(
      makeInput({ readExistingMatchForecasts: malformed, options: liveOpts({ dryRun: true, forceRebuild: true }) }).input,
    );
    expect(rebuilt.decision).toBe("would-write");
  });
});

// --- archive integrity ------------------------------------------------------

describe("archive integrity", () => {
  const archivedM73 = entryFor(73, "roundOf32", "south-africa", "canada", {
    status: "complete",
    forecastAsOf: "2026-06-28",
    generatedAt: "2026-06-28T00:00:00.000Z",
    provenance: "archived-pre-match-forecast",
    capturedBeforeCompletion: true,
    archived: true,
    sourceSnapshotId: "snap-A",
  });

  it("preserves an existing archived pre-match entry byte-for-byte", async () => {
    const { input } = makeInput({
      readExistingMatchForecasts: existingWith(existingObj([archivedM73])),
      options: liveOpts({ dryRun: true }),
    });
    const res = await runRefreshMatchForecasts(input);
    const m73 = res.matchForecasts!.matchForecasts.find((e) => e.matchNumber === 73)!;
    expect(m73).toEqual(archivedM73);
    expect(res.preservedArchived).toBe(1);
  });

  it("preserves an existing retrospective entry byte-for-byte", async () => {
    const retro = entryFor(5, "group", "spain", "argentina", {
      status: "complete",
      forecastAsOf: "2026-06-20",
      generatedAt: "2026-06-20T00:00:00.000Z",
      provenance: "retrospective-model-forecast",
      capturedBeforeCompletion: false,
      archived: true,
    });
    const res = await runRefreshMatchForecasts(
      makeInput({ readExistingMatchForecasts: existingWith(existingObj([retro])), options: liveOpts({ dryRun: true }) }).input,
    );
    expect(res.matchForecasts!.matchForecasts.find((e) => e.matchNumber === 5)).toEqual(retro);
  });

  it("preserves a current pre-match entry while the match stays incomplete", async () => {
    const m74 = entryFor(74, "roundOf32", "germany", "paraguay", {
      status: "resolved",
      forecastAsOf: "2026-06-29",
      generatedAt: "2026-06-29T00:00:00.000Z",
      provenance: "current-pre-match-forecast",
      capturedBeforeCompletion: true,
      archived: false,
      sourceSnapshotId: "snap-A",
    });
    const res = await runRefreshMatchForecasts(
      makeInput({ readExistingMatchForecasts: existingWith(existingObj([m74])), options: liveOpts({ dryRun: true }) }).input,
    );
    expect(res.matchForecasts!.matchForecasts.find((e) => e.matchNumber === 74)).toEqual(m74);
    expect(res.preservedCurrent).toBeGreaterThanOrEqual(1);
  });

  it("archives a current entry when the match completes, preserving the original forecast", async () => {
    const completed = structuredClone(sampleState);
    const m = completed.matches.find((x) => x.matchNumber === 74)!;
    m.status = "complete";
    m.goalsA = 2;
    m.goalsB = 1;
    m.winner = "germany";
    const b = completed.bracket.find((x) => x.matchNumber === 74)!;
    b.winner = "germany";

    const priorCurrent = entryFor(74, "roundOf32", "germany", "paraguay", {
      status: "resolved",
      forecastAsOf: "2026-06-29",
      generatedAt: "2026-06-29T00:00:00.000Z",
      provenance: "current-pre-match-forecast",
      capturedBeforeCompletion: true,
      archived: false,
      sourceSnapshotId: "snap-A",
    });
    const res = await runRefreshMatchForecasts(
      makeInput({
        source: source(completed),
        readExistingMatchForecasts: existingWith(existingObj([priorCurrent])),
        options: liveOpts({ dryRun: true }),
      }).input,
    );
    const m74 = res.matchForecasts!.matchForecasts.find((e) => e.matchNumber === 74)!;
    expect(res.archivedCompleted).toBe(1);
    expect(m74.archived).toBe(true);
    expect(m74.status).toBe("complete");
    expect(m74.forecastProvenance).toBe("archived-pre-match-forecast");
    expect(m74.homeWin).toBe(priorCurrent.homeWin); // forecast preserved
    expect(m74.generatedAt).toBe(priorCurrent.generatedAt);
    expect(m74.forecastAsOf).toBe(priorCurrent.forecastAsOf);
    expect(m74.sourceSnapshotId).toBe(priorCurrent.sourceSnapshotId);
  });

  it("does not label a completed match with no prior as archived-pre-match (default omit)", async () => {
    const res = await runRefreshMatchForecasts(makeInput({ options: liveOpts({ dryRun: true }) }).input);
    expect(res.matchForecasts!.matchForecasts.find((e) => e.matchNumber === 73)).toBeUndefined();
  });

  it("--include-retrospective labels completed-no-prior as retrospective (archived, not captured)", async () => {
    const res = await runRefreshMatchForecasts(
      makeInput({ options: liveOpts({ dryRun: true, includeRetrospective: true }) }).input,
    );
    const m73 = res.matchForecasts!.matchForecasts.find((e) => e.matchNumber === 73)!;
    expect(m73.forecastProvenance).toBe("retrospective-model-forecast");
    expect(m73.capturedBeforeCompletion).toBe(false);
    expect(m73.archived).toBe(true);
  });
});

// --- participant change / conflict / orphan ---------------------------------

describe("participant change, conflict, orphan", () => {
  it("replaces only an unarchived current entry when participants change", async () => {
    const wrongTeams = entryFor(74, "roundOf32", "brazil", "japan", {
      status: "resolved",
      forecastAsOf: "2026-06-29",
      generatedAt: "2026-06-29T00:00:00.000Z",
      provenance: "current-pre-match-forecast",
      capturedBeforeCompletion: true,
      archived: false,
    });
    const res = await runRefreshMatchForecasts(
      makeInput({ readExistingMatchForecasts: existingWith(existingObj([wrongTeams])), options: liveOpts({ dryRun: true }) }).input,
    );
    expect(res.participantChanged).toBeGreaterThanOrEqual(1);
    const m74 = res.matchForecasts!.matchForecasts.find((e) => e.matchNumber === 74)!;
    expect(m74.homeTeamId).toBe("germany");
    expect(m74.awayTeamId).toBe("paraguay");
  });

  it("never overwrites an archived entry on participant conflict", async () => {
    const archivedWrong = entryFor(74, "roundOf32", "brazil", "japan", {
      status: "complete",
      forecastAsOf: "2026-06-29",
      generatedAt: "2026-06-29T00:00:00.000Z",
      provenance: "archived-pre-match-forecast",
      capturedBeforeCompletion: true,
      archived: true,
    });
    const res = await runRefreshMatchForecasts(
      makeInput({ readExistingMatchForecasts: existingWith(existingObj([archivedWrong])), options: liveOpts({ dryRun: true }) }).input,
    );
    expect(res.participantConflict).toBeGreaterThanOrEqual(1);
    expect(res.matchForecasts!.matchForecasts.find((e) => e.matchNumber === 74)).toEqual(archivedWrong);
  });

  it("drops an orphan unarchived current entry no longer forecastable", async () => {
    const orphan: PublicSafeMatchForecastEntry = {
      matchNumber: 200,
      stage: "group",
      status: "scheduled",
      homeTeamId: "spain",
      awayTeamId: "argentina",
      forecastAsOf: "2026-06-20",
      generatedAt: "2026-06-20T00:00:00.000Z",
      forecastProvenance: "current-pre-match-forecast",
      capturedBeforeCompletion: true,
      archived: false,
      homeWin: 0.4,
      draw: 0.3,
      awayWin: 0.3,
      expectedHomeGoals: 1.2,
      expectedAwayGoals: 1.0,
      topScorelines: [],
    };
    const res = await runRefreshMatchForecasts(
      makeInput({ readExistingMatchForecasts: existingWith(existingObj([orphan])), options: liveOpts({ dryRun: true }) }).input,
    );
    expect(res.orphanCurrentDropped).toBe(1);
    expect(res.matchForecasts!.matchForecasts.find((e) => e.matchNumber === 200)).toBeUndefined();
  });
});

// --- shape / advancement / fingerprint / safety -----------------------------

describe("fixture resolution + shape", () => {
  it("resolves 88 fixtures and skips 16 unresolved knockout slots", () => {
    const { fixtures, unresolvedKnockoutSkipped } = resolveForecastableFixtures(sampleState);
    expect(fixtures).toHaveLength(88);
    expect(unresolvedKnockoutSkipped).toBe(16);
  });

  it("group entries omit advancement; knockout entries include it", async () => {
    const res = await runRefreshMatchForecasts(
      makeInput({ options: liveOpts({ dryRun: true, includeRetrospective: true }) }).input,
    );
    const group = res.matchForecasts!.matchForecasts.find((e) => e.matchNumber === 1)!;
    const knockout = res.matchForecasts!.matchForecasts.find((e) => e.matchNumber === 74)!;
    expect(group.homeAdvance).toBeUndefined();
    expect(group.advancementBasis).toBeUndefined();
    expect(typeof knockout.homeAdvance).toBe("number");
    expect(knockout.advancementBasis).toBe("derived-from-90min-and-shootout-model");
  });

  it("uses sourceSnapshotId from forecast-current; omits it when null", async () => {
    const withId = await runRefreshMatchForecasts(makeInput({ options: liveOpts({ dryRun: true }) }).input);
    expect(withId.matchForecasts!.matchForecasts.find((e) => e.matchNumber === 74)!.sourceSnapshotId).toBe(
      "current-2026-06-29-after-match-073",
    );
    const nullId = await runRefreshMatchForecasts(makeInput({ sourceSnapshotId: null, options: liveOpts({ dryRun: true }) }).input);
    expect(nullId.matchForecasts!.matchForecasts.find((e) => e.matchNumber === 74)!.sourceSnapshotId).toBeUndefined();
  });
});

describe("idempotency", () => {
  it("fingerprint is deterministic", () => {
    const res = makeInput();
    void res;
    const a = runRefreshMatchForecasts(makeInput({ options: liveOpts({ dryRun: true }) }).input);
    const b = runRefreshMatchForecasts(makeInput({ options: liveOpts({ dryRun: true }) }).input);
    return Promise.all([a, b]).then(([ra, rb]) => {
      expect(ra.matchForecastsFingerprint).toBe(rb.matchForecastsFingerprint);
      expect(computeMatchForecastsFingerprint(ra.matchForecasts!.matchForecasts)).toBe(
        rb.matchForecastsFingerprint,
      );
    });
  });

  it("skips when the merged result is unchanged", async () => {
    const first = await runRefreshMatchForecasts(makeInput().input);
    expect(first.decision).toBe("wrote");
    const second = await runRefreshMatchForecasts(
      makeInput({ readExistingMatchForecasts: existingWith(first.matchForecasts!) }).input,
    );
    expect(second.decision).toBe("skipped");
    expect(second.reason).toBe("no-meaningful-change");
  });

  it("writes (completion transition) when a match completes", async () => {
    const completed = structuredClone(sampleState);
    const m = completed.matches.find((x) => x.matchNumber === 74)!;
    m.status = "complete";
    m.winner = "germany";
    completed.bracket.find((x) => x.matchNumber === 74)!.winner = "germany";
    const prior = entryFor(74, "roundOf32", "germany", "paraguay", {
      status: "resolved",
      forecastAsOf: "2026-06-29",
      generatedAt: "2026-06-29T00:00:00.000Z",
      provenance: "current-pre-match-forecast",
      capturedBeforeCompletion: true,
      archived: false,
    });
    const res = await runRefreshMatchForecasts(
      makeInput({ source: source(completed), readExistingMatchForecasts: existingWith(existingObj([prior])) }).input,
    );
    expect(res.decision).toBe("wrote");
    expect(res.reason).toBe("matches-completed-archived");
  });
});

describe("write path + safety", () => {
  it("writes via the real put (validates + leak-scans) and the body is leak-clean", async () => {
    const objects: Record<string, string> = {};
    const store: ForecastBlobStore = {
      put: async (pathname, body) => {
        objects[pathname] = body;
        return { pathname };
      },
      getText: async (pathname) => objects[pathname] ?? null,
    };
    const res = await runRefreshMatchForecasts(
      makeInput({ writeMatchForecasts: (m) => putPublicSafeMatchForecastsToBlob(m, { store }) }).input,
    );
    expect(res.decision).toBe("wrote");
    expect(objects[MATCHES_PATH]).toBeDefined();
    expect(findForecastForbiddenSubstrings(objects[MATCHES_PATH]!)).toEqual([]);
    expect(validateMatchForecasts(JSON.parse(objects[MATCHES_PATH]!))).toEqual([]);
  });

  it("dry-run never writes", async () => {
    const { input, writes } = makeInput({ options: liveOpts({ dryRun: true }) });
    await runRefreshMatchForecasts(input);
    expect(writes).toHaveLength(0);
  });

  it("does not change MODEL_WEIGHTS", async () => {
    const before = structuredClone(MODEL_WEIGHTS);
    await runRefreshMatchForecasts(makeInput({ options: liveOpts({ dryRun: true }) }).input);
    expect(MODEL_WEIGHTS).toEqual(before);
  });

  it("orchestrator imports nothing from football-data / live-ingest", () => {
    const src = readFileSync(join(process.cwd(), "scripts/forecast/refresh-match-forecasts.ts"), "utf8");
    const imports = src.split("\n").filter((l) => l.trimStart().startsWith("import")).join("\n");
    expect(imports).not.toMatch(/football-data|@\/lib\/live-ingest/);
  });
});
