/**
 * Production live-state smoke-check RUNNER (PR-81).
 * ------------------------------------------------
 * Operator tool: fetches a public `/api/live-state` URL and asserts the live-state
 * invariants via the pure checker (`smoke-check.ts`). Run AFTER the live-state write
 * workflow has refreshed the Blob on latest main (see docs/LIVE_STATE_RUNBOOK.md).
 *
 *   LIVE_STATE_URL=https://<host>/api/live-state npm run live:state:smoke
 *   npm run live:state:smoke -- --url https://<host>/api/live-state
 *   npm run live:state:smoke -- --url <url> --phase structural --max-age-hours 24
 *
 * It reads ONLY a public app URL (no football-data fetch, no Blob, no tokens). Exits 0
 * when all asserts pass, 1 otherwise (failing checks printed first).
 */
import { runLiveStateSmokeCheck, type SmokePhase } from "./smoke-check";

function valueOf(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const url = valueOf(argv, "--url") ?? process.env.LIVE_STATE_URL;
  const phaseArg = valueOf(argv, "--phase") ?? "post-group";
  const phase: SmokePhase = phaseArg === "structural" ? "structural" : "post-group";
  const maxAgeHours = Number(valueOf(argv, "--max-age-hours") ?? process.env.LIVE_STATE_MAX_AGE_HOURS ?? "24");

  if (!url) {
    process.stderr.write("FAIL: no URL. Pass --url <url> or set LIVE_STATE_URL.\n");
    process.exitCode = 1;
    return;
  }

  let body: unknown;
  try {
    const res = await fetch(url, { cache: "no-store" });
    body = await res.json();
  } catch (err) {
    process.stderr.write(`FAIL: could not fetch/parse ${url} (${(err as Error).message})\n`);
    process.exitCode = 1;
    return;
  }

  const report = runLiveStateSmokeCheck(body, { phase, maxAgeHours });
  const f = report.fields;

  const lines: string[] = [];
  lines.push(`${report.ok ? "PASS" : "FAIL"}  live-state smoke check (phase=${report.phase})  ${url}`);
  if (!report.ok) {
    lines.push("");
    lines.push("Failing checks:");
    for (const x of report.failures) lines.push(`  x ${x.name}: ${x.detail}`);
  }
  lines.push("");
  lines.push("Snapshot:");
  lines.push(`  servedFrom          ${f.servedFrom ?? "(none)"}`);
  lines.push(`  sourceObjectPath    ${f.sourceObjectPath ?? "(none)"}`);
  lines.push(`  providerDerivedBlocked ${String(f.providerDerivedBlocked)}`);
  lines.push(`  isProviderDerived   ${String(f.isProviderDerived)}`);
  lines.push(`  publicSourcePolicy  ${f.publicSourcePolicy ?? "(none)"}`);
  lines.push(`  asOf                ${f.asOf ?? "(none)"}`);
  lines.push(`  generatedAt         ${f.generatedAt ?? "(none)"}`);
  lines.push(`  status / freshness  ${f.status ?? "?"} / ${f.freshness ?? "?"}`);
  lines.push(`  matches / standings / bracket  ${f.matches} / ${f.standings} / ${f.bracket}`);
  lines.push(`  third-place         ${f.thirdPlace.qualified} qualified / ${f.thirdPlace.eliminated} eliminated / ${f.thirdPlace.undecided} undecided`);
  lines.push(`  round of 32         ${f.r32.resolved} resolved / ${f.r32.partial} partial / ${f.r32.unresolved} unresolved (of ${f.r32.total})`);
  lines.push(`  leak scan           ${f.leakHits.length === 0 ? "clean" : "LEAK: " + f.leakHits.join(", ")}`);
  if (report.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const w of report.warnings) lines.push(`  ! ${w.name}: ${w.detail}`);
  }

  process.stdout.write(lines.join("\n") + "\n");
  process.exitCode = report.ok ? 0 : 1;
}

void main();
