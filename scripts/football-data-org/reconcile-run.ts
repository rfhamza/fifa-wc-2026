/**
 * Phase 1.28I - LOCAL-ONLY reconciliation runner (CLI; the only I/O boundary).
 * --------------------------------------------------------------------------
 * Wires real Node deps into the pure `runReconcile` core. Local maintainer use ONLY;
 * never in CI. Reads user-supplied CSVs and an optional football-data.org live-state
 * artifact, optionally performs a local-only fetch (reusing the existing
 * `runFetchLiveState`, token from `FOOTBALL_DATA_TOKEN` only), prints a sanitized
 * summary, and writes `reconcile-summary.json` ONLY to the git-ignored output dir.
 *
 * Run:
 *   npm run live:football-data:reconcile -- --results-csv <path> [--standings-csv <path>]
 *       [--fd-artifact artifacts/football-data-org/live-state.json] [--fetch]
 *       [--out artifacts/football-data-org] [--summary-only]
 *
 * Never logs the token, raw payloads, full CSVs, or account identity.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import {
  runReconcile,
  formatReconcileReport,
  type FdComparisonMatch,
  type ReconcileInput,
} from "./reconcile";
import { runFetchLiveState, DEFAULT_OUT_DIR, type FetchLike } from "./live-state-fetch";

interface CliOptions {
  resultsCsv?: string;
  standingsCsv?: string;
  fdArtifact?: string;
  fetch: boolean;
  outDir: string;
  summaryOnly: boolean;
}

function parseCliArgs(argv: string[]): CliOptions {
  const valueOf = (f: string): string | undefined => {
    const i = argv.indexOf(f);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  return {
    resultsCsv: valueOf("--results-csv"),
    standingsCsv: valueOf("--standings-csv"),
    fdArtifact: valueOf("--fd-artifact"),
    fetch: argv.includes("--fetch"),
    outDir: valueOf("--out") ?? DEFAULT_OUT_DIR,
    summaryOnly: argv.includes("--summary-only"),
  };
}

/** Extract comparison matches from a football-data.org live-state.json artifact. */
function fdMatchesFromArtifact(path: string): FdComparisonMatch[] {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as {
    matches?: { matchId: string; teamA: string; teamB: string; goalsA?: number; goalsB?: number; status: string }[];
  };
  return (parsed.matches ?? []).map((m) => ({
    matchId: m.matchId, teamA: m.teamA, teamB: m.teamB, goalsA: m.goalsA, goalsB: m.goalsB, status: m.status,
  }));
}

async function main(): Promise<void> {
  const opts = parseCliArgs(process.argv.slice(2));
  if (!opts.resultsCsv) {
    // eslint-disable-next-line no-console
    console.error("ERROR: --results-csv <path> is required.");
    process.exitCode = 1;
    return;
  }

  const writeArtifact = (relPath: string, contents: string): void => {
    mkdirSync(dirname(relPath), { recursive: true });
    writeFileSync(relPath, contents);
  };

  // Optional local-only fetch -> writes live-state.json into the ignored out dir.
  let fdArtifactPath = opts.fdArtifact;
  let fdSource: ReconcileInput["fdSource"] = opts.fdArtifact ? "artifact" : "none";
  if (opts.fetch) {
    const fetchImpl: FetchLike = (url, init) => fetch(url, init);
    const res = await runFetchLiveState({
      token: process.env.FOOTBALL_DATA_TOKEN,
      fetchImpl,
      now: () => new Date().toISOString(),
      writeArtifact,
      // eslint-disable-next-line no-console
      log: (line) => console.log(line),
      options: { standings: false, dryRun: false, summaryOnly: false, expectFullTournament: true, outDir: opts.outDir },
    });
    if (res.exitCode === 0) {
      fdArtifactPath = `${opts.outDir}/live-state.json`;
      fdSource = "fetch";
    } else {
      // eslint-disable-next-line no-console
      console.error("Local fetch failed; continuing with CSV-only reconciliation.");
    }
  }

  let fdMatches: FdComparisonMatch[] | undefined;
  if (fdArtifactPath && existsSync(fdArtifactPath)) {
    fdMatches = fdMatchesFromArtifact(fdArtifactPath);
  } else if (fdSource === "artifact") {
    fdSource = "none"; // requested artifact not present
  }

  const input: ReconcileInput = {
    resultsCsvText: readFileSync(opts.resultsCsv, "utf8"),
    standingsCsvText: opts.standingsCsv ? readFileSync(opts.standingsCsv, "utf8") : undefined,
    fdMatches,
    fdSource: fdMatches ? fdSource : "none",
    resultsLabel: basename(opts.resultsCsv),
    standingsLabel: opts.standingsCsv ? basename(opts.standingsCsv) : undefined,
    now: new Date().toISOString(),
  };

  const report = runReconcile(input);
  // eslint-disable-next-line no-console
  console.log(formatReconcileReport(report));

  if (!opts.summaryOnly) {
    writeArtifact(`${opts.outDir}/reconcile-summary.json`, JSON.stringify(report, null, 2));
  }

  const problems =
    (report.parity?.scoreMismatches.length ?? 0) +
    report.results.unknownTeams.length +
    (report.standingsCompare?.coreFieldMismatches.length ?? 0);
  process.exitCode = problems > 0 ? 1 : 0;
}

await main();
