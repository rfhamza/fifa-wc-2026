#!/usr/bin/env node
/**
 * Phase 1.19B - WC-2006 historical source-pack snapshot generator (dev-only, STRETCH).
 * -----------------------------------------------------------------------------------
 * Transcribes the USER-SUPPLIED, source-backed WC-2006 pack (4 CSVs + a README of
 * source notes) into the committed, derived TypeScript snapshot
 * `data/historical/snapshots/wc-2006.ts`. Raw CSV/MD files are NOT committed; only
 * the derived snapshot is. Deterministic; no network.
 *
 * STRETCH EVIDENCE ONLY. WC-2006 is an ADDITIVE stretch historical pack: it is NOT
 * calibration, NOT tournament replay, and it does NOT change the primary
 * four-tournament (2010/2014/2018/2022) diagnostic headline, LOTO, or any production
 * probability. It is never imported by the production 2026 app.
 *
 * This is a DEDICATED copy of the 2010 generator pattern with 2006-specific
 * constants (it intentionally does NOT refactor the 2010/2014/2018/2022 generators).
 * A shared generator remains deferred.
 *
 * Usage:
 *   node scripts/generate-historical-2006.mjs <dir-with-raw-files>
 *   (or set WC2006_RAW_DIR=<dir>)
 *
 * The supplied raw files are the reproducibility anchor: each file's SHA-256 is
 * recorded in the snapshot provenance (WC2006_SOURCE). This snapshot lives in the
 * ISOLATED backtesting layer (`data/historical/`, `lib/backtesting/`): it is NEVER
 * imported by the production 2026 app, nothing is wired into the model, and no
 * probability changes. See docs/BACKTESTING_WC2006_SNAPSHOT.md.
 *
 * 2006 raw-format specifics (same shape as 2010):
 *  - identity `groups` is JSON ({"A": ["Germany", ...], ...}); `confederations`
 *    is colon-style ("AFC:4; CAF:5; CONCACAF:4; CONMEBOL:4; OFC:1; UEFA:14").
 *  - results stage labels are capitalized ("Group stage", "Round of 16",
 *    "Quarter-finals", "Semi-finals", "Third-place play-off", "Final") - lowercased
 *    before mapping to contract enums; `resultAt90` raw values are
 *    `teamA`/`draw`/`teamB` -> `A`/`D`/`B`; the extra-time flag column is `extraTime`.
 *  - the raw `goalsA`/`goalsB` are the AFTER-EXTRA-TIME score; the derived snapshot's
 *    `goalsA`/`goalsB` use the 90-MINUTE score (`goalsAAt90`/`goalsBAt90`), matching
 *    the existing 2022/2018/2014/2010 snapshot convention. ET / penalties (penalties
 *    MADE, not attempts) are recorded separately. Results are OUTCOMES ONLY.
 *  - elo/fifa: pass-through values mapped to historical team ids. FIFA ranks may
 *    contain ties (e.g. several teams share a rank) - uniqueness is NOT asserted.
 *
 * SLUG GOVERNANCE (see docs):
 *  - "Serbia and Montenegro" -> serbia-and-montenegro: a HISTORICAL-ONLY slug,
 *    DISTINCT from any modern `serbia` slug (the 2006 entity is the FR Yugoslavia
 *    successor that dissolved into Serbia + Montenegro after the tournament).
 *  - "Czech Republic" -> czechia: REUSE the existing canonical slug (the project
 *    already canonically maps Czech Republic -> czechia in the 2026 model inputs);
 *    no separate `czech-republic` slug is created.
 *  - Australia -> OFC: the source-pack confederation convention (qualification /
 *    allocation route). Australia qualified via the OFC route for 2006; their AFC
 *    transfer took effect 2006-01-01 but the pack and qualification basis are OFC.
 *
 * LEAKAGE: every Elo asOfDate (2006-06-08) and FIFA rankingDate (2006-05-17) is
 * strictly before the 2006 opening kickoff (2006-06-09T18:00:00+02:00 =
 * 2006-06-09T16:00:00Z). FIFA uses the last pre-tournament release (2006-05-17),
 * NOT any post-tournament ranking.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const RAW_DIR = process.argv[2] ?? process.env.WC2006_RAW_DIR;
if (!RAW_DIR) {
  console.error("usage: node scripts/generate-historical-2006.mjs <dir-with-raw-files>");
  process.exit(2);
}
const OUT = "data/historical/snapshots/wc-2006.ts";
const OPENING_KICKOFF = "2006-06-09T18:00:00+02:00"; // = 2006-06-09T16:00:00Z (leakage cutoff)

const FILES = {
  readme: "README_SOURCE_NOTES.md",
  identity: "wc2006-identity.csv",
  results: "wc2006-results.csv",
  elo: "wc2006-elo.csv",
  fifa: "wc2006-fifa.csv",
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
 * project (2026 `data/official/teams.ts`, or the 2022/2018/2014/2010 snapshots).
 * Czech Republic REUSES the canonical `czechia` slug (continuity of the same football
 * association). New historical slugs: angola, togo, ukraine, trinidad-and-tobago, and
 * the HISTORICAL-ONLY serbia-and-montenegro (distinct from modern `serbia`).
 */
const NAME_TO_ID = {
  Germany: "germany", Ecuador: "ecuador", Poland: "poland", "Costa Rica": "costa-rica",
  England: "england", Sweden: "sweden", Paraguay: "paraguay", "Trinidad and Tobago": "trinidad-and-tobago",
  Argentina: "argentina", Netherlands: "netherlands", "Côte d'Ivoire": "ivory-coast", "Serbia and Montenegro": "serbia-and-montenegro",
  Portugal: "portugal", Mexico: "mexico", Angola: "angola", Iran: "iran",
  Italy: "italy", Ghana: "ghana", "Czech Republic": "czechia", USA: "usa",
  Brazil: "brazil", Australia: "australia", Croatia: "croatia", Japan: "japan",
  Switzerland: "switzerland", France: "france", "South Korea": "south-korea", Togo: "togo",
  Spain: "spain", Ukraine: "ukraine", Tunisia: "tunisia", "Saudi Arabia": "saudi-arabia",
  // aliases (not necessarily present in this pack, kept for robustness)
  "Ivory Coast": "ivory-coast", "United States": "usa", "Korea Republic": "south-korea",
  Czechia: "czechia", "Czech Rep.": "czechia", "IR Iran": "iran",
};

/**
 * teamId -> confederation. The compact identity row carries only aggregate counts
 * (AFC:4; CAF:5; CONCACAF:4; CONMEBOL:4; OFC:1; UEFA:14); per-team membership follows
 * the source-pack 2006 allocation. The validator cross-checks that the tally of this
 * map equals the identity-declared counts. Australia is the sole OFC entrant (OFC:1),
 * using the qualification/allocation convention (see docs).
 */
const CONFEDERATION_BY_ID = {
  iran: "AFC", japan: "AFC", "south-korea": "AFC", "saudi-arabia": "AFC",
  angola: "CAF", "ivory-coast": "CAF", ghana: "CAF", togo: "CAF", tunisia: "CAF",
  "costa-rica": "CONCACAF", mexico: "CONCACAF", "trinidad-and-tobago": "CONCACAF", usa: "CONCACAF",
  argentina: "CONMEBOL", brazil: "CONMEBOL", ecuador: "CONMEBOL", paraguay: "CONMEBOL",
  australia: "OFC",
  croatia: "UEFA", czechia: "UEFA", england: "UEFA", france: "UEFA", germany: "UEFA",
  italy: "UEFA", netherlands: "UEFA", poland: "UEFA", portugal: "UEFA",
  "serbia-and-montenegro": "UEFA", spain: "UEFA", sweden: "UEFA", switzerland: "UEFA", ukraine: "UEFA",
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
const hostCountry = idRow[G("hostCountries")].trim();
const formatText = idRow[G("format")].trim();
const confCountsText = idRow[G("confederations")].trim();
const groupsText = idRow[G("groups")].trim();
const bracketText = idRow[G("knockoutBracketStructure")].trim();
const identitySourceRef = idRow[G("sourceRef")].trim();

// groups: JSON {"A": ["Germany", ...], ...} -> { A: [ids], ... }
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

// bracket: 2006 uses a match-numbered description ("Round of 16: M49 1A-2B, ...").
// Stored as the raw description + the round order (not used by the evaluator).
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
  "quarter-finals": "quarter-final",
  "semi-finals": "semi-final",
  "third-place play-off": "third-place",
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
  // Derived snapshot goalsA/goalsB use the 90-minute score (NOT after-ET).
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
  tournamentYear: 2006,
  hostCountries: [hostCountry],
  openingKickoff: OPENING_KICKOFF,
  format: "32-team-8-groups",
  teamIds,
  confederations,
  groups,
  bracket,
  provenance: {
    sourceName: "OpenFootball World Cup repository (2006--germany) + FIFA 2006 page (user-supplied derived CSV)",
    sourceUrl: identitySourceRef,
    sourceFile: FILES.identity,
    sha256: identityRaw.sha256,
    licence: "OpenFootball CC0-1.0; FIFA pages reference-only; eloratings derived reference",
    retrievedAt: "2026-06-21",
    notes:
      "Compact raw identity (1 row; groups as JSON, confederations as colon-style string) normalized to " +
      "teamIds[]/groups{}/confederations{}. Per-team confederation follows the source-pack 2006 allocation " +
      "(Australia OFC); aggregate counts (" + confCountsText + ") cross-checked by the validator. format text: " +
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
 * Phase 1.19B - WC-2006 historical source-pack snapshot (32 teams, 64 matches). STRETCH.
 * GENERATED by scripts/generate-historical-2006.mjs - DO NOT EDIT BY HAND.
 *
 * ISOLATED + UNWIRED: part of the backtesting layer (\`data/historical/\`,
 * \`lib/backtesting/\`). NEVER imported by the production 2026 app; nothing is wired
 * into lib/model/*; no probabilities change; no calibration, no tournament replay.
 * Validated by lib/backtesting/validate-historical.ts.
 *
 * STRETCH EVIDENCE ONLY: WC-2006 is an ADDITIVE stretch pack. It does NOT change the
 * primary four-tournament (2010/2014/2018/2022) diagnostic headline, does NOT recompute
 * LOTO, and does NOT approve calibration (calibration remains NO-GO). Per-tournament
 * diagnostics are NOT pooled with the primary scope.
 *
 * DERIVED-ONLY: raw CSV/MD source files are NOT committed; their SHA-256 anchors live
 * in WC2006_SOURCE.
 *
 * LEAKAGE: every Elo asOfDate (2006-06-08) and FIFA rankingDate (2006-05-17) is
 * strictly before the opening kickoff (${OPENING_KICKOFF} = 2006-06-09T16:00:00Z).
 * Match results are OUTCOMES ONLY and must never feed a pre-tournament feature.
 *
 * SCORE CONVENTION (mirrors 2022/2018/2014/2010): snapshot goalsA/goalsB store the
 * 90-MINUTE score; resultAt90 is derived from the 90' score; extra time
 * (afterExtraTime) and penalties (penalties MADE, not attempts) are recorded
 * separately. The evaluator targets only 90-minute W/D/L. Final: Italy 1-1 France
 * after extra time (1-1 at 90, so goalsA=1/goalsB=1, resultAt90 "D", afterExtraTime
 * true, penalties Italy 5-3).
 *
 * SLUGS: "Serbia and Montenegro" -> serbia-and-montenegro (HISTORICAL-ONLY, distinct
 * from modern \`serbia\`); "Czech Republic" -> czechia (REUSE canonical slug);
 * Australia -> OFC (source-pack qualification/allocation convention, sole OFC entrant).
 */
import type { HistoricalSourcePack, BacktestProvenance } from "@/lib/backtesting/types";

/** Per-file source provenance + SHA-256 anchors (raw files NOT committed). */
export const WC2006_SOURCE: {
  label: string;
  openingKickoff: string;
  retrievedAt: string;
  files: Record<string, BacktestProvenance>;
  notes: string;
} = {
  label: "FIFA World Cup 2006 (Germany) historical source pack - backtesting (STRETCH)",
  openingKickoff: ${JSON.stringify(OPENING_KICKOFF)},
  retrievedAt: "2026-06-21",
  files: {
    identity: {
      sourceName: "OpenFootball World Cup repository (2006--germany) + FIFA 2006 page",
      sourceUrl: "https://github.com/openfootball/worldcup",
      sourceFile: ${JSON.stringify(FILES.identity)},
      sha256: ${JSON.stringify(identityRaw.sha256)},
      licence: "OpenFootball CC0-1.0; FIFA page reference-only",
      retrievedAt: "2026-06-21",
      notes: "Compact 1-row identity (JSON groups, colon-style confederations) normalized; raw not committed. Australia=OFC (source allocation).",
    },
    results: {
      sourceName: "OpenFootball World Cup repository (2006--germany)",
      sourceUrl: "https://github.com/openfootball/worldcup",
      sourceFile: ${JSON.stringify(FILES.results)},
      sha256: ${JSON.stringify(resultsRaw.sha256)},
      licence: "OpenFootball CC0-1.0",
      retrievedAt: "2026-06-21",
      notes:
        "64 matches; stage/outcome labels normalized to contract enums; outcomes only. Snapshot " +
        "goalsA/goalsB = 90-minute score (raw goalsA/goalsB are after-ET). Final: Italy 1-1 France AET, pens 5-3.",
    },
    elo: {
      sourceName: "World Football Elo Ratings 2006 World Cup start (eloratings.net)",
      sourceUrl: "https://www.eloratings.net/2006_World_Cup_start",
      sourceFile: ${JSON.stringify(FILES.elo)},
      sha256: ${JSON.stringify(eloRaw.sha256)},
      licence: "eloratings/international-football.net reference; small derived values only",
      retrievedAt: "2026-06-21",
      asOfDate: "2006-06-08",
      notes: "Pre-tournament Elo as-of 2006-06-08, strictly before the opening kickoff. No host adjustment.",
    },
    fifa: {
      sourceName: "FIFA men's ranking 2006-05-17 (en.fifaranking.net mirror)",
      sourceUrl: "https://en.fifaranking.net/ranking/index.php?d=2006-05-17",
      sourceFile: ${JSON.stringify(FILES.fifa)},
      sha256: ${JSON.stringify(fifaRaw.sha256)},
      licence: "Public ranking mirror licensing unclear / reference-grade; official values conceptually",
      retrievedAt: "2026-06-21",
      asOfDate: "2006-05-17",
      notes:
        "Last pre-tournament FIFA release (exact date 2006-05-17); no post-tournament ranking used. Ranks may " +
        "contain ties (uniqueness not asserted). Raw mirror not committed - SHA-256 is the anchor.",
    },
    readme: {
      sourceName: "User-supplied source notes (README_SOURCE_NOTES.md)",
      sourceFile: ${JSON.stringify(FILES.readme)},
      sha256: ${JSON.stringify(readme.sha256)},
      licence: "n/a (documentation of source strategy + licence notes)",
      retrievedAt: "2026-06-21",
      notes: "Records source strategy, leakage rules, ET/penalty cases, and licence notes for the pack.",
    },
  },
  notes:
    "STRETCH backtesting pack (2006). Optional packs (macro, recent form, squads, managers, " +
    "venues/tournamentContext) are intentionally deferred. Sources: OpenFootball (CC0) is the " +
    "permissive fixtures/results route; FIFA ranking values are official conceptually but supplied via a " +
    "public mirror (treat licensing cautiously); eloratings is a small derived Elo reference, not a raw " +
    "dump. Raw source files are NOT committed; checksums are the reproducibility anchor. Stretch-only: this " +
    "does not change the primary four-tournament diagnostics, does not recompute LOTO, and does not approve " +
    "calibration (calibration remains NO-GO).",
};

/** Declared per-confederation entrant counts (from the compact identity row). */
export const WC2006_CONFEDERATION_COUNTS: Record<string, number> = ${JSON.stringify(confederationCounts, null, 2)};

/** Source team display name -> historical team id (historical id space). */
export const WC2006_NAME_TO_ID: Record<string, string> = ${JSON.stringify(NAME_TO_ID, null, 2)};

export const WC2006_PACK: HistoricalSourcePack = ${JSON.stringify(pack, null, 2)};
`;

writeFileSync(OUT, banner);
console.log(
  `wrote ${OUT}: ${teamIds.length} teams, ${results.length} matches, ` +
  `${elo.length} elo, ${fifa.length} fifa\n` +
  `  identity=${identityRaw.sha256}\n  results =${resultsRaw.sha256}\n` +
  `  elo     =${eloRaw.sha256}\n  fifa    =${fifaRaw.sha256}\n  readme  =${readme.sha256}`,
);
