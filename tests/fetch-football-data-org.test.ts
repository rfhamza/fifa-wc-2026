import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  runFetchLiveState,
  parseArgs,
  readThrottle,
  summariseMatchesPayload,
  DEFAULT_OPTIONS,
  DEFAULT_OUT_DIR,
  type FetchLike,
  type FetchResponseLike,
  type FetchOptions,
} from "@/scripts/football-data-org/live-state-fetch";
import { buildOfficialReference } from "@/lib/live-state/ingest";
import {
  groupStageSample,
  standingsComparison,
} from "./fixtures/live-ingest/football-data-org/sample-payloads";

/**
 * Phase 1.28C: the local-only football-data.org fetch report. All tests use a MOCK
 * fetch (no network, no token). They prove safe token handling, header/rate-limit
 * parsing, fail-closed HTTP handling, reuse of the pure normalize+validate pipeline,
 * comparison-only standings, ignored output paths, and script isolation.
 */

const TOKEN = "SECRET-TOKEN-DO-NOT-LOG";
const NOW = "2026-06-24T15:00:00Z";
const reference = buildOfficialReference();
const MATCHES_HEADERS = { "X-RequestsAvailable": "9", "X-RequestCounter-Reset": "45", "X-API-Version": "4" };

function makeRes(opts: { status?: number; headers?: Record<string, string>; body?: string }): FetchResponseLike {
  const status = opts.status ?? 200;
  const h = new Map(Object.entries(opts.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (n) => h.get(n.toLowerCase()) ?? null },
    text: async () => opts.body ?? "",
  };
}

interface Harness {
  fetchImpl: FetchLike;
  calls: { url: string; headers?: Record<string, string> }[];
  logs: string[];
  writes: { path: string; contents: string }[];
}

function harness(handler: (url: string) => FetchResponseLike | Promise<FetchResponseLike>): Harness {
  const calls: Harness["calls"] = [];
  const logs: string[] = [];
  const writes: Harness["writes"] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, headers: init?.headers });
    return handler(url);
  };
  return { fetchImpl, calls, logs, writes };
}

function opts(over: Partial<FetchOptions> = {}): FetchOptions {
  return { ...DEFAULT_OPTIONS, expectFullTournament: false, dryRun: true, ...over };
}

// Default handler: matches + standings both 200 with the minimized fixtures.
const okHandler = (url: string): FetchResponseLike =>
  url.includes("/standings")
    ? makeRes({ headers: MATCHES_HEADERS, body: JSON.stringify(standingsComparison) })
    : makeRes({ headers: MATCHES_HEADERS, body: JSON.stringify(groupStageSample) });

describe("token safety", () => {
  it("missing token fails safely and never calls fetch", async () => {
    const h = harness(okHandler);
    const r = await runFetchLiveState({
      token: undefined,
      fetchImpl: h.fetchImpl,
      now: () => NOW,
      writeArtifact: (p, c) => h.writes.push({ path: p, contents: c }),
      log: (l) => h.logs.push(l),
      reference,
      options: opts(),
    });
    expect(r.exitCode).toBe(1);
    expect(r.error).toBe("missing-token");
    expect(h.calls).toHaveLength(0);
    expect(h.logs.join("\n")).not.toContain(TOKEN);
  });

  it("sends the token only via X-Auth-Token and never logs it", async () => {
    const h = harness(okHandler);
    const r = await runFetchLiveState({
      token: TOKEN,
      fetchImpl: h.fetchImpl,
      now: () => NOW,
      writeArtifact: (p, c) => h.writes.push({ path: p, contents: c }),
      log: (l) => h.logs.push(l),
      reference,
      options: opts(),
    });
    expect(r.exitCode).toBe(0);
    expect(h.calls[0]!.headers).toEqual({ "X-Auth-Token": TOKEN });
    expect(h.logs.join("\n")).not.toContain(TOKEN);
  });
});

describe("success path: parse, normalize, validate", () => {
  function run(over: Partial<FetchOptions> = {}, handler = okHandler) {
    const h = harness(handler);
    return runFetchLiveState({
      token: TOKEN,
      fetchImpl: h.fetchImpl,
      now: () => NOW,
      writeArtifact: (p, c) => h.writes.push({ path: p, contents: c }),
      log: (l) => h.logs.push(l),
      reference,
      options: opts(over),
    }).then((r) => ({ r, h }));
  }

  it("parses headers + JSON and maps to canonical M{n} via the pure adapter", async () => {
    const { r } = await run();
    expect(r.exitCode).toBe(0);
    const s = r.summary!;
    expect(s.throttle).toEqual({ requestsAvailable: 9, counterReset: "45", apiVersion: "4" });
    expect(s.matchesReceived).toBe(3);
    expect(s.mappedCount).toBe(3); // M1, M3, M32
    expect(s.unmappedCount).toBe(0);
    expect(s.derivedStandingsSource).toBe("results");
    expect(s.freshnessOverall).toBe("fresh");
  });

  it("keeps provider standings comparison-only", async () => {
    const { r } = await run();
    const s = r.summary!;
    expect(s.providerStandingsComparisonOnly).toBe(true);
    expect(s.standingsFetched).toBe(true);
    expect(s.standingsComparisonRows).toBe(3);
  });

  it("X-RequestsAvailable <= 1 skips the optional standings fetch", async () => {
    const lowHandler = (url: string): FetchResponseLike =>
      url.includes("/standings")
        ? makeRes({ body: JSON.stringify(standingsComparison) })
        : makeRes({ headers: { ...MATCHES_HEADERS, "X-RequestsAvailable": "1" }, body: JSON.stringify(groupStageSample) });
    const { r, h } = await run({ standings: true }, lowHandler);
    expect(r.exitCode).toBe(0);
    expect(h.calls).toHaveLength(1); // standings not fetched
    expect(r.summary!.standingsFetched).toBe(false);
    expect(r.summary!.standingsSkippedReason).toContain("rate-limit");
  });

  it("persists artifacts only under the ignored output dir", async () => {
    const { h } = await run({ dryRun: false, summaryOnly: false });
    expect(h.writes.length).toBeGreaterThan(0);
    for (const w of h.writes) expect(w.path.startsWith(`${DEFAULT_OUT_DIR}/`)).toBe(true);
    // and no artifact contents leak the token
    for (const w of h.writes) expect(w.contents).not.toContain(TOKEN);
  });
});

describe("fail-closed HTTP handling", () => {
  const cases: { name: string; status: number; error: string }[] = [
    { name: "401 auth", status: 401, error: "http-401" },
    { name: "403 tier", status: 403, error: "http-403" },
    { name: "429 rate limit", status: 429, error: "http-429" },
    { name: "503 provider error", status: 503, error: "http-503" },
  ];
  for (const c of cases) {
    it(`fails closed on ${c.name}`, async () => {
      const h = harness(() => makeRes({ status: c.status, headers: { "X-RequestCounter-Reset": "30" } }));
      const r = await runFetchLiveState({
        token: TOKEN, fetchImpl: h.fetchImpl, now: () => NOW,
        writeArtifact: (p, ct) => h.writes.push({ path: p, contents: ct }),
        log: (l) => h.logs.push(l), reference, options: opts(),
      });
      expect(r.exitCode).toBe(1);
      expect(r.error).toBe(c.error);
      expect(h.logs.join("\n")).not.toContain(TOKEN);
    });
  }

  it("fails closed on invalid JSON", async () => {
    const h = harness(() => makeRes({ body: "<<not json>>" }));
    const r = await runFetchLiveState({
      token: TOKEN, fetchImpl: h.fetchImpl, now: () => NOW,
      writeArtifact: () => {}, log: (l) => h.logs.push(l), reference, options: opts(),
    });
    expect(r.exitCode).toBe(1);
    expect(r.error).toBe("invalid-json");
  });

  it("fails closed on a non-WC competition", async () => {
    const h = harness(() => makeRes({ headers: MATCHES_HEADERS, body: JSON.stringify({ competition: { code: "PL" }, matches: [] }) }));
    const r = await runFetchLiveState({
      token: TOKEN, fetchImpl: h.fetchImpl, now: () => NOW,
      writeArtifact: () => {}, log: (l) => h.logs.push(l), reference, options: opts(),
    });
    expect(r.exitCode).toBe(1);
    expect(r.error).toBe("normalize-failed");
  });
});

describe("pure helpers", () => {
  it("parseArgs reads the documented flags", () => {
    expect(parseArgs(["--no-standings", "--dry-run", "--out", "tmp/x", "--partial", "--summary-only"])).toEqual({
      standings: false, dryRun: true, summaryOnly: true, expectFullTournament: false, outDir: "tmp/x",
    });
    expect(parseArgs([])).toEqual(DEFAULT_OPTIONS);
  });

  it("readThrottle ignores account-identifying headers", () => {
    const res = makeRes({ headers: { "X-RequestsAvailable": "7", "X-Authenticated-Client": "someone@example.com" } });
    const t = readThrottle(res);
    expect(t.requestsAvailable).toBe(7);
    expect(JSON.stringify(t)).not.toContain("example.com");
  });

  it("summariseMatchesPayload counts statuses/stages in plain JS", () => {
    const s = summariseMatchesPayload(groupStageSample);
    expect(s.competition.code).toBe("WC");
    expect(s.matchesReceived).toBe(3);
    expect(s.statusCounts.FINISHED).toBe(2);
    expect(s.statusCounts.TIMED).toBe(1);
    expect(s.stageCounts.GROUP_STAGE).toBe(3);
  });
});

const walk = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      )
    : [];

describe("script isolation / governance", () => {
  const root = process.cwd();
  const scriptDir = join(root, "scripts", "football-data-org");
  const coreSrc = readFileSync(join(scriptDir, "live-state-fetch.ts"), "utf8");

  it("the core module does no env reads and no global fetch (all injected)", () => {
    expect(/\bprocess\.env\b/.test(coreSrc)).toBe(false);
    expect(/\bfetch\s*\(/.test(coreSrc)).toBe(false); // uses injected fetchImpl, not global fetch
  });

  it("the core module imports no model / app / client code", () => {
    for (const bad of ["lib/model", "prediction-core", "@/app", "@/components"]) {
      expect(coreSrc.includes(bad)).toBe(false);
    }
  });

  it("the runner reads ONLY FOOTBALL_DATA_TOKEN (never NEXT_PUBLIC)", () => {
    const runSrc = readFileSync(join(scriptDir, "run.ts"), "utf8");
    expect(runSrc.includes("process.env.FOOTBALL_DATA_TOKEN")).toBe(true);
    expect(/NEXT_PUBLIC/.test(runSrc)).toBe(false);
  });

  it("no NEXT_PUBLIC_FOOTBALL_DATA_TOKEN anywhere in source", () => {
    for (const d of ["scripts/football-data-org", "lib/live-ingest", "lib/live-state"]) {
      for (const p of walk(join(root, d)).filter((x) => x.endsWith(".ts"))) {
        expect(readFileSync(p, "utf8").includes("NEXT_PUBLIC_FOOTBALL_DATA_TOKEN")).toBe(false);
      }
    }
  });

  it("the football-data.org adapter stays pure (no fetch/env)", () => {
    const adapterDir = join(root, "lib", "live-ingest", "football-data-org");
    for (const f of readdirSync(adapterDir).filter((x) => x.endsWith(".ts"))) {
      const src = readFileSync(join(adapterDir, f), "utf8");
      expect(/\bfetch\s*\(/.test(src)).toBe(false);
      expect(/\bprocess\.env\b/.test(src)).toBe(false);
    }
  });

  it("no provider SDK / HTTP client dependency was added", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>; devDependencies?: Record<string, string>;
    };
    const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    for (const banned of ["axios", "node-fetch", "undici", "football-data", "got", "superagent"]) {
      expect(banned in all).toBe(false);
    }
  });

  it("no scheduled CI workflow was added", () => {
    const wfDir = join(root, ".github", "workflows");
    if (!existsSync(wfDir)) return;
    for (const f of readdirSync(wfDir)) {
      const src = readFileSync(join(wfDir, f), "utf8");
      expect(/^\s*schedule:/m.test(src)).toBe(false);
      expect(/cron:/.test(src)).toBe(false);
    }
  });

  it("the output dir is git-ignored", () => {
    const gi = readFileSync(join(root, ".gitignore"), "utf8");
    expect(gi.includes("/artifacts/")).toBe(true);
  });

  it("no app route imports the fetch script", () => {
    for (const f of walk(join(root, "app")).filter((x) => /\.(ts|tsx)$/.test(x))) {
      expect(readFileSync(f, "utf8").includes("football-data-org")).toBe(false);
    }
  });
});
