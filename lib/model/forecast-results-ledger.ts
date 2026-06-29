/**
 * Forecast results ledger (Phase 1.29, PR-3B)
 * -------------------------------------------
 * A committed, public-safe ledger of completed group-stage results that the
 * forecast snapshot generator turns into `lockedResults` for a live-aware
 * simulation. This is NOT live-ingestion storage and never carries provider
 * identity or raw payloads - only the canonical fields needed to lock a match.
 *
 * Validation is layered:
 *  - `validateResultsLedger`            : pure schema + public-safe leakage scan.
 *  - `validateResultsLedgerAgainstFixtures` : fixture-aware (matchNumber exists,
 *    stage = group, group matches the official fixture, team set matches).
 *  - `ledgerToLockedResults` -> `resolveLockedResults` (existing) does the final
 *    orientation + simulator-facing checks.
 */
import type { Fixture, GroupId } from "@/lib/types";
import type { LockedResult } from "@/lib/simulation/locked-results";
import { fixtures } from "@/lib/data";
import { FORBIDDEN_SNAPSHOT_SUBSTRINGS, findForbiddenSubstrings } from "./forecast-snapshots";

export const FORECAST_RESULTS_SCHEMA_VERSION = "1.0.0";

/** Group-stage match numbers are M1..M72; knockout (M73+) is never lockable here. */
export const GROUP_STAGE_MAX_MATCH = 72;

/** Only completed group-stage matches are lockable in this phase. */
export const LEDGER_ALLOWED_STAGE = "group" as const;
export const LEDGER_ALLOWED_STATUS = "complete" as const;

/** One completed result in the ledger (public-safe; simulation-canonical only). */
export interface ResultLedgerRow {
  /** Canonical FIFA match number, M1..M72. */
  matchNumber: number;
  stage: "group";
  group: GroupId;
  homeTeamId: string;
  awayTeamId: string;
  /** Non-negative integer goals for homeTeamId / awayTeamId. */
  homeGoals: number;
  awayGoals: number;
  status: "complete";
  /** Optional ISO kickoff/played time. */
  playedAt?: string;
}

/** A committed results ledger reflecting completed matches as of a point in time. */
export interface ForecastResultsLedger {
  schemaVersion: string;
  ledgerId: string;
  /** ISO; the cutoff this ledger reflects (maps to snapshot `liveStateAsOf`). */
  asOf: string;
  /** Provenance LABEL only (e.g. "manual-snapshot") - never a URL/token. */
  sourcePolicy: string;
  notes: string;
  /** Public-safe source object PATHNAME (never a URL/token). Present when known. */
  sourceObjectPath?: string;
  /**
   * Count of ALL completed official matches in the source live-state (incl.
   * matches the engine cannot yet lock, e.g. knockout). `results` may be fewer.
   */
  providerCompletedMatchesTotal?: number;
  results: ResultLedgerRow[];
}

export interface ForecastResultsManifestEntry {
  ledgerId: string;
  file: string;
  asOf: string;
  label: string;
  resultCount: number;
  notes: string;
}

export interface ForecastResultsManifest {
  schemaVersion: string;
  ledgers: ForecastResultsManifestEntry[];
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}
function isNonNegativeInteger(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

/**
 * Pure schema + public-safe validation of a results ledger (no fixtures needed).
 * Returns a list of human-readable errors ([] = valid). Rejects non-group stage,
 * non-final status, invalid goals, duplicate match numbers, and any provider /
 * private data leakage (raw IDs, tokens, Blob URLs, crests, odds, referees).
 */
export function validateResultsLedger(value: unknown): string[] {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) return ["ledger is not an object"];
  const led = value as Partial<ForecastResultsLedger>;

  if (led.schemaVersion !== FORECAST_RESULTS_SCHEMA_VERSION)
    errors.push(`schemaVersion must be ${FORECAST_RESULTS_SCHEMA_VERSION}`);
  for (const k of ["ledgerId", "asOf", "sourcePolicy", "notes"] as const) {
    if (!isString(led[k])) errors.push(`${k} must be a string`);
  }
  if (led.sourceObjectPath !== undefined && !isString(led.sourceObjectPath))
    errors.push("sourceObjectPath must be a string when present");
  if (led.providerCompletedMatchesTotal !== undefined && !isNonNegativeInteger(led.providerCompletedMatchesTotal))
    errors.push("providerCompletedMatchesTotal must be a non-negative integer when present");

  if (!Array.isArray(led.results)) {
    errors.push("results must be an array");
  } else {
    const seen = new Set<number>();
    led.results.forEach((r, i) => {
      if (typeof r !== "object" || r === null) {
        errors.push(`results[${i}] is not an object`);
        return;
      }
      const row = r as Partial<ResultLedgerRow>;
      if (typeof row.matchNumber !== "number" || !Number.isInteger(row.matchNumber))
        errors.push(`results[${i}].matchNumber must be an integer`);
      else if (seen.has(row.matchNumber)) errors.push(`results[${i}].matchNumber duplicated: ${row.matchNumber}`);
      else seen.add(row.matchNumber);
      if (row.stage !== LEDGER_ALLOWED_STAGE)
        errors.push(`results[${i}].stage must be "${LEDGER_ALLOWED_STAGE}" (got ${String(row.stage)})`);
      if (row.status !== LEDGER_ALLOWED_STATUS)
        errors.push(`results[${i}].status must be "${LEDGER_ALLOWED_STATUS}" (got ${String(row.status)})`);
      if (!isString(row.group)) errors.push(`results[${i}].group must be a string`);
      if (!isString(row.homeTeamId) || !isString(row.awayTeamId))
        errors.push(`results[${i}] homeTeamId/awayTeamId must be strings`);
      if (!isNonNegativeInteger(row.homeGoals)) errors.push(`results[${i}].homeGoals must be a non-negative integer`);
      if (!isNonNegativeInteger(row.awayGoals)) errors.push(`results[${i}].awayGoals must be a non-negative integer`);
      if (row.playedAt !== undefined && !isString(row.playedAt))
        errors.push(`results[${i}].playedAt must be a string when present`);
    });
  }

  // Public-safe guard: reject raw provider/private data anywhere in the ledger.
  // (Truthful source-policy labels like "provider-public-delayed" are fine - the
  // forbidden list targets raw IDs/tokens/URLs, not the bare word "provider".)
  const hits = findForbiddenSubstrings(JSON.stringify(value));
  if (hits.length > 0) errors.push(`ledger contains forbidden/private data: ${hits.join(", ")}`);

  return errors;
}

/**
 * Fixture-aware validation: every row's matchNumber must resolve to an official
 * group-stage fixture, its `group` must match that fixture, and its team set must
 * match. Rejects unknown / knockout / non-group match numbers and team mismatches.
 */
export function validateResultsLedgerAgainstFixtures(
  ledger: ForecastResultsLedger,
  groupFixtures: readonly Fixture[],
): string[] {
  const errors: string[] = [];
  const byMatchNumber = new Map<number, Fixture>();
  for (const f of groupFixtures) {
    if (typeof f.matchNumber === "number") byMatchNumber.set(f.matchNumber, f);
  }
  ledger.results.forEach((row, i) => {
    const fixture = byMatchNumber.get(row.matchNumber);
    if (!fixture) {
      errors.push(`results[${i}]: unknown or non-group-stage matchNumber ${row.matchNumber}`);
      return;
    }
    if (row.group !== fixture.group) {
      errors.push(
        `results[${i}] M${row.matchNumber}: group "${row.group}" does not match fixture group "${fixture.group}"`,
      );
    }
    const fixtureTeams = new Set([fixture.homeTeamId, fixture.awayTeamId]);
    if (
      row.homeTeamId === row.awayTeamId ||
      !fixtureTeams.has(row.homeTeamId) ||
      !fixtureTeams.has(row.awayTeamId)
    ) {
      errors.push(
        `results[${i}] M${row.matchNumber}: teams {${row.homeTeamId}, ${row.awayTeamId}} do not match ` +
          `fixture {${fixture.homeTeamId}, ${fixture.awayTeamId}}`,
      );
    }
  });
  return errors;
}

/** Map ledger rows to the simulator's `LockedResult[]` (the 5 sim fields only). */
export function ledgerToLockedResults(ledger: ForecastResultsLedger): LockedResult[] {
  return ledger.results.map((r) => ({
    matchNumber: r.matchNumber,
    homeTeamId: r.homeTeamId,
    awayTeamId: r.awayTeamId,
    homeGoals: r.homeGoals,
    awayGoals: r.awayGoals,
  }));
}

/** Validate a results manifest. Returns a list of errors ([] = valid). */
export function validateForecastResultsManifest(value: unknown): string[] {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) return ["manifest is not an object"];
  const man = value as Partial<ForecastResultsManifest>;
  if (man.schemaVersion !== FORECAST_RESULTS_SCHEMA_VERSION)
    errors.push(`schemaVersion must be ${FORECAST_RESULTS_SCHEMA_VERSION}`);
  if (!Array.isArray(man.ledgers)) {
    errors.push("ledgers must be an array");
    return errors;
  }
  man.ledgers.forEach((e, i) => {
    if (typeof e !== "object" || e === null) {
      errors.push(`ledgers[${i}] is not an object`);
      return;
    }
    const entry = e as Partial<ForecastResultsManifestEntry>;
    for (const k of ["ledgerId", "file", "asOf", "label", "notes"] as const) {
      if (!isString(entry[k])) errors.push(`ledgers[${i}].${k} must be a string`);
    }
    if (!isNonNegativeInteger(entry.resultCount)) errors.push(`ledgers[${i}].resultCount must be a non-negative integer`);
  });
  return errors;
}

/** An empty, schema-valid results manifest (used to seed `results/manifest.json`). */
export function emptyForecastResultsManifest(): ForecastResultsManifest {
  return { schemaVersion: FORECAST_RESULTS_SCHEMA_VERSION, ledgers: [] };
}

/**
 * Parse + validate a ledger from JSON text or an object. Schema-validates always;
 * fixture-validates too when `groupFixtures` is supplied. Throws on any error.
 */
export function loadForecastResultsLedger(
  raw: string | unknown,
  groupFixtures?: readonly Fixture[],
): ForecastResultsLedger {
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  const errors = validateResultsLedger(value);
  if (errors.length === 0 && groupFixtures) {
    errors.push(...validateResultsLedgerAgainstFixtures(value as ForecastResultsLedger, groupFixtures));
  }
  if (errors.length > 0) {
    throw new Error(`Invalid forecast results ledger:\n- ${errors.join("\n- ")}`);
  }
  return value as ForecastResultsLedger;
}

/** Parse + validate a results manifest from JSON text or an object. Throws on invalid. */
export function loadForecastResultsManifest(raw: string | unknown): ForecastResultsManifest {
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  const errors = validateForecastResultsManifest(value);
  if (errors.length > 0) {
    throw new Error(`Invalid forecast results manifest:\n- ${errors.join("\n- ")}`);
  }
  return value as ForecastResultsManifest;
}

/* ----------------------------------------------------------------------------
 * Derivation from a sanitized public-safe live-state (PR-3D).
 *
 * Pure: takes a plain public-safe state object (from a committed file OR the
 * sanitized Blob read - the caller does the I/O) and produces a validated ledger.
 * Imports NO live-state module, so lib/model stays isolated (the Blob read lives
 * in the offline script). Keeps only completed group-stage matches and emits only
 * the sanitized ledger fields - provider/private data can never reach the output.
 * -------------------------------------------------------------------------- */

/** Minimal public-safe match shape this derivation consumes. */
export interface PublicSafeStateMatchInput {
  matchNumber: number;
  stage: string;
  status: string;
  teamA: string;
  teamB: string;
  goalsA: number;
  goalsB: number;
  kickoff?: string;
}

/** Minimal public-safe live-state shape this derivation consumes. */
export interface PublicSafeStateInput {
  asOf?: string;
  publicSourcePolicy?: string;
  serving?: { sourceObjectPath?: string };
  matches: PublicSafeStateMatchInput[];
}

export interface DeriveLedgerOptions {
  asOf?: string;
  ledgerId?: string;
  notes?: string;
  /** Override the provenance label (e.g. "provider-public-delayed"). */
  sourcePolicy?: string;
  /** Override the source object pathname (else taken from state.serving). */
  sourceObjectPath?: string;
}

/**
 * Derive a validated, public-safe results ledger from a sanitized live-state.
 * Keeps `stage==="group" && status==="complete" && matchNumber<=72`, maps each
 * onto the official fixture's canonical home/away (goals by team identity), emits
 * only the 9 ledger fields, and validates against the schema + official fixtures
 * (throws on any inconsistency). No fetch/Blob/token here - I/O is the caller's.
 */
export function deriveLedgerFromPublicSafeState(
  state: PublicSafeStateInput,
  options: DeriveLedgerOptions = {},
): ForecastResultsLedger {
  const fixtureByMatchNumber = new Map<number, Fixture>();
  for (const f of fixtures) {
    if (typeof f.matchNumber === "number") fixtureByMatchNumber.set(f.matchNumber, f);
  }

  const completedGroup = (state.matches ?? [])
    .filter((m) => m.stage === "group" && m.status === "complete" && m.matchNumber <= GROUP_STAGE_MAX_MATCH)
    .sort((a, b) => a.matchNumber - b.matchNumber);

  const results: ResultLedgerRow[] = completedGroup.map((m) => {
    const fixture = fixtureByMatchNumber.get(m.matchNumber);
    if (!fixture) {
      throw new Error(`deriveLedger: matchNumber ${m.matchNumber} is not an official group-stage fixture`);
    }
    const teamSet = new Set([fixture.homeTeamId, fixture.awayTeamId]);
    if (m.teamA === m.teamB || !teamSet.has(m.teamA) || !teamSet.has(m.teamB)) {
      throw new Error(
        `deriveLedger: M${m.matchNumber} teams {${m.teamA}, ${m.teamB}} do not match fixture ` +
          `{${fixture.homeTeamId}, ${fixture.awayTeamId}}`,
      );
    }
    const aIsHome = m.teamA === fixture.homeTeamId;
    return {
      matchNumber: m.matchNumber,
      stage: "group",
      group: fixture.group,
      homeTeamId: fixture.homeTeamId,
      awayTeamId: fixture.awayTeamId,
      homeGoals: aIsHome ? m.goalsA : m.goalsB,
      awayGoals: aIsHome ? m.goalsB : m.goalsA,
      status: "complete",
      ...(m.kickoff ? { playedAt: m.kickoff } : {}),
    };
  });

  const asOf = options.asOf ?? state.asOf ?? "";
  const asOfDate = asOf.slice(0, 10);
  const ledgerId =
    options.ledgerId ?? `results-as-of-${asOfDate}-after-match-${String(results.length).padStart(3, "0")}`;

  const providerCompletedMatchesTotal = (state.matches ?? []).filter((m) => m.status === "complete").length;
  const sourceObjectPath = options.sourceObjectPath ?? state.serving?.sourceObjectPath;

  const ledger: ForecastResultsLedger = {
    schemaVersion: FORECAST_RESULTS_SCHEMA_VERSION,
    ledgerId,
    asOf: state.asOf ?? asOf,
    sourcePolicy: options.sourcePolicy ?? state.publicSourcePolicy ?? "manual-snapshot",
    notes:
      options.notes ??
      "Derived from a sanitized public-safe live-state. No raw provider payloads, provider IDs, " +
        "headers, tokens, or private Blob URLs included.",
    ...(sourceObjectPath !== undefined ? { sourceObjectPath } : {}),
    providerCompletedMatchesTotal,
    results,
  };

  const errors = [
    ...validateResultsLedger(ledger),
    ...validateResultsLedgerAgainstFixtures(ledger, fixtures),
  ];
  if (errors.length > 0) {
    throw new Error(`Derived ledger failed validation:\n- ${errors.join("\n- ")}`);
  }
  return ledger;
}

/** Re-exported for callers that want the shared forbidden-substring set. */
export { FORBIDDEN_SNAPSHOT_SUBSTRINGS };
