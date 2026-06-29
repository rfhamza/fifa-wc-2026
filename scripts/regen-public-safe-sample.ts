/**
 * Regenerate the committed public-safe FALLBACK / REFERENCE fixture (Phase 1.29, PR-3F)
 * ------------------------------------------------------------------------------------
 * Deterministically rebuilds `data/live/public-safe-sample.json` from the committed
 * public-safe provider REFERENCE fixture by running it through the SAME internal
 * derivation path the live route uses (`ingestLiveSnapshot` -> `toPublicSafeLiveState`),
 * so the served fallback reflects the fixed third-place + Round-of-32 derivation.
 *
 * Boundary (PR-3F): the source is the committed PUBLIC-SAFE provider reference fixture -
 * NOT raw provider data. This script is fully OFFLINE: no football-data fetch, no Blob
 * read/write, no token/env requirement, no raw provider payload. The output is a
 * fallback/reference fixture for default config + previews; the canonical production
 * source remains the Blob object `live-state.provider.sanitized.json` (served only when
 * LIVE_STATE_SOURCE=blob, LIVE_STATE_BLOB_OBJECT_PATH=live-state.provider.sanitized.json,
 * LIVE_STATE_ALLOW_PROVIDER_DERIVED_PUBLIC=true). Provenance is kept honest:
 * isProviderDerived=true, publicSourcePolicy="provider-public-delayed".
 *
 *   vite-node --config vitest.config.ts scripts/regen-public-safe-sample.ts -- --write
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildOfficialReference, ingestLiveSnapshot } from "../lib/live-state/ingest";
import {
  toPublicSafeLiveState,
  type PublicSafeLiveState,
  type PublicSourcePolicy,
} from "../lib/live-state/public-safe";
import type { RawLiveMatch, RawLiveSnapshot } from "../lib/live-state/types";

/** Committed inputs/outputs (relative to repo root). */
export const REFERENCE_FIXTURE_PATH = "tests/fixtures/live-state/provider-public-safe-2026-06-29.json";
export const SAMPLE_OUTPUT_PATH = "data/live/public-safe-sample.json";

/** Honest provenance for the reference fixture (provider-public-delayed). */
const SAMPLE_PUBLIC_SOURCE_POLICY: PublicSourcePolicy = "provider-public-delayed";

/** The subset of a committed public-safe reference fixture this regeneration reads. */
interface ReferenceFixture {
  asOf: string;
  generatedAt: string;
  attribution: { sourceName: string; sourceUrl?: string; text: string };
  matches: PublicSafeLiveState["matches"];
}

/**
 * Transform a committed public-safe reference fixture's match rows into the internal
 * `RawLiveSnapshot` ingestion shape (canonical app ids only; no provider/raw fields).
 * Pure + deterministic.
 */
export function referenceFixtureToRawSnapshot(fixture: ReferenceFixture): RawLiveSnapshot {
  const matches: RawLiveMatch[] = fixture.matches.map((m) => ({
    matchId: m.matchId,
    stage: m.stage,
    ...(m.group ? { group: m.group } : {}),
    teamA: m.teamA,
    teamB: m.teamB,
    status: m.status,
    ...(typeof m.goalsA === "number" ? { goalsA: m.goalsA } : {}),
    ...(typeof m.goalsB === "number" ? { goalsB: m.goalsB } : {}),
    ...(m.winner ? { winner: m.winner } : {}),
    ...(m.penalties ? { penalties: { a: m.penalties.a, b: m.penalties.b } } : {}),
    ...(m.kickoff ? { kickoff: m.kickoff } : {}),
    ...(m.lastUpdatedAt ? { lastUpdatedAt: m.lastUpdatedAt } : {}),
  }));

  return {
    sourceVersion: "provider-public-delayed-reference",
    source: {
      sourceId: "provider-public-delayed",
      sourceType: "external",
      sourceName: fixture.attribution.sourceName,
      lastUpdatedAt: fixture.asOf,
      ...(fixture.attribution.sourceUrl ? { sourceUrl: fixture.attribution.sourceUrl } : {}),
    },
    asOf: fixture.asOf,
    matches,
  };
}

/**
 * Regenerate the public-safe sample from a committed reference fixture through the FIXED
 * internal derivation path (ingest -> project). Deterministic: timestamps come from the
 * fixture, not the wall clock. Returns the public-safe projection (no `serving` key;
 * that is added by the route at serve time).
 */
export function regeneratePublicSafeSample(fixture: ReferenceFixture): PublicSafeLiveState {
  const snapshot = referenceFixtureToRawSnapshot(fixture);
  const state = ingestLiveSnapshot(snapshot, buildOfficialReference(), {
    generatedAt: fixture.generatedAt,
  });
  return toPublicSafeLiveState(state, {
    attribution: fixture.attribution,
    isProviderDerived: true,
    publicSourcePolicy: SAMPLE_PUBLIC_SOURCE_POLICY,
  });
}

/** Read the committed reference fixture from disk (offline). */
export function loadReferenceFixture(root = process.cwd()): ReferenceFixture {
  return JSON.parse(readFileSync(join(root, REFERENCE_FIXTURE_PATH), "utf8")) as ReferenceFixture;
}

function main(): void {
  const write = process.argv.includes("--write");
  const sample = regeneratePublicSafeSample(loadReferenceFixture());
  const json = JSON.stringify(sample, null, 2);
  if (write) {
    writeFileSync(join(process.cwd(), SAMPLE_OUTPUT_PATH), json + "\n", "utf8");
    process.stderr.write(
      `Wrote ${SAMPLE_OUTPUT_PATH} (${sample.matches.length} matches, ${sample.standings.length} standings, ` +
        `${sample.bracket.length} bracket rows)\n`,
    );
  } else {
    process.stdout.write(json + "\n");
  }
}

// Run only when an explicit CLI flag is passed (vite-node strips the script path from
// argv, so a filename check is unreliable). Importing this module from tests passes
// neither flag, so `main` does not run on import.
if (process.argv.includes("--write") || process.argv.includes("--print")) {
  main();
}
