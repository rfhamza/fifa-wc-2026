#!/usr/bin/env node
/**
 * Phase 1.19C - WC-2002 historical source-pack snapshot generator (dev-only, STRETCH).
 * -----------------------------------------------------------------------------------
 * Transcribes the USER-SUPPLIED, source-backed WC-2002 pack (4 CSVs + a README of
 * source notes) into the committed, derived TypeScript snapshot
 * `data/historical/snapshots/wc-2002.ts`. Raw CSV/MD files are NOT committed; only
 * the derived snapshot is. Deterministic; no network.
 *
 * STRETCH EVIDENCE ONLY. WC-2002 is an ADDITIVE stretch historical pack: it is NOT
 * calibration, NOT tournament replay, and it does NOT change the primary
 * four-tournament (2010/2014/2018/2022) diagnostic headline, LOTO, or any production
 * probability. It is never imported by the production 2026 app.
 *
 * This is a DEDICATED copy of the 2006 generator pattern with 2002-specific
 * constants + co-host handling (it intentionally does NOT refactor the
 * 2006/2010/2014/2018/2022 generators). A shared generator remains deferred.
 *
 * Usage:
 *   node scripts/generate-historical-2002.mjs <dir-with-raw-files>
 *   (or set WC2002_RAW_DIR=<dir>)
 *
 * The supplied raw files are the reproducibility anchor: each file's SHA-256 is
 * recorded in the snapshot provenance (WC2002_SOURCE). This snapshot lives in the
 * ISOLATED backtesting layer (`data/historical/`, `lib/backtesting/`): it is NEVER
 * imported by the production 2026 app, nothing is wired into the model, and no
 * probability changes. See docs/BACKTESTING_WC2002_SNAPSHOT.md.
 *
 * 2002 raw-format specifics (same shape as 2006):
 *  - identity `groups` is JSON ({"A": ["France", ...], ...}); `confederations` is
 *    colon-style ("AFC:4; CAF:5; CONCACAF:3; CONMEBOL:5; UEFA:15").
 *  - CO-HOSTS: identity `hostCountries` is a delimited list ("South Korea; Japan");
 *    the generator SPLITS it on ";" into ["South Korea","Japan"] (both AFC).
 *  - results stage labels are capitalized ("Group stage", "Round of 16",
 *    "Quarter-final", "Semi-final", "Third-place match", "Final") - lowercased before
 *    mapping to contract enums; `resultAt90` raw values are `teamA`/`draw`/`teamB`
 *    -> `A`/`D`/`B`; the extra-time flag column is `extraTime`.
 *  - the raw `goalsA`/`goalsB` are the AFTER-EXTRA-TIME score; the derived snapshot's
 *    `goalsA`/`goalsB` use the 90-MINUTE score (`goalsAAt90`/`goalsBAt90`), matching
 *    the existing 2022/2018/2014/2010/2006 snapshot convention. ET / penalties
 *    (penalties MADE, not attempts) are recorded separately. Results are OUTCOMES ONLY.
 *  - elo/fifa: pass-through values mapped to historical team ids. FIFA ranks may
 *    contain ties (uniqueness is NOT asserted).
 *
 * GOLDEN-GOAL handling: 2002 used golden-goal extra time in the knockout rounds. A
 * golden-goal match is stored exactly like any ET match: the 90-MINUTE score (a draw),
 * `resultAt90: "D"`, `afterExtraTime: true`, and NO `penalties` (unless it actually
 * went to a shootout). The golden goal is an ET goal and is NEVER added to the snapshot
 * `goalsA`/`goalsB`, nor is it the `resultAt90` target. No new field is required.
 *
 * SLUG GOVERNANCE (see docs):
 *  - "Republic of Ireland" -> republic-of-ireland: a HISTORICAL-ONLY slug (full FIFA
 *    identity; unambiguous vs Northern Ireland / IFA). Do NOT use `ireland`.
 *  - "China PR"/"China" -> china: clean canonical-style slug (PRC men's continuity).
 *  - "Turkey" -> turkiye: REUSE the existing canonical slug (same football
 *    association); no separate `turkey` slug is created.
 *  - "South Korea"/"Korea Republic" -> south-korea; "United States"/"USA" -> usa.
 *
 * LEAKAGE: every Elo asOfDate (2002-05-30) and FIFA rankingDate (2002-05-15) is
 * strictly before the 2002 opening kickoff (2002-05-31T20:30:00+09:00 =
 * 2002-05-31T11:30:00Z). FIFA uses the last pre-tournament release (2002-05-15),
 * NOT any post-tournament ranking.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const RAW_DIR = process.argv[2] ?? process.env.WC2002_RAW_DIR;
if (!RAW_DIR) {
  console.error("usage: node scripts/generate-historical-2002.mjs <dir-with-raw-files>");
  process.exit(2);
}
const OUT = "data/historical/snapshots/wc-2002.ts";
const OPENING_KICKOFF = "2002-05-31T20:30:00+09:00"; // = 2002-05-31T11:30:00Z (leakage cutoff)

const FILES = {
  readme: "README_SOURCE_NOTES.md",
  identity: "wc2002-identity.csv",
  results: "wc2002-results.csv",
  elo: "wc2002-elo.csv",
  fifa: "wc2002-fifa.csv",
};

/** Read a raw file and its SHA-256 (raw is NOT committed; checksum is the anchor). */
const readRaw = (name) => {
  const raw = readFileSync(join(RAW_DIR, name), "utf8");
  const sha256 = createHash("sha256").update(raw).digest("hex");
  return { raw, sha256 };
};

/**
 * Source team display name -> historical team id (historical id space).
 * Reuses existing canonical slugs wherever the same nation already has one in the
 * project (2026 `data/official/teams.ts`, or the 2006/2010/2014/2018/2022 snapshots).
 * New historical-only slugs (no canonical id existed): `republic-of-ireland` and
 * `china`. Turkey REUSES the canonical `turkiye` slug; South Korea -> `south-korea`.
 */
const NAME_TO_ID = {
  France: "france", Senegal: "senegal", Uruguay: "uruguay", Denmark: "denmark",
  Spain: "spain", Slovenia: "slovenia", Paraguay: "paraguay", "South Africa": "south-africa",
  Brazil: "brazil", Turkey: "turkiye", "China PR": "china", "Costa Rica": "costa-rica",
  "South Korea": "south-korea", Poland: "poland", "United States": "usa", Portugal: "portugal",
  Germany: "germany", "Saudi Arabia": "saudi-arabia", "Republic of Ireland": "republic-of-ireland", Cameroon: "cameroon",
  Argentina: "argentina", Nigeria: "nigeria", England: "england", Sweden: "sweden",
  Italy: "italy", Ecuador: "ecuador", Croatia: "croatia", Mexico: "mexico",
  Japan: "japan", Belgium: "belgium", Russia: "russia", Tunisia: "tunisia",
  // aliases (not necessarily present in this pack, kept for robustness)
  China: "china", "Korea Republic": "south-korea", USA: "usa", "Türkiye": "turkiye",
  Ireland: "republic-of-ireland",
};

/**
 * teamId -> confederation. The compact identity row carries only aggregate counts
 * (AFC:4; CAF:5; CONCACAF:3; CONMEBOL:5; UEFA:15); per-team membership follows the
 * source-pack 2002 allocation. The validator cross-checks that the tally of this map
 * equals the identity-declared counts. Co-hosts South Korea + Japan are both AFC; OFC:0.
 */
const CONFEDERATION_BY_ID = {
  "south-korea": "AFC", japan: "AFC", china: "AFC", "saudi-arabia": "AFC",
  senegal: "CAF", "south-africa": "CAF", cameroon: "CAF", nigeria: "CAF", tunisia: "CAF",
  "costa-rica": "CONCACAF", usa: "CONCACAF", mexico: "CONCACAF",
  uruguay: "CONMEBOL", paraguay: "CONMEBOL", brazil: "CONMEBOL", argentina: "CONMEBOL", ecuador: "CONMEBOL",
  france: "UEFA", denmark: "UEFA", spain: "UEFA", slovenia: "UEFA", turkiye: "UEFA",
  poland: "UEFA", portugal: "UEFA", germany: "UEFA", "republic-of-ireland": "UEFA", england: "UEFA",
  sweden: "UEFA", croatia: "UEFA", italy: "UEFA", belgium: "UEFA", russia: "UEFA",
};

const id = (name) => {
  const teamId = NAME_TO_ID[name.trim()];
  if (!teamId) throw new Error(`unmapped team name: "${name}"`);
  return teamId;
};

/** Minimal CSV splitter honouring double-quoted fields (handles "" escapes). */
const splitCsvLine = (line) => {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === "," && !inQ) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
};

const parseCsv = (raw) => {
  const lines = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim().split("\n");
  const header = splitCsvLine(lines[0]);
  const ix = (n) => { const i = header.indexOf(n); if (i < 0) throw new Error(`missing column ${n}`); return i; };
  return { rows: lines.slice(1).map(splitCsvLine), ix };
};

// ---------------------------------------------------------------------------
// Read raw + checksums
// ---------------------------------------------------------------------------
const readme = readRaw(FILES.readme);
const identityRaw = readRaw(FILES.identity);
const resultsRaw = readRaw(FILES.results);
const eloRaw = readRaw(FILES.elo);
const fifaRaw = readRaw(FILES.fifa);

// ---------------------------------------------------------------------------
// 1. Identity (compact 1 row -> normalized; JSON groups, colon confederations)
// ---------------------------------------------------------------------------
const idCsv = parseCsv(identityRaw.raw);
const idRow = idCsv.rows[0];
const G = idCsv.ix;
const hostCountriesText = idRow[G("hostCountries")].trim();
const formatText = idRow[G("format")].trim();
const confCountsText = idRow[G("confederations")].trim();
const groupsText = idRow[G("groups")].trim();
const bracketText = idRow[G("knockoutBracketStructure")].trim();
const identitySourceRef = idRow[G("sourceRef")].trim();

// CO-HOSTS: split the delimited hostCountries list ("South Korea; Japan") -> array.
const hostCountries = hostCountriesText.split(";").map((s) => s.trim()).filter(Boolean);

// groups: JSON {"A": ["France", ...], ...} -> { A: [ids], ... }
const rawGroups = JSON.parse(groupsText);
const groups = {};
for (const [g, names] of Object.entries(rawGroups)) {
  groups[g.trim()] = names.map((t) => id(t));
}
const groupTeamIds = Object.values(groups).flat();
const teamIds = [...groupTeamIds].sort((a, b) => a.localeCompare(b));

// confederation counts string ("AFC:4; CAF:5; ...") -> { AFC: 4, ... } (cross-check anchor)
const confederationCounts = {};
for (const seg of confCountsText.split(";")) {
  const [k, v] = seg.split(":");
  if (k && v !== undefined) confederationCounts[k.trim()] = Number(v.trim());
}
const confederations = {};
for (const tid of teamIds) {
  const conf = CONFEDERATION_BY_ID[tid];
  if (!conf) throw new Error(`no confederation mapped for ${tid}`);
  confederations[tid] = conf;
}

// bracket: stored as the raw description + the round order (not used by the evaluator).
const bracket = {
  description: bracketText,
  rounds: ["round-of-16", "quarter-final", "semi-final", "third-place", "final"],
};

// ---------------------------------------------------------------------------
// 2. Results (normalize stage + outcome enums; goalsA/B = 90-minute goals)
// ---------------------------------------------------------------------------
const STAGE_MAP = {
  "group stage": "group",
  "round of 16": "round-of-16",
  "quarter-final": "quarter-final",
  "semi-final": "semi-final",
  "third-place match": "third-place",
  final: "final",
};
const OUTCOME_MAP = { teamA: "A", draw: "D", teamB: "B" };
const rCsv = parseCsv(resultsRaw.raw);
const R = rCsv.ix;
const num = (s) => (s === "" || s == null ? undefined : Number(s));
const bool = (s) => String(s).trim().toUpperCase() === "TRUE";

const results = rCsv.rows.map((f) => {
  const rawStage = f[R("stage")].trim().toLowerCase();
  const stage = STAGE_MAP[rawStage];
  if (!stage) throw new Error(`unmapped stage "${f[R("stage")]}"`);
  const rawOutcome = f[R("resultAt90")].trim();
  const resultAt90 = OUTCOME_MAP[rawOutcome];
  if (!resultAt90) throw new Error(`unmapped resultAt90 "${rawOutcome}"`);
  // Derived snapshot goalsA/goalsB use the 90-minute score (NOT after-ET / golden goal).
  const goalsA = Number(f[R("goalsAAt90")]);
  const goalsB = Number(f[R("goalsBAt90")]);
  const groupVal = f[R("group")].trim();
  const wentToExtraTime = bool(f[R("extraTime")]);
  const pA = num(f[R("penaltiesA")]);
  const pB = num(f[R("penaltiesB")]);
  const out = {
    matchId: f[R("matchId")].trim(),
    date: f[R("date")].trim(),
    stage,
    ...(stage === "group" ? { group: groupVal } : {}),
    teamA: id(f[R("teamA")]),
    teamB: id(f[R("teamB")]),
    goalsA,
    goalsB,
    resultAt90,
    ...(wentToExtraTime ? { afterExtraTime: true } : {}),
    ...(pA !== undefined && pB !== undefined ? { penalties: { a: pA, b: pB } } : {}),
    venue: f[R("venue")].trim(),
    sourceRef: f[R("sourceRef")].trim(),
  };
  return out;
});

// ---------------------------------------------------------------------------
// 3. Pre-tournament Elo
// ---------------------------------------------------------------------------
const eCsv = parseCsv(eloRaw.raw);
const E = eCsv.ix;
const elo = eCsv.rows.map((f) => ({
  teamId: id(f[E("team")]),
  rating: Number(f[E("rating")]),
  asOfDate: f[E("asOfDate")].trim(),
  sourceRef: f[E("sourceRef")].trim(),
})).sort((a, b) => a.teamId.localeCompare(b.teamId));

// ---------------------------------------------------------------------------
// 4. Pre-tournament FIFA ranking (ranks may contain ties - no uniqueness assertion)
// ---------------------------------------------------------------------------
const fCsv = parseCsv(fifaRaw.raw);
const F = fCsv.ix;
const fifa = fCsv.rows.map((f) => ({
  teamId: id(f[F("team")]),
  rank: Number(f[F("rank")]),
  ...(f[F("points")] !== "" ? { points: Number(f[F("points")]) } : {}),
  rankingDate: f[F("rankingDate")].trim(),
  sourceRef: f[F("sourceRef")].trim(),
})).sort((a, b) => a.teamId.localeCompare(b.teamId));

// ---------------------------------------------------------------------------
// Assemble identity + pack
// ---------------------------------------------------------------------------
const identity = {
  tournamentYear: 2002,
  hostCountries,
  openingKickoff: OPENING_KICKOFF,
  format: "32-team-8-groups",
  teamIds,
  confederations,
  groups,
  bracket,
  provenance: {
    sourceName: "OpenFootball World Cup repository (2002--south-korea-n-japan) + FIFA 2002 page (user-supplied derived CSV)",
    sourceUrl: identitySourceRef,
    sourceFile: FILES.identity,
    sha256: identityRaw.sha256,
    licence: "OpenFootball CC0-1.0; FIFA pages reference-only; eloratings derived reference",
    retrievedAt: "2026-06-22",
    notes:
      "Compact raw identity (1 row; groups as JSON, confederations as colon-style string) normalized to " +
      "teamIds[]/groups{}/confederations{}. CO-HOSTS South Korea + Japan (both AFC) parsed from the delimited " +
      "hostCountries column; aggregate counts (" + confCountsText + ") cross-checked by the validator. format text: " +
      JSON.stringify(formatText) + ".",
  },
};

const pack = {
  identity,
  results,
  elo,
  fifa,
  macro: [],
  recentForm: [],
};

// ---------------------------------------------------------------------------
// Emit derived snapshot
// ---------------------------------------------------------------------------
mkdirSync("data/historical/snapshots", { recursive: true });

const banner = `/**
 * Phase 1.19C - WC-2002 historical source-pack snapshot (32 teams, 64 matches). STRETCH.
 * GENERATED by scripts/generate-historical-2002.mjs - DO NOT EDIT BY HAND.
 *
 * ISOLATED + UNWIRED: part of the backtesting layer (\`data/historical/\`,
 * \`lib/backtesting/\`). NEVER imported by the production 2026 app; nothing is wired
 * into lib/model/*; no probabilities change; no calibration, no tournament replay.
 * Validated by lib/backtesting/validate-historical.ts.
 *
 * STRETCH EVIDENCE ONLY: WC-2002 is an ADDITIVE stretch pack. It does NOT change the
 * primary four-tournament (2010/2014/2018/2022) diagnostic headline, does NOT recompute
 * LOTO, does NOT create stretch consolidation, and does NOT approve calibration
 * (calibration remains NO-GO). Per-tournament diagnostics are NOT pooled with the
 * primary scope.
 *
 * DERIVED-ONLY: raw CSV/MD source files are NOT committed; their SHA-256 anchors live
 * in WC2002_SOURCE.
 *
 * CO-HOSTS: South Korea + Japan (both AFC). hostCountries = ["South Korea","Japan"].
 *
 * LEAKAGE: every Elo asOfDate (2002-05-30) and FIFA rankingDate (2002-05-15) is
 * strictly before the opening kickoff (${OPENING_KICKOFF} = 2002-05-31T11:30:00Z).
 * Match results are OUTCOMES ONLY and must never feed a pre-tournament feature.
 *
 * SCORE CONVENTION (mirrors 2022/2018/2014/2010/2006): snapshot goalsA/goalsB store the
 * 90-MINUTE score; resultAt90 is derived from the 90' score; extra time
 * (afterExtraTime) and penalties (penalties MADE, not attempts) are recorded separately.
 * GOLDEN GOAL (2002 knockouts): stored as a 90' draw + afterExtraTime:true, no penalties
 * (the golden goal is an ET goal, never in 90' goalsA/goalsB). The evaluator targets only
 * 90-minute W/D/L. Final: Germany 0-2 Brazil (no ET, no penalties; resultAt90 "B").
 *
 * SLUGS: "Republic of Ireland" -> republic-of-ireland (HISTORICAL-ONLY, distinct from
 * Northern Ireland); "China PR"/"China" -> china (new clean slug); "Turkey" -> turkiye
 * (REUSE canonical slug); "South Korea" -> south-korea; "United States" -> usa.
 */
import type { HistoricalSourcePack, BacktestProvenance } from "@/lib/backtesting/types";

/** Per-file source provenance + SHA-256 anchors (raw files NOT committed). */
export const WC2002_SOURCE: {
  label: string;
  openingKickoff: string;
  retrievedAt: string;
  files: Record<string, BacktestProvenance>;
  notes: string;
} = {
  label: "FIFA World Cup 2002 (South Korea / Japan) historical source pack - backtesting (STRETCH)",
  openingKickoff: ${JSON.stringify(OPENING_KICKOFF)},
  retrievedAt: "2026-06-22",
  files: {
    identity: {
      sourceName: "OpenFootball World Cup repository (2002--south-korea-n-japan) + FIFA 2002 page",
      sourceUrl: "https://github.com/openfootball/worldcup",
      sourceFile: ${JSON.stringify(FILES.identity)},
      sha256: ${JSON.stringify(identityRaw.sha256)},
      licence: "OpenFootball CC0-1.0; FIFA page reference-only",
      retrievedAt: "2026-06-22",
      notes: "Compact 1-row identity (JSON groups, colon-style confederations) normalized; raw not committed. Co-hosts South Korea + Japan (both AFC).",
    },
    results: {
      sourceName: "OpenFootball World Cup repository (2002--south-korea-n-japan)",
      sourceUrl: "https://github.com/openfootball/worldcup",
      sourceFile: ${JSON.stringify(FILES.results)},
      sha256: ${JSON.stringify(resultsRaw.sha256)},
      licence: "OpenFootball CC0-1.0",
      retrievedAt: "2026-06-22",
      notes:
        "64 matches; stage/outcome labels normalized to contract enums; outcomes only. Snapshot " +
        "goalsA/goalsB = 90-minute score (raw goalsA/goalsB are after-ET; golden-goal era). Final: Germany 0-2 Brazil.",
    },
    elo: {
      sourceName: "World Football Elo Ratings 2002 World Cup start (eloratings.net)",
      sourceUrl: "https://www.eloratings.net/2002_World_Cup_start",
      sourceFile: ${JSON.stringify(FILES.elo)},
      sha256: ${JSON.stringify(eloRaw.sha256)},
      licence: "eloratings/international-football.net reference; small derived values only",
      retrievedAt: "2026-06-22",
      asOfDate: "2002-05-30",
      notes: "Pre-tournament Elo as-of 2002-05-30, strictly before the opening kickoff. No host adjustment.",
    },
    fifa: {
      sourceName: "FIFA men's ranking 2002-05-15 (en.fifaranking.net mirror)",
      sourceUrl: "https://en.fifaranking.net/ranking/?d=2002-05-15",
      sourceFile: ${JSON.stringify(FILES.fifa)},
      sha256: ${JSON.stringify(fifaRaw.sha256)},
      licence: "Public ranking mirror licensing unclear / reference-grade; official values conceptually",
      retrievedAt: "2026-06-22",
      asOfDate: "2002-05-15",
      notes:
        "Last pre-tournament FIFA release (exact date 2002-05-15); no post-tournament ranking used. Ranks may " +
        "contain ties (uniqueness not asserted). Raw mirror not committed - SHA-256 is the anchor.",
    },
    readme: {
      sourceName: "User-supplied source notes (README_SOURCE_NOTES.md)",
      sourceFile: ${JSON.stringify(FILES.readme)},
      sha256: ${JSON.stringify(readme.sha256)},
      licence: "n/a (documentation of source strategy + licence notes)",
      retrievedAt: "2026-06-22",
      notes: "Records source strategy, leakage rules, golden-goal/ET/penalty cases, and licence notes for the pack.",
    },
  },
  notes:
    "STRETCH backtesting pack (2002). Optional packs (macro, recent form, squads, managers, " +
    "venues/tournamentContext) are intentionally deferred. Sources: OpenFootball (CC0) is the " +
    "permissive fixtures/results route; FIFA ranking values are official conceptually but supplied via a " +
    "public mirror (treat licensing cautiously); eloratings is a small derived Elo reference, not a raw " +
    "dump. Raw source files are NOT committed; checksums are the reproducibility anchor. Stretch-only: this " +
    "does not change the primary four-tournament diagnostics, does not recompute LOTO, does not create " +
    "stretch consolidation, and does not approve calibration (calibration remains NO-GO).",
};

/** Declared per-confederation entrant counts (from the compact identity row). */
export const WC2002_CONFEDERATION_COUNTS: Record<string, number> = ${JSON.stringify(confederationCounts, null, 2)};

/** Source team display name -> historical team id (historical id space). */
export const WC2002_NAME_TO_ID: Record<string, string> = ${JSON.stringify(NAME_TO_ID, null, 2)};

export const WC2002_PACK: HistoricalSourcePack = ${JSON.stringify(pack, null, 2)};
`;

writeFileSync(OUT, banner);
console.log(
  `wrote ${OUT}: ${teamIds.length} teams, ${results.length} matches, ` +
  `${elo.length} elo, ${fifa.length} fifa, hosts=[${hostCountries.join(", ")}]\n` +
  `  identity=${identityRaw.sha256}\n  results =${resultsRaw.sha256}\n` +
  `  elo     =${eloRaw.sha256}\n  fifa    =${fifaRaw.sha256}\n  readme  =${readme.sha256}`,
);
