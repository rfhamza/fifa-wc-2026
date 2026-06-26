/**
 * Phase 1.28Q-A - live-state UI feature flag (code-level; no Vercel env change required).
 * Defaults ON. Set NEXT_PUBLIC_LIVE_STATE_UI="false" to hide the /live route, the nav item,
 * and the homepage teaser. Gates UI only - never the backend.
 */
export const LIVE_STATE_UI_ENABLED =
  (process.env.NEXT_PUBLIC_LIVE_STATE_UI ?? "true").toLowerCase() !== "false";

/** The sanitized public read endpoint the UI consumes (server-side, no-store). */
export const LIVE_STATE_ENDPOINT = "/api/live-state";
