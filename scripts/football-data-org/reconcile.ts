/**
 * Phase 1.28I - LOCAL-ONLY reconciliation reporter (pure core).
 * -------------------------------------------------------------
 * Reconciles a user-supplied current-results CSV against the internal live-state
 * derivation (and, optionally, a football-data.org live-state artifact), and audits
 * which official Round-of-32 slots have activated. PURE: this module does NO I/O - the
 * runner (`reconcile-run.ts`) reads files / fetches / writes artifacts and passes plain
 * text + a clock in here. It never reads a token and never prints raw payloads.
 *
 * Governance: the CSV and provider data are COMPARISON-ONLY reconciliation inputs.
 * Internal Article 13 standings and the internally-derived bracket remain
 * authoritative; canonical `M{n}` stays the key; provider/CSV standings are never a
 * source of truth.
 */
import { buildOfficialReference, ingestLiveSnapshot } from "@/lib/live-state/ingest";
import { resolveTeamId } from "@/lib/live-ingest/mapping";
import type { GroupId } from "@/lib/types";
import type {
  LiveBracketMatch,
  LiveGroupStanding,
  LiveStateReference,
  RawLiveMatch,
  RawLiveSnapshot,
} from "@/lib/live-state/types";

/* ----------------------------- CSV parsing ------------------------------ */

/** Split CSV text into rows of cells (handles quoted fields with commas + CRLF). */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/** Parse CSV text into header-keyed objects (blank trailing lines dropped). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text).filter((r) => !(r.length === 1 && r[0] === ""));
  if (rows.length === 0) return [];
  const header = rows[0]!;
  return rows.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => { obj[h] = cells[i] ?? ""; });
    return obj;
  });
}

const GROUP_IDS = new Set(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"]);
const isGroupId = (g: string): g is GroupId => GROUP_IDS.has(g);

/* ------------------------- CSV -> RawLiveSnapshot ------------------------ */

export interface CsvSnapshotResult {
  snapshot: RawLiveSnapshot;
  completedRows: number;
  unknownTeams: string[];
  skipped: number;
}

export interface CsvSnapshotOptions {
  asOf: string;
  lastUpdatedAt: string;
  sourceName?: string;
  sourceUrl?: string;
}

/**
 * Build a `RawLiveSnapshot` from completed group-stage CSV rows. Team names resolve via
 * the shared `resolveTeamId`; unresolved names are recorded (never silently dropped).
 */
export function buildSnapshotFromCsvResults(
  rows: Record<string, string>[],
  opts: CsvSnapshotOptions,
): CsvSnapshotResult {
  const matches: RawLiveMatch[] = [];
  const unknownTeams = new Set<string>();
  let completedRows = 0;
  let skipped = 0;

  for (const r of rows) {
    const stage = (r.stage ?? "").toLowerCase();
    const status = (r.status ?? "").toLowerCase();
    if (stage !== "group" || status !== "complete") { skipped++; continue; }
    completedRows++;

    const n = Number(r.matchNumber);
    const group = r.group ?? "";
    const aName = r.teamA ?? "";
    const bName = r.teamB ?? "";
    const aId = resolveTeamId(aName);
    const bId = resolveTeamId(bName);
    if (!aId) unknownTeams.add(aName);
    if (!bId) unknownTeams.add(bName);
    if (!Number.isFinite(n) || !isGroupId(group) || !aId || !bId) { skipped++; completedRows--; continue; }

    matches.push({
      matchId: `M${n}`,
      stage: "group",
      group,
      teamA: aId,
      teamB: bId,
      status: "complete",
      goalsA: Number(r.goalsA),
      goalsB: Number(r.goalsB),
      kickoff: r.kickoff || undefined,
      lastUpdatedAt: opts.lastUpdatedAt,
    });
  }

  const snapshot: RawLiveSnapshot = {
    sourceVersion: `csv-${opts.asOf}`,
    source: {
      sourceId: "user-csv-reconciliation",
      sourceType: "manual",
      sourceName: opts.sourceName ?? "user-supplied current-results CSV (reconciliation input)",
      ...(opts.sourceUrl ? { sourceUrl: opts.sourceUrl } : {}),
      lastUpdatedAt: opts.lastUpdatedAt,
      reliability: "medium",
    },
    asOf: opts.asOf,
    matches,
  };
  return { snapshot, completedRows, unknownTeams: [...unknownTeams], skipped };
}

/* --------------------------- result parity ------------------------------ */

/** Minimal football-data.org comparison match (from an ingested live-state artifact). */
export interface FdComparisonMatch {
  matchId: string;
  teamA: string;
  teamB: string;
  goalsA?: number | null;
  goalsB?: number | null;
  status: string;
}

export interface ScoreMismatch {
  matchNumber: number;
  csv: string;
  fd: string;
}

export interface ResultParity {
  csvCompleted: number;
  fdPlayed: number | null;
  matched: number;
  scoreMismatches: ScoreMismatch[];
  unmatchedCsv: number[];
  unmatchedFd: number[];
}

const numOf = (id: string): number => Number(id.replace(/^M/, ""));
const teamGoalMap = (teamA: string, gA: unknown, teamB: string, gB: unknown): Record<string, number> =>
  ({ [teamA]: Number(gA), [teamB]: Number(gB) });

/** Compare completed results by canonical matchNumber, orientation-safe (team->goals). */
export function compareResults(
  csv: RawLiveMatch[],
  fd: FdComparisonMatch[],
): ResultParity {
  const fdById = new Map(fd.filter((m) => m.status === "complete").map((m) => [m.matchId, m]));
  const csvIds = new Set(csv.map((m) => m.matchId));
  const scoreMismatches: ScoreMismatch[] = [];
  const unmatchedCsv: number[] = [];
  let matched = 0;

  for (const c of csv) {
    const f = fdById.get(c.matchId);
    if (!f) { unmatchedCsv.push(numOf(c.matchId)); continue; }
    matched++;
    const cMap = teamGoalMap(c.teamA, c.goalsA, c.teamB, c.goalsB);
    const fMap = teamGoalMap(f.teamA, f.goalsA, f.teamB, f.goalsB);
    const keys = new Set([...Object.keys(cMap), ...Object.keys(fMap)]);
    let ok = true;
    for (const k of keys) if (cMap[k] !== fMap[k]) ok = false;
    if (!ok) {
      scoreMismatches.push({
        matchNumber: numOf(c.matchId),
        csv: `${c.teamA} ${c.goalsA}-${c.goalsB} ${c.teamB}`,
        fd: `${f.teamA} ${f.goalsA}-${f.goalsB} ${f.teamB}`,
      });
    }
  }
  const unmatchedFd = [...fdById.keys()].filter((id) => !csvIds.has(id)).map(numOf);
  return {
    csvCompleted: csv.length,
    fdPlayed: fd.length ? fd.filter((m) => m.status === "complete").length : null,
    matched,
    scoreMismatches,
    unmatchedCsv,
    unmatchedFd,
  };
}

/* ------------------------- standings comparison ------------------------- */

export interface CsvStanding {
  group: string;
  position: number;
  teamId: string | null;
  teamName: string;
  played: number; won: number; drawn: number; lost: number;
  goalsFor: number; goalsAgainst: number; goalDifference: number; points: number;
}

export function parseStandingsCsv(rows: Record<string, string>[]): CsvStanding[] {
  return rows.map((r) => ({
    group: r.group ?? "",
    position: Number(r.position),
    teamId: resolveTeamId(r.team ?? ""),
    teamName: r.team ?? "",
    played: Number(r.matchesPlayed),
    won: Number(r.wins),
    drawn: Number(r.draws),
    lost: Number(r.losses),
    goalsFor: Number(r.goalsFor),
    goalsAgainst: Number(r.goalsAgainst),
    goalDifference: Number(r.goalDifference),
    points: Number(r.points),
  }));
}

export interface StandingsCompare {
  compared: number;
  coreFieldMismatches: string[];
  orderingAdvisories: string[];
  unknownTeams: string[];
}

const CORE_FIELDS: (keyof CsvStanding & keyof LiveGroupStanding)[] = [
  "played", "won", "drawn", "lost", "goalsFor", "goalsAgainst", "goalDifference", "points",
];

/** Compare CSV standings vs internally-derived standings: core fields strict, order advisory. */
export function compareStandings(
  derived: LiveGroupStanding[],
  csv: CsvStanding[],
): StandingsCompare {
  const derivedByKey = new Map(derived.map((s) => [`${s.group}:${s.teamId}`, s]));
  const coreFieldMismatches: string[] = [];
  const orderingAdvisories: string[] = [];
  const unknownTeams = new Set<string>();
  let compared = 0;

  for (const c of csv) {
    if (!c.teamId) { unknownTeams.add(c.teamName); continue; }
    const d = derivedByKey.get(`${c.group}:${c.teamId}`);
    if (!d) { coreFieldMismatches.push(`${c.group} ${c.teamId}: not found in derived standings`); continue; }
    compared++;
    for (const f of CORE_FIELDS) {
      if (c[f] !== d[f]) coreFieldMismatches.push(`${c.group} ${c.teamId}.${f}: csv=${c[f]} derived=${d[f]}`);
    }
    if (c.position !== d.rank) {
      orderingAdvisories.push(`${c.group} ${c.teamId}: csv position ${c.position} vs derived rank ${d.rank} (tie-break tail differs; advisory)`);
    }
  }
  return { compared, coreFieldMismatches, orderingAdvisories, unknownTeams: [...unknownTeams] };
}

/* --------------------------- bracket audit ------------------------------ */

export interface BracketSlotActivation {
  matchNumber: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
}

export interface BracketReport {
  m73: BracketSlotActivation & { fullyResolved: boolean };
  fullyResolvedR32: number[];
  partiallyResolvedR32: BracketSlotActivation[];
  unresolvedR32Count: number;
}

const isFull = (m: LiveBracketMatch): boolean => m.homeTeamId != null && m.awayTeamId != null;
const isPartial = (m: LiveBracketMatch): boolean =>
  (m.homeTeamId != null) !== (m.awayTeamId != null);

/** Classify Round-of-32 participant activation (by participants, not winner). */
export function auditBracket(bracketMatches: LiveBracketMatch[]): BracketReport {
  const r32 = bracketMatches.filter((m) => m.stage === "roundOf32");
  const m73m = r32.find((m) => m.matchNumber === 73);
  const m73: BracketReport["m73"] = m73m
    ? { matchNumber: 73, homeTeamId: m73m.homeTeamId, awayTeamId: m73m.awayTeamId, fullyResolved: isFull(m73m) }
    : { matchNumber: 73, homeTeamId: null, awayTeamId: null, fullyResolved: false };
  return {
    m73,
    fullyResolvedR32: r32.filter(isFull).map((m) => m.matchNumber).sort((a, b) => a - b),
    partiallyResolvedR32: r32.filter(isPartial).map((m) => ({
      matchNumber: m.matchNumber, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId,
    })).sort((a, b) => a.matchNumber - b.matchNumber),
    unresolvedR32Count: r32.filter((m) => m.homeTeamId == null && m.awayTeamId == null).length,
  };
}

/* ----------------------------- orchestrator ----------------------------- */

export interface ReconcileInput {
  resultsCsvText: string;
  standingsCsvText?: string;
  fdMatches?: FdComparisonMatch[];
  fdSource: "none" | "artifact" | "fetch";
  fdPlayedCount?: number | null;
  resultsLabel: string;
  standingsLabel?: string;
  now: string;
  reference?: LiveStateReference;
}

export interface GroupPlacement {
  group: string;
  first: string | null;
  second: string | null;
  complete: boolean;
}

export interface ReconcileReport {
  generatedAt: string;
  results: { label: string; completedRows: number; unknownTeams: string[]; skipped: number };
  standings: { label: string; rows: number } | null;
  fdSource: "none" | "artifact" | "fetch";
  parity: ResultParity | null;
  derivedPlacements: GroupPlacement[];
  bracket: BracketReport;
  standingsCompare: StandingsCompare | null;
  validationWarnings: number;
  providerStandingsComparisonOnly: true;
}

function groupPlacements(standings: LiveGroupStanding[], reference: LiveStateReference): GroupPlacement[] {
  const out: GroupPlacement[] = [];
  for (const group of reference.groups) {
    const rows = standings.filter((s) => s.group === group.id).sort((a, b) => a.rank - b.rank);
    if (rows.length === 0) continue;
    const complete = rows.length === group.teamIds.length && rows.every((r) => r.played === group.teamIds.length - 1);
    out.push({
      group: group.id,
      first: rows[0]?.teamId ?? null,
      second: rows[1]?.teamId ?? null,
      complete,
    });
  }
  return out;
}

/** Run the full reconciliation. Pure: no I/O, no token, no network. */
export function runReconcile(input: ReconcileInput): ReconcileReport {
  const reference = input.reference ?? buildOfficialReference();
  const resultsRows = parseCsv(input.resultsCsvText);
  const built = buildSnapshotFromCsvResults(resultsRows, {
    asOf: input.now,
    lastUpdatedAt: input.now,
  });
  const state = ingestLiveSnapshot(built.snapshot, reference, {
    generatedAt: input.now,
    staleAfterSeconds: 365 * 24 * 60 * 60, // reconciliation is offline; freshness not the point
  });

  const parity = input.fdMatches
    ? compareResults(built.snapshot.matches, input.fdMatches)
    : null;

  let standings: ReconcileReport["standings"] = null;
  let standingsCompare: StandingsCompare | null = null;
  if (input.standingsCsvText) {
    const csvStandings = parseStandingsCsv(parseCsv(input.standingsCsvText));
    standings = { label: input.standingsLabel ?? "standings.csv", rows: csvStandings.length };
    standingsCompare = compareStandings(state.groupStandings, csvStandings);
  }

  return {
    generatedAt: input.now,
    results: {
      label: input.resultsLabel,
      completedRows: built.completedRows,
      unknownTeams: built.unknownTeams,
      skipped: built.skipped,
    },
    standings,
    fdSource: input.fdSource,
    parity: parity
      ? { ...parity, fdPlayed: parity.fdPlayed ?? input.fdPlayedCount ?? null }
      : null,
    derivedPlacements: groupPlacements(state.groupStandings, reference).filter((p) => p.complete),
    bracket: auditBracket(state.bracket.matches),
    standingsCompare,
    validationWarnings: state.warnings.length,
    providerStandingsComparisonOnly: true,
  };
}

/** Render a concise, sanitized text summary (no token / raw payload / full tables). */
export function formatReconcileReport(r: ReconcileReport): string {
  const lines: string[] = [
    "football-data.org reconciliation report",
    `  generatedAt:          ${r.generatedAt}`,
    `  results CSV:          ${r.results.label}`,
    `  CSV completed rows:   ${r.results.completedRows}`,
    `  CSV rows skipped:     ${r.results.skipped}`,
    `  unknown CSV teams:    ${r.results.unknownTeams.length ? r.results.unknownTeams.join(", ") : "none"}`,
    `  standings CSV:        ${r.standings ? `${r.standings.label} (${r.standings.rows} rows)` : "not provided"}`,
    `  football-data source: ${r.fdSource}`,
  ];
  if (r.parity) {
    lines.push(
      `  result parity:        csvCompleted=${r.parity.csvCompleted} fdPlayed=${r.parity.fdPlayed ?? "n/a"} matched=${r.parity.matched}`,
      `  score mismatches:     ${r.parity.scoreMismatches.length}${r.parity.scoreMismatches.length ? " " + JSON.stringify(r.parity.scoreMismatches) : ""}`,
      `  unmatched CSV M#:     ${r.parity.unmatchedCsv.length ? r.parity.unmatchedCsv.join(",") : "none"}`,
      `  unmatched FD M#:      ${r.parity.unmatchedFd.length ? r.parity.unmatchedFd.join(",") : "none"}`,
    );
  }
  for (const p of r.derivedPlacements) {
    lines.push(`  group ${p.group} (complete): 1st=${p.first} 2nd=${p.second}`);
  }
  lines.push(
    `  M73 activation:       ${r.bracket.m73.homeTeamId ?? "?"} vs ${r.bracket.m73.awayTeamId ?? "?"} (fullyResolved=${r.bracket.m73.fullyResolved})`,
    `  R32 fully resolved:   [${r.bracket.fullyResolvedR32.join(",")}]`,
    `  R32 partially resolved: ${r.bracket.partiallyResolvedR32.map((s) => `M${s.matchNumber}(${s.homeTeamId ?? "?"}/${s.awayTeamId ?? "?"})`).join(" ") || "none"}`,
    `  R32 unresolved count: ${r.bracket.unresolvedR32Count}`,
  );
  if (r.standingsCompare) {
    lines.push(
      `  standings compared:   ${r.standingsCompare.compared}`,
      `  core-field mismatches:${r.standingsCompare.coreFieldMismatches.length ? " " + JSON.stringify(r.standingsCompare.coreFieldMismatches) : " 0"}`,
      `  ordering advisories:  ${r.standingsCompare.orderingAdvisories.length}`,
    );
  }
  lines.push(
    `  validation warnings:  ${r.validationWarnings}`,
    `  provider standings:   comparison-only=${r.providerStandingsComparisonOnly} (internal Article 13 authoritative)`,
  );
  return lines.join("\n");
}
