import { describe, expect, it } from "vitest";
import {
  normalizeProviderPayload,
} from "@/lib/live-ingest/normalize";
import {
  resolveTeamId,
  resolveStatus,
  resolveStage,
  parseGroupId,
  resolveVenueId,
  TEAM_ALIASES,
  VENUE_ALIASES,
  APP_TEAM_IDS,
  APP_VENUE_IDS,
} from "@/lib/live-ingest/mapping";
import type { LiveProviderAdapter, ProviderPayload } from "@/lib/live-ingest/types";
import { validateLiveSnapshot } from "@/lib/live-state/validate";
import { buildOfficialReference, ingestLiveSnapshot } from "@/lib/live-state/ingest";
import {
  mockProviderPayload,
  mockProviderPayloadUnknownTeam,
} from "./fixtures/live-ingest/mock-provider-payload";

/**
 * Phase 1.26B: a provider payload normalizes to the canonical `RawLiveSnapshot`,
 * validates + derives through the EXISTING live-state layer, keeps provider ids as
 * provenance only and provider standings/bracket as comparison only. Pure: no
 * network, no secrets (see tests/live-ingest-isolation.test.ts).
 */

const FRESH = { asOf: "2026-06-24T14:09:06Z", staleAfterSeconds: 24 * 60 * 60 };
const reference = buildOfficialReference();
const result = normalizeProviderPayload(mockProviderPayload);
const byMatchId = new Map(result.snapshot.matches.map((m) => [m.matchId, m]));

describe("normalize -> RawLiveSnapshot", () => {
  it("normalizes the mock payload with no errors", () => {
    expect(result.errors).toEqual([]);
    expect(result.snapshot.matches.length).toBe(mockProviderPayload.matches.length);
  });

  it("normalized snapshot validates cleanly through the live-state validator", () => {
    const v = validateLiveSnapshot(result.snapshot, reference, FRESH);
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
  });

  it("carries the provider source as an `external`/`api` ingestion source", () => {
    expect(result.snapshot.source.sourceId).toBe("mock-provider");
    expect(["api", "external"]).toContain(result.snapshot.source.sourceType);
    expect(result.snapshot.source.lastUpdatedAt).toBe("2026-06-24T14:33:36Z");
    expect(result.snapshot.asOf).toBe("2026-06-24T14:09:06Z");
  });
});

describe("matchNumber is canonical; provider ids are provenance-only", () => {
  it("every snapshot matchId is the official M{n} key", () => {
    for (const m of result.snapshot.matches) expect(m.matchId).toMatch(/^M\d+$/);
    expect(byMatchId.has("M1")).toBe(true);
    expect(byMatchId.has("M74")).toBe(true);
  });

  it("provider ids appear ONLY in provenance, never on the snapshot rows", () => {
    for (const m of result.snapshot.matches) {
      expect("providerId" in (m as unknown as Record<string, unknown>)).toBe(false);
    }
    const prov1 = result.provenance.matches.find((p) => p.matchId === "M1")!;
    expect(prov1.providerId).toBe("evt_1001");
    expect(prov1.matchId).toBe("M1");
  });

  it("provider ids do not replace matchNumber (disjoint id spaces)", () => {
    const matchIds = new Set(result.snapshot.matches.map((m) => m.matchId));
    const providerIds = new Set(result.provenance.matches.map((p) => p.providerId));
    expect([...providerIds].some((id) => matchIds.has(id))).toBe(false);
    // M74 is keyed by official number, not the provider's "evt_1074".
    const prov74 = result.provenance.matches.find((p) => p.matchNumber === 74)!;
    expect(prov74.matchId).toBe("M74");
    expect(prov74.providerId).toBe("evt_1074");
  });
});

describe("team / status / stage / venue mapping", () => {
  it("maps team aliases by name to app team ids", () => {
    expect(resolveTeamId("Turkey")).toBe("turkiye");
    expect(resolveTeamId("DR Congo")).toBe("congo-dr");
    expect(resolveTeamId("United States")).toBe("usa");
    expect(resolveTeamId("Bosnia and Herzegovina")).toBe("bosnia-herzegovina");
    expect(resolveTeamId("Czechia")).toBe("czechia");
    // applied in the normalized snapshot
    expect(byMatchId.get("M6")!.teamB).toBe("turkiye");
    expect(byMatchId.get("M48")!.teamB).toBe("congo-dr");
    expect(byMatchId.get("M4")!.teamA).toBe("usa");
    expect(byMatchId.get("M3")!.teamB).toBe("bosnia-herzegovina");
  });

  it("fails closed on unknown teams (excluded + recorded, never guessed)", () => {
    expect(resolveTeamId("Atlantis")).toBeNull();
    const r = normalizeProviderPayload(mockProviderPayloadUnknownTeam);
    expect(r.snapshot.matches).toHaveLength(0);
    expect(r.errors.some((e) => e.code === "unknown-team")).toBe(true);
  });

  it("all alias targets are valid app ids", () => {
    for (const id of Object.values(TEAM_ALIASES)) expect(APP_TEAM_IDS.has(id)).toBe(true);
    for (const id of Object.values(VENUE_ALIASES)) expect(APP_VENUE_IDS.has(id)).toBe(true);
  });

  it("maps statuses, including live -> in-progress", () => {
    expect(resolveStatus("live")).toBe("in-progress");
    expect(resolveStatus("finished")).toBe("complete");
    expect(resolveStatus("scheduled")).toBe("scheduled");
    expect(resolveStatus("postponed")).toBe("postponed");
    expect(resolveStatus("totally-unknown")).toBe("unknown");
    expect(byMatchId.get("M5")!.status).toBe("in-progress");
  });

  it("maps stages and groups; fails closed on unknown", () => {
    expect(resolveStage("Group Stage")).toBe("group");
    expect(resolveStage("Round of 32")).toBe("roundOf32");
    expect(resolveStage("Quarter-finals")).toBe("quarterFinal");
    expect(resolveStage("nonsense")).toBeNull();
    expect(parseGroupId("Group A")).toBe("A");
    expect(parseGroupId("Group Z")).toBeNull();
    expect(resolveVenueId("Mexico City Stadium")).toBe("mexico-city");
    expect(resolveVenueId("Unknown Arena")).toBeNull();
  });
});

describe("scores / knockout winner / penalties", () => {
  it("completed matches include scores; scheduled matches do not", () => {
    const m1 = byMatchId.get("M1")!; // complete
    expect(m1.goalsA).toBe(2);
    expect(m1.goalsB).toBe(0);
    const m73 = byMatchId.get("M73")!; // scheduled knockout
    expect(m73.status).toBe("scheduled");
    expect(m73.goalsA).toBeUndefined();
    expect(m73.goalsB).toBeUndefined();
  });

  it("maps knockout winner and penalties", () => {
    const m74 = byMatchId.get("M74")!;
    expect(m74.stage).toBe("roundOf32");
    expect(m74.winner).toBe("germany");
    expect(m74.penalties).toEqual({ a: 4, b: 2 });
  });

  it("group-stage rows carry no winner/penalties", () => {
    for (const m of result.snapshot.matches.filter((x) => x.stage === "group")) {
      expect(m.winner).toBeUndefined();
      expect(m.penalties).toBeUndefined();
    }
  });
});

describe("provider standings/bracket are comparison-only; state is derived", () => {
  const state = ingestLiveSnapshot(result.snapshot, reference, {
    generatedAt: "2026-06-24T14:40:00Z",
    staleAfterSeconds: 24 * 60 * 60,
  });

  it("comparison carries provider standings/bracket but they are NOT ingested", () => {
    expect(result.comparison.standings.length).toBeGreaterThan(0);
    expect(result.comparison.bracket.length).toBeGreaterThan(0);
    // The derived standings are tagged as derived-from-results, not from the upload.
    expect(state.groupStandings.every((s) => s.derivedFrom === "results")).toBe(true);
    expect(state.bracket.derivedFrom).toBe("results");
  });

  it("derives 48 standings rows from results through the live-state path", () => {
    expect(state.groupStandings).toHaveLength(48);
    const a = Object.fromEntries(
      state.groupStandings.filter((s) => s.group === "A").map((s) => [s.teamId, s]),
    );
    // Group A has only 2 of 3 matchdays here (4 of 6 matches) -> incomplete.
    expect(a.mexico!.points).toBe(6);
    expect(a.mexico!.played).toBe(2);
    expect(a["south-korea"]!.points).toBe(3);
    // Incomplete group: qualification stays undecided (no overclaiming).
    expect(state.groupStandings.every((s) => s.qualificationState === "undecided")).toBe(true);
    // Standings are derived from results, not from the provider's standings upload.
    expect(state.groupStandings.every((s) => s.derivedFrom === "results")).toBe(true);
  });

  it("applies no silent fallback", () => {
    expect(state.freshness.fallbackReason).toBeUndefined();
    expect(state.freshness.overall).toBe("fresh");
  });
});

describe("provider-agnostic adapter boundary (mock adapter; no network)", () => {
  it("fetchRaw() returns the fixture and normalize() yields the same snapshot", async () => {
    const adapter: LiveProviderAdapter<ProviderPayload> = {
      source: result.snapshot.source,
      fetchRaw: async () => mockProviderPayload, // mock: returns fixture, no network
      normalize: (raw) => normalizeProviderPayload(raw),
    };
    const raw = await adapter.fetchRaw();
    const out = adapter.normalize(raw);
    expect(out.snapshot.matches.length).toBe(mockProviderPayload.matches.length);
    expect(out.errors).toEqual([]);
  });
});
