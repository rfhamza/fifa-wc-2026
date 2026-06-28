import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FORECAST_RESULTS_SCHEMA_VERSION,
  type ForecastResultsLedger,
  validateResultsLedger,
  validateResultsLedgerAgainstFixtures,
  validateForecastResultsManifest,
  loadForecastResultsManifest,
  ledgerToLockedResults,
} from "@/lib/model/forecast-results-ledger";
import {
  buildBaselineForecastSnapshot,
  buildLiveAwareForecastSnapshot,
  validateForecastSnapshot,
  findForbiddenSubstrings,
  FORECAST_PROBABILITY_KEYS,
} from "@/lib/model/forecast-snapshots";
import { fixtures, groups } from "@/lib/data";
import type { Fixture, GroupId } from "@/lib/types";

/**
 * Phase 1.29 (PR-3B) - results ledger + live-aware snapshot generator. Tests the
 * ledger schema, fixture-aware validation, ledger->lockedResults mapping, the
 * live-aware snapshot builder, determinism, provenance, leakage, and baseline
 * parity. Uses a SYNTHETIC inline ledger (not real tournament data); no real
 * ledger or post-match snapshot is committed in this PR.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const G = groups[0]!;
const gfx: Fixture[] = fixtures
  .filter((f) => f.group === G.id && typeof f.matchNumber === "number")
  .sort((a, b) => a.matchNumber! - b.matchNumber!);

const SAMPLE_SCORES: [number, number][] = [[2, 0], [1, 1], [0, 3]];

function syntheticLedger(overrides: Partial<ForecastResultsLedger> = {}): ForecastResultsLedger {
  return {
    schemaVersion: FORECAST_RESULTS_SCHEMA_VERSION,
    ledgerId: "synthetic-test-ledger",
    asOf: "2026-06-20T00:00:00.000Z",
    sourcePolicy: "manual-snapshot",
    notes: "Synthetic test ledger (not real tournament data).",
    results: gfx.slice(0, 3).map((f, i) => ({
      matchNumber: f.matchNumber!,
      stage: "group" as const,
      group: f.group,
      homeTeamId: f.homeTeamId,
      awayTeamId: f.awayTeamId,
      homeGoals: SAMPLE_SCORES[i]![0],
      awayGoals: SAMPLE_SCORES[i]![1],
      status: "complete" as const,
    })),
    ...overrides,
  };
}

describe("results ledger schema", () => {
  it("accepts a valid synthetic ledger", () => {
    expect(validateResultsLedger(syntheticLedger())).toEqual([]);
  });

  it("maps rows to LockedResult[] (5 sim fields, count preserved)", () => {
    const locked = ledgerToLockedResults(syntheticLedger());
    expect(locked).toHaveLength(3);
    for (const lr of locked) {
      expect(Object.keys(lr).sort()).toEqual(["awayGoals", "awayTeamId", "homeGoals", "homeTeamId", "matchNumber"]);
    }
  });

  it("accepts a public-safe sourcePolicy label containing the word 'provider'", () => {
    expect(validateResultsLedger(syntheticLedger({ sourcePolicy: "provider-public-delayed" }))).toEqual([]);
  });
});

describe("results ledger validation fails closed", () => {
  it("rejects a non-final status", () => {
    const led = syntheticLedger();
    led.results[0]!.status = "in-progress" as unknown as "complete";
    expect(validateResultsLedger(led).join(" ")).toMatch(/status/i);
  });

  it("rejects a non-group stage", () => {
    const led = syntheticLedger();
    led.results[0]!.stage = "knockout" as unknown as "group";
    expect(validateResultsLedger(led).join(" ")).toMatch(/stage/i);
  });

  it("rejects duplicate matchNumbers", () => {
    const led = syntheticLedger();
    led.results[1]!.matchNumber = led.results[0]!.matchNumber;
    expect(validateResultsLedger(led).join(" ")).toMatch(/duplicat/i);
  });

  it("rejects invalid goals (negative / non-integer)", () => {
    const neg = syntheticLedger();
    neg.results[0]!.homeGoals = -1;
    expect(validateResultsLedger(neg).join(" ")).toMatch(/homeGoals/i);
    const frac = syntheticLedger();
    frac.results[0]!.awayGoals = 1.5;
    expect(validateResultsLedger(frac).join(" ")).toMatch(/awayGoals/i);
  });

  it("rejects provider/private leakage (raw ids, tokens, urls)", () => {
    const leak = syntheticLedger({ notes: "x-auth-token: Bearer secret" });
    expect(validateResultsLedger(leak).join(" ")).toMatch(/forbidden|private/i);
    const withId = syntheticLedger();
    (withId.results[0] as unknown as { providerId: string }).providerId = "abc123";
    expect(validateResultsLedger(withId).join(" ")).toMatch(/forbidden|private/i);
  });
});

describe("fixture-aware ledger validation", () => {
  it("passes for a ledger consistent with the official fixtures", () => {
    expect(validateResultsLedgerAgainstFixtures(syntheticLedger(), fixtures)).toEqual([]);
  });

  it("rejects a group that does not match the official fixture", () => {
    const led = syntheticLedger();
    const wrongGroup: GroupId = (groups[1]!.id === led.results[0]!.group ? groups[2]! : groups[1]!).id;
    led.results[0]!.group = wrongGroup;
    expect(validateResultsLedgerAgainstFixtures(led, fixtures).join(" ")).toMatch(/group/i);
  });

  it("rejects an unknown matchNumber", () => {
    const led = syntheticLedger();
    led.results[0]!.matchNumber = 9999;
    expect(validateResultsLedgerAgainstFixtures(led, fixtures).join(" ")).toMatch(/unknown/i);
  });

  it("rejects a knockout / non-group matchNumber (M73+)", () => {
    const led = syntheticLedger();
    led.results[0]!.matchNumber = 73;
    expect(validateResultsLedgerAgainstFixtures(led, fixtures).join(" ")).toMatch(/unknown|non-group/i);
  });

  it("rejects teams that do not match the fixture", () => {
    const led = syntheticLedger();
    led.results[0]!.homeTeamId = "not-a-real-team";
    expect(validateResultsLedgerAgainstFixtures(led, fixtures).join(" ")).toMatch(/teams/i);
  });
});

describe("results manifest", () => {
  it("the committed results manifest.json is schema-valid and empty", () => {
    const manifest = loadForecastResultsManifest(read("data/forecast/results/manifest.json"));
    expect(validateForecastResultsManifest(manifest)).toEqual([]);
    expect(manifest.schemaVersion).toBe(FORECAST_RESULTS_SCHEMA_VERSION);
    expect(manifest.ledgers).toEqual([]);
  });
});

describe("live-aware snapshot builder", () => {
  const LIVE_GENERATED_AT = "2026-06-20T12:00:00.000Z";
  const ledger = syntheticLedger();
  const build = () =>
    buildLiveAwareForecastSnapshot({
      generatedAt: LIVE_GENERATED_AT,
      lockedResults: ledgerToLockedResults(ledger),
      asOf: ledger.asOf,
      liveStateSource: ledger.sourcePolicy,
      liveStateAsOf: ledger.asOf,
      seed: 20260611,
      iterations: 60,
    });

  it("produces a schema-valid snapshot with 48 teams and probabilities in [0,1]", () => {
    const snap = build();
    expect(validateForecastSnapshot(snap)).toEqual([]);
    expect(snap.teams).toHaveLength(48);
    for (const t of snap.teams) {
      for (const key of FORECAST_PROBABILITY_KEYS) {
        expect(t[key]).toBeGreaterThanOrEqual(0);
        expect(t[key]).toBeLessThanOrEqual(1);
      }
    }
  });

  it("records completedMatchesLocked equal to the ledger row count and ledger provenance", () => {
    const snap = build();
    expect(snap.meta.completedMatchesLocked).toBe(ledger.results.length);
    expect(snap.meta.snapshotType).toBe("post-match");
    expect(snap.meta.liveStateSource).toBe(ledger.sourcePolicy);
    expect(snap.meta.liveStateAsOf).toBe(ledger.asOf);
  });

  it("is deterministic for fixed (ledger, seed, iterations, generatedAt)", () => {
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });

  it("leaks no provider/private data", () => {
    expect(findForbiddenSubstrings(JSON.stringify(build()))).toEqual([]);
  });
});

describe("baseline parity is preserved by the shared builder", () => {
  it("regenerates the committed baseline byte-for-byte", () => {
    const committed = read("data/forecast/snapshots/baseline-2026-06-11.pre-tournament.json").trim();
    const regenerated = buildBaselineForecastSnapshot({ generatedAt: "2026-06-11T00:00:00.000Z" });
    expect(JSON.stringify(regenerated, null, 2)).toBe(committed);
  });
});

describe("generator introduces no runtime live-state / Blob / env / fetch dependency", () => {
  const lib = read("lib/model/forecast-results-ledger.ts");
  const script = read("scripts/generate-forecast-snapshot.ts");
  it("avoids the live-state route, fetch, Blob, and env vars", () => {
    for (const src of [lib, script]) {
      expect(src).not.toContain("/api/live-state");
      expect(src).not.toContain("fetch(");
      expect(src).not.toContain("@vercel/blob");
      expect(src).not.toContain("process.env");
    }
  });
});
