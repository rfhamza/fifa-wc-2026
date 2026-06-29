/**
 * Derive a public-safe results ledger from a sanitized live-state (Phase 1.29,
 * PR-3C/3D). Reusable, offline, deterministic.
 *
 *   # from a committed file (default; used by tests / fallback):
 *   vite-node scripts/derive-results-ledger.ts -- \
 *     --source file --in data/live/public-safe-sample.json \
 *     --as-of 2026-06-25 --out <ledger.json>
 *
 *   # from the sanitized provider-derived Vercel Blob (real PR-3D source):
 *   vite-node scripts/derive-results-ledger.ts -- \
 *     --source blob --object-path live-state.provider.sanitized.json \
 *     --source-policy provider-public-delayed --as-of <date> --out <ledger.json>
 *
 * The Blob read reuses the repo's existing sanitized reader
 * (`getPublicSafeLiveStateFromBlob`), which reads the private Blob token only at
 * the call boundary and never logs/returns it. This script never fetches the
 * upstream provider, never writes Blob, and never prints a token. The pure
 * derivation (keep group-stage `complete` rows, map to fixture orientation,
 * validate, emit only the 9 ledger fields) lives in lib/model and contains no
 * live-state import.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  deriveLedgerFromPublicSafeState,
  type PublicSafeStateInput,
} from "../lib/model/forecast-results-ledger";
import { getPublicSafeLiveStateFromBlob } from "../lib/live-state/public-safe-blob-store";

type Source = "file" | "blob";

interface CliArgs {
  source: Source;
  in: string;
  objectPath?: string;
  asOf?: string;
  ledgerId?: string;
  notes?: string;
  sourcePolicy?: string;
  out?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { source: "file", in: "data/live/public-safe-sample.json" };
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
      case "--in": args.in = next() ?? args.in; break;
      case "--object-path": args.objectPath = next(); break;
      case "--as-of": args.asOf = next(); break;
      case "--ledger-id": args.ledgerId = next(); break;
      case "--notes": args.notes = next(); break;
      case "--source-policy": args.sourcePolicy = next(); break;
      case "--out": args.out = next(); break;
      default:
        if (a.startsWith("--")) throw new Error(`Unknown flag: ${a}`);
    }
  }
  return args;
}

/** Load the sanitized public-safe state from the chosen source (file or Blob). */
async function readSourceState(args: CliArgs): Promise<PublicSafeStateInput> {
  if (args.source === "blob") {
    if (!args.objectPath) throw new Error("--object-path is required for --source blob");
    const result = await getPublicSafeLiveStateFromBlob({ objectPath: args.objectPath });
    if (!result.ok) {
      // Generic error code only (e.g. missing-blob-token / not-found); never a token.
      throw new Error(
        `blob read failed (${result.error}); run in an environment with the Blob read token and Blob egress`,
      );
    }
    return result.state as unknown as PublicSafeStateInput;
  }
  return JSON.parse(readFileSync(args.in, "utf8")) as PublicSafeStateInput;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const state = await readSourceState(args);
  const ledger = deriveLedgerFromPublicSafeState(state, {
    asOf: args.asOf,
    ledgerId: args.ledgerId,
    notes: args.notes,
    sourcePolicy: args.sourcePolicy,
  });

  const json = JSON.stringify(ledger, null, 2);
  if (args.out) {
    writeFileSync(args.out, json + "\n", "utf8");
    process.stderr.write(
      `Wrote ${ledger.ledgerId} (${ledger.results.length} rows, source=${args.source}) -> ${args.out}\n`,
    );
  } else {
    process.stdout.write(json + "\n");
  }
}

main();
