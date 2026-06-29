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
import type { Fixture, GroupId, KnockoutStage } from "@/lib/types";
import type { LockedResult } from "@/lib/simulation/locked-results";
import type { KnockoutLockedResult } from "@/lib/simulation/locked-knockout-results";
import { fixtures } from "@/lib/data";
import { FORBIDDEN_SNAPSHOT_SUBSTRINGS, findForbiddenSubstrings } from "./forecast-snapshots";

export const FORECAST_RESULTS_SCHEMA_VERSION = "1.0.0";

/** Group-stage match numbers are M1..M72; knockout is M73..M104. */
export const GROUP_STAGE_MAX_MATCH = 72;
/** Knockout match numbers span M73 (Round of 32, M73) through M104 (final). */
export const KNOCKOUT_MATCH_MIN = 73;
export const KNOCKOUT_MATCH_MAX = 104;

/** Group rows use the literal stage "group"; knockout rows use a KnockoutStage. */
export const LEDGER_ALLOWED_STAGE = "group" as const;
export const LEDGER_ALLOWED_STATUS = "complete" as const;

/** The knockout stages a ledger row may declare (M73..M104). */
export const KNOCKOUT_STAGES: readonly KnockoutStage[] = [
  "roundOf32",
  "roundOf16",
  "quarterFinal",
  "semiFinal",
  "thirdPlace",
  "final",
] as const;
const KNOCKOUT_STAGE_SET = new Set<string>(KNOCKOUT_STAGES);

/** One completed group-stage result (public-safe; simulation-canonical only). */
export interface GroupResultLedgerRow {
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

/** One completed knockout result (public-safe; M73..M104). */
export interface KnockoutResultLedgerRow {
  /** Canonical FIFA match number, M73..M104. */
  matchNumber: number;
  stage: KnockoutStage;
  /** Participants in the source's orientation (order is informational). */
  homeTeamId: string;
  awayTeamId: string;
  /** Non-negative integer goals for homeTeamId / awayTeamId (90'+ET). */
  homeGoals: number;
  awayGoals: number;
  status: "complete";
  /** The winner; must equal homeTeamId or awayTeamId. */
  winnerTeamId: string;
  /** Optional ISO kickoff/played time. */
  playedAt?: string;
  /** Shootout score for homeTeamId / awayTeamId; present only on a level result. */
  penaltiesHome?: number;
  penaltiesAway?: number;
}

/**
 * One completed result in the ledger, discriminated on `stage`: a group row
 * ("group") or a knockout row (a KnockoutStage). Group rows are unchanged from
 * PR-3B; knockout rows (PR-3E) carry the explicit winner + optional penalties.
 */
export type ResultLedgerRow = GroupResultLedgerRow | KnockoutResultLedgerRow;

/** Type guard: is this row a knockout-stage row? */
export function isKnockoutLedgerRow(row: ResultLedgerRow): row is KnockoutResultLedgerRow {
  return row.stage !== LEDGER_ALLOWED_STAGE;
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
 * Knockout-row schema checks (called once the row is known to declare a knockout
 * stage). Validates the match-number range, the winner being a participant, the
 * decisive-result/goal consistency, and the penalty shootout when the score is
 * level (mirrors the simulator's `knockoutWinner` decision rule).
 */
function validateKnockoutRow(
  row: Partial<KnockoutResultLedgerRow>,
  i: number,
  errors: string[],
): void {
  if (
    typeof row.matchNumber === "number" &&
    Number.isInteger(row.matchNumber) &&
    (row.matchNumber < KNOCKOUT_MATCH_MIN || row.matchNumber > KNOCKOUT_MATCH_MAX)
  ) {
    errors.push(
      `results[${i}].matchNumber must be ${KNOCKOUT_MATCH_MIN}..${KNOCKOUT_MATCH_MAX} for a knockout row`,
    );
  }

  if (!isString(row.winnerTeamId)) {
    errors.push(`results[${i}].winnerTeamId must be a string`);
    return; // winner-dependent checks below need a string winner
  }
  if (
    isString(row.homeTeamId) &&
    isString(row.awayTeamId) &&
    row.winnerTeamId !== row.homeTeamId &&
    row.winnerTeamId !== row.awayTeamId
  ) {
    errors.push(
      `results[${i}].winnerTeamId "${row.winnerTeamId}" must equal homeTeamId or awayTeamId`,
    );
  }

  const home = row.homeGoals;
  const away = row.awayGoals;
  if (!isNonNegativeInteger(home) || !isNonNegativeInteger(away)) return; // goal errors already reported

  if (home !== away) {
    // Decisive in normal/extra time: the winner must be the higher-scoring side,
    // and penalties must not be present.
    const decisiveWinner = home > away ? row.homeTeamId : row.awayTeamId;
    if (isString(decisiveWinner) && row.winnerTeamId !== decisiveWinner)
      errors.push(`results[${i}].winnerTeamId must be the higher-scoring side on a decisive result`);
    if (row.penaltiesHome !== undefined || row.penaltiesAway !== undefined)
      errors.push(`results[${i}] penalties must be absent when the score is not level`);
  } else {
    // Level after extra time: a shootout decided it - penalties required + consistent.
    if (!isNonNegativeInteger(row.penaltiesHome) || !isNonNegativeInteger(row.penaltiesAway)) {
      errors.push(`results[${i}] penaltiesHome/penaltiesAway (non-negative integers) are required on a level result`);
      return;
    }
    if (row.penaltiesHome === row.penaltiesAway) {
      errors.push(`results[${i}] penalty shootout cannot be level (no winner)`);
      return;
    }
    const penaltyWinner = row.penaltiesHome > row.penaltiesAway ? row.homeTeamId : row.awayTeamId;
    if (isString(penaltyWinner) && row.winnerTeamId !== penaltyWinner)
      errors.push(`results[${i}].winnerTeamId must match the penalty-shootout winner`);
  }
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
      const row = r as Partial<KnockoutResultLedgerRow> & { group?: unknown };
      const stage: string | undefined = typeof row.stage === "string" ? row.stage : undefined;

      // Shared fields (both stages).
      if (typeof row.matchNumber !== "number" || !Number.isInteger(row.matchNumber))
        errors.push(`results[${i}].matchNumber must be an integer`);
      else if (seen.has(row.matchNumber)) errors.push(`results[${i}].matchNumber duplicated: ${row.matchNumber}`);
      else seen.add(row.matchNumber);
      if (row.status !== LEDGER_ALLOWED_STATUS)
        errors.push(`results[${i}].status must be "${LEDGER_ALLOWED_STATUS}" (got ${String(row.status)})`);
      if (!isString(row.homeTeamId) || !isString(row.awayTeamId))
        errors.push(`results[${i}] homeTeamId/awayTeamId must be strings`);
      if (!isNonNegativeInteger(row.homeGoals)) errors.push(`results[${i}].homeGoals must be a non-negative integer`);
      if (!isNonNegativeInteger(row.awayGoals)) errors.push(`results[${i}].awayGoals must be a non-negative integer`);
      if (row.playedAt !== undefined && !isString(row.playedAt))
        errors.push(`results[${i}].playedAt must be a string when present`);

      // Stage-specific (discriminated on `stage`).
      if (stage === LEDGER_ALLOWED_STAGE) {
        if (!isString(row.group)) errors.push(`results[${i}].group must be a string`);
        if (
          typeof row.matchNumber === "number" &&
          Number.isInteger(row.matchNumber) &&
          (row.matchNumber < 1 || row.matchNumber > GROUP_STAGE_MAX_MATCH)
        )
          errors.push(`results[${i}].matchNumber must be 1..${GROUP_STAGE_MAX_MATCH} for a group row`);
      } else if (stage !== undefined && KNOCKOUT_STAGE_SET.has(stage)) {
        validateKnockoutRow(row, i, errors);
      } else {
        errors.push(
          `results[${i}].stage must be "${LEDGER_ALLOWED_STAGE}" or a knockout stage ` +
            `(${KNOCKOUT_STAGES.join(", ")}); got ${String(row.stage)}`,
        );
      }
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
    // Only group rows resolve to a group-stage fixture; knockout rows (M73..M104)
    // are not in `fixtures` and are validated against the bracket graph elsewhere.
    if (isKnockoutLedgerRow(row)) return;
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

/** Map group rows to the simulator's `LockedResult[]` (the 5 sim fields only). */
export function ledgerToLockedResults(ledger: ForecastResultsLedger): LockedResult[] {
  return ledger.results
    .filter((r): r is GroupResultLedgerRow => !isKnockoutLedgerRow(r))
    .map((r) => ({
      matchNumber: r.matchNumber,
      homeTeamId: r.homeTeamId,
      awayTeamId: r.awayTeamId,
      homeGoals: r.homeGoals,
      awayGoals: r.awayGoals,
    }));
}

/** Map knockout rows to the simulator's `KnockoutLockedResult[]` (M73..M104). */
export function ledgerToKnockoutLockedResults(ledger: ForecastResultsLedger): KnockoutLockedResult[] {
  return ledger.results.filter(isKnockoutLedgerRow).map((r) => ({
    matchNumber: r.matchNumber,
    stage: r.stage,
    homeTeamId: r.homeTeamId,
    awayTeamId: r.awayTeamId,
    winnerTeamId: r.winnerTeamId,
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
  /** Explicit winner (knockout); preferred over goals/penalties when present. */
  winner?: string;
  /** Shootout score for teamA / teamB (knockout, level result). */
  penalties?: { a: number; b: number };
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
 * Resolve a completed knockout match's winner from a sanitized live-state row,
 * mirroring the simulator's decision rule: an explicit `winner` is preferred,
 * else the higher-scoring side, else the penalty-shootout winner. Throws if the
 * result is level with no winner and no decisive shootout.
 */
function deriveKnockoutWinnerId(m: PublicSafeStateMatchInput): string {
  if (m.winner !== undefined) {
    if (m.winner !== m.teamA && m.winner !== m.teamB) {
      throw new Error(
        `deriveLedger: M${m.matchNumber} winner "${m.winner}" is not a participant {${m.teamA}, ${m.teamB}}`,
      );
    }
    return m.winner;
  }
  if (m.goalsA > m.goalsB) return m.teamA;
  if (m.goalsB > m.goalsA) return m.teamB;
  if (m.penalties) {
    if (m.penalties.a > m.penalties.b) return m.teamA;
    if (m.penalties.b > m.penalties.a) return m.teamB;
  }
  throw new Error(`deriveLedger: M${m.matchNumber} is level with no winner or decisive penalty shootout`);
}

/**
 * Derive a validated, public-safe results ledger from a sanitized live-state.
 * Group rows (`stage==="group" && status==="complete" && matchNumber<=72`) are
 * mapped onto the official fixture's canonical home/away (goals by team identity);
 * knockout rows (a knockout stage, status complete, M73..M104) keep the source's
 * orientation and carry the resolved winner (+ penalties on a level result). Emits
 * only sanitized ledger fields and validates against the schema + official
 * fixtures (throws on any inconsistency). No fetch/Blob/token here - I/O is the
 * caller's.
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

  const groupResults: GroupResultLedgerRow[] = completedGroup.map((m) => {
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

  const completedKnockout = (state.matches ?? [])
    .filter(
      (m) =>
        KNOCKOUT_STAGE_SET.has(m.stage) &&
        m.status === "complete" &&
        m.matchNumber >= KNOCKOUT_MATCH_MIN &&
        m.matchNumber <= KNOCKOUT_MATCH_MAX,
    )
    .sort((a, b) => a.matchNumber - b.matchNumber);

  const knockoutResults: KnockoutResultLedgerRow[] = completedKnockout.map((m) => {
    if (m.teamA === m.teamB) {
      throw new Error(`deriveLedger: M${m.matchNumber} has identical participants {${m.teamA}}`);
    }
    const winnerTeamId = deriveKnockoutWinnerId(m);
    const level = m.goalsA === m.goalsB;
    return {
      matchNumber: m.matchNumber,
      stage: m.stage as KnockoutStage,
      homeTeamId: m.teamA,
      awayTeamId: m.teamB,
      homeGoals: m.goalsA,
      awayGoals: m.goalsB,
      status: "complete",
      winnerTeamId,
      ...(m.kickoff ? { playedAt: m.kickoff } : {}),
      ...(level && m.penalties ? { penaltiesHome: m.penalties.a, penaltiesAway: m.penalties.b } : {}),
    };
  });

  const results: ResultLedgerRow[] = [...groupResults, ...knockoutResults];

  const asOf = options.asOf ?? state.asOf ?? "";
  const asOfDate = asOf.slice(0, 10);
  // Suffix = latest completed LOCKED match number (NOT the row count), so a
  // non-contiguous knockout completion still names the artifact correctly.
  const latestMatchNumber = results.reduce((max, r) => (r.matchNumber > max ? r.matchNumber : max), 0);
  const ledgerId =
    options.ledgerId ?? `results-as-of-${asOfDate}-after-match-${String(latestMatchNumber).padStart(3, "0")}`;

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
