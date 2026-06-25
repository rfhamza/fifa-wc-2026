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
// Default blob loader for the serving resolver. Safe function-level (non-init) cycle:
// the blob store imports only fallback/guard helpers from this module, used at call time.
import { DEFAULT_BLOB_OBJECT_PATH, getPublicSafeLiveStateFromBlob } from "./public-safe-blob-store";

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

/* ----------------------------------------------------------------------------
 * Phase 1.28M - serving resolver (source selection + provider-derived guard).
 *
 * PURE w.r.t. env/network: it takes a plain config object and (optionally) injected
 * loaders. The route is the only place that reads server env and wires these. By default
 * the route serves the local fixture; private-Blob serving is opt-in via config, and
 * provider-derived state is NEVER served publicly unless explicitly allowed.
 * -------------------------------------------------------------------------- */

export type LiveStateServeSource = "fixture" | "blob";

export interface ServeConfig {
  /** Where to read from. Default behaviour (anything but "blob") is the fixture. */
  source: LiveStateServeSource;
  /** Gate for provider-derived state. Must be explicitly true to serve it publicly. */
  allowProviderDerivedPublic: boolean;
  /** Private Blob object path override. */
  objectPath?: string;
}

export interface ServeDeps {
  loadFixture?: () => Promise<LoadResult>;
  loadBlob?: (opts: { objectPath?: string }) => Promise<LoadResult>;
}

/* ----------------------------------------------------------------------------
 * Phase 1.28N - safe serving metadata (observability without leakage).
 *
 * `ServeMeta` is composed into the route response so consumers can tell WHETHER the
 * endpoint served from Blob or the fixture fallback, and WHY it fell back - using a
 * FIXED enum only. It never carries a token, a private Blob URL, headers, account data,
 * provider IDs, or a raw SDK error.
 * -------------------------------------------------------------------------- */

export type LiveStateServedFrom = "blob" | "fixture" | "fixture-fallback";

export type LiveStateFallbackReason =
  | "blob-read-failed"
  | "provider-derived-public-blocked"
  | "invalid-blob-state"
  | "missing-blob-token";

export interface ServeMeta {
  servedFrom: LiveStateServedFrom;
  providerDerivedBlocked: boolean;
  /** Present only on a fixture-fallback. Fixed enum - never a raw error. */
  fallbackReason?: LiveStateFallbackReason;
  /** Configured object PATHNAME (never a URL). Present only when Blob was attempted. */
  sourceObjectPath?: string;
}

export interface ServeResult extends LoadResult {
  serving: ServeMeta;
}

/** Map a (already-safe) blob loader error code to the public `fallbackReason` enum. */
function fallbackReasonFromBlobError(error: string | undefined): LiveStateFallbackReason {
  if (error === "missing-blob-token") return "missing-blob-token";
  if (error === "invalid-shape") return "invalid-blob-state";
  // not-found / blob-read-error / anything else -> generic read failure.
  return "blob-read-failed";
}

/**
 * Resolve the sanitized state to serve from `/api/live-state`, honouring the source
 * selection and the provider-derived public-display gate, and attaching SAFE serving
 * metadata. Falls back to the fixture on any blob failure, and refuses to return
 * provider-derived state unless explicitly allowed. Never throws.
 */
export async function resolvePublicSafeLiveStateForServing(
  config: ServeConfig,
  deps: ServeDeps = {},
): Promise<ServeResult> {
  const loadFixture = deps.loadFixture ?? (() => loadPublicSafeLiveState());

  // Default source (anything but "blob"): the manual fixture is the primary source.
  if (config.source !== "blob") {
    const fixture = await loadFixture();
    return { ...fixture, serving: { servedFrom: "fixture", providerDerivedBlocked: false } };
  }

  // Default to the private-Blob loader (lazy SDK import lives in the blob store module).
  const loadBlob = deps.loadBlob ?? ((o: { objectPath?: string }) => getPublicSafeLiveStateFromBlob(o));
  const sourceObjectPath = config.objectPath ?? DEFAULT_BLOB_OBJECT_PATH;

  const blob = await loadBlob({ objectPath: config.objectPath });

  // Blob read failed -> safe fixture fallback, with a fixed-enum reason.
  if (!blob.ok) {
    const fixture = await loadFixture();
    return {
      ...fixture,
      serving: {
        servedFrom: "fixture-fallback",
        providerDerivedBlocked: false,
        fallbackReason: fallbackReasonFromBlobError(blob.error),
        sourceObjectPath,
      },
    };
  }

  // Provider-derived state stays PRIVATE unless explicitly approved -> fixture fallback.
  if (blob.state.isProviderDerived && !config.allowProviderDerivedPublic) {
    const fixture = await loadFixture();
    return {
      ...fixture,
      serving: {
        servedFrom: "fixture-fallback",
        providerDerivedBlocked: true,
        fallbackReason: "provider-derived-public-blocked",
        sourceObjectPath,
      },
    };
  }

  return { ...blob, serving: { servedFrom: "blob", providerDerivedBlocked: false, sourceObjectPath } };
}
