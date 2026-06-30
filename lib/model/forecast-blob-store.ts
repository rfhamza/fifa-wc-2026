/**
 * Forecast Blob store (Phase 1.30, PR-83B)
 * ----------------------------------------
 * Private Vercel Blob read/write for the two public-safe forecast objects.
 * Mirrors `lib/live-state/public-safe-blob-store.ts` but is decoupled from
 * live-state internals (its own minimal store interface; imports only the
 * forecast public-safe contracts).
 *
 * Contract:
 *   - writes use private access, allowOverwrite, no random suffix, JSON; they
 *     VALIDATE + leak-scan BEFORE the Blob call and throw on a refusable object;
 *     the result exposes only the pathname (never a URL or token);
 *   - reads NEVER throw — they return a typed `ForecastLoadResult` with
 *     `value: null` + a machine error code on any failure.
 *
 * No real Blob/token/network in tests: callers inject a fake `store`.
 */
import {
  assertForecastPublicSafe,
  isPublicSafeForecastCurrent,
  isPublicSafeMatchForecasts,
  validateForecastCurrent,
  validateMatchForecasts,
  type PublicSafeForecastCurrent,
  type PublicSafeMatchForecasts,
} from "@/lib/model/forecast-public-safe";

/** Default private Blob object paths (overridable via `objectPath`). */
export const FORECAST_CURRENT_OBJECT_PATH = "forecast-current.provider.sanitized.json";
export const FORECAST_MATCHES_OBJECT_PATH = "forecast-matches.provider.sanitized.json";

/** Minimal storage seam (a fake satisfies this exactly in tests). */
export interface ForecastBlobStore {
  /** Write `body` at `pathname`; returns only the pathname (never a private URL). */
  put: (pathname: string, body: string) => Promise<{ pathname: string }>;
  /** Read text at `pathname`, or null if absent. */
  getText: (pathname: string) => Promise<string | null>;
}

export interface ForecastBlobIoOptions {
  /** Injected store (tests / alternative backends). */
  store?: ForecastBlobStore;
  /** `BLOB_READ_WRITE_TOKEN`; read from env only inside the real factory. */
  token?: string;
  /** Object path; defaults to the per-object constant. */
  objectPath?: string;
}

export type ForecastLoadError =
  | "missing-blob-token"
  | "not-found"
  | "invalid-shape"
  | "blob-read-error";

export interface ForecastLoadResult<T> {
  value: T | null;
  ok: boolean;
  fallback: boolean;
  error?: ForecastLoadError;
}

/** Real Vercel Blob store (private access; pathname-only result). */
export function createVercelForecastBlobStore(token: string): ForecastBlobStore {
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

function resolveStore(options: ForecastBlobIoOptions): ForecastBlobStore {
  if (options.store) return options.store;
  const token = options.token ?? process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("missing-blob-token");
  return createVercelForecastBlobStore(token);
}

async function getForecastObject<T>(
  options: ForecastBlobIoOptions,
  defaultPath: string,
  guard: (v: unknown) => v is T,
): Promise<ForecastLoadResult<T>> {
  const objectPath = options.objectPath ?? defaultPath;
  let store: ForecastBlobStore;
  try {
    store = resolveStore(options);
  } catch {
    return { value: null, ok: false, fallback: true, error: "missing-blob-token" };
  }
  try {
    const text = await store.getText(objectPath);
    if (text == null) return { value: null, ok: false, fallback: true, error: "not-found" };
    const parsed = JSON.parse(text) as unknown;
    if (!guard(parsed)) return { value: null, ok: false, fallback: true, error: "invalid-shape" };
    return { value: parsed, ok: true, fallback: false };
  } catch {
    // Generic code only — never surface the path, url, or token in an error.
    return { value: null, ok: false, fallback: true, error: "blob-read-error" };
  }
}

// --- forecast-current --------------------------------------------------------

export async function putPublicSafeForecastCurrentToBlob(
  current: PublicSafeForecastCurrent,
  options: ForecastBlobIoOptions = {},
): Promise<{ pathname: string }> {
  const errors = validateForecastCurrent(current);
  if (errors.length > 0) {
    throw new Error(`refusing-to-write: invalid forecast-current (${errors.length} error(s))`);
  }
  const body = JSON.stringify(current);
  assertForecastPublicSafe(body);
  const store = resolveStore(options);
  return store.put(options.objectPath ?? FORECAST_CURRENT_OBJECT_PATH, body);
}

export function getPublicSafeForecastCurrentFromBlob(
  options: ForecastBlobIoOptions = {},
): Promise<ForecastLoadResult<PublicSafeForecastCurrent>> {
  return getForecastObject(options, FORECAST_CURRENT_OBJECT_PATH, isPublicSafeForecastCurrent);
}

// --- match-forecasts ---------------------------------------------------------

export async function putPublicSafeMatchForecastsToBlob(
  matches: PublicSafeMatchForecasts,
  options: ForecastBlobIoOptions = {},
): Promise<{ pathname: string }> {
  const errors = validateMatchForecasts(matches);
  if (errors.length > 0) {
    throw new Error(`refusing-to-write: invalid match-forecasts (${errors.length} error(s))`);
  }
  const body = JSON.stringify(matches);
  assertForecastPublicSafe(body);
  const store = resolveStore(options);
  return store.put(options.objectPath ?? FORECAST_MATCHES_OBJECT_PATH, body);
}

export function getPublicSafeMatchForecastsFromBlob(
  options: ForecastBlobIoOptions = {},
): Promise<ForecastLoadResult<PublicSafeMatchForecasts>> {
  return getForecastObject(options, FORECAST_MATCHES_OBJECT_PATH, isPublicSafeMatchForecasts);
}
