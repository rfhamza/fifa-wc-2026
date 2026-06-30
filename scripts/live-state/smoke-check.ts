/**
 * Production live-state smoke checker (PR-81) - PURE, offline-testable.
 * ---------------------------------------------------------------------
 * Given a parsed `/api/live-state` response body, assert the public invariants an
 * operator cares about after the group stage. The HTTP fetch lives in the runner
 * (`smoke-check-run.ts`); this module does no I/O so it can be unit-tested with a
 * committed fixture.
 *
 * Reuse: the pure, Node-safe view helpers from `lib/live-client/public-safe-view.client`
 * (that module imports only a plain config constant - no React/window/CSS). The
 * forbidden-substring leak list is kept LOCAL here (a tiny ops-tool copy) so the
 * smoke checker stays decoupled from the model/simulation layer; a drift test
 * (`tests/live-state-smoke-check.test.ts`) asserts it covers the canonical
 * `FORBIDDEN_SNAPSHOT_SUBSTRINGS`.
 */
import {
  isLiveStateView,
  summariseBracket,
  deriveThirdPlaceRace,
  type LiveStateView,
  type BracketSummary,
} from "@/lib/live-client/public-safe-view.client";

export type SmokePhase = "post-group" | "structural";

/** The route appends this `serving` block to the public-safe body. */
export interface ServingMeta {
  servedFrom?: string;
  sourceObjectPath?: string;
  providerDerivedBlocked?: boolean;
  fallbackReason?: string;
}

export interface SmokeFinding {
  name: string;
  level: "assert" | "warn";
  pass: boolean;
  detail: string;
}

export interface SmokeFields {
  schemaVersion?: string;
  asOf?: string;
  generatedAt?: string;
  status?: string;
  freshness?: string;
  matches: number;
  standings: number;
  bracket: number;
  isProviderDerived?: boolean;
  publicSourcePolicy?: string;
  servedFrom?: string;
  sourceObjectPath?: string;
  providerDerivedBlocked?: boolean;
  thirdPlace: { qualified: number; eliminated: number; undecided: number };
  r32: BracketSummary;
  leakHits: string[];
}

export interface SmokeReport {
  ok: boolean;
  phase: SmokePhase;
  fields: SmokeFields;
  findings: SmokeFinding[];
  failures: SmokeFinding[];
  warnings: SmokeFinding[];
}

export interface SmokeOptions {
  phase?: SmokePhase;
  /** Warn (never fail) if asOf/generatedAt are older than this. Default 24h. */
  maxAgeHours?: number;
  /** Injected for deterministic tests; defaults to Date.now(). */
  nowMs?: number;
}

/**
 * Local, ops-tool copy of the public-safe forbidden substrings. Kept in sync with
 * `FORBIDDEN_SNAPSHOT_SUBSTRINGS` by a drift test (see module docstring).
 */
export const SMOKE_FORBIDDEN_SUBSTRINGS = [
  "providerid",
  "providermatchid",
  "providerteamid",
  "x-auth-token",
  "authorization",
  "football_data_token",
  "blob_read_write_token",
  "vercel-storage",
  "blob.vercel-storage",
  "crest",
  "odds",
  "referee",
] as const;

function scanForbidden(serialized: string): string[] {
  const haystack = serialized.toLowerCase();
  return SMOKE_FORBIDDEN_SUBSTRINGS.filter((s) => haystack.includes(s));
}

const POST_GROUP = "post-group-stage invariant";
const PROVIDER_OBJECT_PATH = "live-state.provider.sanitized.json";

/** Run the smoke check against a parsed `/api/live-state` body. Pure; never throws. */
export function runLiveStateSmokeCheck(body: unknown, opts: SmokeOptions = {}): SmokeReport {
  const phase: SmokePhase = opts.phase ?? "post-group";
  const findings: SmokeFinding[] = [];
  const add = (name: string, level: SmokeFinding["level"], pass: boolean, detail: string) =>
    findings.push({ name, level, pass, detail });

  // Shape guard first - everything downstream depends on it.
  if (!isLiveStateView(body)) {
    const failure: SmokeFinding = {
      name: "shape",
      level: "assert",
      pass: false,
      detail: "response is not a valid public-safe live-state body (isLiveStateView failed)",
    };
    return {
      ok: false,
      phase,
      fields: {
        matches: 0,
        standings: 0,
        bracket: 0,
        thirdPlace: { qualified: 0, eliminated: 0, undecided: 0 },
        r32: { total: 0, resolved: 0, partial: 0, unresolved: 0 },
        leakHits: [],
      },
      findings: [failure],
      failures: [failure],
      warnings: [],
    };
  }

  const view = body as LiveStateView;
  const serving = (body as { serving?: ServingMeta }).serving;
  const third = deriveThirdPlaceRace(view.standings);
  const thirdPlace = {
    qualified: third.clinched,
    eliminated: third.eliminated,
    undecided: third.totalThirdPlace - third.clinched - third.eliminated,
  };
  const r32 = summariseBracket(view.bracket, "roundOf32");
  const leakHits = scanForbidden(JSON.stringify(body));

  const fields: SmokeFields = {
    schemaVersion: view.schemaVersion,
    asOf: view.asOf,
    generatedAt: view.generatedAt,
    status: view.status,
    freshness: view.freshness,
    matches: view.matches.length,
    standings: view.standings.length,
    bracket: view.bracket.length,
    isProviderDerived: view.isProviderDerived,
    publicSourcePolicy: view.publicSourcePolicy,
    servedFrom: serving?.servedFrom,
    sourceObjectPath: serving?.sourceObjectPath,
    providerDerivedBlocked: serving?.providerDerivedBlocked,
    thirdPlace,
    r32,
    leakHits,
  };

  // ---- Common asserts (both phases) ----
  add("schemaVersion", "assert", view.schemaVersion === "1.0.0", `schemaVersion = ${view.schemaVersion}`);
  add(
    "leak-scan",
    "assert",
    leakHits.length === 0,
    leakHits.length === 0 ? "no forbidden/private substrings" : `forbidden substrings: ${leakHits.join(", ")}`,
  );

  // ---- Common warnings (both phases) ----
  const staleish = view.status === "stale" || view.freshness === "stale" || view.freshness === "fallback";
  add(
    "freshness",
    "warn",
    !staleish,
    staleish ? `data may be delayed (status=${view.status}, freshness=${view.freshness})` : "fresh",
  );
  const maxAgeHours = opts.maxAgeHours ?? 24;
  const nowMs = opts.nowMs ?? Date.now();
  const ageHours = (iso?: string): number | null => {
    if (!iso) return null;
    const t = Date.parse(iso);
    return Number.isNaN(t) ? null : (nowMs - t) / 3_600_000;
  };
  const oldest = Math.max(ageHours(view.asOf) ?? -Infinity, ageHours(view.generatedAt) ?? -Infinity);
  const tooOld = Number.isFinite(oldest) && oldest > maxAgeHours;
  add(
    "max-age",
    "warn",
    !tooOld,
    tooOld ? `asOf/generatedAt older than ${maxAgeHours}h (~${oldest.toFixed(1)}h)` : `within ${maxAgeHours}h`,
  );

  if (phase === "structural") {
    // Shape + leak + (serving shape if present) only - no phase-specific counts.
    if (serving !== undefined) {
      const known =
        serving.servedFrom === "blob" ||
        serving.servedFrom === "fixture" ||
        serving.servedFrom === "fixture-fallback";
      add("serving-shape", "assert", known, `serving.servedFrom = ${String(serving.servedFrom)}`);
    }
  } else {
    // ---- post-group invariants ----
    add(
      "third-place",
      "assert",
      thirdPlace.qualified === 8 && thirdPlace.eliminated === 4 && thirdPlace.undecided === 0,
      `${POST_GROUP}: third-place ${thirdPlace.qualified} qualified / ${thirdPlace.eliminated} eliminated / ${thirdPlace.undecided} undecided (expected 8/4/0)`,
    );
    add(
      "round-of-32",
      "assert",
      r32.total === 16 && r32.resolved === 16 && r32.partial === 0 && r32.unresolved === 0,
      `${POST_GROUP}: R32 ${r32.resolved} resolved / ${r32.partial} partial / ${r32.unresolved} unresolved of ${r32.total} (expected 16/0/0)`,
    );
    add(
      "serving.servedFrom",
      "assert",
      serving?.servedFrom === "blob",
      `serving.servedFrom = ${String(serving?.servedFrom)} (expected "blob")`,
    );
    add(
      "serving.sourceObjectPath",
      "assert",
      serving?.sourceObjectPath === PROVIDER_OBJECT_PATH,
      `serving.sourceObjectPath = ${String(serving?.sourceObjectPath)} (expected "${PROVIDER_OBJECT_PATH}")`,
    );
    add(
      "serving.providerDerivedBlocked",
      "assert",
      serving?.providerDerivedBlocked === false,
      `serving.providerDerivedBlocked = ${String(serving?.providerDerivedBlocked)} (expected false)`,
    );
    add(
      "isProviderDerived",
      "assert",
      view.isProviderDerived === true,
      `isProviderDerived = ${String(view.isProviderDerived)} (expected true)`,
    );
    add(
      "publicSourcePolicy",
      "assert",
      view.publicSourcePolicy === "provider-public-delayed",
      `publicSourcePolicy = ${view.publicSourcePolicy} (expected "provider-public-delayed")`,
    );
  }

  const failures = findings.filter((f) => f.level === "assert" && !f.pass);
  const warnings = findings.filter((f) => f.level === "warn" && !f.pass);
  return { ok: failures.length === 0, phase, fields, findings, failures, warnings };
}
