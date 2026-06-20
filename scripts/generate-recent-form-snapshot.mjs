#!/usr/bin/env node
/**
 * Phase 1.16B - recent-form snapshot generator (dev-only).
 * -------------------------------------------------------
 * Transcribes a USER-SUPPLIED, pre-derived "last-10 per team" CSV (based on the CC0
 * international-results dataset) into the committed TypeScript snapshot
 * `data/model-inputs/snapshots/recent-form-2026-06-11.ts`. The raw CSV is NOT
 * committed; only the derived snapshot is. Deterministic; no network.
 *
 * Usage:
 *   node scripts/generate-recent-form-snapshot.mjs <path-to.csv>
 *   (or set RECENT_FORM_CSV=<path>)
 *
 * The supplied CSV is the reproducibility anchor (its SHA-256 is recorded in the
 * snapshot provenance). Upstream source URL points at GitHub `master` (mutable).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash as _createHash } from "node:crypto";

const CSV = process.argv[2] ?? process.env.RECENT_FORM_CSV;
if (!CSV) {
  console.error("usage: node scripts/generate-recent-form-snapshot.mjs <path-to.csv>");
  process.exit(2);
}

const CUTOFF = "2026-06-11T19:00:00Z"; // opening kickoff; matches must be strictly before
const OUT = "data/model-inputs/snapshots/recent-form-2026-06-11.ts";

/** CSV "Team" display value -> repo team id (authoritative join). */
const NAME_TO_ID = {
  "Mexico": "mexico", "South Korea": "south-korea", "South Africa": "south-africa",
  "Czechia": "czechia", "Canada": "canada", "Switzerland": "switzerland", "Qatar": "qatar",
  "Bosnia and Herzegovina": "bosnia-herzegovina", "Brazil": "brazil", "Morocco": "morocco",
  "Scotland": "scotland", "Haiti": "haiti", "United States": "usa", "Australia": "australia",
  "Paraguay": "paraguay", "Turkey": "turkiye", "Germany": "germany", "Ecuador": "ecuador",
  "Ivory Coast": "ivory-coast", "Curaçao": "curacao", "Netherlands": "netherlands",
  "Japan": "japan", "Tunisia": "tunisia", "Sweden": "sweden", "Belgium": "belgium",
  "Iran": "iran", "Egypt": "egypt", "New Zealand": "new-zealand", "Spain": "spain",
  "Uruguay": "uruguay", "Saudi Arabia": "saudi-arabia", "Cape Verde": "cape-verde",
  "France": "france", "Senegal": "senegal", "Norway": "norway", "Iraq": "iraq",
  "Argentina": "argentina", "Austria": "austria", "Algeria": "algeria", "Jordan": "jordan",
  "Portugal": "portugal", "Colombia": "colombia", "Uzbekistan": "uzbekistan",
  "DR Congo": "congo-dr", "England": "england", "Croatia": "croatia", "Panama": "panama",
  "Ghana": "ghana",
};

// Opponent name -> WC team id (optional). Built from Team names + dataset aliases.
const OPP_TO_ID = { ...NAME_TO_ID, "Czech Republic": "czechia" };

const raw = readFileSync(CSV, "utf8");
const sha = _createHash("sha256").update(raw).digest("hex");
const lines = raw.replace(/\r\n/g, "\n").trim().split("\n");
const header = lines[0].split(",");
const col = (name) => {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`missing column: ${name}`);
  return i;
};
const C = {
  team: col("Team"), rank: col("Match rank latest-first"), date: col("Match date"),
  opp: col("Opponent"), venue: col("Venue perspective"), gf: col("Goals for"),
  ga: col("Goals against"), result: col("Result"), comp: col("Tournament / competition"),
  cat: col("Competition category"), homeTeam: col("Home team"), awayTeam: col("Away team"),
  homeScore: col("Home score"), awayScore: col("Away score"),
  neutral: col("Neutral flag"), dataset: col("Team dataset name"),
  url: col("Source URL"), line: col("Source CSV line"),
};

const byTeam = new Map();
for (let i = 1; i < lines.length; i++) {
  const f = lines[i].split(",");
  const teamName = f[C.team];
  const teamId = NAME_TO_ID[teamName];
  if (!teamId) throw new Error(`unmapped WC team name: "${teamName}" (line ${i + 1})`);
  const oppName = f[C.opp];
  const match = {
    rank: Number(f[C.rank]),
    date: f[C.date],
    opponentName: oppName,
    opponentId: OPP_TO_ID[oppName],
    venue: f[C.venue],
    goalsFor: Number(f[C.gf]),
    goalsAgainst: Number(f[C.ga]),
    result: f[C.result],
    competition: f[C.comp],
    competitionCategory: f[C.cat],
    neutral: String(f[C.neutral]).toLowerCase() === "true",
    homeTeam: f[C.homeTeam],
    awayTeam: f[C.awayTeam],
    homeScore: Number(f[C.homeScore]),
    awayScore: Number(f[C.awayScore]),
    sourceUrl: f[C.url],
    sourceCsvLine: Number(f[C.line]),
    _teamName: teamName,
    _dataset: f[C.dataset],
  };
  const list = byTeam.get(teamId) ?? [];
  list.push(match);
  byTeam.set(teamId, list);
}

const r6 = (x) => Number(x.toFixed(6));
const points = (res) => (res === "W" ? 3 : res === "D" ? 1 : 0);
const agg = (ms, n) => {
  const w = ms.slice(0, n);
  const c = w.length;
  if (!c) return { c: 0, ppm: 0, gd: 0, gf: 0, ga: 0 };
  let p = 0, gf = 0, ga = 0;
  for (const m of w) { p += points(m.result); gf += m.goalsFor; ga += m.goalsAgainst; }
  return { c, ppm: p / c, gd: (gf - ga) / c, gf: gf / c, ga: ga / c };
};

const rows = [...byTeam.entries()]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([teamId, ms]) => {
    ms.sort((a, b) => a.rank - b.rank); // latest-first by rank
    const a5 = agg(ms, 5), a10 = agg(ms, 10);
    const teamName = ms[0]._teamName;
    const dataset = ms[0]._dataset;
    const recentMatches = ms.map((m) => ({
      rank: m.rank, date: m.date, opponentName: m.opponentName,
      ...(m.opponentId ? { opponentId: m.opponentId } : {}),
      venue: m.venue, goalsFor: m.goalsFor, goalsAgainst: m.goalsAgainst, result: m.result,
      competition: m.competition, competitionCategory: m.competitionCategory, neutral: m.neutral,
      homeTeam: m.homeTeam, awayTeam: m.awayTeam, homeScore: m.homeScore, awayScore: m.awayScore,
      sourceUrl: m.sourceUrl, sourceCsvLine: m.sourceCsvLine,
    }));
    return {
      teamId, sourceTeamName: teamName, sourceDatasetName: dataset, cutoffDate: CUTOFF,
      matchesConsidered5: a5.c, matchesConsidered10: a10.c,
      last5PointsPerMatch: r6(a5.ppm), last10PointsPerMatch: r6(a10.ppm),
      last5GoalDiffPerMatch: r6(a5.gd), last10GoalDiffPerMatch: r6(a10.gd),
      last5GoalsForPerMatch: r6(a5.gf), last5GoalsAgainstPerMatch: r6(a5.ga),
      last10GoalsForPerMatch: r6(a10.gf), last10GoalsAgainstPerMatch: r6(a10.ga),
      recentMatches,
      dataStatus: "source-backed",
      sourceRef: `${ms[0].sourceUrl} (CC0; SHA-256 ${sha.slice(0, 12)}...)`,
    };
  });

const banner = `/**
 * Phase 1.16B - recent-form snapshot (last 10 pre-tournament matches per team).
 * GENERATED by scripts/generate-recent-form-snapshot.mjs - DO NOT EDIT BY HAND.
 *
 * STANDALONE + UNWIRED: this is NOT read by lib/model/*; the active \`recentForm\`
 * placeholder family is untouched and probabilities do not change. The raw match
 * results are source-backed (CC0 international-results dataset, via a user-supplied
 * pre-derived CSV); the DERIVED recent-form score (lib/recent-form/score.ts) is a
 * candidate heuristic that overlaps Elo/FIFA. Opponent-adjusted Elo residual is
 * DEFERRED. Leakage cutoff: matches strictly before ${CUTOFF}.
 *
 * Provenance: upstream CC0 dataset URL points at GitHub \`master\` (mutable), so the
 * supplied CSV SHA-256 is the reproducibility anchor. Raw CSV is NOT committed.
 */
import type { RecentFormRow, RecentFormSource } from "@/lib/types";

export const RECENT_FORM_SOURCE: RecentFormSource = {
  label: "National-team recent form (last 10 pre-tournament matches)",
  sourceName: "CC0 international-results dataset (martj42/international_results), user-supplied pre-derived last-10 CSV",
  sourceUrl: "https://raw.githubusercontent.com/martj42/international_results/master/results.csv",
  sourceFile: "wc2026_last10_pre_tournament_matches.csv",
  sourceChecksumSha256: ${JSON.stringify(sha)},
  retrievedAt: "2026-06-20",
  cutoff: ${JSON.stringify(CUTOFF)},
  status: "source-backed",
  notes:
    "Pre-derived from the CC0 dataset (one row per WC team's last 10 completed matches strictly before the opening kickoff). Czechia rows use dataset name 'Czech Republic'. Opponent ids resolve only for WC teams. Derived score is candidate; opponent-Elo residual deferred.",
};

/** CSV "Team" display value -> repo team id (authoritative join). */
export const RECENT_FORM_NAME_TO_ID: Record<string, string> = ${JSON.stringify(NAME_TO_ID, null, 2)};

export const recentFormSnapshot: RecentFormRow[] = ${JSON.stringify(rows, null, 2)};

/** teamId -> recent-form row. */
export const recentFormById: Map<string, RecentFormRow> = new Map(
  recentFormSnapshot.map((r) => [r.teamId, r]),
);
`;

writeFileSync(OUT, banner);
console.log(`wrote ${OUT}: ${rows.length} teams, sha256=${sha}`);
