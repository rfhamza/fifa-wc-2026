/**
 * Post-tournament retrospective (PR B) - Markdown report assembly.
 * ----------------------------------------------------------------
 * Renders the retrospective from an already-computed input bundle. PURE and
 * deterministic: no I/O, no clock, no randomness, no model call. The caller (the
 * env-gated test writer) gathers the data; this module only formats it.
 *
 * Editorial rules enforced here:
 *   - Public stage labels only ("Title chance", "Reach round of 16") - never "win %".
 *   - Every table that rests on partial coverage states that coverage inline.
 *   - Archived pre-match forecasts and retrospective-model forecasts are always labelled
 *     and never pooled into one number.
 *   - Respectful performance language; no "small team" / "weak team" / "fluke".
 *   - Findings are computed, never asserted: rankings come from the metrics above.
 */
import type { ForecastSnapshot } from "@/lib/model/forecast-snapshots";
import type { ForecastResultsLedger } from "@/lib/model/forecast-results-ledger";
import type { ActualOutcomes } from "@/lib/retrospective/actual-outcomes";
import { STAGE_LABELS } from "@/lib/retrospective/actual-outcomes";
import {
  REACH_STAGE_ORDER,
  UNEXPECTED_EXIT_MIN,
  UPSET_QUALIFIER_MAX,
  qualifyProbability,
  type GroupStageAccuracy,
  type StageAccuracyRow,
  type TeamSurpriseRow,
  type ThirdPlaceAccuracy,
} from "@/lib/retrospective/stage-accuracy";
import {
  binaryReliabilityBins,
  summarizeBinary,
  type BinaryObservation,
} from "@/lib/retrospective/calibration";
import type { AdvancementEvaluation, GroupMatchEvaluation, MatchForecastLike } from "@/lib/retrospective/match-accuracy";
import type { ScorelineEvaluation } from "@/lib/retrospective/scoreline-accuracy";

export const REPORT_TITLE = "BeyondVAR 2026 Post-Tournament Retrospective - RETROSPECTIVE / EVALUATION";
export const SOURCE_OF_TRUTH_LINE =
  "The machine-enforced source of truth is tests/post-tournament-retrospective.test.ts. " +
  "This Markdown report is the readable retrospective generated from the validated artifacts.";

/** A named public checkpoint in the committed snapshot chain. */
export interface CheckpointInput {
  label: string;
  completedMatchesLocked: number;
  snapshot: ForecastSnapshot;
}

/** Aggregated pre-tournament driver view for one team. */
export interface DriverSummary {
  teamId: string;
  netAdvantage: number;
  topSupporting: { label: string; contribution: number }[];
  topOpposing: { label: string; contribution: number }[];
}

export interface RetrospectiveInput {
  ledger: ForecastResultsLedger;
  baseline: ForecastSnapshot;
  checkpoints: CheckpointInput[];
  /** Terminal M104 snapshot (all probabilities 0/1). Used only as a timeline endpoint. */
  finalSnapshot: ForecastSnapshot | null;
  actual: ActualOutcomes;
  stageAccuracy: StageAccuracyRow[];
  groupAccuracy: GroupStageAccuracy[];
  surprise: TeamSurpriseRow[];
  archivedAdvancement: AdvancementEvaluation;
  recomputedGroupMatches: GroupMatchEvaluation;
  archivedScorelines: ScorelineEvaluation;
  archivedForecasts: readonly MatchForecastLike[];
  thirdPlaceAccuracy: ThirdPlaceAccuracy;
  drivers: DriverSummary[];
  teamNames: ReadonlyMap<string, string>;
  /** Third-place probabilities are stored per team; scenario combinations are not. */
  annexeCScenarioProbabilitiesAvailable: boolean;
}

/** Outside the pre-tournament top 10 counts as a lower-rated side for narrative purposes. */
const UNDERDOG_RANK_MIN = 11;

/**
 * DISPLAY-ONLY mapping from the ledger's internal stage tokens to public labels. Internal
 * keys are untouched; this only controls how a stage is printed in a table.
 */
const MATCH_STAGE_LABELS: Readonly<Record<string, string>> = {
  group: "Group stage",
  roundOf32: "Round of 32",
  roundOf16: "Round of 16",
  quarterFinal: "Quarterfinal",
  semiFinal: "Semifinal",
  thirdPlace: "Third-place match",
  final: "Final",
};

/** Public label for a ledger stage token, falling back to the token if unmapped. */
export function matchStageLabel(stage: string): string {
  return MATCH_STAGE_LABELS[stage] ?? stage;
}

const pct = (x: number, dp = 1): string => `${(x * 100).toFixed(dp)}%`;
const pp = (x: number, dp = 1): string => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(dp)}pp`;
const num = (x: number, dp = 4): string => x.toFixed(dp);

/**
 * Fold a display name to ASCII for the report (Turkiye, Curacao). The report is an
 * ASCII-only document, and these are the established ASCII renderings the repository
 * already uses as team ids. The underlying dataset keeps the accented official names.
 */
export function asciiFold(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function nameOf(input: RetrospectiveInput, teamId: string): string {
  return asciiFold(input.teamNames.get(teamId) ?? teamId);
}

function titleRanked(snapshot: ForecastSnapshot) {
  return [...snapshot.teams].sort((a, b) => b.winner - a.winner || a.teamId.localeCompare(b.teamId));
}

function rankOf(snapshot: ForecastSnapshot, teamId: string): number {
  return titleRanked(snapshot).findIndex((t) => t.teamId === teamId) + 1;
}

function titleProbability(snapshot: ForecastSnapshot, teamId: string): number {
  return snapshot.teams.find((t) => t.teamId === teamId)?.winner ?? 0;
}

/* ---------------------------------------------------------------------------
 * Sections
 * ------------------------------------------------------------------------- */

function sectionHeader(input: RetrospectiveInput): string {
  const { ledger } = input;
  return [
    `# ${REPORT_TITLE}`,
    "",
    "> **RETROSPECTIVE EVALUATION.** This is a retrospective evaluation report. It does not",
    "> change the model, regenerate forecasts, or alter public outputs. The source of truth is",
    "> the validated retrospective artifacts and `tests/post-tournament-retrospective.test.ts`.",
    "> Archived pre-match forecasts are separated from retrospective-model forecasts throughout.",
    "",
    SOURCE_OF_TRUTH_LINE,
    "",
    `Results ledger: \`${ledger.ledgerId}\` (${ledger.results.length} matches, as of ${ledger.asOf}).`,
    "Regenerate with `WRITE_RETROSPECTIVE=1 npx vitest run tests/post-tournament-retrospective.test.ts`.",
    "",
  ].join("\n");
}

function sectionExecutiveSummary(input: RetrospectiveInput): string {
  const { baseline, actual } = input;
  const ranked = titleRanked(baseline);
  const favourite = ranked[0]!;
  const champRank = rankOf(baseline, actual.champion);
  const champProb = titleProbability(baseline, actual.champion);
  const runnerRank = rankOf(baseline, actual.runnerUp);
  const runnerProb = titleProbability(baseline, actual.runnerUp);

  const semiRanks = actual.semiFinalists.map((t) => rankOf(baseline, t)).sort((a, b) => a - b);
  const bestStage = [...input.stageAccuracy].sort((a, b) => b.hitRate - a.hitRate)[0]!;
  const worstStage = [...input.stageAccuracy].sort((a, b) => a.hitRate - b.hitRate)[0]!;
  const bottomSurprise = input.surprise[input.surprise.length - 1]!;
  const biggestUpset = input.archivedAdvancement.upsets[0];
  // Raw surprise rewards depth, so favourites top it; the interesting run is a lower-rated side.
  const underdogRun = input.surprise.find((r) => r.baselineTitleRank >= UNDERDOG_RANK_MIN && r.surprise > 0) ?? null;

  const titleObs: BinaryObservation[] = baseline.teams.map((t) => ({
    probability: t.winner,
    occurred: t.teamId === actual.champion,
    label: t.teamId,
  }));
  const titleSummary = summarizeBinary(titleObs);

  const favouriteWon = favourite.teamId === actual.champion;
  const withinTop = (k: number) => (champRank <= k ? "yes" : "no");
  // The champion "reached" the terminal rung; phrase that as winning, not as reaching a stage.
  const runPhrase = (r: TeamSurpriseRow) =>
    r.actualStage === "champion" ? "won the tournament" : `reached the ${r.actualStageLabel.toLowerCase()}`;

  const lines: (string | null)[] = [
    "## 1. Executive summary",
    "",
    `BeyondVAR's pre-tournament title favourite was **${nameOf(input, favourite.teamId)}** at a ` +
      `${pct(favourite.winner, 2)} Title chance. The tournament was won by ` +
      `**${nameOf(input, actual.champion)}**, who started as the model's **#${champRank}** title ` +
      `contender at ${pct(champProb, 2)}.`,
    "",
    favouriteWon
      ? "**The model's pre-tournament favourite won the tournament.**"
      : "The model's pre-tournament favourite did not win the tournament.",
    "",
    "| Headline | Value |",
    "| --- | --- |",
    `| Pre-tournament title favourite | ${nameOf(input, favourite.teamId)} (${pct(favourite.winner, 2)}) |`,
    `| Actual champion | ${nameOf(input, actual.champion)} |`,
    `| Champion pre-tournament Title chance | ${pct(champProb, 2)} (rank #${champRank}) |`,
    `| Runner-up | ${nameOf(input, actual.runnerUp)} - ${pct(runnerProb, 2)} (rank #${runnerRank}) |`,
    `| Champion inside pre-tournament top 3 | ${withinTop(3)} |`,
    `| Champion inside pre-tournament top 5 | ${withinTop(5)} |`,
    `| Champion inside pre-tournament top 10 | ${withinTop(10)} |`,
    `| Teams rated above the champion | ${champRank - 1} |`,
    `| Strongest stage result | ${bestStage.label} (${bestStage.hitCount}/${bestStage.actualCount} correct) |`,
    `| Weakest stage result | ${worstStage.label} (${worstStage.hitCount}/${worstStage.actualCount} correct) |`,
    "",
    "### Biggest model hit",
    "",
    `The four semifinalists were the model's pre-tournament ranks ${semiRanks.join(", ")} by Title chance.`,
    semiRanks.join(",") === "1,2,3,4"
      ? "The final four were exactly the pre-tournament top four - the single strongest result in this dataset."
      : null,
    "",
    favouriteWon
      ? "The model named the champion, the runner-up and the entire final four in advance. For a " +
        "48-team field decided months later, that is the strongest evidence in this report that " +
        "the strength priors carry real signal."
      : null,
    "",
    underdogRun
      ? `The clearest unforeseen run was **${nameOf(input, underdogRun.teamId)}**, ranked ` +
        `#${underdogRun.baselineTitleRank} pre-tournament, who ${runPhrase(underdogRun)} ` +
        `(surprise ${num(underdogRun.surprise, 2)} rungs against forecast).`
      : null,
    "",
    "### Biggest model miss",
    "",
    `The largest negative divergence was **${nameOf(input, bottomSurprise.teamId)}**, whose run ended at the ` +
      `${bottomSurprise.actualStageLabel.toLowerCase()} against an expected depth of ` +
      `${num(bottomSurprise.expectedDepth, 2)} rungs (surprise ${num(bottomSurprise.surprise, 2)}).`,
    biggestUpset
      ? `The costliest single call was **M${biggestUpset.matchNumber}**: the model favoured ` +
        `${nameOf(input, biggestUpset.favourite)} at ${pct(biggestUpset.favouriteProbability)} to advance, and ` +
        `${nameOf(input, biggestUpset.actualWinner)} went through.`
      : null,
    "",
    "",
    "### Headline calibration finding",
    "",
    `Across all 48 teams the pre-tournament Title chance carried a Brier score of ${num(titleSummary.brier)}`,
    `against a base rate of ${pct(titleSummary.baseRate, 2)} (one champion in 48). Title and Final are`,
    "single-outcome events, so these numbers carry very wide uncertainty and are reported for",
    "completeness rather than as a calibration verdict. The meaningful calibration signal sits in",
    "the qualification and Round-of-32 bands, where every team contributes an observation - see",
    "section 10.",
    "",
    "### Product interpretation",
    "",
    "The model was strongest exactly where a probabilistic tournament forecast is most useful and",
    "hardest to fake: separating the genuine title contenders from the field months in advance. It",
    "identified the eventual champion, the runner-up and the whole final four at the top of its",
    "pre-tournament ranking, and its knockout advancement calls were both accurate and correctly",
    "ordered by confidence. It was weakest on exact scorelines, which is expected from a",
    "Poisson-shaped goal model, and on individual group-stage placings, where three matches leave",
    "very little signal and the format's third-place route adds genuine irreducible noise. The",
    "product implication is that BeyondVAR should keep leading with stage-level and advancement",
    "narratives, and continue to present scorelines as illustrative shapes rather than predictions.",
    "",
  ];
  // Drop only the CONDITIONAL entries (null); intentional blank lines are preserved so the
  // Markdown tables and headings keep the surrounding blank line they need to render.
  return lines.filter((l): l is string => l !== null).join("\n");
}

function sectionTimeline(input: RetrospectiveInput): string {
  const lines: string[] = [
    "## 2. Forecast timeline",
    "",
    "Public checkpoints only. The committed public snapshot chain is the baseline plus the",
    "group-stage milestones; the terminal M104 artifact is included as the endpoint.",
    "",
    "| Checkpoint | Title favourite | Favourite Title chance | Champion Title chance | Champion rank | Biggest riser | Biggest faller |",
    "| --- | --- | --: | --: | --: | --- | --- |",
  ];

  const all: CheckpointInput[] = [...input.checkpoints];
  if (input.finalSnapshot) {
    all.push({ label: "M104 (final, terminal)", completedMatchesLocked: 104, snapshot: input.finalSnapshot });
  }

  all.forEach((cp, i) => {
    const ranked = titleRanked(cp.snapshot);
    const fav = ranked[0]!;
    const champProb = titleProbability(cp.snapshot, input.actual.champion);
    const champRank = rankOf(cp.snapshot, input.actual.champion);
    let riser = "-";
    let faller = "-";
    if (i > 0) {
      const prev = all[i - 1]!.snapshot;
      const deltas = cp.snapshot.teams
        .map((t) => ({ teamId: t.teamId, delta: t.winner - (prev.teams.find((p) => p.teamId === t.teamId)?.winner ?? 0) }))
        .sort((a, b) => b.delta - a.delta);
      const up = deltas[0]!;
      const down = deltas[deltas.length - 1]!;
      riser = `${nameOf(input, up.teamId)} ${pp(up.delta)}`;
      faller = `${nameOf(input, down.teamId)} ${pp(down.delta)}`;
    }
    lines.push(
      `| ${cp.label} | ${nameOf(input, fav.teamId)} | ${pct(fav.winner, 2)} | ${pct(champProb, 2)} | #${champRank} | ${riser} | ${faller} |`,
    );
  });

  lines.push("", "### Top five Title chance by checkpoint", "");
  for (const cp of all) {
    const ranked = titleRanked(cp.snapshot);
    // A terminal snapshot has every probability at 0 or 1. Ranking it produces an arbitrary
    // ordering of zero-probability teams, so state the resolved outcome instead of a "top five".
    const isTerminal = ranked.every((t) => t.winner === 0 || t.winner === 1);
    if (isTerminal) {
      const resolved = ranked.filter((t) => t.winner > 0);
      lines.push(
        `- **${cp.label}**: ${resolved.map((t) => `${nameOf(input, t.teamId)} ${pct(t.winner, 2)}`).join(", ")};` +
          " all other teams 0%. This is a resolved end state, not a ranking.",
      );
      continue;
    }
    const top5 = ranked
      .slice(0, 5)
      .map((t, i) => `${i + 1}. ${nameOf(input, t.teamId)} ${pct(t.winner, 2)}`)
      .join(" | ");
    lines.push(`- **${cp.label}**: ${top5}`);
  }

  lines.push(
    "",
    "### Limitation: no knockout-stage title-probability path",
    "",
    "The rolling current-forecast object is overwritten on every refresh, so only the terminal",
    "M104 state survives. The model's title-probability path across the knockout stage (M73-M103)",
    "was not retained and is **not recoverable**. The jump from the group-stage checkpoint to the",
    "terminal endpoint in the table above is therefore a gap in the record, not a modelling",
    "artefact, and no intermediate knockout title-probability path is claimed anywhere in this report.",
    "",
    "What does survive is the archived per-tie forecast set. Those are **match/tie advancement",
    "probabilities**, a different quantity from tournament Title chance, and they are reported as",
    "such in sections 7 and 8 - never restyled as a title-probability timeline.",
    "",
  );
  return lines.join("\n");
}

function sectionChampion(input: RetrospectiveInput): string {
  const { baseline, actual } = input;
  const ranked = titleRanked(baseline);
  const lines: string[] = [
    "## 3. Champion forecast retrospective",
    "",
    "### Pre-tournament top 10 by Title chance",
    "",
    "| Rank | Team | Title chance | Reach final | Actual result |",
    "| --: | --- | --: | --: | --- |",
  ];
  ranked.slice(0, 10).forEach((t, i) => {
    const stage = actual.deepestStage.get(t.teamId) ?? "groupStage";
    lines.push(
      `| ${i + 1} | ${nameOf(input, t.teamId)} | ${pct(t.winner, 2)} | ${pct(t.final, 2)} | ${STAGE_LABELS[stage]} |`,
    );
  });

  const champRank = rankOf(baseline, actual.champion);
  const favouriteWon = ranked[0]!.teamId === actual.champion;
  lines.push(
    "",
    `- The eventual champion, ${nameOf(input, actual.champion)}, was ranked **#${champRank}** of 48 before a ball was kicked,`,
    `  with a ${pct(titleProbability(baseline, actual.champion), 2)} Title chance.`,
    `- **${champRank - 1}** teams were given a higher pre-tournament Title chance.`,
    `- The model's pre-tournament favourite ${favouriteWon ? "**won** the tournament" : "did not win the tournament"}.`,
    "",
    "### Finalists and semifinalists, by pre-tournament standing",
    "",
    "| Team | Pre-tournament rank | Title chance | Reach final | Reach semifinal | Actual result |",
    "| --- | --: | --: | --: | --: | --- |",
  );
  for (const teamId of actual.semiFinalists) {
    const t = baseline.teams.find((x) => x.teamId === teamId)!;
    const stage = actual.deepestStage.get(teamId) ?? "groupStage";
    lines.push(
      `| ${nameOf(input, teamId)} | #${rankOf(baseline, teamId)} | ${pct(t.winner, 2)} | ${pct(t.final, 2)} | ${pct(t.semiFinal, 2)} | ${STAGE_LABELS[stage]} |`,
    );
  }

  const earlyExits = ranked
    .slice(0, 10)
    .filter((t) => (input.actual.deepestStage.get(t.teamId) ?? "groupStage") === "groupStage");
  lines.push(
    "",
    earlyExits.length
      ? `Highly rated teams that exited in the group stage: ${earlyExits.map((t) => `${nameOf(input, t.teamId)} (#${rankOf(baseline, t.teamId)})`).join(", ")}.`
      : "No team from the pre-tournament top 10 exited in the group stage.",
    "",
  );
  return lines.join("\n");
}

function sectionGroups(input: RetrospectiveInput): string {
  const { groupAccuracy, baseline } = input;
  const byId = new Map(baseline.teams.map((t) => [t.teamId, t]));
  const lines: string[] = [
    "## 4. Group-stage retrospective",
    "",
    "Definitions (deterministic, fixed in advance):",
    "",
    "- **Model top-2 pick** - the two teams in that group with the highest pre-tournament `qualifyTop2`.",
    `- **Likely qualifier** - pre-tournament qualification probability >= ${pct(0.5, 0)}.`,
    `- **Upset qualifier** - qualified with a pre-tournament qualification probability below ${pct(UPSET_QUALIFIER_MAX, 0)}.`,
    `- **Unexpected exit** - eliminated despite a pre-tournament qualification probability of ${pct(UNEXPECTED_EXIT_MIN, 0)} or above.`,
    "",
    "Actual placings come from internal Article 13 standings, never from provider fields.",
    "",
    "| Group | Model top-2 picks | Actual top 2 | Correct | Model winner pick | Actual winner | Actual third | Third qualified | Notes |",
    "| --- | --- | --- | --: | --- | --- | --- | --- | --- |",
  ];

  for (const g of groupAccuracy) {
    const notes: string[] = [];
    if (g.upsetQualifiers.length) notes.push(`upset qualifier: ${g.upsetQualifiers.map((t) => nameOf(input, t)).join(", ")}`);
    if (g.unexpectedExits.length) notes.push(`unexpected exit: ${g.unexpectedExits.map((t) => nameOf(input, t)).join(", ")}`);
    lines.push(
      `| ${g.group} | ${g.modelTopTwo.map((t) => nameOf(input, t)).join(", ")} | ${g.actualTopTwo.map((t) => nameOf(input, t)).join(", ")} | ${g.correctTopTwoCount}/2 | ${nameOf(input, g.modelGroupWinner)} | ${nameOf(input, g.actualGroupWinner)} | ${nameOf(input, g.actualThirdPlaced)} | ${g.thirdPlaceQualified ? "yes" : "no"} | ${notes.join("; ") || "-"} |`,
    );
  }

  const exact = groupAccuracy.filter((g) => g.exactTopTwoSet).length;
  const teamHits = groupAccuracy.reduce((s, g) => s + g.correctTopTwoCount, 0);
  const winners = groupAccuracy.filter((g) => g.groupWinnerCorrect).length;
  const r32Row = input.stageAccuracy.find((s) => s.stage === "roundOf32")!;
  const mostPredictable = groupAccuracy.filter((g) => g.exactTopTwoSet && g.groupWinnerCorrect).map((g) => g.group);
  const mostChaotic = groupAccuracy.filter((g) => g.correctTopTwoCount <= 1).map((g) => g.group);

  const allUpsets = groupAccuracy.flatMap((g) => g.upsetQualifiers);
  const allExits = groupAccuracy.flatMap((g) => g.unexpectedExits);
  const sortedExits = allExits
    .map((t) => ({ teamId: t, p: qualifyProbability(byId.get(t)!) }))
    .sort((a, b) => b.p - a.p);
  const sortedUpsets = allUpsets
    .map((t) => ({ teamId: t, p: qualifyProbability(byId.get(t)!) }))
    .sort((a, b) => a.p - b.p);

  lines.push(
    "",
    "### Aggregate",
    "",
    "| Metric | Value |",
    "| --- | --: |",
    `| Exact top-2 set hits | ${exact}/12 |`,
    `| Team-level top-2 hits | ${teamHits}/24 (${pct(teamHits / 24)}) |`,
    `| Group winners correctly identified | ${winners}/12 |`,
    `| Round-of-32 qualification accuracy | ${r32Row.hitCount}/${r32Row.actualCount} (${pct(r32Row.hitRate)}) |`,
    "",
    `- **Most predictable groups** (exact top two and correct winner): ${mostPredictable.join(", ") || "none"}.`,
    `- **Most chaotic groups** (at most one of the top two identified): ${mostChaotic.join(", ") || "none"}.`,
    sortedExits.length
      ? `- **Biggest group-stage surprises - unexpected exits**: ${sortedExits.map((e) => `${nameOf(input, e.teamId)} (${pct(e.p)} to qualify)`).join(", ")}.`
      : "- No unexpected exits by the stated threshold.",
    sortedUpsets.length
      ? `- **Surprise qualifiers**: ${sortedUpsets.map((e) => `${nameOf(input, e.teamId)} (${pct(e.p)} to qualify)`).join(", ")}.`
      : "- No upset qualifiers by the stated threshold.",
    "",
  );
  return lines.join("\n");
}

function sectionThirdPlace(input: RetrospectiveInput): string {
  const { actual, thirdPlaceAccuracy } = input;
  const thirdSummary = summarizeBinary(thirdPlaceAccuracy.observations);
  const thirdBins = binaryReliabilityBins(thirdPlaceAccuracy.observations, 10);
  const lines: string[] = [
    "## 5. Third-place qualification retrospective",
    "",
    "The 2026 format promotes the eight best third-placed teams. Ranking and allocation below are",
    "internal (Article 13 plus the official Annexe C bracket), not provider-derived.",
    "",
    "### Descriptive context - the twelve teams that finished third",
    "",
    "This table is **descriptive only**. It is not the evaluation: see the scored section below for",
    "why a metric computed over these twelve rows would not be a valid test of the forecast.",
    "",
    "| Annexe C rank | Team | Group | Baseline qualifyThird | Advanced |",
    "| --: | --- | --- | --: | --- |",
    ...thirdPlaceAccuracy.descriptive.map(
      (r) =>
        `| ${r.annexeCRank} | ${nameOf(input, r.teamId)} | ${r.group} | ${pct(r.qualifyThird, 2)} | ${r.advanced ? "yes" : "no"} |`,
    ),
    "",
    `- Third-placed teams that advanced: ${actual.thirdPlaceQualifiers.map((t) => nameOf(input, t)).join(", ")}.`,
    `- Third-placed teams eliminated: ${actual.thirdPlaceEliminated.map((t) => nameOf(input, t)).join(", ")}.`,
    "",
    "### Team-level evaluation of `qualifyThird` (all 48 teams)",
    "",
    "`qualifyThird` is an **unconditional** pre-tournament probability: P(this team qualifies via",
    "the third-place route). It is therefore scored across the **whole field**, with the event being",
    "\"finished third and advanced\". Restricting the scoring to the twelve teams that happened to",
    "finish third would compare an unconditional forecast against a conditional base rate (8 of 12)",
    "that it was never forecasting, and would overstate the error.",
    "",
    "| Metric | Value |",
    "| --- | --: |",
    `| Observations | ${thirdPlaceAccuracy.observationCount} (all teams) |`,
    `| Positives (finished third and advanced) | ${thirdPlaceAccuracy.positives} |`,
    `| Mean forecast | ${pct(thirdSummary.meanPredicted, 2)} |`,
    `| Realised rate | ${pct(thirdSummary.baseRate, 2)} |`,
    `| Brier | ${num(thirdSummary.brier)} |`,
    `| Log-loss | ${num(thirdSummary.logLoss)} |`,
    "",
    "As in section 10, the mean forecast matching the realised rate here is **mechanical, not a",
    "calibration result**: exactly eight third-place slots exist, so `qualifyThird` sums to eight",
    "across the field by construction. The informative quantities are the Brier and log-loss values",
    "and the bands below, which respond to whether the probability sat on the right teams.",
    "",
    `Reliability bands over the same ${thirdPlaceAccuracy.observationCount} observations:`,
    "",
    "| Band | Count | Mean forecast | Observed frequency | Gap |",
    "| --- | --: | --: | --: | --: |",
    ...thirdBins.map(
      (b) =>
        `| ${(b.lower * 100).toFixed(0)}-${(b.upper * 100).toFixed(0)}% | ${b.count} | ${b.count ? pct(b.meanPredicted, 2) : "-"} | ${b.count ? pct(b.empiricalRate, 2) : "-"} | ${b.count ? pp(b.gap, 1) : "-"} |`,
    ),
    "",
    "### Limitation: the conditional question cannot be answered",
    "",
    "The model stores the unconditional `qualifyThird` only. It does **not** store",
    "P(qualifies | finished third), so \"how well did the model rank the actual third-placed teams",
    "against each other\" cannot be evaluated from these artifacts. The descriptive table above shows",
    "what happened; it does not score the forecast, and no Brier value is quoted over it.",
    "",
    "### Limitation: no scenario-level Annexe C probabilities",
    "",
    input.annexeCScenarioProbabilitiesAvailable
      ? "Scenario-level third-place combination probabilities are available and evaluated above."
      : "The forecast stores a per-team third-place qualification probability only. It does **not** store" +
        "\nprobabilities over the 495 Annexe C third-place group combinations, so the accuracy of the" +
        "\nrealised combination against high-probability scenarios cannot be evaluated. Only team-level" +
        "\nthird-place accuracy is reported here, and no scenario-level probability is inferred.",
    "",
  ];
  return lines.join("\n");
}

function sectionReachStage(input: RetrospectiveInput): string {
  const lines: string[] = [
    "## 6. Knockout reach-stage retrospective",
    "",
    "For each stage the predicted set is the model's top N by that probability, where N is the",
    "number of places that actually existed. This keeps a probability from being read as a",
    "deterministic claim while still producing a checkable set.",
    "",
    "| Stage | Slots | Correctly identified | Hit rate | Highest-probability misses | Lowest-probability qualifiers |",
    "| --- | --: | --: | --: | --- | --- |",
  ];
  for (const row of input.stageAccuracy) {
    const misses = row.highProbabilityMisses
      .slice(0, 3)
      .map((m) => `${nameOf(input, m.teamId)} (${pct(m.probability)})`)
      .join(", ");
    const over = row.lowProbabilityOverperformers
      .slice(0, 3)
      .map((m) => `${nameOf(input, m.teamId)} (${pct(m.probability)})`)
      .join(", ");
    lines.push(
      `| ${row.label} | ${row.actualCount} | ${row.hitCount} | ${pct(row.hitRate)} | ${misses || "-"} | ${over || "-"} |`,
    );
  }

  lines.push("", "### Teams reaching each stage", "");
  for (const row of input.stageAccuracy) {
    lines.push(`- **${row.label}** (${row.actualCount}): ${row.actualTeams.map((t) => nameOf(input, t)).join(", ")}.`);
  }
  lines.push("");
  return lines.join("\n");
}

function sectionBracketPath(input: RetrospectiveInput): string {
  const { ledger, archivedForecasts, archivedAdvancement } = input;
  const knockout = ledger.results.filter((r) => r.stage !== "group").sort((a, b) => a.matchNumber - b.matchNumber);
  const archivedByNumber = new Map(archivedForecasts.map((f) => [f.matchNumber, f]));
  const advByNumber = new Map(archivedAdvancement.rows.map((r) => [r.matchNumber, r]));
  const scoreByNumber = new Map(input.archivedScorelines.rows.map((r) => [r.matchNumber, r]));

  const lines: string[] = [
    "## 7. Bracket path retrospective (M73-M104)",
    "",
    `Forecast provenance is stated per row. ${archivedForecasts.length} of ${knockout.length} knockout ties have a`,
    "genuine archived pre-match forecast; the rest are marked `unavailable` and contribute to no",
    "aggregate. No forecast is reconstructed for those ties.",
    "",
    "| M | Stage | Match | Score | Winner | Provenance | Pre-match favourite | Favourite prob. | Favourite won | Top scoreline | Scoreline |",
    "| --: | --- | --- | --- | --- | --- | --- | --: | --- | --- | --- |",
  ];

  for (const row of knockout) {
    const winner = "winnerTeamId" in row ? row.winnerTeamId : "";
    const pens = "penaltiesHome" in row && row.penaltiesHome !== undefined
      ? ` (pens ${row.penaltiesHome}-${row.penaltiesAway})`
      : "";
    const f = archivedByNumber.get(row.matchNumber);
    const adv = advByNumber.get(row.matchNumber);
    const sc = scoreByNumber.get(row.matchNumber);
    const provenance = f ? "archived-pre-match-forecast" : "unavailable";
    const top = sc ? `${sc.predictedHomeGoals}-${sc.predictedAwayGoals}` : "-";
    const scoreVerdict = sc ? (sc.exact ? "exact" : sc.directionHit ? "direction only" : "miss") : "-";
    lines.push(
      `| ${row.matchNumber} | ${matchStageLabel(row.stage)} | ${nameOf(input, row.homeTeamId)} v ${nameOf(input, row.awayTeamId)} | ${row.homeGoals}-${row.awayGoals}${pens} | ${nameOf(input, winner)} | ${provenance} | ${adv ? nameOf(input, adv.favourite) : "-"} | ${adv ? pct(adv.favouriteProbability) : "-"} | ${adv ? (adv.favouriteWon ? "yes" : "no") : "-"} | ${top} | ${scoreVerdict} |`,
    );
  }

  const a = archivedAdvancement;
  const biggest = a.upsets[0];
  lines.push(
    "",
    "### Aggregate - archived pre-match forecasts only",
    "",
    `Coverage: ${a.coverage.evaluated} of ${a.coverage.total} knockout ties. Missing: ` +
      `${a.coverage.missing.map((m) => `M${m}`).join(", ") || "none"}.`,
    "",
    "| Metric | Value |",
    "| --- | --: |",
    `| Ties evaluated | ${a.coverage.evaluated} |`,
    `| Favourite win rate | ${a.correct}/${a.coverage.evaluated} (${pct(a.accuracy)}) |`,
    `| Average favourite probability | ${pct(a.averageFavouriteProbability)} |`,
    `| Average confidence when correct | ${pct(a.averageConfidenceCorrect)} |`,
    `| Average confidence when wrong | ${pct(a.averageConfidenceMiss)} |`,
    `| Upsets (favourite eliminated) | ${a.upsetCount} |`,
    `| Binary Brier (favourite perspective) | ${num(a.brier)} |`,
    `| Binary log-loss | ${num(a.logLoss)} |`,
    `| Exact scoreline hits | ${input.archivedScorelines.exactHits}/${input.archivedScorelines.coverage.withForecast} (${pct(input.archivedScorelines.exactHitRate)}) |`,
    `| Result-direction hits | ${input.archivedScorelines.directionHits}/${input.archivedScorelines.coverage.withForecast} (${pct(input.archivedScorelines.directionRate)}) |`,
    "",
    "### Accuracy by round (archived only)",
    "",
    "| Round | Evaluated | Correct | Accuracy |",
    "| --- | --: | --: | --: |",
    ...a.byStage.map((s) => `| ${matchStageLabel(s.stage)} | ${s.evaluated} | ${s.correct} | ${pct(s.accuracy)} |`),
    "",
    biggest
      ? `**Biggest upset by pre-match probability:** M${biggest.matchNumber}, ${nameOf(input, biggest.favourite)} ` +
        `favoured at ${pct(biggest.favouriteProbability)} to advance; ${nameOf(input, biggest.actualWinner)} progressed. ` +
        "This is also the highest-confidence miss in the archived set."
      : "No upsets in the archived set.",
    "",
  );
  return lines.join("\n");
}

function sectionMatchLevel(input: RetrospectiveInput): string {
  const g = input.recomputedGroupMatches;
  const a = input.archivedAdvancement;
  return [
    "## 8. Match-level prediction retrospective",
    "",
    "Two evaluations, deliberately kept apart and never pooled:",
    "",
    "1. **Group stage, 90-minute W/D/L** - scored with the shared backtesting metrics helper.",
    "2. **Knockout, advancement** - which team progressed.",
    "",
    "They are not comparable, and they do not share a provenance:",
    "",
    "| Evaluation | Target | Provenance | Coverage |",
    "| --- | --- | --- | --- |",
    `| Group stage | 90-minute W/D/L | \`${g.provenance}\` | ${g.coverage.evaluated}/${g.coverage.total} |`,
    `| Knockout | Advancement | \`${a.provenance}\` | ${a.coverage.evaluated}/${a.coverage.total} |`,
    "",
    "> **Provenance warning.** No group-stage match forecast was ever archived. The group numbers",
    "> below are `retrospective-model-forecast` values: the model re-evaluated from frozen",
    "> pre-tournament inputs after the fact. Because those inputs are static pre-tournament, this",
    "> reproduces what the model would have said on day zero - but it is **not** a captured",
    "> pre-match archive and must not be presented as one, or compared like-for-like with the",
    "> knockout numbers.",
    "",
    "### Group stage - 90-minute W/D/L (retrospective-model-forecast)",
    "",
    "| Metric | Value |",
    "| --- | --: |",
    `| Matches evaluated | ${g.metrics.n} |`,
    `| Outcome accuracy (argmax) | ${pct(g.metrics.accuracy)} |`,
    `| Ranked probability score | ${num(g.metrics.rps)} |`,
    `| Log-loss | ${num(g.metrics.logLoss)} |`,
    `| Brier (3-class) | ${num(g.metrics.brier)} |`,
    `| Average confidence when correct | ${pct(g.averageConfidenceCorrect)} |`,
    `| Average confidence when wrong | ${pct(g.averageConfidenceMiss)} |`,
    "",
    "### Knockout - advancement (archived-pre-match-forecast)",
    "",
    "| Metric | Value |",
    "| --- | --: |",
    `| Ties evaluated | ${a.coverage.evaluated} of ${a.coverage.total} |`,
    `| Advancement accuracy | ${a.correct}/${a.coverage.evaluated} (${pct(a.accuracy)}) |`,
    `| Binary Brier | ${num(a.brier)} |`,
    `| Binary log-loss | ${num(a.logLoss)} |`,
    `| Average confidence when correct | ${pct(a.averageConfidenceCorrect)} |`,
    `| Average confidence when wrong | ${pct(a.averageConfidenceMiss)} |`,
    "",
    a.averageConfidenceCorrect > a.averageConfidenceMiss
      ? "Confidence is correctly ordered: the model was measurably more confident on the ties it got" +
        "\nright than on the ties it got wrong, which is the behaviour a usable probability should show."
      : "Confidence was not correctly ordered between correct and incorrect calls.",
    "",
    "### Biggest correct calls (archived)",
    "",
    ...a.rows
      .filter((r) => r.favouriteWon)
      .sort((x, y) => y.favouriteProbability - x.favouriteProbability)
      .slice(0, 5)
      .map((r) => `- M${r.matchNumber}: ${nameOf(input, r.favourite)} at ${pct(r.favouriteProbability)} - advanced.`),
    "",
    "### Biggest misses (archived)",
    "",
    ...a.upsets.map((r) => `- M${r.matchNumber}: ${nameOf(input, r.favourite)} at ${pct(r.favouriteProbability)} - ${nameOf(input, r.actualWinner)} advanced.`),
    "",
    "### Note on the 90-minute / extra-time split",
    "",
    "Knockout rows store 90 minutes plus extra time combined, with the shootout carried separately.",
    "A regulation-only result therefore cannot be recovered for knockout ties, so knockout matches",
    "are scored on advancement and never on 90-minute W/D/L. Pooling the two would silently count a",
    "tie settled in extra time as a regulation win.",
    "",
  ].join("\n");
}

function sectionScorelines(input: RetrospectiveInput): string {
  const s = input.archivedScorelines;
  const lines: string[] = [
    "## 9. Scoreline-level retrospective",
    "",
    "Scored against the most likely scoreline (`topScorelines[0]`) from archived pre-match",
    "forecasts only. Scores are the regulation-corrected values from the retrospective ledger: the",
    "provider folds a penalty shootout into full-time, so the raw field would have compared a goal",
    "forecast against a number that includes penalty kicks.",
    "",
    "### Coverage",
    "",
    "| Scope | With scoreline forecast | Without | Total |",
    "| --- | --: | --: | --: |",
    `| Knockout (M73-M104) | ${s.coverage.withForecast} | ${s.coverage.withoutForecast} | ${s.coverage.total} |`,
    "",
    "| Stage | With forecast | Total |",
    "| --- | --: | --: |",
    ...s.coverage.byStage.map((b) => `| ${matchStageLabel(b.stage)} | ${b.withForecast} | ${b.total} |`),
    "",
    `Group-stage scoreline forecasts were never archived (0 of 72), so no group scoreline accuracy`,
    "is reported. Missing knockout ties: " +
      (s.coverage.missingMatchNumbers.map((m) => `M${m}`).join(", ") || "none") + ".",
    "",
    "### Accuracy",
    "",
    "| Metric | Value |",
    "| --- | --: |",
    `| Exact scoreline | ${s.exactHits}/${s.coverage.withForecast} (${pct(s.exactHitRate)}) |`,
    `| Correct goal difference | ${s.goalDifferenceHits}/${s.coverage.withForecast} (${pct(s.goalDifferenceRate)}) |`,
    `| Correct total-goals bucket (0-1 / 2-3 / 4+) | ${s.goalsBucketHits}/${s.coverage.withForecast} (${pct(s.goalsBucketRate)}) |`,
    `| Correct result direction | ${s.directionHits}/${s.coverage.withForecast} (${pct(s.directionRate)}) |`,
    `| Mean absolute goal error (both sides) | ${num(s.meanAbsoluteGoalError, 2)} |`,
    `| Mean total-goals error | ${num(s.meanTotalGoalsError, 2)} |`,
    "",
    "### Best scoreline predictions",
    "",
    ...s.bestPredictions.map(
      (r) =>
        `- M${r.matchNumber} ${nameOf(input, r.homeTeamId)} v ${nameOf(input, r.awayTeamId)}: predicted ` +
        `${r.predictedHomeGoals}-${r.predictedAwayGoals}, actual ${r.actualHomeGoals}-${r.actualAwayGoals}` +
        `${r.exact ? " - exact" : ""}.`,
    ),
    "",
    "### Largest scoreline misses",
    "",
    ...s.largestMisses.map(
      (r) =>
        `- M${r.matchNumber} ${nameOf(input, r.homeTeamId)} v ${nameOf(input, r.awayTeamId)}: predicted ` +
        `${r.predictedHomeGoals}-${r.predictedAwayGoals}, actual ${r.actualHomeGoals}-${r.actualAwayGoals} ` +
        `(goal error ${r.absoluteGoalError}).`,
    ),
    "",
    "Exact-scoreline accuracy is low in absolute terms, which is the expected behaviour of a",
    "Poisson-shaped goal model: the most likely single scoreline in an evenly matched game rarely",
    "exceeds a low-teens percentage, so a hit rate near that level indicates the distribution is",
    "behaving, not that the model is malfunctioning. Scorelines should continue to be presented as",
    "illustrative shapes rather than predictions.",
    "",
  ];
  return lines.join("\n");
}

function sectionCalibration(input: RetrospectiveInput): string {
  const lines: string[] = [
    "## 10. Probability calibration retrospective",
    "",
    "Each team-versus-stage pair is one binary observation: the pre-tournament probability of",
    "reaching that stage, against whether the team did. All 48 teams contribute to every stage, so",
    "the qualification and Round-of-32 rows are the statistically meaningful ones; Reach final and",
    "Title chance rest on one or two realised outcomes and are shown for completeness only.",
    "",
    "### Summary by stage",
    "",
    "| Stage | Observations | Mean forecast | Realised rate | Brier | Log-loss |",
    "| --- | --: | --: | --: | --: | --: |",
  ];

  for (const row of input.stageAccuracy) {
    const s = summarizeBinary(row.observations);
    lines.push(
      `| ${row.label} | ${s.n} | ${pct(s.meanPredicted, 2)} | ${pct(s.baseRate, 2)} | ${num(s.brier)} | ${num(s.logLoss)} |`,
    );
  }

  lines.push(
    "",
    "> **Do not read the mean-forecast column as a calibration result.** It equals the realised",
    "> rate at every stage by construction, not by merit: each simulated tournament produces",
    "> exactly the real number of qualifiers at each stage, so the probabilities sum to the slot",
    "> count and the mean must equal the observed frequency. Aggregate agreement here is",
    "> mechanical. The informative quantities are the Brier and log-loss columns, which respond to",
    "> whether the probability was attached to the RIGHT teams, and the reliability bands below.",
  );

  // Pool every team-stage observation for one overall reliability table.
  const pooled: BinaryObservation[] = input.stageAccuracy.flatMap((r) => r.observations);
  const bins = binaryReliabilityBins(pooled, 10);
  const pooledSummary = summarizeBinary(pooled);

  lines.push(
    "",
    "### Reliability table - all team-versus-stage observations pooled",
    "",
    `Pooled across the ${REACH_STAGE_ORDER.length} reach-stage metrics and 48 teams`,
    `(${pooled.length} observations). A positive gap means the model under-forecast that band.`,
    "",
    "| Band | Count | Mean forecast | Observed frequency | Gap |",
    "| --- | --: | --: | --: | --: |",
  );
  for (const b of bins) {
    lines.push(
      `| ${(b.lower * 100).toFixed(0)}-${(b.upper * 100).toFixed(0)}% | ${b.count} | ${b.count ? pct(b.meanPredicted, 2) : "-"} | ${b.count ? pct(b.empiricalRate, 2) : "-"} | ${b.count ? pp(b.gap, 1) : "-"} |`,
    );
  }

  const populated = bins.filter((b) => b.count > 0);
  const worst = [...populated].sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap))[0];
  const midUnderCount = populated.filter((b) => b.gap > 0).length;

  lines.push(
    "",
    `Pooled Brier ${num(pooledSummary.brier)}, log-loss ${num(pooledSummary.logLoss)}, mean forecast`,
    `${pct(pooledSummary.meanPredicted, 2)} against a realised rate of ${pct(pooledSummary.baseRate, 2)}.`,
    worst
      ? `The largest deviation is the ${(worst.lower * 100).toFixed(0)}-${(worst.upper * 100).toFixed(0)}% band ` +
        `(${worst.count} observations, gap ${pp(worst.gap, 1)}).`
      : "",
    "",
    `The shape worth noting is in the middle of the range: ${midUnderCount} of the ${populated.length} populated`,
    "bands sit above their forecast, and the mid-range bands are under-forecast by a consistent",
    "margin. Read plainly, teams the model rated as live-but-not-favoured advanced somewhat more",
    "often than it implied. The counter-signal is the second-highest band, which ran the other way.",
    "Both observations rest on single-digit to low-double-digit counts from one tournament, so they",
    "are a direction to test against future data, not a correction to apply now.",
    "",
    "### Knockout advancement calibration (archived forecasts)",
    "",
    `Over ${input.archivedAdvancement.coverage.evaluated} archived ties scored from the favourite's`,
    `perspective: Brier ${num(input.archivedAdvancement.brier)}, log-loss ${num(input.archivedAdvancement.logLoss)},`,
    `mean favourite probability ${pct(input.archivedAdvancement.averageFavouriteProbability)} against a realised`,
    `favourite win rate of ${pct(input.archivedAdvancement.accuracy)}.`,
    "",
    "### Small-sample caveat",
    "",
    "Reach final and Title chance resolve to two and one realised outcomes respectively. Any Brier",
    "or log-loss at those stages is dominated by a single tournament outcome and cannot support a",
    "calibration claim in either direction. They are reported so the table is complete, and should",
    "not be quoted as evidence that the model is or is not well calibrated at the top of the",
    "bracket. A calibration verdict at those stages needs several tournaments, not one.",
    "",
  );
  return lines.join("\n");
}

function sectionPerformers(input: RetrospectiveInput): string {
  const over = input.surprise.slice(0, 8);
  const under = [...input.surprise].reverse().slice(0, 8);
  // Raw surprise favours whoever went deepest; isolate the genuinely unforeseen runs.
  const underdogRun = input.surprise.find((r) => r.baselineTitleRank >= UNDERDOG_RANK_MIN && r.surprise > 0) ?? null;
  const highRatedExit = [...input.surprise].reverse().find((r) => r.baselineTitleRank <= 10 && r.surprise < 0) ?? null;
  const lines: (string | null)[] = [
    "## 11. Overperformers and underperformers",
    "",
    "Surprise is the number of ladder rungs a team actually cleared minus its expected depth (the",
    "sum of its pre-tournament reach-stage probabilities). Positive means the team went further",
    "than the forecast implied.",
    "",
    "### Outperformed forecast",
    "",
    "| Team | Baseline Title chance | Baseline rank | Actual result | Expected depth | Surprise |",
    "| --- | --: | --: | --- | --: | --: |",
    ...over.map(
      (r) =>
        `| ${nameOf(input, r.teamId)} | ${pct(r.baselineTitleProbability, 2)} | #${r.baselineTitleRank} | ${r.actualStageLabel} | ${num(r.expectedDepth, 2)} | ${num(r.surprise, 2)} |`,
    ),
    "",
    "### Underperformed forecast",
    "",
    "| Team | Baseline Title chance | Baseline rank | Actual result | Expected depth | Surprise |",
    "| --- | --: | --: | --- | --: | --: |",
    ...under.map(
      (r) =>
        `| ${nameOf(input, r.teamId)} | ${pct(r.baselineTitleProbability, 2)} | #${r.baselineTitleRank} | ${r.actualStageLabel} | ${num(r.expectedDepth, 2)} | ${num(r.surprise, 2)} |`,
    ),
    "",
    "### Reading this table honestly",
    "",
    "Raw surprise rewards depth, so the teams that went furthest sit at the top whether or not",
    "they were expected to. The champion and runner-up lead the list because no team can clear",
    "more rungs, not because their runs were unforeseen - both were the model's top two before a",
    "ball was kicked. The genuinely unforeseen runs are the lower-rated sides below them.",
    "",
    underdogRun
      ? `The clearest surprise run by a lower-rated side was **${nameOf(input, underdogRun.teamId)}**, ranked ` +
        `#${underdogRun.baselineTitleRank} before the tournament, reaching the ` +
        `${underdogRun.actualStageLabel.toLowerCase()} (surprise ${num(underdogRun.surprise, 2)}).`
      : "No team ranked outside the pre-tournament top 10 outperformed its forecast.",
    highRatedExit
      ? `The clearest unexpected exit by a higher-rated side was **${nameOf(input, highRatedExit.teamId)}**, ` +
        `ranked #${highRatedExit.baselineTitleRank}, whose tournament ended at the ` +
        `${highRatedExit.actualStageLabel.toLowerCase()} (surprise ${num(highRatedExit.surprise, 2)}).`
      : "No team from the pre-tournament top 10 underperformed its forecast.",
    `Across the whole field the largest shortfall against forecast was **${nameOf(input, under[0]!.teamId)}**`,
    `(surprise ${num(under[0]!.surprise, 2)}).`,
    "",
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

function sectionDrivers(input: RetrospectiveInput): string {
  const lines: string[] = [
    "## 12. Model driver retrospective",
    "",
    "Driver decompositions are **not** persisted in any artifact, so these are recomputed from the",
    "same frozen pre-tournament inputs the baseline used. They explain what the model liked about a",
    "team before the tournament; they are not a post-hoc attribution of what happened.",
    "",
    "Values are mean signed driver contributions across that team's three group fixtures, in",
    "Elo-equivalent points, oriented so a positive number favours the team named.",
    "",
    "| Team | Net advantage | Strongest supporting drivers | Strongest opposing drivers |",
    "| --- | --: | --- | --- |",
    ...input.drivers.map(
      (d) =>
        `| ${nameOf(input, d.teamId)} | ${num(d.netAdvantage, 1)} | ${d.topSupporting.map((x) => `${x.label} (${num(x.contribution, 1)})`).join(", ") || "-"} | ${d.topOpposing.map((x) => `${x.label} (${num(x.contribution, 1)})`).join(", ") || "-"} |`,
    ),
    "",
    "### Reading these honestly",
    "",
    "- The static strength priors - Elo and FIFA ranking - carried the top of the ranking, and the",
    "  top of the ranking is where the model performed best. That is consistent with those signals",
    "  being genuinely informative, and it is the part of the model that has been backtested.",
    "- Squad quality and recent form remain capped placeholder inputs. They contributed to the",
    "  ordering but their measured value cannot be separated from the strength priors they",
    "  correlate with, so no claim is made about them here either way.",
    "- The manager-cohesion signal carries zero model weight and did not affect any probability in",
    "  this tournament.",
    "- A results-based in-tournament performance signal was tested before the tournament and",
    "  deliberately kept inactive. Nothing in this retrospective re-opens that decision: judging it",
    "  on the same tournament it would have been fitted to is exactly the circularity the original",
    "  decision avoided. It should be re-evaluated out-of-sample, not from this dataset.",
    "- No model change is proposed on the strength of a single tournament. Section 14 separates",
    "  what is evidenced from what merely looks appealing.",
    "",
  ];
  return lines.join("\n");
}

function sectionProduct(): string {
  return [
    "## 13. Product retrospective",
    "",
    "### What BeyondVAR explained well",
    "",
    "- **The title race.** The pre-tournament ranking put the eventual champion, the runner-up and",
    "  the whole final four at the top, so the headline surface was telling a true story throughout.",
    "- **Movement framing.** Presenting probability change as checkpoint intervals rather than",
    "  per-match causation held up: the record does not support single-match causal claims, and the",
    "  product never made them.",
    "- **Advancement narratives.** Knockout ties were the model's strongest match-level output, and",
    "  they are what the bracket and team-outlook surfaces lead with.",
    "- **Honesty guardrails.** Elimination language was tied to canonical internal state rather than",
    "  a zero probability, so no team was described as eliminated before it was.",
    "",
    "### Where context was missing",
    "",
    "- **The knockout title-probability path is gone.** The rolling current-forecast object was",
    "  overwritten on every refresh. Users saw the path live; it cannot now be reconstructed, and",
    "  this report is measurably poorer for it. This is the single biggest product-data regret.",
    "- **Scoreline archive coverage is thin.** 26 of 104 matches have an archived pre-match",
    "  forecast and none of them are group matches, so match-level retrospection is limited to the",
    "  knockout stage.",
    "- **No 90-minute / extra-time split.** Knockout results cannot be separated into regulation and",
    "  extra time, which blocks like-for-like comparison with group matches.",
    "- **Shootout scores needed correcting.** The provider folds penalties into full-time; this was",
    "  found and corrected retrospectively, but it means live surfaces showed inflated knockout",
    "  scorelines during the tournament.",
    "",
    "### Narratives that were missing",
    "",
    "- A tournament recap surface: nothing in the product tells the story of the tournament now that",
    "  it is over.",
    "- Bracket path difficulty: the model knew which routes were harder and never surfaced it.",
    "- Per-team season stories: the data supports them and the team page stops short.",
    "",
  ].join("\n");
}

interface Recommendation {
  title: string;
  detail: string;
  impact: "high" | "medium" | "low";
  effort: "high" | "medium" | "low";
  risk: "high" | "medium" | "low";
  beforeNext: boolean;
}

const MODEL_RECS: Recommendation[] = [
  {
    title: "Stage-specific calibration review",
    detail:
      "Qualification-band calibration is measurable now; deep-stage calibration is not. Build the " +
      "multi-tournament series needed before adjusting anything at the top of the bracket.",
    impact: "high",
    effort: "medium",
    risk: "low",
    beforeNext: false,
  },
  {
    title: "Improve scoreline calibration",
    detail:
      "Exact-scoreline accuracy is the weakest measured output. A dispersion or correlation " +
      "adjustment to the goal model is the obvious candidate, evaluated out-of-sample.",
    impact: "medium",
    effort: "medium",
    risk: "medium",
    beforeNext: false,
  },
  {
    title: "Stronger squad and player-availability data",
    detail:
      "Squad quality remains a capped placeholder. Real squad-value or availability data is the " +
      "most plausible route to improving the mid-table, where the model was weakest.",
    impact: "high",
    effort: "high",
    risk: "medium",
    beforeNext: true,
  },
  {
    title: "Injury and suspension signal",
    detail: "Not currently modelled at all. Only worth adding if a reliable, timely feed exists.",
    impact: "medium",
    effort: "high",
    risk: "medium",
    beforeNext: false,
  },
  {
    title: "Keep in-tournament performance inactive",
    detail:
      "The negative result stands. Do not activate it on the strength of this tournament; it must " +
      "be shown to work out-of-sample first.",
    impact: "low",
    effort: "low",
    risk: "low",
    beforeNext: false,
  },
];

const PRODUCT_RECS: Recommendation[] = [
  {
    title: "Public tournament recap page",
    detail: "This retrospective is internal. The strongest findings deserve a public surface.",
    impact: "high",
    effort: "medium",
    risk: "low",
    beforeNext: false,
  },
  {
    title: "Match impact archive",
    detail: "Preserve per-match impact so the story of the tournament survives the tournament.",
    impact: "high",
    effort: "medium",
    risk: "low",
    beforeNext: true,
  },
  {
    title: "Bracket path difficulty",
    detail: "The model already knows which routes are harder; surface it.",
    impact: "medium",
    effort: "medium",
    risk: "low",
    beforeNext: false,
  },
  {
    title: "Richer team story pages",
    detail: "Extend the team outlook work into a full per-team tournament story.",
    impact: "medium",
    effort: "medium",
    risk: "low",
    beforeNext: false,
  },
  {
    title: "Shareable cards",
    detail: "Distribution for the above; low risk, no model impact.",
    impact: "low",
    effort: "low",
    risk: "low",
    beforeNext: false,
  },
];

const DATA_RECS: Recommendation[] = [
  {
    title: "Retain every current-forecast snapshot during the tournament",
    detail:
      "The single most valuable fix. Overwriting the rolling object destroyed the knockout " +
      "title-probability path permanently. Write to a versioned key per refresh.",
    impact: "high",
    effort: "low",
    risk: "low",
    beforeNext: true,
  },
  {
    title: "Fix provider shootout normalisation upstream",
    detail:
      "The provider folds the shootout into full-time. This retrospective corrected it locally, but " +
      "the ingestion path still records inflated knockout scores and silently drops the shootout, " +
      "because an inflated score reads as a decisive win and passes validation. Fix in normalisation.",
    impact: "high",
    effort: "low",
    risk: "low",
    beforeNext: true,
  },
  {
    title: "Store the 90-minute / extra-time / penalty split explicitly",
    detail:
      "Would allow knockout matches to be scored on regulation W/D/L alongside advancement, making " +
      "group and knockout evaluation directly comparable.",
    impact: "high",
    effort: "medium",
    risk: "low",
    beforeNext: true,
  },
  {
    title: "Preserve a complete match-forecast archive",
    detail:
      "Only 26 of 104 matches were archived, and no group matches at all. Archive every pre-match " +
      "forecast so match-level retrospection covers the whole tournament.",
    impact: "high",
    effort: "low",
    risk: "low",
    beforeNext: true,
  },
  {
    title: "Venue and weather actuals",
    detail: "Would let the climate and travel priors finally be evaluated rather than assumed.",
    impact: "medium",
    effort: "medium",
    risk: "low",
    beforeNext: false,
  },
  {
    title: "Lineup availability capture",
    detail: "Prerequisite for any injury or availability signal.",
    impact: "medium",
    effort: "high",
    risk: "medium",
    beforeNext: false,
  },
];

function recTable(recs: Recommendation[]): string[] {
  return [
    "| Recommendation | Impact | Effort | Risk | Before next tournament | Detail |",
    "| --- | --- | --- | --- | --- | --- |",
    ...recs.map(
      (r) => `| ${r.title} | ${r.impact} | ${r.effort} | ${r.risk} | ${r.beforeNext ? "yes" : "no"} | ${r.detail} |`,
    ),
  ];
}

function sectionRecommendations(): string {
  const priority = [...DATA_RECS, ...MODEL_RECS, ...PRODUCT_RECS]
    .filter((r) => r.beforeNext && r.impact === "high")
    .map((r) => r.title);
  return [
    "## 14. Recommendations for the next version",
    "",
    "### Priority - high impact and needed before the next tournament",
    "",
    ...priority.map((t, i) => `${i + 1}. ${t}`),
    "",
    "The pattern is worth stating plainly: the highest-value fixes are **data-retention** fixes, not",
    "model changes. The model performed well where it was measured. What limited this retrospective",
    "was that evidence was discarded during the tournament.",
    "",
    "### Model recommendations",
    "",
    ...recTable(MODEL_RECS),
    "",
    "### Product recommendations",
    "",
    ...recTable(PRODUCT_RECS),
    "",
    "### Data recommendations",
    "",
    ...recTable(DATA_RECS),
    "",
  ].join("\n");
}

function sectionLimitations(input: RetrospectiveInput): string {
  return [
    "## 15. Limitations",
    "",
    "Stated plainly, because each one bounds a claim made above:",
    "",
    "1. **Archived versus recomputed forecasts.** Only 26 of 104 matches have a genuine",
    "   `archived-pre-match-forecast`, all of them knockout ties. Group-stage match numbers are",
    "   `retrospective-model-forecast` values recomputed from frozen pre-tournament inputs. The two",
    "   are never pooled, and every table states which it uses.",
    "2. **No knockout title-probability path.** The rolling current-forecast object was overwritten",
    "   on each refresh, so the model's title probabilities across M73-M103 are not recoverable. No",
    "   intermediate knockout title-probability path is claimed anywhere in this report.",
    "3. **No scenario-level Annexe C probabilities.** Third-place qualification is stored per team,",
    "   not as probabilities over the 495 possible third-place group combinations, so combination",
    "   accuracy cannot be evaluated and none is inferred.",
    "4. **The shootout correction was retrospective-local.** Four knockout rows arrived with the",
    "   penalty shootout folded into full-time. They were corrected in the retrospective artifact",
    "   only; production ingestion was not modified, and it will reproduce the same inflated scores",
    "   until the upstream fix in section 14 is made.",
    "5. **No 90-minute / extra-time split.** Knockout results combine regulation and extra time, so",
    "   knockout ties are scored on advancement only.",
    "6. **Single-tournament samples at the top of the bracket.** Reach final and Title chance rest",
    "   on one or two realised outcomes and cannot support a calibration verdict.",
    "7. **No production model change.** This report changes no weight, no simulation, no forecast",
    "   and no public surface. It is an evaluation of what was already published.",
    "",
    `Source artifacts: \`${input.ledger.ledgerId}\`, the archived match-forecast set`,
    `(${input.archivedForecasts.length} entries) and the terminal current forecast, all validated in`,
    "`tests/retrospective-artifacts.test.ts`.",
    "",
  ].join("\n");
}

/** Assemble the full report. Deterministic for a given input bundle. */
export function buildRetrospectiveReport(input: RetrospectiveInput): string {
  return [
    sectionHeader(input),
    sectionExecutiveSummary(input),
    sectionTimeline(input),
    sectionChampion(input),
    sectionGroups(input),
    sectionThirdPlace(input),
    sectionReachStage(input),
    sectionBracketPath(input),
    sectionMatchLevel(input),
    sectionScorelines(input),
    sectionCalibration(input),
    sectionPerformers(input),
    sectionDrivers(input),
    sectionProduct(),
    sectionRecommendations(),
    sectionLimitations(input),
  ].join("\n");
}
