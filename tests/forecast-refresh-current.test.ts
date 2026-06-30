/**
 * PR-83C — rolling current-forecast orchestrator tests. Committed sample +
 * injected fakes only: no network, no real Blob, no token, no football-data fetch.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MODEL_WEIGHTS } from "@/lib/model/config";
import { loadForecastSnapshot } from "@/lib/model/forecast-snapshots";
import { getPublicSafeLiveStateFromBlob } from "@/lib/live-state/public-safe-blob-store";
import {
  deriveLedgerFromPublicSafeState,
  type PublicSafeStateInput,
} from "@/lib/model/forecast-results-ledger";
import {
  findForecastForbiddenSubstrings,
  forecastCurrentToSnapshot,
  validateForecastCurrent,
  type ForecastAttribution,
  type PublicSafeForecastCurrent,
} from "@/lib/model/forecast-public-safe";
import {
  putPublicSafeForecastCurrentToBlob,
  type ForecastBlobStore,
  type ForecastLoadResult,
} from "@/lib/model/forecast-blob-store";
import {
  computeSourceResultsFingerprint,
  currentSnapshotId,
  runRefreshCurrentForecast,
  type RefreshInput,
  type RefreshSource,
} from "@/scripts/forecast/refresh-current";

const ATTR: ForecastAttribution = { sourceName: "football-data.org", text: "Derived internally." };
const SAMPLE_PATH = "live-state.provider.sanitized.json";
const FORECAST_PATH = "forecast-current.provider.sanitized.json";

const sampleRaw = readFileSync(join(process.cwd(), "data/live/public-safe-sample.json"), "utf8");
const sampleState = JSON.parse(sampleRaw) as PublicSafeStateInput & { generatedAt?: string };

function fileSource(over: Partial<RefreshSource> = {}): RefreshSource {
  return {
    ok: true,
    state: sampleState,
    objectPath: SAMPLE_PATH,
    liveStateGeneratedAt: sampleState.generatedAt ?? null,
    ...over,
  };
}

const notFound = async (): Promise<ForecastLoadResult<PublicSafeForecastCurrent>> => ({
  value: null,
  ok: false,
  fallback: true,
  error: "not-found",
});

function makeInput(over: Partial<RefreshInput> = {}): { input: RefreshInput; calls: { writes: number } } {
  const calls = { writes: 0 };
  const input: RefreshInput = {
    source: fileSource(),
    generatedAt: "2026-06-30T00:00:00.000Z",
    forecastObjectPath: FORECAST_PATH,
    previousSnapshotIdFallback: "baseline-2026-06-11.pre-tournament",
    readExistingCurrent: notFound,
    writeCurrent: async () => {
      calls.writes++;
      return { pathname: FORECAST_PATH };
    },
    options: { attribution: ATTR, dryRun: true, force: false, writeAllowed: true, iterations: 50 },
    ...over,
  };
  return { input, calls };
}

// A real produced current (from the committed sample) reused as the "existing" object.
let produced: PublicSafeForecastCurrent;
const existing =
  (over: Partial<PublicSafeForecastCurrent> = {}) =>
  async (): Promise<ForecastLoadResult<PublicSafeForecastCurrent>> => ({
    value: { ...produced, ...over },
    ok: true,
    fallback: false,
  });

beforeAll(async () => {
  const { input } = makeInput();
  const res = await runRefreshCurrentForecast(input);
  produced = res.current!;
});

describe("file-source dry-run from the committed sample", () => {
  it("would-write a valid, traceable, leak-clean current", async () => {
    const { input, calls } = makeInput();
    const res = await runRefreshCurrentForecast(input);
    expect(res.decision).toBe("would-write");
    expect(res.wouldWrite).toBe(true);
    expect(calls.writes).toBe(0);
    expect(res.newLatestCompletedSupportedMatchNumber).toBe(73);
    expect(res.newCompletedMatchesLocked).toBe(73);
    expect(res.snapshotId).toBe("current-2026-06-29-after-match-073");
    expect(res.sourceLiveStateObjectPath).toBe(SAMPLE_PATH);
    expect(validateForecastCurrent(res.current)).toEqual([]);
    expect(() => loadForecastSnapshot(forecastCurrentToSnapshot(res.current!))).not.toThrow();
    expect(findForecastForbiddenSubstrings(JSON.stringify(res.current))).toEqual([]);
    expect(res.current!.sourceLiveStateAsOf).toBe(sampleState.asOf);
  });
});

describe("sourceResultsFingerprint", () => {
  it("is deterministic and public-safe", () => {
    expect(produced.sourceResultsFingerprint).toMatch(/^srf-[0-9a-f]{8}$/);
    expect(findForecastForbiddenSubstrings(produced.sourceResultsFingerprint!)).toEqual([]);
  });
});

describe("blob-source via injected fake live-state store", () => {
  it("reads the sample through the blob reader and would-write", async () => {
    const store: ForecastBlobStore = {
      put: async (pathname) => ({ pathname }),
      getText: async () => sampleRaw,
    };
    const read = await getPublicSafeLiveStateFromBlob({ store, objectPath: SAMPLE_PATH });
    expect(read.ok).toBe(true);
    const { input } = makeInput({
      source: {
        ok: true,
        state: read.state as unknown as PublicSafeStateInput,
        objectPath: SAMPLE_PATH,
        liveStateGeneratedAt: (read.state as { generatedAt?: string }).generatedAt ?? null,
      },
    });
    const res = await runRefreshCurrentForecast(input);
    expect(res.decision).toBe("would-write");
    expect(res.newLatestCompletedSupportedMatchNumber).toBe(73);
  });
});

describe("idempotency", () => {
  const liveOpts = { attribution: ATTR, dryRun: false, force: false, writeAllowed: true, iterations: 50 };

  it("skips when latest/completed/fingerprint are all unchanged", async () => {
    const { input, calls } = makeInput({ readExistingCurrent: existing(), options: liveOpts });
    const res = await runRefreshCurrentForecast(input);
    expect(res.decision).toBe("skipped");
    expect(res.reason).toBe("no-newer-completed-supported-match");
    expect(calls.writes).toBe(0);
  });

  it("writes when the fingerprint differs (a correction with same counts)", async () => {
    const { input, calls } = makeInput({
      readExistingCurrent: existing({ sourceResultsFingerprint: "srf-deadbeef" }),
      options: liveOpts,
    });
    const res = await runRefreshCurrentForecast(input);
    expect(res.decision).toBe("wrote");
    expect(res.reason).toBe("source-results-changed");
    expect(calls.writes).toBe(1);
  });

  it("writes when a newer latest match exists", async () => {
    const { input } = makeInput({
      readExistingCurrent: existing({ latestCompletedSupportedMatchNumber: 50, completedMatchesLocked: 50 }),
      options: liveOpts,
    });
    const res = await runRefreshCurrentForecast(input);
    expect(res.decision).toBe("wrote");
    expect(res.reason).toBe("newer-completed-supported-match");
  });

  it("writes when the completed count is greater (same latest)", async () => {
    const { input } = makeInput({
      readExistingCurrent: existing({ completedMatchesLocked: 60 }),
      options: liveOpts,
    });
    const res = await runRefreshCurrentForecast(input);
    expect(res.decision).toBe("wrote");
    expect(res.reason).toBe("newer-completed-supported-match");
  });

  it("force writes even when unchanged", async () => {
    const { input } = makeInput({
      readExistingCurrent: existing(),
      options: { ...liveOpts, force: true },
    });
    const res = await runRefreshCurrentForecast(input);
    expect(res.decision).toBe("wrote");
    expect(res.reason).toBe("forced");
  });

  it("writes when no existing current", async () => {
    const { input } = makeInput({ readExistingCurrent: notFound, options: liveOpts });
    const res = await runRefreshCurrentForecast(input);
    expect(res.decision).toBe("wrote");
    expect(res.reason).toBe("no-existing-current");
  });

  it("writes when existing current is malformed", async () => {
    const malformed = async (): Promise<ForecastLoadResult<PublicSafeForecastCurrent>> => ({
      value: null,
      ok: false,
      fallback: true,
      error: "invalid-shape",
    });
    const { input } = makeInput({ readExistingCurrent: malformed, options: liveOpts });
    const res = await runRefreshCurrentForecast(input);
    expect(res.decision).toBe("wrote");
    expect(res.reason).toBe("existing-unreadable");
  });
});

describe("write safety + dry-run", () => {
  it("dry-run never writes", async () => {
    const { input, calls } = makeInput({ options: { attribution: ATTR, dryRun: true, force: false, writeAllowed: true, iterations: 50 } });
    const res = await runRefreshCurrentForecast(input);
    expect(res.wrote).toBe(false);
    expect(calls.writes).toBe(0);
  });

  it("blocks a file-source write when writeAllowed is false", async () => {
    const { input, calls } = makeInput({
      options: { attribution: ATTR, dryRun: false, force: false, writeAllowed: false, iterations: 50 },
    });
    const res = await runRefreshCurrentForecast(input);
    expect(res.decision).toBe("blocked");
    expect(res.reason).toBe("file-write-not-allowed");
    expect(res.exitCode).toBe(1);
    expect(calls.writes).toBe(0);
    expect(res.current).not.toBeNull();
  });

  it("write path validates + leak-scans via the real put (fake store)", async () => {
    const objects: Record<string, string> = {};
    const store: ForecastBlobStore = {
      put: async (pathname, body) => {
        objects[pathname] = body;
        return { pathname };
      },
      getText: async (pathname) => objects[pathname] ?? null,
    };
    const { input } = makeInput({
      writeCurrent: (c) => putPublicSafeForecastCurrentToBlob(c, { store }),
      options: { attribution: ATTR, dryRun: false, force: true, writeAllowed: true, iterations: 50 },
    });
    const res = await runRefreshCurrentForecast(input);
    expect(res.decision).toBe("wrote");
    expect(objects[FORECAST_PATH]).toBeDefined();
    expect(findForecastForbiddenSubstrings(objects[FORECAST_PATH]!)).toEqual([]);
  });
});

describe("blocked inputs", () => {
  it("blocks when the source is unavailable", async () => {
    const { input, calls } = makeInput({
      source: { ok: false, objectPath: SAMPLE_PATH, liveStateGeneratedAt: null, error: "not-found" },
      options: { attribution: ATTR, dryRun: false, force: false, writeAllowed: true, iterations: 50 },
    });
    const res = await runRefreshCurrentForecast(input);
    expect(res.decision).toBe("blocked");
    expect(res.reason).toBe("source-unavailable");
    expect(res.exitCode).toBe(1);
    expect(calls.writes).toBe(0);
    expect(res.current).toBeNull();
  });

  it("blocks when ledger derivation fails", async () => {
    const badState: PublicSafeStateInput = {
      asOf: "2026-06-29",
      publicSourcePolicy: "provider-public-delayed",
      matches: [
        // M1 exists as an official fixture, but these teams do not match it -> deriver throws.
        { matchNumber: 1, stage: "group", status: "complete", teamA: "not-a-team", teamB: "also-bogus", goalsA: 1, goalsB: 0 },
      ],
    };
    const { input, calls } = makeInput({
      source: { ok: true, state: badState, objectPath: SAMPLE_PATH, liveStateGeneratedAt: null },
      options: { attribution: ATTR, dryRun: false, force: false, writeAllowed: true, iterations: 50 },
    });
    const res = await runRefreshCurrentForecast(input);
    expect(res.decision).toBe("blocked");
    expect(res.reason).toBe("ledger-derivation-failed");
    expect(calls.writes).toBe(0);
  });
});

describe("helpers + safety", () => {
  it("currentSnapshotId zero-pads the match number", () => {
    expect(currentSnapshotId("2026-06-29", 73)).toBe("current-2026-06-29-after-match-073");
    expect(currentSnapshotId("2026-06-11", 0)).toBe("current-2026-06-11-after-match-000");
  });

  it("computeSourceResultsFingerprint is deterministic and matches the produced current", () => {
    const ledger = deriveLedgerFromPublicSafeState(sampleState, { sourceObjectPath: SAMPLE_PATH });
    const a = computeSourceResultsFingerprint(ledger);
    const b = computeSourceResultsFingerprint(ledger);
    expect(a).toBe(b);
    expect(a).toBe(produced.sourceResultsFingerprint);
  });

  it("does not change MODEL_WEIGHTS", async () => {
    const before = structuredClone(MODEL_WEIGHTS);
    await runRefreshCurrentForecast(makeInput().input);
    expect(MODEL_WEIGHTS).toEqual(before);
  });

  it("orchestrator source imports nothing from football-data / live-ingest", () => {
    const src = readFileSync(join(process.cwd(), "scripts/forecast/refresh-current.ts"), "utf8");
    const imports = src.split("\n").filter((l) => l.trimStart().startsWith("import")).join("\n");
    expect(imports).not.toMatch(/football-data|@\/lib\/live-ingest/);
  });
});
