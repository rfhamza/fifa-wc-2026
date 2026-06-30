/**
 * Match-forecast current/archive CLI runner (Phase 1.30, PR-83D)
 * --------------------------------------------------------------
 * Thin entry: parse args, do all real I/O (file/blob live-state load, existing
 * forecast-matches read, forecast-current read for sourceSnapshotId, write), then
 * delegate the decision to the pure `runRefreshMatchForecasts`.
 *
 * Safety: a file source NEVER writes unless `--allow-file-write` (the safe local
 * path is `--source file --dry-run`). Blob source may write.
 *
 * No football-data fetch, no raw provider payloads, no token logging.
 */
import { readFileSync } from "node:fs";
import { getPublicSafeLiveStateFromBlob } from "@/lib/live-state/public-safe-blob-store";
import {
  FORECAST_PUBLIC_SOURCE_POLICIES,
  type ForecastAttribution,
  type ForecastPublicSourcePolicy,
} from "@/lib/model/forecast-public-safe";
import {
  FORECAST_CURRENT_OBJECT_PATH,
  FORECAST_MATCHES_OBJECT_PATH,
  getPublicSafeForecastCurrentFromBlob,
  getPublicSafeMatchForecastsFromBlob,
  putPublicSafeMatchForecastsToBlob,
} from "@/lib/model/forecast-blob-store";
import {
  runRefreshMatchForecasts,
  type MatchForecastLiveStateInput,
  type MatchRefreshSource,
} from "./refresh-match-forecasts";

const DEFAULT_LIVE_STATE_OBJECT_PATH = "live-state.provider.sanitized.json";
const DEFAULT_INPUT = "data/live/public-safe-sample.json";

const ATTRIBUTION: ForecastAttribution = {
  sourceName: "football-data.org",
  sourceUrl: "https://www.football-data.org/",
  text: "Match forecasts derived internally from the model; standings and bracket use FIFA Article 13. Data may be delayed.",
};

interface CliArgs {
  source: "file" | "blob";
  input: string;
  liveStateObjectPath: string;
  matchesObjectPath: string;
  forecastCurrentObjectPath: string;
  generatedAt?: string;
  dryRun: boolean;
  force: boolean;
  allowFileWrite: boolean;
  includeRetrospective: boolean;
  forceRebuild: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    source: "file",
    input: DEFAULT_INPUT,
    liveStateObjectPath: DEFAULT_LIVE_STATE_OBJECT_PATH,
    matchesObjectPath: FORECAST_MATCHES_OBJECT_PATH,
    forecastCurrentObjectPath: FORECAST_CURRENT_OBJECT_PATH,
    dryRun: false,
    force: false,
    allowFileWrite: false,
    includeRetrospective: false,
    forceRebuild: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    const next = () => argv[++i];
    switch (a) {
      case "--source": {
        const v = next();
        if (v !== "file" && v !== "blob") throw new Error(`--source must be file|blob (got ${v})`);
        args.source = v;
        break;
      }
      case "--input": args.input = next() ?? args.input; break;
      case "--live-state-object-path": args.liveStateObjectPath = next() ?? args.liveStateObjectPath; break;
      case "--matches-object-path": args.matchesObjectPath = next() ?? args.matchesObjectPath; break;
      case "--forecast-current-object-path": args.forecastCurrentObjectPath = next() ?? args.forecastCurrentObjectPath; break;
      case "--generated-at": args.generatedAt = next(); break;
      case "--dry-run": args.dryRun = true; break;
      case "--force": args.force = true; break;
      case "--allow-file-write": args.allowFileWrite = true; break;
      case "--include-retrospective": args.includeRetrospective = true; break;
      case "--force-rebuild": args.forceRebuild = true; break;
      default:
        if (a.startsWith("--")) throw new Error(`Unknown flag: ${a}`);
    }
  }
  return args;
}

function coercePolicy(value: string | undefined): ForecastPublicSourcePolicy | undefined {
  if (value && (FORECAST_PUBLIC_SOURCE_POLICIES as readonly string[]).includes(value)) {
    return value as ForecastPublicSourcePolicy;
  }
  return undefined;
}

async function loadSource(args: CliArgs): Promise<MatchRefreshSource> {
  if (args.source === "blob") {
    const result = await getPublicSafeLiveStateFromBlob({ objectPath: args.liveStateObjectPath });
    if (!result.ok) {
      return { ok: false, objectPath: args.liveStateObjectPath, liveStateGeneratedAt: null, error: result.error };
    }
    const state = result.state as unknown as MatchForecastLiveStateInput;
    return { ok: true, state, objectPath: args.liveStateObjectPath, liveStateGeneratedAt: state.generatedAt ?? null };
  }
  const state = JSON.parse(readFileSync(args.input, "utf8")) as MatchForecastLiveStateInput;
  return { ok: true, state, objectPath: args.input, liveStateGeneratedAt: state.generatedAt ?? null };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const source = await loadSource(args);

  // Source the snapshotId from the forecast-current Blob (warn + null if missing).
  let sourceSnapshotId: string | null = null;
  const currentRead = await getPublicSafeForecastCurrentFromBlob({ objectPath: args.forecastCurrentObjectPath });
  if (currentRead.ok && currentRead.value) {
    sourceSnapshotId = currentRead.value.snapshotId;
  } else {
    process.stderr.write(
      `WARN: forecast-current unavailable (${currentRead.error}); sourceSnapshotId=null.\n`,
    );
  }

  const sourcePolicy =
    coercePolicy((source.state as { publicSourcePolicy?: string } | undefined)?.publicSourcePolicy) ??
    "provider-public-delayed";
  const writeAllowed = args.source === "blob" ? true : args.allowFileWrite;

  const result = await runRefreshMatchForecasts({
    source,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    matchesObjectPath: args.matchesObjectPath,
    forecastCurrentObjectPath: args.forecastCurrentObjectPath,
    sourceSnapshotId,
    readExistingMatchForecasts: () => getPublicSafeMatchForecastsFromBlob({ objectPath: args.matchesObjectPath }),
    writeMatchForecasts: (m) => putPublicSafeMatchForecastsToBlob(m, { objectPath: args.matchesObjectPath }),
    options: {
      asOf: undefined,
      attribution: ATTRIBUTION,
      sourcePolicy,
      dryRun: args.dryRun,
      force: args.force,
      writeAllowed,
      includeRetrospective: args.includeRetrospective,
      forceRebuild: args.forceRebuild,
    },
  });

  const { matchForecasts, ...summary } = result;
  void matchForecasts;
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (result.decision === "blocked") process.stderr.write(`BLOCKED: ${result.reason}\n`);
  process.exitCode = result.exitCode;
}

main().catch((err) => {
  process.stderr.write(`refresh-match-forecasts failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
