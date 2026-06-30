import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  runLiveStateSmokeCheck,
  SMOKE_FORBIDDEN_SUBSTRINGS,
} from "../scripts/live-state/smoke-check";
import { FORBIDDEN_SNAPSHOT_SUBSTRINGS } from "@/lib/model/forecast-snapshots";

/**
 * PR-81 - offline coverage of the production live-state smoke checker. The checker is
 * pure (no network); here we feed it the committed public-safe sample (the resolved
 * provider-public-delayed projection) plus a synthetic `serving` block (which the route
 * appends at serve time) and assert the post-group invariants, then tamper to prove the
 * negative paths. No network, no Blob, no tokens.
 */
const sample = JSON.parse(
  readFileSync(join(process.cwd(), "data/live/public-safe-sample.json"), "utf8"),
) as Record<string, unknown> & { asOf: string };

const SERVING_OK = {
  servedFrom: "blob",
  sourceObjectPath: "live-state.provider.sanitized.json",
  providerDerivedBlocked: false,
};
/** Production-shaped body: committed projection + the route's serving block. */
const goodBody = (): Record<string, unknown> => ({ ...structuredClone(sample), serving: { ...SERVING_OK } });
/** A `nowMs` close to the sample's asOf so the (warning-only) max-age check stays quiet. */
const nowMs = Date.parse(sample.asOf) + 1000;

describe("smoke checker - post-group invariants (clean production body)", () => {
  it("passes with 8/4/0 third-place, 16/0/0 R32, blob serving, leak-clean, no warnings", () => {
    const r = runLiveStateSmokeCheck(goodBody(), { phase: "post-group", nowMs });
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.fields.thirdPlace).toEqual({ qualified: 8, eliminated: 4, undecided: 0 });
    expect(r.fields.r32).toEqual({ total: 16, resolved: 16, partial: 0, unresolved: 0 });
    expect(r.fields.servedFrom).toBe("blob");
    expect(r.fields.sourceObjectPath).toBe("live-state.provider.sanitized.json");
    expect(r.fields.providerDerivedBlocked).toBe(false);
    expect(r.fields.isProviderDerived).toBe(true);
    expect(r.fields.publicSourcePolicy).toBe("provider-public-delayed");
    expect(r.fields.leakHits).toEqual([]);
  });
});

describe("smoke checker - negative paths fail closed (exit-1 conditions)", () => {
  it("fails when serving is a fixture-fallback (not blob)", () => {
    const body = goodBody();
    (body.serving as { servedFrom: string }).servedFrom = "fixture-fallback";
    const r = runLiveStateSmokeCheck(body, { nowMs });
    expect(r.ok).toBe(false);
    expect(r.failures.map((f) => f.name)).toContain("serving.servedFrom");
  });

  it("fails when third-place is not 8/4/0", () => {
    const body = goodBody();
    const standings = body.standings as { position: number; qualificationState: string }[];
    const aThird = standings.find((s) => s.position === 3 && s.qualificationState === "qualified")!;
    aThird.qualificationState = "undecided";
    const r = runLiveStateSmokeCheck(body, { nowMs });
    expect(r.ok).toBe(false);
    expect(r.failures.map((f) => f.name)).toContain("third-place");
  });

  it("fails when a forbidden/private substring leaks", () => {
    const body = { ...goodBody(), leakBait: "providerId-abc123" };
    const r = runLiveStateSmokeCheck(body, { nowMs });
    expect(r.ok).toBe(false);
    expect(r.failures.map((f) => f.name)).toContain("leak-scan");
    expect(r.fields.leakHits).toContain("providerid");
  });

  it("fails fast on a non-live-state body (shape guard)", () => {
    const r = runLiveStateSmokeCheck({ nonsense: true }, { nowMs });
    expect(r.ok).toBe(false);
    expect(r.failures.map((f) => f.name)).toEqual(["shape"]);
  });
});

describe("smoke checker - structural phase + warnings", () => {
  it("structural phase asserts only shape + leak (no count assertions), even without serving", () => {
    const { serving: _drop, ...noServing } = goodBody();
    const r = runLiveStateSmokeCheck(noServing, { phase: "structural", nowMs });
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it("warns (does not fail) on stale freshness", () => {
    const body = goodBody();
    (body as { freshness: string }).freshness = "stale";
    const r = runLiveStateSmokeCheck(body, { nowMs });
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.name)).toContain("freshness");
  });

  it("warns (does not fail) when asOf/generatedAt exceed the max-age threshold", () => {
    const r = runLiveStateSmokeCheck(goodBody(), {
      nowMs: Date.parse(sample.asOf) + 48 * 3_600_000,
      maxAgeHours: 24,
    });
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.name)).toContain("max-age");
  });
});

describe("smoke checker - forbidden-substring list does not drift from canonical", () => {
  it("covers every canonical FORBIDDEN_SNAPSHOT_SUBSTRINGS entry", () => {
    const local = new Set(SMOKE_FORBIDDEN_SUBSTRINGS.map((s) => s.toLowerCase()));
    for (const s of FORBIDDEN_SNAPSHOT_SUBSTRINGS) {
      expect(local.has(s.toLowerCase())).toBe(true);
    }
  });
});
