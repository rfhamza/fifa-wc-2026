import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  deriveLedgerFromPublicSafeState,
  validateResultsLedger,
  validateResultsLedgerAgainstFixtures,
  type PublicSafeStateInput,
} from "@/lib/model/forecast-results-ledger";
import { findForbiddenSubstrings } from "@/lib/model/forecast-snapshots";
import { getPublicSafeLiveStateFromBlob } from "@/lib/live-state/public-safe-blob-store";
import { fixtures } from "@/lib/data";

/**
 * Phase 1.29 (PR-3D) - Blob-backed derivation capability. Proves the derive path
 * (sanitized public-safe state -> validated ledger) works from an injected Blob
 * read WITHOUT a real token or network, and that no provider/private data ever
 * reaches the output. The real provider artifact is generated in an authorized
 * environment (CI) that has BLOB_READ_WRITE_TOKEN + Blob egress.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const sampleState = JSON.parse(read("data/live/public-safe-sample.json")) as PublicSafeStateInput;

describe("deriveLedgerFromPublicSafeState (pure, no I/O)", () => {
  it("derives a valid 54-row ledger from the committed sanitized sample", () => {
    const ledger = deriveLedgerFromPublicSafeState(sampleState, { asOf: "2026-06-25" });
    expect(ledger.results).toHaveLength(54);
    expect(validateResultsLedger(ledger)).toEqual([]);
    expect(validateResultsLedgerAgainstFixtures(ledger, fixtures)).toEqual([]);
    expect(ledger.sourcePolicy).toBe("manual-snapshot");
  });

  it("honours a sourcePolicy override (e.g. provider-public-delayed)", () => {
    const ledger = deriveLedgerFromPublicSafeState(sampleState, {
      asOf: "2026-06-25",
      sourcePolicy: "provider-public-delayed",
    });
    expect(ledger.sourcePolicy).toBe("provider-public-delayed");
    expect(validateResultsLedger(ledger)).toEqual([]);
  });

  it("emits only the sanitized ledger fields - provider/private data never reaches the output", () => {
    const dirty: PublicSafeStateInput = {
      asOf: "2026-06-26T00:00:00Z",
      publicSourcePolicy: "provider-public-delayed",
      matches: [
        {
          matchNumber: 1,
          stage: "group",
          status: "complete",
          teamA: "mexico",
          teamB: "south-africa",
          goalsA: 2,
          goalsB: 0,
          kickoff: "2026-06-11T19:00:00Z",
          // hostile extra fields that must be dropped:
          ...( { providerId: "X-secret-123", crest: "https://example/crest.png", odds: "1.5" } as object ),
        },
      ],
    };
    const ledger = deriveLedgerFromPublicSafeState(dirty);
    expect(ledger.results).toHaveLength(1);
    expect(Object.keys(ledger.results[0]!).sort()).toEqual([
      "awayGoals",
      "awayTeamId",
      "group",
      "homeGoals",
      "homeTeamId",
      "matchNumber",
      "playedAt",
      "stage",
      "status",
    ]);
    expect(findForbiddenSubstrings(JSON.stringify(ledger))).toEqual([]);
  });
});

describe("Blob read seam (injected store, no token / no network)", () => {
  it("reads a sanitized state via an injected store and derives a valid ledger", async () => {
    const store = {
      put: async (pathname: string) => ({ pathname }),
      getText: async () => JSON.stringify(sampleState),
    };
    const result = await getPublicSafeLiveStateFromBlob({
      objectPath: "live-state.provider.sanitized.json",
      store,
    });
    expect(result.ok).toBe(true);
    const ledger = deriveLedgerFromPublicSafeState(result.state as unknown as PublicSafeStateInput, {
      asOf: "2026-06-25",
      sourcePolicy: "provider-public-delayed",
    });
    expect(ledger.results).toHaveLength(54);
    expect(validateResultsLedgerAgainstFixtures(ledger, fixtures)).toEqual([]);
  });

  it("fails safe (no throw) when the Blob object is absent", async () => {
    const store = {
      put: async (pathname: string) => ({ pathname }),
      getText: async () => null,
    };
    const result = await getPublicSafeLiveStateFromBlob({ objectPath: "missing.json", store });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("not-found");
  });
});

describe("derive helper script stays offline and token-safe", () => {
  const script = read("scripts/derive-results-ledger.ts");
  it("supports --source blob via the existing sanitized Blob reader", () => {
    expect(script).toContain("getPublicSafeLiveStateFromBlob");
    expect(script).toContain("--source");
    expect(script).toContain("blob read failed");
  });
  it("does not fetch football-data, write Blob, or print a token", () => {
    expect(script).not.toContain("fetch(");
    expect(script).not.toContain("football-data");
    expect(script).not.toContain("putPublicSafeLiveStateToBlob");
    expect(script).not.toMatch(/console\.[a-z]+\([^)]*token/i);
    expect(script).not.toContain("BLOB_READ_WRITE_TOKEN");
  });
});
