/**
 * Forecast smoke checker (Phase 1.30, PR-83E1) — PURE, offline-testable.
 * ----------------------------------------------------------------------
 * Given the two already-loaded public-safe forecast objects (the rolling
 * `forecast-current` and the `forecast-matches` archive), assert the invariants
 * an operator cares about after a forecast refresh. All I/O (Blob/file read) lives
 * in the runner (`forecast-smoke-check-run.ts`); this module does no I/O so it can
 * be unit-tested with synthetic fixtures.
 *
 * It asserts, for forecast-current: a valid public-safe shape
 * (`validateForecastCurrent === []`), leak-cleanliness
 * (`findForecastForbiddenSubstrings`), that it converts to a strict
 * `ForecastSnapshot` (`loadForecastSnapshot(forecastCurrentToSnapshot(...))`), and
 * that its `sourceLiveStateObjectPath` is the expected provider live-state object.
 * For forecast-matches: a valid public-safe shape (`validateMatchForecasts === []`,
 * which enforces every entry's provenance lifecycle) and leak-cleanliness.
 *
 * Missing objects are a WARNING in the default (non-strict) mode and a FAILURE in
 * `--strict` mode (the workflow uses `--strict`). Reports only counts / object
 * paths / machine error codes — never tokens, Blob URLs, or raw provider payloads.
 *
 * PURE: no fs / env / fetch / Blob / live-state / provider / simulation imports
 * (only the forecast contracts, the converter, and the snapshot loader).
 */
import { loadForecastSnapshot } from "@/lib/model/forecast-snapshots";
import {
  findForecastForbiddenSubstrings,
  forecastCurrentToSnapshot,
  validateForecastCurrent,
  validateMatchForecastEntry,
  validateMatchForecasts,
  type PublicSafeForecastCurrent,
  type PublicSafeMatchForecastEntry,
} from "@/lib/model/forecast-public-safe";
import type { MatchForecastProvenance } from "@/lib/model/match-forecast";

/** The provider live-state object the forecast pipeline reads (the only valid source). */
export const FORECAST_EXPECTED_LIVE_STATE_OBJECT_PATH = "live-state.provider.sanitized.json";

export interface ForecastSmokeInput {
  /** Parsed forecast-current object, or null when the object is absent/unreadable. */
  current: unknown;
  /** Parsed forecast-matches object, or null when the object is absent/unreadable. */
  matches: unknown;
  /** Machine error code for an absent/unreadable forecast-current (reported, not a token). */
  currentError?: string | null;
  /** Machine error code for an absent/unreadable forecast-matches (reported, not a token). */
  matchesError?: string | null;
}

export interface ForecastSmokeOptions {
  /** Strict mode: a missing object FAILS (default: missing only WARNS). */
  strict?: boolean;
  /** Expected forecast-current.sourceLiveStateObjectPath. */
  expectedLiveStateObjectPath?: string;
}

export interface ForecastSmokeFinding {
  name: string;
  level: "assert" | "warn";
  pass: boolean;
  detail: string;
}

export interface ForecastSmokeFields {
  // forecast-current
  currentAvailable: boolean;
  snapshotId?: string;
  asOf?: string;
  completedMatchesLocked?: number;
  latestCompletedSupportedMatchNumber?: number;
  sourceLiveStateObjectPath?: string | null;
  teams?: number;
  // forecast-matches
  matchesAvailable: boolean;
  matchForecasts?: number;
  currentPreMatch?: number;
  archivedPreMatch?: number;
  retrospective?: number;
  // shared
  leakHits: string[];
}

export interface ForecastSmokeReport {
  ok: boolean;
  strict: boolean;
  fields: ForecastSmokeFields;
  findings: ForecastSmokeFinding[];
  failures: ForecastSmokeFinding[];
  warnings: ForecastSmokeFinding[];
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function countProvenance(
  entries: PublicSafeMatchForecastEntry[],
  provenance: MatchForecastProvenance,
): number {
  return entries.filter((e) => e.forecastProvenance === provenance).length;
}

/**
 * Run the forecast smoke check against already-loaded objects. Pure; never throws.
 */
export function runForecastSmokeCheck(
  input: ForecastSmokeInput,
  opts: ForecastSmokeOptions = {},
): ForecastSmokeReport {
  const strict = opts.strict ?? false;
  const expectedPath = opts.expectedLiveStateObjectPath ?? FORECAST_EXPECTED_LIVE_STATE_OBJECT_PATH;
  const findings: ForecastSmokeFinding[] = [];
  const add = (name: string, level: ForecastSmokeFinding["level"], pass: boolean, detail: string) =>
    findings.push({ name, level, pass, detail });

  const leakHits: string[] = [];
  const fields: ForecastSmokeFields = {
    currentAvailable: input.current != null,
    matchesAvailable: input.matches != null,
    leakHits,
  };

  // ---- forecast-current ----
  const missingLevel: ForecastSmokeFinding["level"] = strict ? "assert" : "warn";
  if (input.current == null) {
    add(
      "forecast-current present",
      missingLevel,
      false,
      `forecast-current object unavailable${input.currentError ? ` (${input.currentError})` : ""}`,
    );
  } else {
    const currentErrors = validateForecastCurrent(input.current);
    add(
      "forecast-current valid",
      "assert",
      currentErrors.length === 0,
      currentErrors.length === 0
        ? "valid public-safe forecast-current"
        : `invalid: ${currentErrors.slice(0, 3).join("; ")}${currentErrors.length > 3 ? " …" : ""}`,
    );

    const currentLeaks = findForecastForbiddenSubstrings(JSON.stringify(input.current));
    leakHits.push(...currentLeaks.map((s) => `current:${s}`));
    add(
      "forecast-current leak-scan",
      "assert",
      currentLeaks.length === 0,
      currentLeaks.length === 0 ? "no forbidden substrings" : `forbidden: ${currentLeaks.join(", ")}`,
    );

    // Defensive field extraction (works even when validation flagged issues).
    const c = input.current as Partial<PublicSafeForecastCurrent> & Record<string, unknown>;
    if (typeof c.snapshotId === "string") fields.snapshotId = c.snapshotId;
    if (typeof c.asOf === "string") fields.asOf = c.asOf;
    if (typeof c.completedMatchesLocked === "number") fields.completedMatchesLocked = c.completedMatchesLocked;
    if (typeof c.latestCompletedSupportedMatchNumber === "number") {
      fields.latestCompletedSupportedMatchNumber = c.latestCompletedSupportedMatchNumber;
    }
    fields.sourceLiveStateObjectPath = (c.sourceLiveStateObjectPath as string | null | undefined) ?? null;
    if (Array.isArray(c.teams)) fields.teams = c.teams.length;

    add(
      "forecast-current sourceLiveStateObjectPath",
      "assert",
      c.sourceLiveStateObjectPath === expectedPath,
      `sourceLiveStateObjectPath = ${String(c.sourceLiveStateObjectPath)} (expected "${expectedPath}")`,
    );

    // Convert-to-snapshot round-trip only when the object validated (avoid noise).
    if (currentErrors.length === 0) {
      let converts = true;
      let convertDetail = "converts to a valid ForecastSnapshot";
      try {
        loadForecastSnapshot(forecastCurrentToSnapshot(input.current as PublicSafeForecastCurrent));
      } catch (err) {
        converts = false;
        convertDetail = `conversion to ForecastSnapshot failed: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`;
      }
      add("forecast-current → snapshot", "assert", converts, convertDetail);
    }
  }

  // ---- forecast-matches ----
  if (input.matches == null) {
    add(
      "forecast-matches present",
      missingLevel,
      false,
      `forecast-matches object unavailable${input.matchesError ? ` (${input.matchesError})` : ""}`,
    );
  } else {
    const matchErrors = validateMatchForecasts(input.matches);
    add(
      "forecast-matches valid",
      "assert",
      matchErrors.length === 0,
      matchErrors.length === 0
        ? "valid public-safe match-forecasts"
        : `invalid: ${matchErrors.slice(0, 3).join("; ")}${matchErrors.length > 3 ? " …" : ""}`,
    );

    const matchLeaks = findForecastForbiddenSubstrings(JSON.stringify(input.matches));
    leakHits.push(...matchLeaks.map((s) => `matches:${s}`));
    add(
      "forecast-matches leak-scan",
      "assert",
      matchLeaks.length === 0,
      matchLeaks.length === 0 ? "no forbidden substrings" : `forbidden: ${matchLeaks.join(", ")}`,
    );

    const entries =
      isObject(input.matches) && Array.isArray(input.matches.matchForecasts)
        ? (input.matches.matchForecasts as PublicSafeMatchForecastEntry[])
        : [];
    fields.matchForecasts = entries.length;
    fields.currentPreMatch = countProvenance(entries, "current-pre-match-forecast");
    fields.archivedPreMatch = countProvenance(entries, "archived-pre-match-forecast");
    fields.retrospective = countProvenance(entries, "retrospective-model-forecast");

    // Explicit per-entry provenance-lifecycle assertion (count of entries that fail).
    const badEntries = entries.filter((e, i) => validateMatchForecastEntry(e, i).length > 0).length;
    add(
      "forecast-matches entry lifecycle",
      "assert",
      badEntries === 0,
      badEntries === 0
        ? `${entries.length} entr${entries.length === 1 ? "y" : "ies"} pass the provenance lifecycle`
        : `${badEntries} of ${entries.length} entries violate the provenance lifecycle`,
    );
  }

  const failures = findings.filter((f) => f.level === "assert" && !f.pass);
  const warnings = findings.filter((f) => f.level === "warn" && !f.pass);
  return { ok: failures.length === 0, strict, fields, findings, failures, warnings };
}
