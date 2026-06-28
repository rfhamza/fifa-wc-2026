/**
 * Derive a public-safe results ledger from a committed public-safe live-state
 * (Phase 1.29, PR-3C). Reusable, offline, deterministic.
 *
 *   vite-node scripts/derive-results-ledger.ts -- \
 *     --in data/live/public-safe-sample.json \
 *     --as-of 2026-06-25 \
 *     --out data/forecast/results/results-as-of-2026-06-25-after-match-054.json
 *
 * It reads ONLY a committed public-safe live-state JSON, keeps only completed
 * group-stage matches (matchNumber <= 72), maps each onto the official fixture's
 * canonical home/away orientation (goals mapped by team identity), and writes a
 * schema-valid ledger containing only the sanitized ledger fields. It validates
 * the result against both the ledger schema and the official fixtures, and never
 * fetches anything, reads Blob, or requires env vars. No provider IDs, payloads,
 * tokens, Blob URLs, odds, referees or crests are read or written.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fixtures } from "@/lib/data";
import type { Fixture } from "@/lib/types";
import {
  FORECAST_RESULTS_SCHEMA_VERSION,
  validateResultsLedger,
  validateResultsLedgerAgainstFixtures,
  type ForecastResultsLedger,
  type ResultLedgerRow,
} from "../lib/model/forecast-results-ledger";

const GROUP_STAGE_MAX_MATCH = 72;

/** Minimal shape of the public-safe live-state fields this helper consumes. */
interface PublicSafeMatchLike {
  matchNumber: number;
  stage: string;
  status: string;
  teamA: string;
  teamB: string;
  goalsA: number;
  goalsB: number;
  kickoff?: string;
}
interface PublicSafeLiveStateLike {
  asOf?: string;
  publicSourcePolicy?: string;
  matches: PublicSafeMatchLike[];
}

interface CliArgs {
  in: string;
  asOf?: string;
  ledgerId?: string;
  notes?: string;
  out?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { in: "data/live/public-safe-sample.json" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    const next = () => argv[++i];
    switch (a) {
      case "--in": args.in = next() ?? args.in; break;
      case "--as-of": args.asOf = next(); break;
      case "--ledger-id": args.ledgerId = next(); break;
      case "--notes": args.notes = next(); break;
      case "--out": args.out = next(); break;
      default:
        if (a.startsWith("--")) throw new Error(`Unknown flag: ${a}`);
    }
  }
  return args;
}

function deriveLedger(state: PublicSafeLiveStateLike, args: CliArgs): ForecastResultsLedger {
  const fixtureByMatchNumber = new Map<number, Fixture>();
  for (const f of fixtures) {
    if (typeof f.matchNumber === "number") fixtureByMatchNumber.set(f.matchNumber, f);
  }

  const completedGroup = state.matches
    .filter((m) => m.stage === "group" && m.status === "complete" && m.matchNumber <= GROUP_STAGE_MAX_MATCH)
    .sort((a, b) => a.matchNumber - b.matchNumber);

  const results: ResultLedgerRow[] = completedGroup.map((m) => {
    const fixture = fixtureByMatchNumber.get(m.matchNumber);
    if (!fixture) {
      throw new Error(`derive: matchNumber ${m.matchNumber} is not an official group-stage fixture`);
    }
    const teamSet = new Set([fixture.homeTeamId, fixture.awayTeamId]);
    if (!teamSet.has(m.teamA) || !teamSet.has(m.teamB) || m.teamA === m.teamB) {
      throw new Error(
        `derive: M${m.matchNumber} teams {${m.teamA}, ${m.teamB}} do not match fixture ` +
          `{${fixture.homeTeamId}, ${fixture.awayTeamId}}`,
      );
    }
    // Map goals onto the fixture's canonical home/away by team identity.
    const aIsHome = m.teamA === fixture.homeTeamId;
    return {
      matchNumber: m.matchNumber,
      stage: "group",
      group: fixture.group,
      homeTeamId: fixture.homeTeamId,
      awayTeamId: fixture.awayTeamId,
      homeGoals: aIsHome ? m.goalsA : m.goalsB,
      awayGoals: aIsHome ? m.goalsB : m.goalsA,
      status: "complete",
      ...(m.kickoff ? { playedAt: m.kickoff } : {}),
    };
  });

  const asOf = args.asOf ?? state.asOf ?? "";
  const asOfDate = asOf.slice(0, 10);
  const ledgerId =
    args.ledgerId ?? `results-as-of-${asOfDate}-after-match-${String(results.length).padStart(3, "0")}`;

  return {
    schemaVersion: FORECAST_RESULTS_SCHEMA_VERSION,
    ledgerId,
    asOf: state.asOf ?? asOf,
    sourcePolicy: state.publicSourcePolicy ?? "manual-snapshot",
    notes:
      args.notes ??
      "Derived from the committed public-safe manual sample. Historical/manual checkpoint; " +
        "no raw provider payloads or provider IDs. Not the latest provider-derived live-state.",
    results,
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const state = JSON.parse(readFileSync(args.in, "utf8")) as PublicSafeLiveStateLike;
  const ledger = deriveLedger(state, args);

  const errors = [
    ...validateResultsLedger(ledger),
    ...validateResultsLedgerAgainstFixtures(ledger, fixtures),
  ];
  if (errors.length > 0) {
    throw new Error(`Derived ledger failed validation:\n- ${errors.join("\n- ")}`);
  }

  const json = JSON.stringify(ledger, null, 2);
  if (args.out) {
    writeFileSync(args.out, json + "\n", "utf8");
    process.stderr.write(`Wrote ${ledger.ledgerId} (${ledger.results.length} rows) -> ${args.out}\n`);
  } else {
    process.stdout.write(json + "\n");
  }
}

main();
