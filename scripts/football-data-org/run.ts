/**
 * Phase 1.28C - LOCAL-ONLY CLI runner for the football-data.org fetch report.
 * --------------------------------------------------------------------------
 * The ONLY file that touches the environment, network, and filesystem. It wires the
 * real Node deps into the pure orchestrator in `live-state-fetch.ts`.
 *
 * Run manually (maintainer only; NEVER in CI):
 *     FOOTBALL_DATA_TOKEN=*** npm run live:football-data:check
 *     FOOTBALL_DATA_TOKEN=*** npm run live:football-data:check -- --no-standings --dry-run
 *
 * The token is read ONLY from `process.env.FOOTBALL_DATA_TOKEN`, sent only in the
 * `X-Auth-Token` header, and never logged or written. Outputs go ONLY to the
 * git-ignored `artifacts/football-data-org/` directory. Regenerate the token before
 * real use (it was previously exposed in chat).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  parseArgs,
  runFetchLiveState,
  type FetchLike,
} from "./live-state-fetch";

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const fetchImpl: FetchLike = (url, init) => fetch(url, init);
  const writeArtifact = (relPath: string, contents: string): void => {
    mkdirSync(dirname(relPath), { recursive: true });
    writeFileSync(relPath, contents);
  };

  const result = await runFetchLiveState({
    token: process.env.FOOTBALL_DATA_TOKEN,
    fetchImpl,
    now: () => new Date().toISOString(),
    writeArtifact,
    // eslint-disable-next-line no-console
    log: (line) => console.log(line),
    options,
  });

  process.exitCode = result.exitCode;
}

await main();
