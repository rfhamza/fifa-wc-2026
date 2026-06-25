/**
 * Phase 1.28M - thin CLI runner for the manual private-Blob writer (the ONLY I/O boundary).
 * --------------------------------------------------------------------------------------
 * Wires real env + fetch into the pure `runWritePublicSafeBlob` core. Manual maintainer/CI
 * use ONLY (never scheduled). Tokens are read from the environment and never logged:
 *   - BLOB_READ_WRITE_TOKEN   (required unless --dry-run)
 *   - FOOTBALL_DATA_TOKEN     (required for --source football-data)
 *
 * Run:
 *   npm run live:state:write-blob -- --source fixture [--dry-run] [--object-path <path>]
 *   FOOTBALL_DATA_TOKEN=*** BLOB_READ_WRITE_TOKEN=*** \
 *     npm run live:state:write-blob -- --source football-data [--allow-partial]
 */
import {
  parseWriteArgs,
  runWritePublicSafeBlob,
  type WriteSource,
} from "./write-public-safe-blob";
import type { FetchLike } from "@/scripts/football-data-org/live-state-fetch";

async function main(): Promise<void> {
  const opts = parseWriteArgs(process.argv.slice(2));
  const fetchImpl: FetchLike = (url, init) => fetch(url, init);

  const result = await runWritePublicSafeBlob({
    source: opts.source as WriteSource,
    objectPath: opts.objectPath,
    dryRun: opts.dryRun,
    allowPartial: opts.allowPartial,
    blobToken: process.env.BLOB_READ_WRITE_TOKEN,
    providerToken: process.env.FOOTBALL_DATA_TOKEN,
    fetchImpl,
    now: () => new Date().toISOString(),
    // eslint-disable-next-line no-console
    log: (line) => console.log(line),
  });

  process.exitCode = result.exitCode;
}

await main();
