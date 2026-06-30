/**
 * Rolling current-forecast CLI runner (Phase 1.30, PR-83C)
 * --------------------------------------------------------
 * Thin entry: parse args, do all real I/O (file/blob source load, existing-current
 * read, write), then delegate the decision to the pure `runRefreshCurrentForecast`.
 *
 * Safety: a file source NEVER writes to the forecast Blob unless `--allow-file-write`
 * is passed (the safe local path is `--source file --dry-run`). Blob source may write.
 *
 * No football-data fetch, no raw provider payloads, no token logging.
 */
import { readFileSync } from "node:fs";
import { getPublicSafeLiveStateFromBlob } from "@/lib/live-state/public-safe-blob-store";
import { getCurrentSnapshotPolicy } from "@/lib/model/forecast-snapshot-store";
import type { PublicSafeStateInput } from "@/lib/model/forecast-results-ledger";
import {
  FORECAST_PUBLIC_SOURCE_POLICIES,
  type ForecastAttribution,
  type ForecastPublicSourcePolicy,
} from "@/lib/model/forecast-public-safe";
import {
  FORECAST_CURRENT_OBJECT_PATH,
  getPublicSafeForecastCurrentFromBlob,
  putPublicSafeForecastCurrentToBlob,
} from "@/lib/model/forecast-blob-store";
import { runRefreshCurrentForecast, type RefreshSource } from "./refresh-current";

const DEFAULT_LIVE_STATE_OBJECT_PATH = "live-state.provider.sanitized.json";
const DEFAULT_INPUT = "data/live/public-safe-sample.json";

const ATTRIBUTION: ForecastAttribution = {
  sourceName: "football-data.org",
  sourceUrl: "https://www.football-data.org/",
  text: "Forecast derived internally from results; standings and bracket use FIFA Article 13. Data may be delayed.",
};

interface CliArgs {
  source: "file" | "blob";
  input: string;
  liveStateObjectPath: string;
  forecastObjectPath: string;
  generatedAt?: string;
  asOf?: string;
  iterations?: number;
  seed?: number;
  sourcePolicy?: string;
  dryRun: boolean;
  force: boolean;
  allowFileWrite: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    source: "file",
    input: DEFAULT_INPUT,
    liveStateObjectPath: DEFAULT_LIVE_STATE_OBJECT_PATH,
    forecastObjectPath: FORECAST_CURRENT_OBJECT_PATH,
    dryRun: false,
    force: false,
    allowFileWrite: false,
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
      case "--forecast-object-path": args.forecastObjectPath = next() ?? args.forecastObjectPath; break;
      case "--generated-at": args.generatedAt = next(); break;
      case "--as-of": args.asOf = next(); break;
      case "--iterations": args.iterations = Number(next()); break;
      case "--seed": args.seed = Number(next()); break;
      case "--source-policy": args.sourcePolicy = next(); break;
      case "--dry-run": args.dryRun = true; break;
      case "--force": args.force = true; break;
      case "--allow-file-write": args.allowFileWrite = true; break;
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

async function loadSource(args: CliArgs): Promise<RefreshSource> {
  if (args.source === "blob") {
    const result = await getPublicSafeLiveStateFromBlob({ objectPath: args.liveStateObjectPath });
    if (!result.ok) {
      return { ok: false, objectPath: args.liveStateObjectPath, liveStateGeneratedAt: null, error: result.error };
    }
    const state = result.state as unknown as PublicSafeStateInput & { generatedAt?: string };
    return {
      ok: true,
      state,
      objectPath: args.liveStateObjectPath,
      liveStateGeneratedAt: state.generatedAt ?? null,
    };
  }
  const state = JSON.parse(readFileSync(args.input, "utf8")) as PublicSafeStateInput & { generatedAt?: string };
  return { ok: true, state, objectPath: args.input, liveStateGeneratedAt: state.generatedAt ?? null };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const source = await loadSource(args);
  const policyFromState = coercePolicy(
    (source.state as { publicSourcePolicy?: string } | undefined)?.publicSourcePolicy,
  );
  const sourcePolicy = coercePolicy(args.sourcePolicy) ?? policyFromState ?? "provider-public-delayed";
  const previousSnapshotIdFallback = getCurrentSnapshotPolicy().currentSnapshotId;
  const writeAllowed = args.source === "blob" ? true : args.allowFileWrite;

  const result = await runRefreshCurrentForecast({
    source,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    forecastObjectPath: args.forecastObjectPath,
    previousSnapshotIdFallback,
    readExistingCurrent: () => getPublicSafeForecastCurrentFromBlob({ objectPath: args.forecastObjectPath }),
    writeCurrent: (current) =>
      putPublicSafeForecastCurrentToBlob(current, { objectPath: args.forecastObjectPath }),
    options: {
      asOf: args.asOf,
      seed: args.seed,
      iterations: args.iterations,
      sourcePolicy,
      attribution: ATTRIBUTION,
      dryRun: args.dryRun,
      force: args.force,
      writeAllowed,
    },
  });

  const summary = {
    decision: result.decision,
    reason: result.reason,
    snapshotId: result.snapshotId,
    source: args.source,
    sourceLiveStateObjectPath: result.sourceLiveStateObjectPath,
    forecastObjectPath: result.forecastObjectPath,
    latest: {
      previous: result.previousLatestCompletedSupportedMatchNumber,
      new: result.newLatestCompletedSupportedMatchNumber,
    },
    completedMatchesLocked: {
      previous: result.previousCompletedMatchesLocked,
      new: result.newCompletedMatchesLocked,
    },
    fingerprint: {
      previous: result.previousSourceResultsFingerprint,
      new: result.newSourceResultsFingerprint,
    },
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (result.decision === "blocked") {
    process.stderr.write(`BLOCKED: ${result.reason}\n`);
  }
  process.exitCode = result.exitCode;
}

main().catch((err) => {
  process.stderr.write(`refresh-current failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
