/**
 * Phase 1.28K - PUBLIC-SAFE live-state read path (spike).
 * ------------------------------------------------------
 * A tiny, Vercel-compatible read path for the sanitized projection. It is built around a
 * repointable `PublicSafeSource` seam so the SAME consumer works for:
 *   - the local committed sanitized fixture (now), and
 *   - private storage (later) - swap the source function only.
 *
 * It NEVER fetches a provider, NEVER reads the API token, and NEVER touches the network
 * itself. On any source/validation failure it returns a SAFE FALLBACK (status
 * "unavailable", empty data, freshness "missing") rather than throwing - so a route or
 * page can always render a labelled, last-known-safe state.
 */
import {
  PUBLIC_SAFE_SCHEMA_VERSION,
  type PublicSafeLiveState,
} from "./public-safe";

/** A source returns the raw sanitized JSON (fixture now, storage later) or throws. */
export type PublicSafeSource = () => Promise<unknown>;

export interface LoadResult {
  state: PublicSafeLiveState;
  ok: boolean;
  fallback: boolean;
  error?: string;
}

/** Minimal structural guard (no provider fields are ever expected here). */
export function isPublicSafeLiveState(x: unknown): x is PublicSafeLiveState {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.schemaVersion === "string" &&
    typeof o.tournamentId === "string" &&
    typeof o.asOf === "string" &&
    typeof o.status === "string" &&
    Array.isArray(o.matches) &&
    Array.isArray(o.standings) &&
    Array.isArray(o.bracket)
  );
}

/** A safe, empty, clearly-unavailable state (never throws downstream). */
export function fallbackPublicSafeState(reason: string): PublicSafeLiveState {
  return {
    schemaVersion: PUBLIC_SAFE_SCHEMA_VERSION,
    tournamentId: "wc-2026",
    asOf: "",
    generatedAt: "",
    status: "unavailable",
    freshness: "missing",
    validationStatus: { ok: false, warningCount: 0 },
    attribution: {
      sourceName: "unavailable",
      text: `Live state unavailable: ${reason}`,
    },
    isProviderDerived: false,
    publicSourcePolicy: "manual-snapshot",
    matches: [],
    standings: [],
    bracket: [],
  };
}

/**
 * The default local source: the committed, app-safe sanitized fixture (derived from the
 * manual FIFA snapshot, NOT football-data.org). Swap this for a storage read later.
 */
export const localFixtureSource: PublicSafeSource = () =>
  import("@/data/live/public-safe-sample.json").then((m) => m.default as unknown);

/** Load + validate the sanitized state from a source; fall back safely on any failure. */
export async function loadPublicSafeLiveState(
  source: PublicSafeSource = localFixtureSource,
): Promise<LoadResult> {
  try {
    const raw = await source();
    if (!isPublicSafeLiveState(raw)) {
      return { state: fallbackPublicSafeState("malformed sanitized state"), ok: false, fallback: true, error: "invalid-shape" };
    }
    return { state: raw, ok: true, fallback: false };
  } catch (e) {
    const error = e instanceof Error ? e.message : "unknown";
    return { state: fallbackPublicSafeState("source read failed"), ok: false, fallback: true, error };
  }
}
