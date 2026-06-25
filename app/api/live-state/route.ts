/**
 * Phase 1.28K - PUBLIC-SAFE live-state read route (SPIKE / scaffold).
 * ------------------------------------------------------------------
 * An isolated, Vercel-compatible GET route that serves ONLY the sanitized public-safe
 * projection from the local committed fixture (derived from the manual FIFA snapshot,
 * NOT football-data.org). It performs NO provider fetch, reads NO API token, and touches
 * NO storage. The read path is repointable to private storage later by swapping the
 * source passed to `loadPublicSafeLiveState`.
 *
 * This route is a scaffold: it is NOT linked from any user-facing page. `revalidate`
 * makes it ISR-ready for when a real (private) source is wired in.
 */
import { NextResponse } from "next/server";
import { loadPublicSafeLiveState } from "@/lib/live-state/public-safe-source";

/** ISR-ready: re-evaluate at most every 5 minutes once a live source is wired in. */
export const revalidate = 300;

export async function GET(): Promise<NextResponse> {
  const result = await loadPublicSafeLiveState();
  return NextResponse.json(result.state, { status: result.ok ? 200 : 503 });
}
