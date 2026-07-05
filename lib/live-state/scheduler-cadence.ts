/**
 * Live-state scheduler cadence guard - PURE decision helper.
 * ----------------------------------------------------------
 * Decides whether a given scheduler wake-up should perform a provider fetch +
 * sanitized live-state Blob write, WITHOUT any provider fetch, Blob read, or
 * secret. It reads only:
 *   - the injected wall-clock (nowMs, epoch ms UTC),
 *   - committed fixture kickoff instants (passed in as epoch ms), and
 *   - (optionally) the set of match numbers already terminally complete in
 *     committed data.
 *
 * Two cadences, matching the operating model:
 *   1. MATCH WINDOW - run every wake-up while now is inside any active match's
 *      polling window [kickoff - preWindow, kickoff + postWindow]. The window is
 *      deliberately wide (pre-match readiness through penalties + provider lag).
 *   2. BASELINE - outside every match window, run on the first wake within a small
 *      tolerance AFTER each 30-minute mark, so the app stays generally fresh all
 *      day without a provider call every 5 minutes.
 *
 * No React, no I/O, no Date.now() inside the logic - time is injected, so the
 * whole thing is deterministic and node-testable. It never throws.
 *
 * GitHub Actions caveat (documented, not enforceable here): scheduled workflows
 * are best-effort. A wake-up can be delayed or dropped. Crucially, the guard reads
 * the clock only AFTER checkout + `npm ci` + GitHub's dispatch delay, so it is never
 * exactly on minute 0/30 - an EXACT-equality baseline would essentially never fire.
 * The baseline therefore uses a tolerance window (default 5 min = the cron wake
 * granularity): the first 5-minute wake landing in the first `tolerance` minutes of
 * each 30-minute bucket triggers the baseline. Worst case is one extra harmless
 * refresh; still stateless, deterministic, and fail-safe. The match window is wide
 * enough to absorb ordinary drift on its own.
 */

/** A committed fixture reduced to what the cadence guard needs. */
export interface FixtureKickoff {
  matchNumber: number;
  /** Kickoff instant as epoch milliseconds (UTC). Non-finite values are ignored. */
  kickoffMs: number;
}

export interface CadenceConfig {
  /** Minutes before kickoff the window opens (pre-match readiness). Default 45. */
  preWindowMinutes?: number;
  /** Minutes after kickoff the window stays open (ET/penalties/provider lag). Default 240. */
  postWindowMinutes?: number;
  /** Baseline boundary interval in minutes (a 30-minute mark). Default 30. */
  baselineIntervalMinutes?: number;
  /**
   * Minutes AFTER a baseline mark within which a wake still counts as on-boundary.
   * Absorbs the fire-to-clock-read latency (queue + checkout + npm ci) so the
   * baseline actually fires. Default 5 (= the cron wake granularity).
   */
  boundaryToleranceMinutes?: number;
  /**
   * Match numbers already terminally complete in committed data. Such matches are
   * dropped from the active-window set (no point polling a finished match). This is
   * a POSITIVE-only signal: a committed-complete match is definitively finished.
   */
  completedMatchNumbers?: ReadonlySet<number>;
}

export interface CadenceDecision {
  /** Whether this wake-up should run the provider fetch + Blob write. */
  run: boolean;
  /** Human-readable explanation (for logs). */
  reason: string;
  /** True when now is inside at least one active (non-complete) match window. */
  inMatchWindow: boolean;
  /** True when now falls on a baseline boundary (UTC minute % interval === 0). */
  onBaselineBoundary: boolean;
  /** Match numbers whose window currently contains now (excluding completed). */
  activeMatchNumbers: number[];
  /** UTC minute-of-hour of now (0..59), for diagnostics. */
  minuteOfHour: number;
}

export const DEFAULT_PRE_WINDOW_MINUTES = 45;
export const DEFAULT_POST_WINDOW_MINUTES = 240;
export const DEFAULT_BASELINE_INTERVAL_MINUTES = 30;
export const DEFAULT_BASELINE_TOLERANCE_MINUTES = 5;

const MINUTE_MS = 60_000;

/**
 * Decide whether a scheduled wake-up at `nowMs` should refresh. Pure and total.
 */
export function decideScheduledCadence(
  nowMs: number,
  kickoffs: readonly FixtureKickoff[],
  config: CadenceConfig = {},
): CadenceDecision {
  const pre = (config.preWindowMinutes ?? DEFAULT_PRE_WINDOW_MINUTES) * MINUTE_MS;
  const post = (config.postWindowMinutes ?? DEFAULT_POST_WINDOW_MINUTES) * MINUTE_MS;
  const baselineInterval = config.baselineIntervalMinutes ?? DEFAULT_BASELINE_INTERVAL_MINUTES;
  const baselineTolerance = config.boundaryToleranceMinutes ?? DEFAULT_BASELINE_TOLERANCE_MINUTES;
  const completed = config.completedMatchNumbers ?? new Set<number>();

  const minuteOfHour = Number.isFinite(nowMs) ? new Date(nowMs).getUTCMinutes() : 0;

  // Active match windows: now within [kickoff - pre, kickoff + post], inclusive on
  // both ends, for any fixture not already terminally complete.
  const activeMatchNumbers: number[] = [];
  if (Number.isFinite(nowMs)) {
    for (const k of kickoffs) {
      if (!Number.isFinite(k.kickoffMs)) continue;
      if (completed.has(k.matchNumber)) continue;
      if (nowMs >= k.kickoffMs - pre && nowMs <= k.kickoffMs + post) {
        activeMatchNumbers.push(k.matchNumber);
      }
    }
  }
  activeMatchNumbers.sort((a, b) => a - b);

  const inMatchWindow = activeMatchNumbers.length > 0;
  // Baseline boundary: the first wake within `baselineTolerance` minutes AFTER a
  // 30-minute mark. The tolerance (not exact equality) absorbs the latency between
  // the cron fire time and when this guard actually reads the clock (queue delay +
  // checkout + npm ci), which is never exactly minute 0/30.
  const onBaselineBoundary =
    baselineInterval > 0 &&
    baselineTolerance > 0 &&
    Number.isFinite(nowMs) &&
    minuteOfHour % baselineInterval < baselineTolerance;

  const run = inMatchWindow || onBaselineBoundary;

  let reason: string;
  if (inMatchWindow) {
    reason = `match window active (matches ${activeMatchNumbers.join(", ")})`;
  } else if (onBaselineBoundary) {
    reason = `baseline boundary (UTC minute ${minuteOfHour}, within ${baselineTolerance} min of a ${baselineInterval}-minute mark)`;
  } else {
    reason = `no match window and UTC minute ${minuteOfHour} is not within ${baselineTolerance} min of a ${baselineInterval}-minute mark`;
  }

  return { run, reason, inMatchWindow, onBaselineBoundary, activeMatchNumbers, minuteOfHour };
}
