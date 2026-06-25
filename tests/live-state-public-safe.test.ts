import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOfficialReference, ingestLiveSnapshot } from "@/lib/live-state/ingest";
import {
  toPublicSafeLiveState,
  PUBLIC_SAFE_SCHEMA_VERSION,
  type PublicSafeLiveState,
} from "@/lib/live-state/public-safe";
import {
  loadPublicSafeLiveState,
  isPublicSafeLiveState,
  fallbackPublicSafeState,
} from "@/lib/live-state/public-safe-source";
import { currentResults54Snapshot } from "./fixtures/live-state/current-results-54";
import committedFixture from "@/data/live/public-safe-sample.json";

/**
 * Phase 1.28K: sanitized public-safe projection + read-path spike. Pure, no network, no
 * token. Proves the privacy boundary, canonical identity, internally-derived
 * standings/bracket (incl. M73 South Africa vs Canada), and safe fallback behaviour.
 */

const MANUAL_ATTRIBUTION = {
  attribution: {
    sourceName: "FIFA official fixtures/results (manual snapshot)",
    sourceUrl: "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures",
    text: "Derived from FIFA official fixtures/results (manual snapshot).",
  },
  isProviderDerived: false,
  publicSourcePolicy: "manual-snapshot" as const,
};

const reference = buildOfficialReference();
const state = ingestLiveSnapshot(currentResults54Snapshot, reference, {
  generatedAt: "2026-06-25T12:33:09Z",
  staleAfterSeconds: 365 * 24 * 60 * 60,
});
const projection = toPublicSafeLiveState(state, MANUAL_ATTRIBUTION);

const FORBIDDEN_KEYS = [
  "providerId", "providerMatchId", "providerTeamId", "provenance",
  "tla", "teamACode", "teamBCode", "crest", "crestUrl",
  "odds", "referee", "referees", "events",
  "source", "freshnessStatus", "warnings", "headers",
  "X-Auth-Token", "X-Authenticated-Client",
];

const deepKeys = (x: unknown, acc = new Set<string>()): Set<string> => {
  if (Array.isArray(x)) x.forEach((v) => deepKeys(v, acc));
  else if (x && typeof x === "object") {
    for (const [k, v] of Object.entries(x)) { acc.add(k); deepKeys(v, acc); }
  }
  return acc;
};

describe("projection privacy boundary", () => {
  const keys = deepKeys(projection);
  it("contains none of the forbidden provider/private keys", () => {
    for (const bad of FORBIDDEN_KEYS) expect(keys.has(bad)).toBe(false);
  });

  it("the serialized projection leaks no provider ids, codes, or token strings", () => {
    const text = JSON.stringify(projection);
    for (const needle of ["66456", "66457", "X-Auth", "X-Authenticated", "token", "tla\""]) {
      expect(text).not.toContain(needle);
    }
  });

  it("only the documented top-level keys are present", () => {
    expect(Object.keys(projection).sort()).toEqual(
      [
        "asOf", "attribution", "bracket", "freshness", "generatedAt", "isProviderDerived",
        "matches", "publicSourcePolicy", "schemaVersion", "standings", "status", "tournamentId", "validationStatus",
      ].sort(),
    );
  });
});

describe("canonical identity (no provider ids)", () => {
  it("every match uses canonical M{n} + numeric matchNumber", () => {
    expect(projection.matches).toHaveLength(54);
    for (const m of projection.matches) {
      expect(m.matchId).toMatch(/^M\d+$/);
      expect(m.matchNumber).toBe(Number(m.matchId.slice(1)));
    }
  });

  it("team ids are canonical app ids (kebab-case), not codes", () => {
    const m1 = projection.matches.find((m) => m.matchNumber === 1)!;
    expect(m1.teamA).toBe("mexico");
    expect(m1.teamB).toBe("south-africa");
  });
});

describe("derived standings + bracket (internal, not provider)", () => {
  it("standings are marked derivedFrom results; no provider standings", () => {
    expect(projection.standings).toHaveLength(48);
    expect(projection.standings.every((s) => s.derivedFrom === "results")).toBe(true);
    const a = projection.standings.filter((s) => s.group === "A").sort((x, y) => x.position - y.position);
    expect(a.slice(0, 2).map((s) => s.teamId)).toEqual(["mexico", "south-africa"]);
  });

  it("M73 resolves to South Africa vs Canada and is marked resolved/internal", () => {
    const m73 = projection.bracket.find((b) => b.matchNumber === 73)!;
    expect(m73.homeTeamId).toBe("south-africa");
    expect(m73.awayTeamId).toBe("canada");
    expect(m73.resolution).toBe("resolved");
    expect(m73.round).toBe("roundOf32");
    expect(m73.derivedFrom).toBe("results");
  });

  it("partial and unresolved R32 slots are represented safely", () => {
    const m79 = projection.bracket.find((b) => b.matchNumber === 79)!;
    expect(m79.homeTeamId).toBe("mexico");
    expect(m79.awayTeamId).toBeNull();
    expect(m79.resolution).toBe("partial");
    const m74 = projection.bracket.find((b) => b.matchNumber === 74)!;
    expect(m74.resolution).toBe("unresolved");
    // exactly one R32 fully resolved by participants given only A/B/C complete
    const resolvedR32 = projection.bracket.filter((b) => b.round === "roundOf32" && b.resolution === "resolved");
    expect(resolvedR32.map((b) => b.matchNumber)).toEqual([73]);
  });
});

describe("metadata + policy labelling", () => {
  it("carries schema/attribution/freshness/validation and honest source policy", () => {
    expect(projection.schemaVersion).toBe(PUBLIC_SAFE_SCHEMA_VERSION);
    expect(projection.tournamentId).toBe("wc-2026");
    expect(projection.status).toBe("ok");
    expect(projection.freshness).toBe("fresh");
    expect(projection.validationStatus).toEqual({ ok: true, warningCount: 0 });
    expect(projection.isProviderDerived).toBe(false);
    expect(projection.publicSourcePolicy).toBe("manual-snapshot");
    expect(projection.attribution.text).toContain("FIFA");
  });
});

describe("committed fixture is the app-safe manual-snapshot projection", () => {
  it("matches a freshly computed projection (provenance = FIFA manual snapshot, not provider)", () => {
    const committed = committedFixture as unknown as PublicSafeLiveState;
    expect(committed.isProviderDerived).toBe(false);
    expect(committed.publicSourcePolicy).toBe("manual-snapshot");
    expect(committed.matches).toHaveLength(54);
    const m73 = committed.bracket.find((b) => b.matchNumber === 73)!;
    expect([m73.homeTeamId, m73.awayTeamId]).toEqual(["south-africa", "canada"]);
  });

  it("the committed fixture lives outside the git-ignored private live path", () => {
    const gi = readFileSync(join(process.cwd(), ".gitignore"), "utf8");
    expect(gi.includes("/data/live/private/")).toBe(true); // private subdir is ignored
    expect(gi.includes("/data/live/\n") || /\/data\/live\/$/m.test(gi)).toBe(false); // but data/live/ itself is not
  });
});

describe("read path + fallback", () => {
  it("loads the local fixture source and reports ok (no network, no token)", async () => {
    const r = await loadPublicSafeLiveState();
    expect(r.ok).toBe(true);
    expect(r.fallback).toBe(false);
    expect(r.state.matches.length).toBe(54);
  });

  it("falls back safely when the source throws", async () => {
    const r = await loadPublicSafeLiveState(async () => { throw new Error("boom"); });
    expect(r.ok).toBe(false);
    expect(r.fallback).toBe(true);
    expect(r.state.status).toBe("unavailable");
    expect(r.state.matches).toEqual([]);
  });

  it("falls back safely on a malformed source payload", async () => {
    const r = await loadPublicSafeLiveState(async () => ({ nonsense: true }));
    expect(r.ok).toBe(false);
    expect(r.state.status).toBe("unavailable");
  });

  it("guard + fallback helpers behave", () => {
    expect(isPublicSafeLiveState(projection)).toBe(true);
    expect(isPublicSafeLiveState({})).toBe(false);
    expect(fallbackPublicSafeState("x").status).toBe("unavailable");
  });
});

describe("module isolation", () => {
  const root = process.cwd();
  const projSrc = readFileSync(join(root, "lib", "live-state", "public-safe.ts"), "utf8");
  const srcSrc = readFileSync(join(root, "lib", "live-state", "public-safe-source.ts"), "utf8");
  const routeSrc = readFileSync(join(root, "app", "api", "live-state", "route.ts"), "utf8");

  it("the pure projection + source modules do no env/network work", () => {
    // public-safe.ts (pure mapper) and public-safe-source.ts (fixture seam + resolver)
    // must remain free of env reads and network calls. Phase 1.28M intentionally moved
    // server-env source selection into the route only (asserted separately below).
    for (const s of [projSrc, srcSrc]) {
      expect(/\bprocess\.env\b/.test(s)).toBe(false);
      expect(/\bfetch\s*\(/.test(s)).toBe(false);
    }
  });

  it("no projection/read-path module does its own provider work", () => {
    // None of the three may import the provider adapter or read the provider token.
    for (const s of [projSrc, srcSrc, routeSrc]) {
      expect(/\bfetch\s*\(/.test(s)).toBe(false); // no direct network anywhere
      expect(s.includes("football-data-org")).toBe(false);
      expect(s.includes("FOOTBALL_DATA_TOKEN")).toBe(false);
    }
  });

  it("the route reads ONLY public-safe LIVE_STATE_* server env (no provider/blob token)", () => {
    // Phase 1.28M: the route is the composition root and may read server env for source
    // selection, but only the non-sensitive LIVE_STATE_* flags - never a token.
    const envReads = routeSrc.match(/process\.env\.([A-Z0-9_]+)/g) ?? [];
    for (const read of envReads) {
      expect(read.startsWith("process.env.LIVE_STATE_")).toBe(true);
    }
    expect(routeSrc.includes("BLOB_READ_WRITE_TOKEN")).toBe(false);
    expect(routeSrc.includes("FOOTBALL_DATA_TOKEN")).toBe(false);
  });
});
