/**
 * Offline forecast snapshot generator (Phase 1.29, PR-1)
 * ------------------------------------------------------
 * Deterministic CLI that produces a pre-tournament baseline forecast snapshot
 * by running the existing tournament simulation with the current model config.
 * Run via vite-node (the repo convention for app-importing scripts), NOT plain
 * node — the generator must import the TypeScript simulator.
 *
 *   npm run forecast:snapshot                         # print baseline to stdout (dry run)
 *   npm run forecast:snapshot -- --generated-at <iso> # deterministic timestamp
 *   npm run forecast:snapshot -- --out <path>         # write artifact (used in PR-2)
 *   npm run forecast:snapshot -- --iterations 500 --seed 20260611
 *   npm run forecast:snapshot -- --results <ledger.json> --type post-match --out <path>
 *
 * With `--results`, a committed sanitized results ledger is locked into the
 * simulation (live-aware snapshot); without it, the pre-tournament baseline is
 * generated unchanged.
 *
 * Safety: this generator runs purely from committed fixtures + model config (+ a
 * committed ledger when given). It does NOT read the runtime live-state HTTP
 * route, Blob, env vars or any provider data, and it does not write a committed
 * artifact unless `--out` is given.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fixtures } from "@/lib/data";
import {
  buildBaselineForecastSnapshot,
  buildLiveAwareForecastSnapshot,
  validateForecastSnapshot,
  assertNoForbiddenData,
  type ForecastSnapshot,
} from "../lib/model/forecast-snapshots";
import {
  loadForecastResultsLedger,
  ledgerToLockedResults,
} from "../lib/model/forecast-results-ledger";

type LiveAwareType = "post-match" | "post-matchday" | "manual";
const LIVE_AWARE_TYPES: LiveAwareType[] = ["post-match", "post-matchday", "manual"];

interface CliArgs {
  generatedAt?: string;
  asOf?: string;
  snapshotId?: string;
  seed?: number;
  iterations?: number;
  notes?: string;
  out?: string;
  results?: string;
  type?: string;
  sourceObjectPath?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    const next = () => argv[++i];
    switch (a) {
      case "--generated-at": args.generatedAt = next(); break;
      case "--as-of": args.asOf = next(); break;
      case "--snapshot-id": args.snapshotId = next(); break;
      case "--seed": args.seed = Number(next()); break;
      case "--iterations": args.iterations = Number(next()); break;
      case "--notes": args.notes = next(); break;
      case "--out": args.out = next(); break;
      case "--results": args.results = next(); break;
      case "--type": args.type = next(); break;
      case "--source-object-path": args.sourceObjectPath = next(); break;
      // --dry-run / --stdout are the default; accepted as no-ops for clarity.
      case "--dry-run":
      case "--stdout": break;
      default:
        if (a.startsWith("--")) {
          throw new Error(`Unknown flag: ${a}`);
        }
    }
  }
  return args;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  // A wall-clock default is fine for ad-hoc runs; pass --generated-at for
  // deterministic/committed output.
  const generatedAt = args.generatedAt ?? new Date().toISOString();

  let snapshot: ForecastSnapshot;
  if (args.results) {
    // Live-aware: lock a committed sanitized results ledger into the simulation.
    if (args.type && !LIVE_AWARE_TYPES.includes(args.type as LiveAwareType)) {
      throw new Error(`--type must be one of ${LIVE_AWARE_TYPES.join(", ")} (got ${args.type})`);
    }
    const ledger = loadForecastResultsLedger(readFileSync(args.results, "utf8"), fixtures);
    const lockedResults = ledgerToLockedResults(ledger);
    const latestCompletedSupportedMatchNumber = lockedResults.length
      ? lockedResults.reduce((max, r) => (r.matchNumber > max ? r.matchNumber : max), 0)
      : undefined;
    snapshot = buildLiveAwareForecastSnapshot({
      generatedAt,
      lockedResults,
      snapshotType: (args.type as LiveAwareType | undefined) ?? "post-match",
      asOf: args.asOf ?? ledger.asOf,
      snapshotId: args.snapshotId,
      seed: args.seed,
      iterations: args.iterations,
      notes: args.notes,
      liveStateSource: ledger.sourcePolicy,
      liveStateAsOf: ledger.asOf,
      providerCompletedMatchesTotal: ledger.providerCompletedMatchesTotal,
      sourceObjectPath: args.sourceObjectPath ?? ledger.sourceObjectPath,
      latestCompletedSupportedMatchNumber,
    });
  } else {
    snapshot = buildBaselineForecastSnapshot({
      generatedAt,
      asOf: args.asOf,
      snapshotId: args.snapshotId,
      seed: args.seed,
      iterations: args.iterations,
      notes: args.notes,
    });
  }

  const errors = validateForecastSnapshot(snapshot);
  if (errors.length > 0) {
    throw new Error(`Generated snapshot failed validation:\n- ${errors.join("\n- ")}`);
  }
  assertNoForbiddenData(snapshot);

  const json = JSON.stringify(snapshot, null, 2);
  if (args.out) {
    writeFileSync(args.out, json + "\n", "utf8");
    process.stderr.write(
      `Wrote ${snapshot.meta.snapshotId} (${snapshot.teams.length} teams) -> ${args.out}\n`,
    );
  } else {
    process.stdout.write(json + "\n");
  }
}

main();
