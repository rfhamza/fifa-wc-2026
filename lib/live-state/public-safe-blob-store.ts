/**
 * Phase 1.28M - PUBLIC-SAFE live-state PRIVATE Vercel Blob adapter (seam).
 * ----------------------------------------------------------------------
 * A tiny read/write adapter for the sanitized `PublicSafeLiveState` projection over a
 * **private** Vercel Blob store. It is built around an injectable `PublicSafeBlobStore`
 * seam so storage can be mocked in tests, and so the real Vercel Blob SDK is only ever
 * loaded server-side (lazy `import("@vercel/blob")`).
 *
 * Governance / security:
 *   - Only the sanitized projection is written; raw provider payloads NEVER reach Blob.
 *   - Access is always `private`; no public Blob store, no public Blob URL is returned.
 *   - The `BLOB_READ_WRITE_TOKEN` is read at the call boundary only, never logged, never
 *     returned, never written. Errors are reduced to generic codes (no path/url/token).
 *   - Reads paranoidly validate shape and fall back safely (never throw to the route).
 */
import type { PublicSafeLiveState } from "./public-safe";
import {
  fallbackPublicSafeState,
  isPublicSafeLiveState,
  type LoadResult,
} from "./public-safe-source";

/** Default private-Blob object path for the sanitized live-state projection. */
export const DEFAULT_BLOB_OBJECT_PATH = "live-state.sanitized.json";
/** Optional small manifest object path (freshness/validation summary). */
export const DEFAULT_BLOB_MANIFEST_PATH = "live-state.manifest.json";

/** Storage seam: a minimal private object store. URLs are deliberately not surfaced. */
export interface PublicSafeBlobStore {
  /** Write `body` at `pathname`; returns only the pathname (never a private URL). */
  put: (pathname: string, body: string) => Promise<{ pathname: string }>;
  /** Read text at `pathname`, or null if absent. */
  getText: (pathname: string) => Promise<string | null>;
}

export interface BlobIoOptions {
  /** Injected store (tests / alternative backends). */
  store?: PublicSafeBlobStore;
  /** `BLOB_READ_WRITE_TOKEN`; defaults to the env var inside the real factory only. */
  token?: string;
  /** Object path; defaults to {@link DEFAULT_BLOB_OBJECT_PATH}. */
  objectPath?: string;
}

/**
 * Lazily build the real Vercel Blob (PRIVATE) store. The SDK is imported on demand so it
 * never enters a static/client bundle. The token is passed through to the SDK only.
 */
export function createVercelBlobStore(token: string): PublicSafeBlobStore {
  return {
    async put(pathname, body) {
      const { put } = await import("@vercel/blob");
      const res = await put(pathname, body, {
        access: "private",
        token,
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      // Return ONLY the pathname - never the (sensitive) private URL.
      return { pathname: res.pathname };
    },
    async getText(pathname) {
      const { get } = await import("@vercel/blob");
      const res = await get(pathname, { access: "private", token, useCache: false });
      if (!res || res.statusCode !== 200) return null;
      return await new Response(res.stream).text();
    },
  };
}

/** Resolve a store from options, or build the real private store from a token. */
function resolveStore(options: BlobIoOptions): PublicSafeBlobStore {
  if (options.store) return options.store;
  const token = options.token ?? process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("missing-blob-token");
  return createVercelBlobStore(token);
}

/** Keys that must never appear in a stored sanitized object (belt-and-suspenders). */
const FORBIDDEN_SUBSTRINGS = [
  "X-Auth-Token",
  "X-Authenticated-Client",
  "BLOB_READ_WRITE_TOKEN",
  "FOOTBALL_DATA_TOKEN",
  "providerId",
  "providerMatchId",
  "providerTeamId",
];

/** Paranoid pre-write check: refuse to persist anything provider-sensitive. */
export function assertNoProviderSecrets(serialized: string): void {
  for (const bad of FORBIDDEN_SUBSTRINGS) {
    if (serialized.includes(bad)) {
      throw new Error("refusing-to-write: sanitized object contains a forbidden field");
    }
  }
}

/**
 * Write a sanitized `PublicSafeLiveState` to the PRIVATE Blob object. Serializes,
 * paranoid-checks, and writes via the resolved store. Returns only the pathname.
 */
export async function putPublicSafeLiveStateToBlob(
  state: PublicSafeLiveState,
  options: BlobIoOptions = {},
): Promise<{ pathname: string }> {
  const objectPath = options.objectPath ?? DEFAULT_BLOB_OBJECT_PATH;
  const body = JSON.stringify(state);
  assertNoProviderSecrets(body);
  const store = resolveStore(options);
  return store.put(objectPath, body);
}

/**
 * Read a sanitized `PublicSafeLiveState` from the PRIVATE Blob object. Validates shape;
 * on any failure (missing token, absent object, malformed JSON, store error) returns a
 * SAFE FALLBACK result and never throws. Errors are generic codes only.
 */
export async function getPublicSafeLiveStateFromBlob(
  options: BlobIoOptions = {},
): Promise<LoadResult> {
  const objectPath = options.objectPath ?? DEFAULT_BLOB_OBJECT_PATH;
  let store: PublicSafeBlobStore;
  try {
    store = resolveStore(options);
  } catch {
    return { state: fallbackPublicSafeState("blob token missing"), ok: false, fallback: true, error: "missing-blob-token" };
  }
  try {
    const text = await store.getText(objectPath);
    if (text == null) {
      return { state: fallbackPublicSafeState("blob object missing"), ok: false, fallback: true, error: "not-found" };
    }
    const parsed = JSON.parse(text) as unknown;
    if (!isPublicSafeLiveState(parsed)) {
      return { state: fallbackPublicSafeState("malformed blob state"), ok: false, fallback: true, error: "invalid-shape" };
    }
    return { state: parsed, ok: true, fallback: false };
  } catch {
    // Generic code only - never surface the path, url, or token in an error.
    return { state: fallbackPublicSafeState("blob read failed"), ok: false, fallback: true, error: "blob-read-error" };
  }
}
