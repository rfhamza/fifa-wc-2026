/**
 * Live-state scheduler cadence guard - RUNNER (thin I/O wrapper).
 * --------------------------------------------------------------
 * Decides whether THIS scheduler wake-up should refresh, and emits a
 * `run=true|false` GitHub Actions step output. It reads ONLY committed data:
 *   - official fixture kickoff instants (data/official/*),
 *   - the latest committed results ledger (data/forecast/results/*), used purely
 *     as a positive "this match is already finished" signal.
 * It performs NO provider fetch, NO Blob read, and reads NO secret - the guard
 * must never require a provider call to decide whether to make one.
 *
 * Exit code is always 0 (a skip is a successful no-op); the workflow gates the
 * write on the `run` step output, not on the exit code.
 *
 * Usage: vite-node --config vitest.config.ts scripts/live-state/scheduler-cadence-run.ts \
 *          [--event <github-event-name>] [--now <iso8601>] \
 *          [--pre <minutes>] [--post <minutes>] [--baseline <minutes>]
 */
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { officialFixtures } from "@/data/official/fixtures";
import { officialKnockoutSchedule } from "@/data/official/knockout-schedule";
import {
  loadForecastResultsManifest,
  loadForecastResultsLedger,
} from "@/lib/model/forecast-results-ledger";
import {
  decideScheduledCadence,
  type FixtureKickoff,
} from "@/lib/live-state/scheduler-cadence";

interface CliArgs {
  event?: string;
  nowIso?: string;
  preMinutes?: number;
  postMinutes?: number;
  baselineMinutes?: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--event":
        args.event = next();
        break;
      case "--now":
        args.nowIso = next();
        break;
      case "--pre":
        args.preMinutes = Number(next());
        break;
      case "--post":
        args.postMinutes = Number(next());
        break;
      case "--baseline":
        args.baselineMinutes = Number(next());
        break;
      default:
        if (a && a.startsWith("--")) throw new Error(`Unknown flag: ${a}`);
    }
  }
  return args;
}

/** Committed fixture kickoffs (group M1-M72 + knockout M73-M104) as epoch ms. */
function collectKickoffs(): FixtureKickoff[] {
  const out: FixtureKickoff[] = [];
  for (const f of officialFixtures) {
    out.push({ matchNumber: f.matchNumber, kickoffMs: Date.parse(f.kickoff) });
  }
  for (const k of officialKnockoutSchedule) {
    out.push({ matchNumber: k.matchNumber, kickoffMs: Date.parse(k.kickoffUtc) });
  }
  return out;
}

/**
 * Terminally-complete match numbers from the latest committed results ledger.
 * Positive signal only; fails open to an empty set (which just means "poll",
 * the safe direction) if the committed data cannot be read.
 */
function collectCompletedMatchNumbers(): { completed: Set<number>; note: string } {
  const dir = join(process.cwd(), "data", "forecast", "results");
  try {
    const manifest = loadForecastResultsManifest(readFileSync(join(dir, "manifest.json"), "utf8"));
    if (manifest.ledgers.length === 0) return { completed: new Set(), note: "ledger manifest empty" };
    // Pick the most-complete ledger (largest resultCount).
    const latest = manifest.ledgers.reduce((a, b) => (b.resultCount > a.resultCount ? b : a));
    const ledger = loadForecastResultsLedger(readFileSync(join(dir, latest.file), "utf8"));
    const completed = new Set<number>(ledger.results.map((r) => r.matchNumber));
    return { completed, note: `ledger ${latest.ledgerId} (${completed.size} complete)` };
  } catch (err) {
    return {
      completed: new Set(),
      note: `ledger unavailable (${err instanceof Error ? err.message : String(err)}); polling not short-circuited`,
    };
  }
}

function emitOutput(run: boolean): void {
  const out = process.env.GITHUB_OUTPUT;
  if (!out) return;
  try {
    // Appended, mirroring the inline guard step's `echo "run=..." >> $GITHUB_OUTPUT`.
    appendFileSync(out, `run=${run ? "true" : "false"}\n`);
  } catch {
    /* best-effort: local runs without GITHUB_OUTPUT just print below */
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const event = args.event ?? process.env.GITHUB_EVENT_NAME ?? "schedule";
  const nowMs = args.nowIso ? Date.parse(args.nowIso) : Date.now();

  const lines: string[] = [];

  // Manual dispatch (any non-schedule event) always runs: operational recovery.
  if (event !== "schedule") {
    lines.push(`RUN  cadence: manual dispatch (event=${event}) always refreshes.`);
    process.stdout.write(lines.join("\n") + "\n");
    emitOutput(true);
    process.exitCode = 0;
    return;
  }

  const kickoffs = collectKickoffs();
  const { completed, note } = collectCompletedMatchNumbers();
  const decision = decideScheduledCadence(nowMs, kickoffs, {
    completedMatchNumbers: completed,
    preWindowMinutes: args.preMinutes,
    postWindowMinutes: args.postMinutes,
    baselineIntervalMinutes: args.baselineMinutes,
  });

  lines.push(`${decision.run ? "RUN " : "SKIP"} cadence: ${decision.reason}.`);
  lines.push(`  now=${new Date(nowMs).toISOString()} (UTC minute ${decision.minuteOfHour})`);
  lines.push(`  inMatchWindow=${decision.inMatchWindow} onBaselineBoundary=${decision.onBaselineBoundary}`);
  if (decision.activeMatchNumbers.length > 0) {
    lines.push(`  active matches: ${decision.activeMatchNumbers.join(", ")}`);
  }
  lines.push(`  terminal-complete source: ${note}`);
  process.stdout.write(lines.join("\n") + "\n");

  emitOutput(decision.run);
  process.exitCode = 0;
}

main();
