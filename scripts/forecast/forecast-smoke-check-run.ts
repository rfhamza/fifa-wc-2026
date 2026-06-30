/**
 * Forecast smoke-check RUNNER (Phase 1.30, PR-83E1).
 * --------------------------------------------------
 * Operator tool: loads the two public-safe forecast objects (from Blob or from
 * local files) and asserts the forecast invariants via the pure checker
 * (`forecast-smoke-check.ts`). Run AFTER the forecast refresh has written the Blob
 * objects (see docs/FORECAST_REFRESH_RUNBOOK.md).
 *
 *   # Blob (operator / CI) — requires BLOB_READ_WRITE_TOKEN in the environment:
 *   npm run forecast:smoke -- --source blob --strict
 *   # Local files (offline, no token):
 *   npm run forecast:smoke -- --source file --current-input <path> --matches-input <path>
 *
 * Blob reads use the read-only Blob store helpers (never throw, return a machine
 * error code). This tool does NO football-data fetch, NO Blob WRITE, and prints NO
 * tokens / Blob URLs / raw provider payloads — only counts, object paths, and error
 * codes. Exits 0 when all asserts pass, 1 otherwise (failing checks printed first).
 */
import { readFileSync } from "node:fs";
import {
  FORECAST_CURRENT_OBJECT_PATH,
  FORECAST_MATCHES_OBJECT_PATH,
  getPublicSafeForecastCurrentFromBlob,
  getPublicSafeMatchForecastsFromBlob,
} from "@/lib/model/forecast-blob-store";
import {
  runForecastSmokeCheck,
  type ForecastSmokeInput,
  type ForecastSmokeReport,
} from "./forecast-smoke-check";

interface CliArgs {
  source: "blob" | "file";
  strict: boolean;
  currentObjectPath: string;
  matchesObjectPath: string;
  currentInput?: string;
  matchesInput?: string;
  expectedLiveStateObjectPath?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    source: "blob",
    strict: false,
    currentObjectPath: FORECAST_CURRENT_OBJECT_PATH,
    matchesObjectPath: FORECAST_MATCHES_OBJECT_PATH,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    const next = () => argv[++i];
    switch (a) {
      case "--source": {
        const v = next();
        if (v !== "blob" && v !== "file") throw new Error(`--source must be blob|file (got ${v})`);
        args.source = v;
        break;
      }
      case "--strict": args.strict = true; break;
      case "--current-object-path": args.currentObjectPath = next() ?? args.currentObjectPath; break;
      case "--matches-object-path": args.matchesObjectPath = next() ?? args.matchesObjectPath; break;
      case "--current-input": args.currentInput = next(); break;
      case "--matches-input": args.matchesInput = next(); break;
      case "--expected-live-state-object-path": args.expectedLiveStateObjectPath = next(); break;
      default:
        if (a.startsWith("--")) throw new Error(`Unknown flag: ${a}`);
    }
  }
  return args;
}

function readFileObject(path: string | undefined): { value: unknown; error: string | null } {
  if (!path) return { value: null, error: "no-input-path" };
  try {
    return { value: JSON.parse(readFileSync(path, "utf8")) as unknown, error: null };
  } catch {
    // Generic code only — never surface the path contents or a stack with secrets.
    return { value: null, error: "file-read-error" };
  }
}

async function loadInput(args: CliArgs): Promise<ForecastSmokeInput> {
  if (args.source === "blob") {
    const c = await getPublicSafeForecastCurrentFromBlob({ objectPath: args.currentObjectPath });
    const m = await getPublicSafeMatchForecastsFromBlob({ objectPath: args.matchesObjectPath });
    return {
      current: c.ok ? c.value : null,
      matches: m.ok ? m.value : null,
      currentError: c.ok ? null : (c.error ?? null),
      matchesError: m.ok ? null : (m.error ?? null),
    };
  }
  const c = readFileObject(args.currentInput);
  const m = readFileObject(args.matchesInput);
  return { current: c.value, matches: m.value, currentError: c.error, matchesError: m.error };
}

function render(report: ForecastSmokeReport, source: string): string {
  const f = report.fields;
  const lines: string[] = [];
  lines.push(`${report.ok ? "PASS" : "FAIL"}  forecast smoke check (source=${source}, strict=${report.strict})`);
  if (!report.ok) {
    lines.push("");
    lines.push("Failing checks:");
    for (const x of report.failures) lines.push(`  x ${x.name}: ${x.detail}`);
  }
  lines.push("");
  lines.push("forecast-current:");
  lines.push(`  available           ${String(f.currentAvailable)}`);
  lines.push(`  snapshotId          ${f.snapshotId ?? "(none)"}`);
  lines.push(`  asOf                ${f.asOf ?? "(none)"}`);
  lines.push(`  completedLocked     ${f.completedMatchesLocked ?? "(none)"}`);
  lines.push(`  latestCompleted#    ${f.latestCompletedSupportedMatchNumber ?? "(none)"}`);
  lines.push(`  sourceLiveState     ${f.sourceLiveStateObjectPath ?? "(none)"}`);
  lines.push(`  teams               ${f.teams ?? "(none)"}`);
  lines.push("");
  lines.push("forecast-matches:");
  lines.push(`  available           ${String(f.matchesAvailable)}`);
  lines.push(`  matchForecasts      ${f.matchForecasts ?? "(none)"}`);
  lines.push(`  current-pre-match   ${f.currentPreMatch ?? "(none)"}`);
  lines.push(`  archived-pre-match  ${f.archivedPreMatch ?? "(none)"}`);
  lines.push(`  retrospective       ${f.retrospective ?? "(none)"}`);
  lines.push("");
  lines.push(`leak scan             ${f.leakHits.length === 0 ? "clean" : "LEAK: " + f.leakHits.join(", ")}`);
  if (report.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const w of report.warnings) lines.push(`  ! ${w.name}: ${w.detail}`);
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const input = await loadInput(args);
  const report = runForecastSmokeCheck(input, {
    strict: args.strict,
    expectedLiveStateObjectPath: args.expectedLiveStateObjectPath,
  });
  process.stdout.write(render(report, args.source) + "\n");
  process.exitCode = report.ok ? 0 : 1;
}

main().catch((err) => {
  process.stderr.write(`forecast-smoke-check failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
