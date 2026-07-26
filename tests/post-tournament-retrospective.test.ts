/**
 * Post-tournament retrospective (PR B) - computation, invariants and report generation.
 * ------------------------------------------------------------------------------------
 * This test IS the machine-enforced source of truth for
 * `docs/POST_TOURNAMENT_RETROSPECTIVE_2026.md`. It recomputes the whole retrospective from
 * the PR A artifacts, asserts the headline numbers and the mandatory limitations, and:
 *
 *   - with `WRITE_RETROSPECTIVE=1`, writes the Markdown report;
 *   - otherwise (CI), asserts the COMMITTED report is byte-identical to the recomputed one,
 *     so the document can never drift from the data.
 *
 * Regenerate with:
 *   WRITE_RETROSPECTIVE=1 npx vitest run tests/post-tournament-retrospective.test.ts
 *
 * Reads only committed artifacts: no provider fetch, no Blob, no live-state.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ForecastResultsLedger } from "@/lib/model/forecast-results-ledger";
import type { ForecastSnapshot } from "@/lib/model/forecast-snapshots";
import { getBaselineSnapshot, listForecastSnapshots } from "@/lib/model/forecast-snapshot-store";
import { getPublicMilestoneLabel, isPublicMilestoneLocked } from "@/lib/model/forecast-checkpoints";
import { predictMatch } from "@/lib/model/predict";
import { fixtures, teamById, teams } from "@/lib/data";
import { deriveActualOutcomes } from "@/lib/retrospective/actual-outcomes";
import {
  buildGroupAccuracy,
  buildStageAccuracy,
  buildTeamSurprise,
  qualifyProbability,
} from "@/lib/retrospective/stage-accuracy";
import {
  evaluateGroupMatches,
  evaluateKnockoutAdvancement,
  type MatchForecastLike,
} from "@/lib/retrospective/match-accuracy";
import { evaluateScorelines } from "@/lib/retrospective/scoreline-accuracy";
import { buildRetrospectiveReport, type CheckpointInput, type DriverSummary, type RetrospectiveInput } from "@/lib/retrospective/report";

const ROOT = process.cwd();
const ARTIFACT_DIR = join(ROOT, "data", "retrospective");
const REPORT_PATH = join(ROOT, "docs", "POST_TOURNAMENT_RETROSPECTIVE_2026.md");
const readArtifact = (f: string) => JSON.parse(readFileSync(join(ARTIFACT_DIR, f), "utf8"));

const ledger = readArtifact("results-2026-07-19-after-match-104.json") as ForecastResultsLedger;
const archiveDoc = readArtifact("match-forecasts-archive-2026-07-19.json") as {
  matchForecasts: MatchForecastLike[];
};
const finalSnapshot = readArtifact("forecast-current-2026-07-19-after-match-104.json") as ForecastSnapshot;

const CHAMPION = "spain";
const RUNNER_UP = "argentina";

/* --- Build the input bundle once, exactly as the report generator consumes it ------- */

const teamMeta = teams.map((t) => ({ teamId: t.id, fifaRanking: t.fifaRanking, conductScore: 0 }));
const actual = deriveActualOutcomes(ledger, teamMeta);

const baseline = getBaselineSnapshot();
if (!baseline) throw new Error("retrospective: baseline snapshot is unavailable");

/** Committed PUBLIC checkpoints only - the dev-only M54/M73 locks are excluded by policy. */
const checkpoints: CheckpointInput[] = listForecastSnapshots()
  .filter((s) => isPublicMilestoneLocked(s.meta.completedMatchesLocked))
  .sort((a, b) => a.meta.completedMatchesLocked - b.meta.completedMatchesLocked)
  .map((s) => ({
    label: `${getPublicMilestoneLabel(s.meta.completedMatchesLocked)?.label ?? "Checkpoint"} (M${s.meta.completedMatchesLocked})`,
    completedMatchesLocked: s.meta.completedMatchesLocked,
    snapshot: s,
  }));

const archivedForecasts = archiveDoc.matchForecasts;
const archivedAdvancement = evaluateKnockoutAdvancement(ledger, archivedForecasts, "archived-pre-match-forecast");
const archivedScorelines = evaluateScorelines(ledger, archivedForecasts, "archived-pre-match-forecast", "knockout");

/**
 * Group-stage forecasts were NEVER archived, so they are recomputed from the same frozen
 * pre-tournament inputs the baseline used. Model inputs are static pre-tournament, so this
 * reproduces the day-zero forecast - but it is labelled `retrospective-model-forecast` and
 * is never pooled with the archived knockout numbers.
 */
const recomputedGroupForecasts: MatchForecastLike[] = fixtures
  .filter((f): f is typeof f & { matchNumber: number } => typeof f.matchNumber === "number")
  .map((f) => {
    const home = teamById.get(f.homeTeamId)!;
    const away = teamById.get(f.awayTeamId)!;
    const p = predictMatch(home, away);
    return {
      matchNumber: f.matchNumber,
      stage: "group",
      homeTeamId: f.homeTeamId,
      awayTeamId: f.awayTeamId,
      homeWin: p.homeWin,
      draw: p.draw,
      awayWin: p.awayWin,
      expectedHomeGoals: p.expectedHomeGoals,
      expectedAwayGoals: p.expectedAwayGoals,
      topScorelines: p.topScorelines,
      forecastProvenance: "retrospective-model-forecast",
      capturedBeforeCompletion: false,
    };
  });
const recomputedGroupMatches = evaluateGroupMatches(ledger, recomputedGroupForecasts, "retrospective-model-forecast");

const stageAccuracy = buildStageAccuracy(baseline, actual);
const groupAccuracy = buildGroupAccuracy(baseline, actual);
const surprise = buildTeamSurprise(baseline, actual);

/** Mean signed driver contributions across a team's three group fixtures. */
function driverSummaryFor(teamId: string): DriverSummary {
  const own = fixtures.filter((f) => f.homeTeamId === teamId || f.awayTeamId === teamId);
  const totals = new Map<string, number>();
  let net = 0;
  for (const f of own) {
    const home = teamById.get(f.homeTeamId)!;
    const away = teamById.get(f.awayTeamId)!;
    const isHome = f.homeTeamId === teamId;
    const { explanation } = predictMatch(home, away);
    // `contribution` is signed toward the HOME team; flip when the team is away.
    const sign = isHome ? 1 : -1;
    net += explanation.netAdvantage * sign;
    for (const d of [...explanation.positiveDrivers, ...explanation.negativeDrivers]) {
      totals.set(d.label, (totals.get(d.label) ?? 0) + d.contribution * sign);
    }
  }
  const n = Math.max(1, own.length);
  const averaged = [...totals.entries()].map(([label, v]) => ({ label, contribution: v / n }));
  return {
    teamId,
    netAdvantage: net / n,
    topSupporting: averaged.filter((d) => d.contribution > 0).sort((a, b) => b.contribution - a.contribution).slice(0, 3),
    topOpposing: averaged.filter((d) => d.contribution < 0).sort((a, b) => a.contribution - b.contribution).slice(0, 3),
  };
}

/**
 * The teams worth a driver breakdown, all DERIVED from the results rather than named: the
 * finalists and semifinalists, the extremes of the surprise ranking, the clearest
 * lower-rated run, the favourite that lost the biggest archived upset, and the most extreme
 * surprise qualifier / unexpected exit from the group stage.
 */
const byQualifyProbability = (a: string, b: string) =>
  qualifyProbability(baseline.teams.find((t) => t.teamId === a)!) -
  qualifyProbability(baseline.teams.find((t) => t.teamId === b)!);

const lowestUpsetQualifier = groupAccuracy.flatMap((g) => g.upsetQualifiers).sort(byQualifyProbability)[0];
const highestUnexpectedExit = groupAccuracy.flatMap((g) => g.unexpectedExits).sort(byQualifyProbability).at(-1);
const clearestUnderdogRun = surprise.find((r) => r.baselineTitleRank >= 11 && r.surprise > 0)?.teamId;
const biggestUpsetFavourite = archivedAdvancement.upsets[0]?.favourite;

const KEY_DRIVER_TEAMS = [
  CHAMPION,
  RUNNER_UP,
  ...actual.semiFinalists.filter((t) => t !== CHAMPION && t !== RUNNER_UP),
  clearestUnderdogRun,
  biggestUpsetFavourite,
  lowestUpsetQualifier,
  highestUnexpectedExit,
  surprise[0]!.teamId,
  surprise[surprise.length - 1]!.teamId,
].filter((t): t is string => typeof t === "string");
const drivers: DriverSummary[] = [...new Set(KEY_DRIVER_TEAMS)].map(driverSummaryFor);

const input: RetrospectiveInput = {
  ledger,
  baseline,
  checkpoints,
  finalSnapshot,
  actual,
  stageAccuracy,
  groupAccuracy,
  surprise,
  archivedAdvancement,
  recomputedGroupMatches,
  archivedScorelines,
  archivedForecasts,
  drivers,
  teamNames: new Map(teams.map((t) => [t.id, t.name])),
  annexeCScenarioProbabilitiesAvailable: false,
};

const report = buildRetrospectiveReport(input);

/* --- Assertions -------------------------------------------------------------------- */

describe("post-tournament retrospective: tournament outcome", () => {
  it("confirms Spain as champion with M104 Spain 1-0 Argentina", () => {
    expect(actual.champion).toBe(CHAMPION);
    expect(actual.runnerUp).toBe(RUNNER_UP);
    const final = ledger.results.find((r) => r.matchNumber === 104)!;
    expect(`${final.homeTeamId} ${final.homeGoals}-${final.awayGoals} ${final.awayTeamId}`).toBe(
      "spain 1-0 argentina",
    );
  });

  it("derives 32 qualifiers and 16 group-stage exits from internal logic", () => {
    expect(actual.qualifiers.length).toBe(32);
    expect(actual.eliminatedInGroup.length).toBe(16);
    expect(actual.groups.length).toBe(12);
    expect(actual.thirdPlaceQualifiers.length).toBe(8);
    expect(actual.thirdPlaceEliminated.length).toBe(4);
  });

  it("derives the full knockout ladder", () => {
    expect(actual.finalists.sort()).toEqual([RUNNER_UP, CHAMPION].sort());
    expect(actual.semiFinalists.length).toBe(4);
    expect(actual.quarterFinalists.length).toBe(8);
    expect(actual.deepestStage.get(CHAMPION)).toBe("champion");
  });
});

describe("post-tournament retrospective: champion forecast", () => {
  const ranked = [...baseline.teams].sort((a, b) => b.winner - a.winner);

  it("had the champion as the pre-tournament title favourite", () => {
    expect(ranked[0]!.teamId).toBe(CHAMPION);
    // Pinned headline: 27.90% title chance at tournament start.
    expect(ranked[0]!.winner).toBeCloseTo(0.279, 3);
  });

  it("had the runner-up ranked second pre-tournament", () => {
    expect(ranked[1]!.teamId).toBe(RUNNER_UP);
    expect(ranked[1]!.winner).toBeCloseTo(0.211, 3);
  });

  it("had all four semifinalists as its pre-tournament top four", () => {
    const rank = new Map(ranked.map((t, i) => [t.teamId, i + 1]));
    expect(actual.semiFinalists.map((t) => rank.get(t)!).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });
});

describe("post-tournament retrospective: group-stage metrics", () => {
  it("pins the group top-two and group-winner accuracy", () => {
    const exact = groupAccuracy.filter((g) => g.exactTopTwoSet).length;
    const teamHits = groupAccuracy.reduce((s, g) => s + g.correctTopTwoCount, 0);
    const winners = groupAccuracy.filter((g) => g.groupWinnerCorrect).length;
    expect({ exact, teamHits, winners }).toEqual({ exact: 7, teamHits: 19, winners: 10 });
  });

  it("pins Round-of-32 qualification accuracy", () => {
    const r32 = stageAccuracy.find((s) => s.stage === "roundOf32")!;
    expect(r32.actualCount).toBe(32);
    expect(r32.hitCount).toBe(25);
  });

  it("labels upset qualifiers and unexpected exits by the fixed thresholds", () => {
    const upsets = groupAccuracy.flatMap((g) => g.upsetQualifiers);
    const exits = groupAccuracy.flatMap((g) => g.unexpectedExits);
    expect(upsets).toContain("ghana");
    expect(exits).toContain("uruguay");
  });
});

describe("post-tournament retrospective: archived forecast coverage and accuracy", () => {
  it("uses exactly the 26 archived pre-match forecasts", () => {
    expect(archivedForecasts.length).toBe(26);
    for (const f of archivedForecasts) {
      expect(f.forecastProvenance).toBe("archived-pre-match-forecast");
      expect(f.capturedBeforeCompletion).toBe(true);
    }
  });

  it("pins knockout advancement accuracy over the archived set", () => {
    expect(archivedAdvancement.provenance).toBe("archived-pre-match-forecast");
    expect(archivedAdvancement.coverage.evaluated).toBe(26);
    expect(archivedAdvancement.coverage.total).toBe(32);
    expect(archivedAdvancement.coverage.missing).toEqual([73, 74, 75, 76, 78, 99]);
    expect(archivedAdvancement.correct).toBe(22);
    expect(archivedAdvancement.accuracy).toBeCloseTo(22 / 26, 6);
    expect(archivedAdvancement.upsetCount).toBe(4);
  });

  it("has confidence correctly ordered between correct and incorrect calls", () => {
    expect(archivedAdvancement.averageConfidenceCorrect).toBeGreaterThan(
      archivedAdvancement.averageConfidenceMiss,
    );
  });

  it("keeps the group evaluation on a separate, clearly-labelled provenance", () => {
    expect(recomputedGroupMatches.provenance).toBe("retrospective-model-forecast");
    expect(recomputedGroupMatches.coverage.evaluated).toBe(72);
    expect(recomputedGroupMatches.coverage.missing).toEqual([]);
    // The two evaluations must never be merged into one object.
    expect(recomputedGroupMatches).not.toBe(archivedAdvancement);
  });
});

describe("post-tournament retrospective: scoreline coverage and metrics", () => {
  it("reports coverage rather than silently scoring a subset", () => {
    expect(archivedScorelines.coverage.total).toBe(32);
    expect(archivedScorelines.coverage.withForecast).toBe(26);
    expect(archivedScorelines.coverage.withoutForecast).toBe(6);
    expect(archivedScorelines.coverage.missingMatchNumbers).toEqual([73, 74, 75, 76, 78, 99]);
  });

  it("evaluates against regulation-corrected scores", () => {
    // M96 was 0-0 after extra time and settled 4-3 on penalties; the corrected ledger
    // score - not the provider's inflated 4-3 - is what the scoreline is judged against.
    const m96 = archivedScorelines.rows.find((r) => r.matchNumber === 96)!;
    expect({ home: m96.actualHomeGoals, away: m96.actualAwayGoals }).toEqual({ home: 0, away: 0 });
    expect(m96.decidedOnPenalties).toBe(true);
  });

  it("pins the headline scoreline metrics", () => {
    expect(archivedScorelines.exactHits).toBe(3);
    expect(archivedScorelines.exactHitRate).toBeCloseTo(3 / 26, 6);
    expect(archivedScorelines.meanAbsoluteGoalError).toBeGreaterThan(0);
  });
});

describe("post-tournament retrospective: calibration", () => {
  it("produces a full reliability ladder for every stage", () => {
    for (const row of stageAccuracy) {
      expect(row.observations.length).toBe(48);
    }
  });

  it("has one realised champion and two finalists among the observations", () => {
    const title = stageAccuracy.find((s) => s.stage === "winner")!;
    const final = stageAccuracy.find((s) => s.stage === "final")!;
    expect(title.observations.filter((o) => o.occurred).length).toBe(1);
    expect(final.observations.filter((o) => o.occurred).length).toBe(2);
  });
});

describe("post-tournament retrospective: report content", () => {
  it("declares the machine-enforced source of truth", () => {
    expect(report).toContain("tests/post-tournament-retrospective.test.ts");
    expect(report).toContain("This Markdown report is the readable retrospective generated from the validated artifacts.");
  });

  it("contains every required section", () => {
    for (const heading of [
      "## 1. Executive summary",
      "## 2. Forecast timeline",
      "## 3. Champion forecast retrospective",
      "## 4. Group-stage retrospective",
      "## 5. Third-place qualification retrospective",
      "## 6. Knockout reach-stage retrospective",
      "## 7. Bracket path retrospective",
      "## 8. Match-level prediction retrospective",
      "## 9. Scoreline-level retrospective",
      "## 10. Probability calibration retrospective",
      "## 11. Overperformers and underperformers",
      "## 12. Model driver retrospective",
      "## 13. Product retrospective",
      "## 14. Recommendations for the next version",
      "## 15. Limitations",
    ]) {
      expect(report).toContain(heading);
    }
  });

  it("states every mandatory limitation", () => {
    expect(report).toContain("Archived versus recomputed forecasts");
    expect(report).toContain("No knockout title-probability path");
    expect(report).toContain("No scenario-level Annexe C probabilities");
    expect(report).toContain("The shootout correction was retrospective-local");
    expect(report).toContain("No 90-minute / extra-time split");
    expect(report).toContain("No production model change");
  });

  it("uses public stage labels and avoids banned metric wording", () => {
    expect(report).toContain("Title chance");
    expect(report).toContain("Reach round of 16");
    for (const banned of ["win %", "final %", "small team", "weak team", "fluke", "giant killing"]) {
      expect({ banned, present: report.toLowerCase().includes(banned) }).toEqual({ banned, present: false });
    }
  });

  it("labels both forecast provenances wherever match numbers appear", () => {
    expect(report).toContain("archived-pre-match-forecast");
    expect(report).toContain("retrospective-model-forecast");
  });

  it("is ASCII-only", () => {
    const offenders = [...report].filter((ch) => ch.charCodeAt(0) > 127);
    expect(offenders).toEqual([]);
  });

  it("is deterministic across rebuilds", () => {
    expect(buildRetrospectiveReport(input)).toBe(report);
  });
});

describe("post-tournament retrospective: generated document", () => {
  it("matches the committed report (or writes it under WRITE_RETROSPECTIVE=1)", () => {
    if (process.env.WRITE_RETROSPECTIVE === "1") {
      writeFileSync(REPORT_PATH, report, "utf8");
      return;
    }
    const committed = readFileSync(REPORT_PATH, "utf8");
    expect(committed).toBe(report);
  });
});
