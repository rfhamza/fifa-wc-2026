import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PublicSafeLiveState } from "@/lib/live-state/public-safe";
import {
  DEFAULT_BLOB_OBJECT_PATH,
  assertNoProviderSecrets,
  getPublicSafeLiveStateFromBlob,
  putPublicSafeLiveStateToBlob,
  type PublicSafeBlobStore,
} from "@/lib/live-state/public-safe-blob-store";
import {
  isPublicSafeLiveState,
  resolvePublicSafeLiveStateForServing,
  type LoadResult,
} from "@/lib/live-state/public-safe-source";
import { runWritePublicSafeBlob } from "@/scripts/live-state/write-public-safe-blob";
import type { FetchLike } from "@/scripts/football-data-org/live-state-fetch";
import { finishedGroupWin } from "./fixtures/live-ingest/football-data-org/sample-payloads";
import committedFixture from "@/data/live/public-safe-sample.json";

/**
 * Phase 1.28M: private-Blob write-path spike. Mocked Blob SDK seam, mocked fetch; no
 * network, no real token, no real Blob. Proves the adapter, the manual writer, the
 * serving resolver (provider-derived public-display guard), and the privacy boundary.
 */

const FIXTURE = committedFixture as unknown as PublicSafeLiveState;

/** An in-memory fake of the private Blob store seam. */
function fakeStore(seed?: Record<string, string>): PublicSafeBlobStore & { objects: Record<string, string> } {
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

const FORBIDDEN = [
  "X-Auth-Token", "X-Authenticated-Client", "BLOB_READ_WRITE_TOKEN", "FOOTBALL_DATA_TOKEN",
  "providerId", "providerMatchId", "providerTeamId", "crest", "odds", "referee", "events", "tla\"",
];

const matchesFetch = (payload: unknown): FetchLike => async () => ({
  status: 200,
  ok: true,
  headers: { get: () => null },
  text: async () => JSON.stringify(payload),
});

describe("Blob adapter (mocked SDK seam)", () => {
  it("writes the sanitized state at the default object path", async () => {
    const store = fakeStore();
    const { pathname } = await putPublicSafeLiveStateToBlob(FIXTURE, { store });
    expect(pathname).toBe(DEFAULT_BLOB_OBJECT_PATH);
    const parsed = JSON.parse(store.objects[DEFAULT_BLOB_OBJECT_PATH]!);
    expect(parsed.matches).toHaveLength(54);
  });

  it("honours a custom object path", async () => {
    const store = fakeStore();
    const { pathname } = await putPublicSafeLiveStateToBlob(FIXTURE, { store, objectPath: "live-state/live-state.sanitized.json" });
    expect(pathname).toBe("live-state/live-state.sanitized.json");
  });

  it("reads the sanitized state back", async () => {
    const store = fakeStore({ [DEFAULT_BLOB_OBJECT_PATH]: JSON.stringify(FIXTURE) });
    const r = await getPublicSafeLiveStateFromBlob({ store });
    expect(r.ok).toBe(true);
    expect(r.state.matches).toHaveLength(54);
  });

  it("falls back safely on a malformed object", async () => {
    const store = fakeStore({ [DEFAULT_BLOB_OBJECT_PATH]: JSON.stringify({ nonsense: true }) });
    const r = await getPublicSafeLiveStateFromBlob({ store });
    expect(r.ok).toBe(false);
    expect(r.state.status).toBe("unavailable");
  });

  it("falls back safely on a missing object", async () => {
    const r = await getPublicSafeLiveStateFromBlob({ store: fakeStore() });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("not-found");
  });

  it("fails safe (read) when no store and no token is available", async () => {
    const prev = process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    try {
      const r = await getPublicSafeLiveStateFromBlob();
      expect(r.ok).toBe(false);
      expect(r.error).toBe("missing-blob-token");
    } finally {
      if (prev !== undefined) process.env.BLOB_READ_WRITE_TOKEN = prev;
    }
  });

  it("refuses to write content containing a forbidden field", () => {
    expect(() => assertNoProviderSecrets(JSON.stringify({ "X-Auth-Token": "abc" }))).toThrow();
    expect(() => assertNoProviderSecrets(JSON.stringify(FIXTURE))).not.toThrow();
  });

  it("never includes a token or provider field in the stored body", async () => {
    const store = fakeStore();
    await putPublicSafeLiveStateToBlob(FIXTURE, { store, token: "blob-secret-xyz" });
    const body = store.objects[DEFAULT_BLOB_OBJECT_PATH]!;
    expect(body).not.toContain("blob-secret-xyz");
    for (const bad of FORBIDDEN) expect(body.includes(bad)).toBe(false);
  });
});

describe("serving resolver (provider-derived public-display guard)", () => {
  const fixtureResult: LoadResult = { state: FIXTURE, ok: true, fallback: false };
  const providerState: PublicSafeLiveState = { ...FIXTURE, isProviderDerived: true, publicSourcePolicy: "provider-public-delayed" };

  it("default source returns the fixture", async () => {
    const r = await resolvePublicSafeLiveStateForServing(
      { source: "fixture", allowProviderDerivedPublic: false },
      { loadFixture: async () => fixtureResult, loadBlob: async () => { throw new Error("should not read blob"); } },
    );
    expect(r.state.isProviderDerived).toBe(false);
    expect(r.ok).toBe(true);
  });

  it("blob source returns manual-snapshot (non-provider) state", async () => {
    const r = await resolvePublicSafeLiveStateForServing(
      { source: "blob", allowProviderDerivedPublic: false },
      { loadFixture: async () => fixtureResult, loadBlob: async () => ({ state: FIXTURE, ok: true, fallback: false }) },
    );
    expect(r.ok).toBe(true);
    expect(r.state.isProviderDerived).toBe(false);
  });

  it("blob source with provider-derived state is BLOCKED unless explicitly allowed", async () => {
    let fixtureServed = false;
    const r = await resolvePublicSafeLiveStateForServing(
      { source: "blob", allowProviderDerivedPublic: false },
      {
        loadFixture: async () => { fixtureServed = true; return fixtureResult; },
        loadBlob: async () => ({ state: providerState, ok: true, fallback: false }),
      },
    );
    expect(fixtureServed).toBe(true);
    expect(r.state.isProviderDerived).toBe(false); // fixture, not the provider-derived blob
  });

  it("blob source with provider-derived state IS served when explicitly allowed", async () => {
    const r = await resolvePublicSafeLiveStateForServing(
      { source: "blob", allowProviderDerivedPublic: true },
      { loadFixture: async () => fixtureResult, loadBlob: async () => ({ state: providerState, ok: true, fallback: false }) },
    );
    expect(r.state.isProviderDerived).toBe(true);
    expect(r.state.publicSourcePolicy).toBe("provider-public-delayed");
  });

  it("still accepts a legacy provider-private-deferred object (backward-compat)", async () => {
    const legacy: PublicSafeLiveState = { ...FIXTURE, isProviderDerived: true, publicSourcePolicy: "provider-private-deferred" };
    expect(isPublicSafeLiveState(legacy)).toBe(true); // guard accepts the historical string
    const r = await resolvePublicSafeLiveStateForServing(
      { source: "blob", allowProviderDerivedPublic: true },
      { loadFixture: async () => fixtureResult, loadBlob: async () => ({ state: legacy, ok: true, fallback: false }) },
    );
    expect(r.state.isProviderDerived).toBe(true);
    expect(r.state.publicSourcePolicy).toBe("provider-private-deferred");
  });

  it("blob read failure falls back to the fixture", async () => {
    const r = await resolvePublicSafeLiveStateForServing(
      { source: "blob", allowProviderDerivedPublic: true },
      {
        loadFixture: async () => fixtureResult,
        loadBlob: async () => ({ state: { ...FIXTURE, status: "unavailable" }, ok: false, fallback: true, error: "x" }),
      },
    );
    expect(r.ok).toBe(true);
    expect(r.state.matches).toHaveLength(54);
  });
});

describe("manual writer", () => {
  const baseDeps = {
    objectPath: DEFAULT_BLOB_OBJECT_PATH,
    now: () => "2026-06-25T12:00:00Z",
  };

  it("fixture mode writes the manual/FIFA snapshot (not provider-derived)", async () => {
    const store = fakeStore();
    const logs: string[] = [];
    const r = await runWritePublicSafeBlob({
      ...baseDeps, source: "fixture", dryRun: false, store, blobToken: "blob-secret",
      log: (l) => logs.push(l),
    });
    expect(r.action).toBe("wrote");
    expect(r.isProviderDerived).toBe(false);
    expect(r.matchCount).toBe(54);
    expect(logs.join("\n")).not.toContain("blob-secret");
  });

  it("provider mode writes ONLY the sanitized projection (public-safe but delayed)", async () => {
    const store = fakeStore();
    const logs: string[] = [];
    const r = await runWritePublicSafeBlob({
      ...baseDeps, source: "football-data", dryRun: false, allowPartial: true, store,
      blobToken: "blob-secret", providerToken: "fd-secret",
      fetchImpl: matchesFetch(finishedGroupWin), log: (l) => logs.push(l),
    });
    expect(r.action).toBe("wrote");
    expect(r.isProviderDerived).toBe(true);
    const body = store.objects[DEFAULT_BLOB_OBJECT_PATH]!;
    const parsed = JSON.parse(body) as PublicSafeLiveState;
    // Phase 1.28P: public-safe-but-delayed policy; legacy private/deferred no longer emitted.
    expect(parsed.publicSourcePolicy).toBe("provider-public-delayed");
    expect(parsed.publicSourcePolicy).not.toBe("provider-private-deferred");
    const m1 = parsed.matches.find((m) => m.matchNumber === 1)!;
    expect([m1.teamA, m1.teamB]).toEqual(["mexico", "south-africa"]);
    // ToU-safe public attribution: names Football-Data.org, flags delay + internal derivation,
    // and carries NO private/deferred wording.
    expect(parsed.attribution.sourceName).toBe("football-data.org");
    expect(parsed.attribution.text).toContain("Football-Data.org API");
    expect(parsed.attribution.text.toLowerCase()).toContain("may be delayed");
    expect(parsed.attribution.text.toLowerCase()).toContain("derived internally");
    const attribution = JSON.stringify(parsed.attribution).toLowerCase();
    expect(attribution).not.toContain("private");
    expect(attribution).not.toContain("deferred");
    // No provider IDs / raw fields / tokens in the stored object or logs.
    expect(/\b(769|774|1001)\b/.test(body)).toBe(false);
    for (const bad of FORBIDDEN) expect(body.includes(bad)).toBe(false);
    expect(logs.join("\n")).not.toContain("fd-secret");
    expect(logs.join("\n")).not.toContain("blob-secret");
  });

  it("provider mode BLOCKS the write on unknown/unmapped teams (nothing written)", async () => {
    const unknownTeamPayload = {
      competition: { id: 2000, name: "FIFA World Cup", code: "WC", type: "CUP" },
      matches: [
        {
          id: 9999, utcDate: "2026-06-11T19:00:00Z", status: "FINISHED", matchday: 1,
          stage: "GROUP_STAGE", group: "GROUP_A", lastUpdated: "2026-06-24T14:09:06Z",
          homeTeam: { id: 1, name: "Atlantis", shortName: "Atlantis", tla: "ATL" },
          awayTeam: { id: 2, name: "El Dorado", shortName: "El Dorado", tla: "ELD" },
          score: { winner: "HOME_TEAM", duration: "REGULAR", fullTime: { home: 1, away: 0 }, halfTime: { home: 0, away: 0 } },
        },
      ],
    };
    const store = fakeStore();
    const r = await runWritePublicSafeBlob({
      ...baseDeps, source: "football-data", dryRun: false, allowPartial: true, store,
      blobToken: "blob-secret", providerToken: "fd-secret",
      fetchImpl: matchesFetch(unknownTeamPayload), log: () => {},
    });
    expect(r.action).toBe("blocked");
    expect(r.reason).toContain("unmapped");
    expect(Object.keys(store.objects)).toHaveLength(0);
  });

  it("dry-run computes + gates but does NOT write", async () => {
    const store = fakeStore();
    const r = await runWritePublicSafeBlob({
      ...baseDeps, source: "fixture", dryRun: true, store, blobToken: "blob-secret", log: () => {},
    });
    expect(r.action).toBe("dry-run");
    expect(Object.keys(store.objects)).toHaveLength(0);
  });

  it("fails safe when no blob token and no store is available", async () => {
    const r = await runWritePublicSafeBlob({
      ...baseDeps, source: "fixture", dryRun: false, log: () => {},
    });
    expect(r.action).toBe("blocked");
    expect(r.reason).toBe("missing-blob-token");
  });

  // Phase 1.28P-Hotfix: scheduled/future knockout shells must NOT block group writes.
  const scheduledKnockoutShell = {
    id: 9500, utcDate: "2026-06-30T19:00:00Z", status: "TIMED", stage: "LAST_32", group: null,
    lastUpdated: "2026-06-24T14:09:06Z",
    homeTeam: { id: 759, name: "Germany", shortName: "Germany", tla: "GER" },
    awayTeam: { id: 764, name: "Brazil", shortName: "Brazil", tla: "BRA" },
    score: { winner: null, duration: "REGULAR", fullTime: { home: null, away: null } },
  };

  it("WRITES when only knockout-shell advisories are present (no blockers)", async () => {
    const payload = { competition: { code: "WC" }, matches: [...finishedGroupWin.matches, scheduledKnockoutShell] };
    const store = fakeStore();
    const logs: string[] = [];
    const r = await runWritePublicSafeBlob({
      ...baseDeps, source: "football-data", dryRun: false, allowPartial: true, store,
      blobToken: "blob-secret", providerToken: "fd-secret",
      fetchImpl: matchesFetch(payload), log: (l) => logs.push(l),
    });
    expect(r.action).toBe("wrote");
    expect(r.isProviderDerived).toBe(true);
    const parsed = JSON.parse(store.objects[DEFAULT_BLOB_OBJECT_PATH]!) as PublicSafeLiveState;
    expect(parsed.publicSourcePolicy).toBe("provider-public-delayed");
    expect(parsed.matches).toHaveLength(1); // M1 only; the scheduled shell is excluded
    // Summary log distinguishes blockers (0) from knockout-shell advisories.
    const out = logs.join("\n");
    expect(out).toContain("unmapped/unknown blockers: 0");
    expect(out).toContain("knockout shell advisories:");
    expect(out).toContain("knockout-shell-unmapped");
    // No provider ids / raw fields / tokens leak into the stored object.
    const body = store.objects[DEFAULT_BLOB_OBJECT_PATH]!;
    expect(/\b(759|764|9500|769)\b/.test(body)).toBe(false);
    for (const bad of FORBIDDEN) expect(body.includes(bad)).toBe(false);
    expect(out).not.toContain("fd-secret");
    expect(out).not.toContain("blob-secret");
  });

  it("still BLOCKS on a FINISHED knockout that cannot be mapped (real result risk)", async () => {
    const finishedUnmappedKo = {
      ...scheduledKnockoutShell,
      id: 9600, status: "FINISHED",
      score: { winner: "HOME_TEAM", duration: "REGULAR", fullTime: { home: 2, away: 1 } },
    };
    const payload = { competition: { code: "WC" }, matches: [...finishedGroupWin.matches, finishedUnmappedKo] };
    const store = fakeStore();
    const r = await runWritePublicSafeBlob({
      ...baseDeps, source: "football-data", dryRun: false, allowPartial: true, store,
      blobToken: "blob-secret", providerToken: "fd-secret",
      fetchImpl: matchesFetch(payload), log: () => {},
    });
    expect(r.action).toBe("blocked");
    expect(r.reason).toContain("unmapped");
    expect(Object.keys(store.objects)).toHaveLength(0); // last-known-good preserved
  });
});

describe("route wiring (real resolver, default env)", () => {
  const KEYS = ["LIVE_STATE_SOURCE", "LIVE_STATE_ALLOW_PROVIDER_DERIVED_PUBLIC", "LIVE_STATE_BLOB_OBJECT_PATH"] as const;
  afterEach(() => {
    for (const k of KEYS) delete process.env[k];
  });

  it("defaults to the manual fixture (200)", async () => {
    const { GET } = await import("@/app/api/live-state/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matches).toHaveLength(54);
    expect(body.isProviderDerived).toBe(false);
  });

  it("source=blob with no token falls back to the fixture (no throw, 200)", async () => {
    process.env.LIVE_STATE_SOURCE = "blob";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const { GET } = await import("@/app/api/live-state/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matches).toHaveLength(54);
    expect(body.isProviderDerived).toBe(false);
  });
});

describe("serving metadata (Phase 1.28N observability)", () => {
  const fixtureResult: LoadResult = { state: FIXTURE, ok: true, fallback: false };
  const providerState: PublicSafeLiveState = { ...FIXTURE, isProviderDerived: true, publicSourcePolicy: "provider-public-delayed" };
  const blobOk = (state: PublicSafeLiveState): LoadResult => ({ state, ok: true, fallback: false });
  const blobErr = (error: string): LoadResult => ({ state: { ...FIXTURE, status: "unavailable" }, ok: false, fallback: true, error });

  it("fixture source -> servedFrom=fixture, no fallbackReason, no sourceObjectPath", async () => {
    const r = await resolvePublicSafeLiveStateForServing(
      { source: "fixture", allowProviderDerivedPublic: false },
      { loadFixture: async () => fixtureResult, loadBlob: async () => { throw new Error("should not read blob"); } },
    );
    expect(r.serving.servedFrom).toBe("fixture");
    expect(r.serving.providerDerivedBlocked).toBe(false);
    expect(r.serving.fallbackReason).toBeUndefined();
    expect(r.serving.sourceObjectPath).toBeUndefined();
  });

  it("blob source with manual snapshot -> servedFrom=blob + echoed object path", async () => {
    const r = await resolvePublicSafeLiveStateForServing(
      { source: "blob", allowProviderDerivedPublic: false, objectPath: "live-state.sanitized.json" },
      { loadFixture: async () => fixtureResult, loadBlob: async () => blobOk(FIXTURE) },
    );
    expect(r.serving.servedFrom).toBe("blob");
    expect(r.serving.sourceObjectPath).toBe("live-state.sanitized.json");
    expect(r.serving.providerDerivedBlocked).toBe(false);
    expect(r.state.isProviderDerived).toBe(false);
  });

  it("provider-derived + allow=false -> fixture-fallback, blocked, served state stays non-provider", async () => {
    const r = await resolvePublicSafeLiveStateForServing(
      { source: "blob", allowProviderDerivedPublic: false, objectPath: "live-state.provider.sanitized.json" },
      { loadFixture: async () => fixtureResult, loadBlob: async () => blobOk(providerState) },
    );
    expect(r.serving.servedFrom).toBe("fixture-fallback");
    expect(r.serving.fallbackReason).toBe("provider-derived-public-blocked");
    expect(r.serving.providerDerivedBlocked).toBe(true);
    expect(r.serving.sourceObjectPath).toBe("live-state.provider.sanitized.json");
    expect(r.state.isProviderDerived).toBe(false);
  });

  it("provider-derived + allow=true -> servedFrom=blob with provider-derived state", async () => {
    const r = await resolvePublicSafeLiveStateForServing(
      { source: "blob", allowProviderDerivedPublic: true },
      { loadFixture: async () => fixtureResult, loadBlob: async () => blobOk(providerState) },
    );
    expect(r.serving.servedFrom).toBe("blob");
    expect(r.state.isProviderDerived).toBe(true);
  });

  it("maps blob error codes to the fixed fallbackReason enum", async () => {
    const cases: Array<[string, string]> = [
      ["missing-blob-token", "missing-blob-token"],
      ["invalid-shape", "invalid-blob-state"],
      ["not-found", "blob-read-failed"],
      ["blob-read-error", "blob-read-failed"],
    ];
    for (const [error, expected] of cases) {
      const r = await resolvePublicSafeLiveStateForServing(
        { source: "blob", allowProviderDerivedPublic: false },
        { loadFixture: async () => fixtureResult, loadBlob: async () => blobErr(error) },
      );
      expect(r.serving.servedFrom).toBe("fixture-fallback");
      expect(r.serving.fallbackReason).toBe(expected);
      expect(r.state.matches).toHaveLength(54); // safe fixture content
    }
  });

  it("default object path is echoed when blob is attempted (no explicit objectPath)", async () => {
    const r = await resolvePublicSafeLiveStateForServing(
      { source: "blob", allowProviderDerivedPublic: false },
      { loadFixture: async () => fixtureResult, loadBlob: async () => blobErr("not-found") },
    );
    expect(r.serving.sourceObjectPath).toBe("live-state.sanitized.json");
  });

  it("the serving block leaks no URL / token / raw error (strict)", async () => {
    const variants = await Promise.all([
      resolvePublicSafeLiveStateForServing({ source: "fixture", allowProviderDerivedPublic: false }, { loadFixture: async () => fixtureResult }),
      resolvePublicSafeLiveStateForServing({ source: "blob", allowProviderDerivedPublic: false, objectPath: "live-state.provider.sanitized.json" }, { loadFixture: async () => fixtureResult, loadBlob: async () => blobOk(providerState) }),
      resolvePublicSafeLiveStateForServing({ source: "blob", allowProviderDerivedPublic: false }, { loadFixture: async () => fixtureResult, loadBlob: async () => blobErr("blob-read-error") }),
    ]);
    const ALLOWED_KEYS = new Set(["servedFrom", "providerDerivedBlocked", "fallbackReason", "sourceObjectPath"]);
    for (const v of variants) {
      const serialized = JSON.stringify(v.serving);
      for (const bad of ["https://", "http://", "://", "vercel-storage", "token", "Authorization"]) {
        expect(serialized.includes(bad)).toBe(false);
      }
      for (const k of Object.keys(v.serving)) expect(ALLOWED_KEYS.has(k)).toBe(true);
    }
  });
});

describe("route serving metadata (real resolver, env set+restore)", () => {
  const KEYS = ["LIVE_STATE_SOURCE", "LIVE_STATE_ALLOW_PROVIDER_DERIVED_PUBLIC", "LIVE_STATE_BLOB_OBJECT_PATH"] as const;
  afterEach(() => {
    for (const k of KEYS) delete process.env[k];
  });

  // Narrow no-leak set: safe public attribution URLs (FIFA / football-data sourceUrl) are
  // permitted, so we do NOT ban https:// globally - only specific sensitive substrings.
  const FORBIDDEN_RESPONSE = [
    "BLOB_READ_WRITE_TOKEN", "FOOTBALL_DATA_TOKEN", "X-Auth-Token", "X-Authenticated-Client",
    "Authorization", "providerId", "providerMatchId", "providerTeamId", "blob.vercel-storage.com",
    "vercel-storage", "blob-read-error", "not-found",
  ];

  it("default env -> serving.servedFrom=fixture, body.matches=54", async () => {
    const { GET } = await import("@/app/api/live-state/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.serving.servedFrom).toBe("fixture");
    expect(body.matches).toHaveLength(54);
  });

  it("source=blob + custom object path + no token -> safe fixture fallback, path echoed", async () => {
    process.env.LIVE_STATE_SOURCE = "blob";
    process.env.LIVE_STATE_BLOB_OBJECT_PATH = "live-state.provider.sanitized.json";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const { GET } = await import("@/app/api/live-state/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.serving.servedFrom).toBe("fixture-fallback");
    expect(body.serving.fallbackReason).toBe("missing-blob-token");
    expect(body.serving.sourceObjectPath).toBe("live-state.provider.sanitized.json");
    expect(body.isProviderDerived).toBe(false);
    expect(body.matches).toHaveLength(54);
  });

  it("the full serialized response leaks no token / blob URL / header / raw error / provider id", async () => {
    process.env.LIVE_STATE_SOURCE = "blob";
    process.env.LIVE_STATE_BLOB_OBJECT_PATH = "live-state.provider.sanitized.json";
    const { GET } = await import("@/app/api/live-state/route");
    const res = await GET();
    const serialized = JSON.stringify(await res.json());
    for (const bad of FORBIDDEN_RESPONSE) expect(serialized.includes(bad)).toBe(false);
  });
});

describe("manual write workflow governance", () => {
  const yml = readFileSync(join(process.cwd(), ".github/workflows/live-state-write-blob-manual.yml"), "utf8");

  it("is manual-dispatch only (no schedule/push/pull_request/workflow_run)", () => {
    expect(yml.includes("workflow_dispatch:")).toBe(true);
    expect(/^\s*schedule:/m.test(yml)).toBe(false);
    expect(/^\s*push:/m.test(yml)).toBe(false);
    expect(/^\s*pull_request:/m.test(yml)).toBe(false);
    expect(/^\s*workflow_run:/m.test(yml)).toBe(false);
  });

  it("is read-only, uploads no artifacts, and sets timeout + concurrency", () => {
    expect(/permissions:\s*\n\s*contents:\s*read/.test(yml)).toBe(true);
    expect(yml.includes("upload-artifact")).toBe(false);
    expect(yml.includes("timeout-minutes: 10")).toBe(true);
    expect(yml.includes("group: live-state-write-blob-manual")).toBe(true);
    expect(yml.includes("cancel-in-progress: false")).toBe(true);
  });

  it("passes secrets only as step env and never echoes a token", () => {
    expect(yml.includes("BLOB_READ_WRITE_TOKEN: ${{ secrets.BLOB_READ_WRITE_TOKEN }}")).toBe(true);
    expect(/echo[^\n]*TOKEN/.test(yml)).toBe(false);
  });
});

describe("route live-read hardening (Phase 1.28O)", () => {
  const KEYS = ["LIVE_STATE_SOURCE", "LIVE_STATE_ALLOW_PROVIDER_DERIVED_PUBLIC", "LIVE_STATE_BLOB_OBJECT_PATH"] as const;
  afterEach(() => {
    for (const k of KEYS) delete process.env[k];
  });

  it("exports dynamic=force-dynamic and revalidate=0 (no static/ISR caching)", async () => {
    const route = await import("@/app/api/live-state/route");
    expect(route.dynamic).toBe("force-dynamic");
    expect(route.revalidate).toBe(0);
  });

  it("sets Cache-Control: no-store, max-age=0 on the response", async () => {
    const { GET } = await import("@/app/api/live-state/route");
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("no-store, max-age=0");
  });
});

describe("scheduled write workflow governance (Phase 1.28O)", () => {
  const yml = readFileSync(join(process.cwd(), ".github/workflows/live-state-write-blob-scheduled.yml"), "utf8");

  it("runs on schedule (7,37) + workflow_dispatch, and no other triggers", () => {
    expect(yml.includes("schedule:")).toBe(true);
    expect(yml.includes('cron: "7,37 * * * *"')).toBe(true);
    expect(yml.includes("workflow_dispatch:")).toBe(true);
    expect(/^\s*push:/m.test(yml)).toBe(false);
    expect(/^\s*pull_request:/m.test(yml)).toBe(false);
    expect(/^\s*workflow_run:/m.test(yml)).toBe(false);
  });

  it("declares no workflow inputs (source/object_path are not configurable)", () => {
    expect(yml.includes("inputs:")).toBe(false);
    expect(/^\s*source:/m.test(yml)).toBe(false);
    expect(/^\s*object_path:/m.test(yml)).toBe(false);
  });

  it("writes ONLY the private provider object, never the public/manual object", () => {
    expect(yml.includes("--object-path live-state.provider.sanitized.json")).toBe(true);
    expect(yml.includes("--source football-data")).toBe(true);
    // The public/manual object path must not appear anywhere in the workflow file.
    expect(yml.includes("live-state.sanitized.json")).toBe(false);
  });

  it("does not dry-run or allow partial (real, full-tournament write)", () => {
    expect(yml.includes("--dry-run")).toBe(false);
    expect(yml.includes("--allow-partial")).toBe(false);
  });

  it("has the LIVE_STATE_SCHEDULER_ENABLED kill-switch gating scheduled runs", () => {
    expect(yml.includes("LIVE_STATE_SCHEDULER_ENABLED")).toBe(true);
    // Guard skips scheduled events unless the variable is exactly "true".
    expect(yml.includes('vars.LIVE_STATE_SCHEDULER_ENABLED')).toBe(true);
    expect(/EVENT_NAME"?\s*=\s*"schedule"/.test(yml) || yml.includes('"$EVENT_NAME" = "schedule"')).toBe(true);
  });

  it("is read-only, uploads no artifacts, commits nothing, sets timeout + concurrency", () => {
    expect(/permissions:\s*\n\s*contents:\s*read/.test(yml)).toBe(true);
    expect(yml.includes("upload-artifact")).toBe(false);
    expect(yml.includes("git commit")).toBe(false);
    expect(yml.includes("git push")).toBe(false);
    expect(yml.includes("timeout-minutes: 10")).toBe(true);
    expect(yml.includes("group: live-state-write-blob-scheduled")).toBe(true);
    expect(yml.includes("cancel-in-progress: false")).toBe(true);
  });

  it("passes secrets only as step env and never echoes a token", () => {
    expect(yml.includes("BLOB_READ_WRITE_TOKEN: ${{ secrets.BLOB_READ_WRITE_TOKEN }}")).toBe(true);
    expect(yml.includes("FOOTBALL_DATA_TOKEN: ${{ secrets.FOOTBALL_DATA_TOKEN }}")).toBe(true);
    expect(/echo[^\n]*TOKEN/.test(yml)).toBe(false);
    expect(/echo[^\n]*\$\{\{\s*secrets\./.test(yml)).toBe(false);
  });

  it("does not modify the existing manual workflow's identity", () => {
    expect(yml.includes("name: live-state-write-blob-scheduled")).toBe(true);
    expect(yml.includes("name: live-state-write-blob-manual")).toBe(false);
  });
});
