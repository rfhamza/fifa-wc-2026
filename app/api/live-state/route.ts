/**
 * Phase 1.28K/1.28M - PUBLIC-SAFE live-state read route (SPIKE / scaffold).
 * ------------------------------------------------------------------------
 * An isolated, Vercel-compatible GET route that serves ONLY the sanitized public-safe
 * projection. It performs NO provider fetch and reads NO provider API token.
 *
 * Source selection (server env only; defaults are the safe path):
 *   - LIVE_STATE_SOURCE = "fixture" (default) | "blob"
 *   - LIVE_STATE_ALLOW_PROVIDER_DERIVED_PUBLIC = "true" to permit serving provider-derived
 *     state publicly (default: NOT allowed - provider-derived state stays private).
 *   - LIVE_STATE_BLOB_OBJECT_PATH (optional) overrides the private Blob object path.
 *
 * Provider-derived state is NEVER served publicly by default: if the Blob holds
 * `isProviderDerived: true` and the allow-flag is not set, the resolver returns the
 * manual fixture fallback instead. Blob read failures also fall back safely.
 *
 * This route is a scaffold: it is NOT linked from any user-facing page. `revalidate`
 * makes it ISR-ready for when a real (private) source is wired in.
 */
import { NextResponse } from "next/server";
import { resolvePublicSafeLiveStateForServing } from "@/lib/live-state/public-safe-source";

/** ISR-ready: re-evaluate at most every 5 minutes once a live source is wired in. */
export const revalidate = 300;

export async function GET(): Promise<NextResponse> {
  const source = process.env.LIVE_STATE_SOURCE === "blob" ? "blob" : "fixture";
  const allowProviderDerivedPublic = process.env.LIVE_STATE_ALLOW_PROVIDER_DERIVED_PUBLIC === "true";
  const objectPath = process.env.LIVE_STATE_BLOB_OBJECT_PATH || undefined;

  const result = await resolvePublicSafeLiveStateForServing({
    source,
    allowProviderDerivedPublic,
    objectPath,
  });

  const status = result.state.status === "unavailable" ? 503 : 200;
  // Additive only: existing PublicSafeLiveState fields stay top-level; `serving` is the
  // safe observability block (fixed enums / object pathnames only - no secrets or URLs).
  return NextResponse.json({ ...result.state, serving: result.serving }, { status });
}
