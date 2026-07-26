/**
 * Post-tournament retrospective (PR A) - artifact derivation.
 * ----------------------------------------------------------
 * Reads the three FINAL sanitized Vercel Blob exports and writes the read-only
 * retrospective input artifacts under `data/retrospective/`.
 *
 * Why this script exists: the provider folds a penalty shootout into `score.fullTime`, so
 * a shootout match arrives with an INFLATED, decisive-looking score (e.g. 4-5 with a 3-4
 * shootout, when the match was actually 1-1). Deriving a ledger from that directly would
 * silently record 4-5, DROP the shootout (penalties are only attached to a level score),
 * and still pass validation - because 4-5 reads as a decisive win for the higher scorer.
 *
 * The correction is deliberately RETROSPECTIVE-LOCAL: this script normalises the input
 * state, then hands it to the UNMODIFIED production `deriveLedgerFromPublicSafeState`,
 * which re-orients group rows onto official fixtures, resolves knockout winners, attaches
 * the shootout (now that the base score is genuinely level) and validates the whole ledger
 * against the schema + official fixtures. Production ingestion (`lib/live-ingest`,
 * `lib/live-state`) is NOT touched; the upstream fix is filed as a report recommendation.
 *
 * Usage:
 *   npx vite-node --config vitest.config.ts scripts/retrospective/derive-retrospective-artifacts.ts \
 *     --live <live-state.provider.sanitized.json> \
 *     --matches <forecast-matches.provider.sanitized.json> \
 *     --current <forecast-current.provider.sanitized.json>
 *
 * Writes nothing to Blob, fetches nothing, reads no token.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveLedgerFromPublicSafeState } from "../../lib/model/forecast-results-ledger";

const OUT_DIR = join(process.cwd(), "data", "retrospective");
const SOURCE_LIVE_OBJECT = "live-state.provider.sanitized.json";
const SOURCE_MATCHES_OBJECT = "forecast-matches.provider.sanitized.json";
const SOURCE_CURRENT_OBJECT = "forecast-current.provider.sanitized.json";

interface RawMatch {
  matchNumber: number;
  stage: string;
  status: string;
  teamA: string;
  teamB: string;
  goalsA?: number;
  goalsB?: number;
  winner?: string;
  penalties?: { a: number; b: number };
  [k: string]: unknown;
}

/** One corrected shootout row, recorded for the manifest audit trail. */
export interface ShootoutCorrection {
  matchNumber: number;
  storedHomeGoals: number;
  storedAwayGoals: number;
  penaltiesHome: number;
  penaltiesAway: number;
  correctedHomeGoals: number;
  correctedAwayGoals: number;
}

/**
 * Recover the regulation(+ET) score on shootout rows. Detection is GENERIC - any knockout
 * row that carries a shootout yet stores a non-level score is treated as provider-inflated
 * - never a hardcoded match list. Throws if a correction does not yield a level score, or
 * if the shootout winner disagrees with the recorded winner, so a wrong assumption fails
 * loudly instead of silently producing bad data.
 */
export function correctShootoutScores(matches: RawMatch[]): {
  matches: RawMatch[];
  corrections: ShootoutCorrection[];
} {
  const corrections: ShootoutCorrection[] = [];
  const out = matches.map((m) => {
    const pens = m.penalties;
    if (!pens || m.status !== "complete") return m;
    if (typeof m.goalsA !== "number" || typeof m.goalsB !== "number") return m;
    // Already level => the provider did not fold the shootout in; nothing to correct.
    if (m.goalsA === m.goalsB) return m;

    const correctedA = m.goalsA - pens.a;
    const correctedB = m.goalsB - pens.b;
    if (correctedA !== correctedB) {
      throw new Error(
        `M${m.matchNumber}: score ${m.goalsA}-${m.goalsB} minus shootout ${pens.a}-${pens.b} ` +
          `gives ${correctedA}-${correctedB}, which is not level - the inflation assumption does not hold`,
      );
    }
    if (correctedA < 0 || correctedB < 0) {
      throw new Error(`M${m.matchNumber}: corrected score ${correctedA}-${correctedB} is negative`);
    }
    const shootoutWinner = pens.a > pens.b ? m.teamA : pens.b > pens.a ? m.teamB : null;
    if (!shootoutWinner) throw new Error(`M${m.matchNumber}: shootout ${pens.a}-${pens.b} is level`);
    if (m.winner && m.winner !== shootoutWinner) {
      throw new Error(
        `M${m.matchNumber}: recorded winner ${m.winner} disagrees with shootout winner ${shootoutWinner}`,
      );
    }
    corrections.push({
      matchNumber: m.matchNumber,
      storedHomeGoals: m.goalsA,
      storedAwayGoals: m.goalsB,
      penaltiesHome: pens.a,
      penaltiesAway: pens.b,
      correctedHomeGoals: correctedA,
      correctedAwayGoals: correctedB,
    });
    return { ...m, goalsA: correctedA, goalsB: correctedB };
  });
  return { matches: out, corrections };
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function writeJson(name: string, value: unknown): void {
  writeFileSync(join(OUT_DIR, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function main(): void {
  const livePath = arg("--live");
  const matchesPath = arg("--matches");
  const currentPath = arg("--current");
  if (!livePath || !matchesPath || !currentPath) {
    throw new Error("--live, --matches and --current are all required");
  }

  const live = readJson(livePath) as { matches: RawMatch[]; asOf?: string };
  const { matches, corrections } = correctShootoutScores(live.matches);

  // The UNMODIFIED production derivation does the canonical work (fixture orientation,
  // winner resolution, shootout attachment, schema + fixture validation).
  const ledger = deriveLedgerFromPublicSafeState(
    { ...live, matches } as Parameters<typeof deriveLedgerFromPublicSafeState>[0],
    {
      ledgerId: "retrospective-results-2026-07-19-after-match-104",
      sourceObjectPath: SOURCE_LIVE_OBJECT,
      sourcePolicy: "provider-public-delayed",
      notes:
        "FINAL post-tournament results ledger for the 2026 retrospective (all 104 matches). " +
        "Derived from the sanitized provider live-state export via the production " +
        "deriveLedgerFromPublicSafeState. Shootout rows carry the RETROSPECTIVE-LOCAL " +
        "regulation-score correction (provider score.fullTime folds in the shootout tally); " +
        "see data/retrospective/manifest.json. Read-only: no production loader reads this path.",
    },
  );

  writeJson("results-2026-07-19-after-match-104.json", ledger);
  // The forecast archive and the final current forecast are committed VERBATIM so they
  // stay faithful, byte-checkable copies of the exports; provenance lives in the manifest.
  const archive = readJson(matchesPath) as { matchForecasts: { stage: string }[] };
  const current = readJson(currentPath) as { snapshotId?: string; completedMatchesLocked?: number };
  writeJson("match-forecasts-archive-2026-07-19.json", archive);
  writeJson("forecast-current-2026-07-19-after-match-104.json", current);

  const byStage: Record<string, number> = {};
  for (const f of archive.matchForecasts) byStage[f.stage] = (byStage[f.stage] ?? 0) + 1;
  const finalRow = ledger.results.find((r) => r.matchNumber === 104);
  const champion = finalRow && "winnerTeamId" in finalRow ? finalRow.winnerTeamId : null;

  writeJson("manifest.json", {
    schemaVersion: "1.0.0",
    purpose:
      "Read-only INPUT artifacts for the 2026 post-tournament retrospective (PR A). Data + " +
      "validation only: no analysis, no report, no production behaviour. These files are a " +
      "frozen, validated copy of the final tournament state so the retrospective report (PR B) " +
      "can be computed deterministically from committed data.",
    // Pinned to the source export (never wall-clock) so re-running this script over the
    // same exports reproduces every artifact byte-for-byte.
    generatedAt: (live as { asOf?: string }).asOf ?? null,
    generatedBy: "scripts/retrospective/derive-retrospective-artifacts.ts",
    tournament: {
      champion,
      runnerUp: finalRow ? finalRow.homeTeamId === champion ? finalRow.awayTeamId : finalRow.homeTeamId : null,
      finalMatchNumber: 104,
      finalScore: finalRow ? `${finalRow.homeGoals}-${finalRow.awayGoals}` : null,
      matchCount: ledger.results.length,
      archivedMatchForecastCount: archive.matchForecasts.length,
    },
    artifacts: [
      {
        file: "results-2026-07-19-after-match-104.json",
        kind: "results-ledger",
        sourceObject: SOURCE_LIVE_OBJECT,
        sourceAsOf: (live as { asOf?: string }).asOf ?? null,
        derivation:
          "Shootout correction applied to the source state, then the UNMODIFIED production " +
          "deriveLedgerFromPublicSafeState (schema + official-fixture validation).",
      },
      {
        file: "match-forecasts-archive-2026-07-19.json",
        kind: "match-forecast-archive",
        sourceObject: SOURCE_MATCHES_OBJECT,
        derivation: "Committed verbatim (unmodified copy of the export).",
        archivedForecastCount: archive.matchForecasts.length,
        coverageByStage: byStage,
        coverageNote:
          "Partial by design: knockout only, 26 of 32 knockout ties. No group-stage match " +
          "forecast was ever archived. M73, M74, M75, M76, M78 and M99 have no archived " +
          "pre-match forecast. Any evaluation MUST state this coverage and must not pool " +
          "archived forecasts with recomputed ones.",
      },
      {
        file: "forecast-current-2026-07-19-after-match-104.json",
        kind: "final-current-forecast",
        sourceObject: SOURCE_CURRENT_OBJECT,
        derivation: "Committed verbatim (unmodified copy of the export).",
        snapshotId: current.snapshotId ?? null,
        completedMatchesLocked: current.completedMatchesLocked ?? null,
        terminalNote:
          "Terminal/degenerate by construction: with all 104 results locked every probability " +
          "is 0 or 1. It is an END STATE, not a forecast. The intermediate knockout-stage " +
          "title-probability path is NOT recoverable - the provider current-forecast Blob object " +
          "is overwritten on every refresh, so only this final state survives. No retrospective " +
          "may claim an intermediate knockout title-probability path from these artifacts.",
      },
    ],
    shootoutCorrection: {
      policy: "retrospective-local",
      reason:
        "The provider folds the penalty shootout into score.fullTime, so a shootout match " +
        "arrives with an inflated, decisive-looking score. Deriving directly would record the " +
        "inflated score, DROP the shootout (penalties attach only to a level score) and still " +
        "pass validation - a silent error.",
      rule:
        "Generic detection: any complete knockout row carrying a shootout whose stored score is " +
        "NOT level is corrected by subtracting the shootout tally. The corrected score must be " +
        "level and the shootout winner must match the recorded winner, else derivation throws.",
      productionUnchanged:
        "lib/live-ingest/**, lib/live-state/**, provider adapter, Blob logic and forecast " +
        "generation are NOT modified. The upstream normalize.ts fix is deferred to a report " +
        "recommendation.",
      correctedRows: corrections,
    },
    guarantees: {
      noProductionLoaderReadsThisPath: true,
      noPublicForecastSnapshotChanged: true,
      noFilesUnderDataForecast: true,
      readOnlyInputs: true,
    },
  });

  process.stdout.write(
    `Wrote ${ledger.results.length} ledger rows; corrected ${corrections.length} shootout row(s): ` +
      `${corrections.map((c) => `M${c.matchNumber} ${c.storedHomeGoals}-${c.storedAwayGoals}->${c.correctedHomeGoals}-${c.correctedAwayGoals}`).join(", ")}\n`,
  );
  process.stdout.write(`${JSON.stringify(corrections, null, 2)}\n`);
}

main();
