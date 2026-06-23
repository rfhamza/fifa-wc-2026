#!/usr/bin/env node
/**
 * Phase 1.18B-8 - WC-2010 historical source-pack snapshot generator (dev-only).
 * ---------------------------------------------------------------------------
 * Transcribes the USER-SUPPLIED, source-backed WC-2010 pack (4 CSVs + a README of
 * source notes) into the committed, derived TypeScript snapshot
 * `data/historical/snapshots/wc-2010.ts`. Raw CSV/MD files are NOT committed; only
 * the derived snapshot is. Deterministic; no network.
 *
 * This is a DEDICATED copy of the 2014 generator pattern with 2010-specific
 * constants (it intentionally does NOT refactor the 2014/2018/2022 generators). A
 * shared generator remains deferred.
 *
 * Usage:
 *   node scripts/generate-historical-2010.mjs <dir-with-raw-files>
 *   (or set WC2010_RAW_DIR=<dir>)
 *
 * The supplied raw files are the reproducibility anchor: each file's SHA-256 is
 * recorded in the snapshot provenance (WC2010_SOURCE). This snapshot lives in the
 * ISOLATED backtesting layer (`data/historical/`, `lib/backtesting/`): it is NEVER
 * imported by the production 2026 app, nothing is wired into the model, and no
 * probability changes. See docs/BACKTESTING_WC2010_SNAPSHOT.md.
 *
 * 2010 raw-format specifics (same as 2014):
 *  - identity `groups` is JSON ({"A": ["South Africa", ...], ...}); `confederations`
 *    is colon-style ("AFC:4; CAF:6; ...").
 *  - results stage labels are capitalized ("Group stage", "Round of 16", ...) -
 *    lowercased before mapping to contract enums; `resultAt90` raw values are
 *    `teamA`/`draw`/`teamB` -> `A`/`D`/`B`; the extra-time flag column is `extraTime`.
 *  - the raw `goalsA`/`goalsB` are the AFTER-EXTRA-TIME score; the derived snapshot's
 *    `goalsA`/`goalsB` use the 90-MINUTE score (`goalsAAt90`/`goalsBAt90`), matching
 *    the existing 2022/2018/2014 snapshot convention. ET / penalties (penalties MADE,
 *    not attempts) are recorded separately. Results are OUTCOMES ONLY, never features.
 *  - elo/fifa: pass-through values mapped to historical team ids.
 *
 * North Korea is mapped to a DISTINCT historical id (north-korea), never conflated
 * with south-korea. New Zealand is the sole OFC entrant (OFC:1).
 *
 * LEAKAGE: every Elo asOfDate (2010-06-10) and FIFA rankingDate (2010-05-26) is
 * strictly before the 2010 opening kickoff (2010-06-11T16:00:00+02:00 =
 * 2010-06-11T14:00:00Z). FIFA uses the last pre-tournament release (2010-05-26),
 * NOT any post-tournament ranking.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const RAW_DIR = process.argv[2] ?? process.env.WC2010_RAW_DIR;
if (!RAW_DIR) {
  console.error("usage: node scripts/generate-historical-2010.mjs <dir-with-raw-files>");
  process.exit(2);
}
const OUT = "data/historical/snapshots/wc-2010.ts";
const OPENING_KICKOFF = "2010-06-11T16:00:00+02:00"; // = 2010-06-11T14:00:00Z (leakage cutoff)

const FILES = {
  readme: "README_SOURCE_NOTES.md",
  identity: "wc2010-identity.csv",
  results: "wc2010-results.csv",
  elo: "wc2010-elo.csv",
  fifa: "wc2010-fifa.csv",
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
 * project (2026 `data/official/teams.ts`, or the 2022/2018/2014 snapshots). Only
 * slovenia/slovakia/north-korea are new historical slugs (no canonical id exists).
 * CRITICAL: North Korea (Korea DPR / DPR Korea) maps to north-korea, distinct from
 * south-korea (Korea Republic) - never conflated.
 */
const NAME_TO_ID = {
  "South Africa": "south-africa", Mexico: "mexico", Uruguay: "uruguay", France: "france",
  Argentina: "argentina", Nigeria: "nigeria", "South Korea": "south-korea", Greece: "greece",
  England: "england", USA: "usa", Algeria: "algeria", Slovenia: "slovenia",
  Germany: "germany", Australia: "australia", Serbia: "serbia", Ghana: "ghana",
  Netherlands: "netherlands", Denmark: "denmark", Japan: "japan", Cameroon: "cameroon",
  Italy: "italy", Paraguay: "paraguay", "New Zealand": "new-zealand", Slovakia: "slovakia",
  Brazil: "brazil", "North Korea": "north-korea", "Côte d'Ivoire": "ivory-coast", Portugal: "portugal",
  Spain: "spain", Switzerland: "switzerland", Honduras: "honduras", Chile: "chile",
  // aliases (not necessarily present in this pack, kept for robustness)
  "Ivory Coast": "ivory-coast", "United States": "usa", "Korea Republic": "south-korea",
  "Korea DPR": "north-korea", "DPR Korea": "north-korea", Holland: "netherlands",
};

/**
 * teamId -> confederation. The compact identity row carries only aggregate counts
 * (AFC:4; CAF:6; CONCACAF:3; CONMEBOL:5; UEFA:13; OFC:1); per-team membership is the
 * well-known 2010 FIFA confederation fact. The validator cross-checks that the tally
 * of this map equals the identity-declared counts. New Zealand is the sole OFC team.
 */
const CONFEDERATION_BY_ID = {
  "south-korea": "AFC", australia: "AFC", japan: "AFC", "north-korea": "AFC",
  "south-africa": "CAF", nigeria: "CAF", algeria: "CAF", ghana: "CAF", cameroon: "CAF", "ivory-coast": "CAF",
  mexico: "CONCACAF", usa: "CONCACAF", honduras: "CONCACAF",
  uruguay: "CONMEBOL", argentina: "CONMEBOL", paraguay: "CONMEBOL", brazil: "CONMEBOL", chile: "CONMEBOL",
  france: "UEFA", greece: "UEFA", england: "UEFA", slovenia: "UEFA", germany: "UEFA", serbia: "UEFA",
  netherlands: "UEFA", denmark: "UEFA", italy: "UEFA", slovakia: "UEFA", portugal: "UEFA",
  spain: "UEFA", switzerland: "UEFA",
  "new-zealand": "OFC",
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

// groups: JSON {"A": ["South Africa", ...], ...} -> { A: [ids], ... }
const rawGroups = JSON.parse(groupsText);
const groups = {};
for (const [g, names] of Object.entries(rawGroups)) {
  groups[g.trim()] = names.map((t) => id(t));
}
const groupTeamIds = Object.values(groups).flat();
const teamIds = [...groupTeamIds].sort((a, b) => a.localeCompare(b));

// confederation counts string ("AFC:4; CAF:6; ...") -> { AFC: 4, ... } (cross-check anchor)
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

// bracket: 2010 uses a match-numbered description ("Round of 16: M49 1A-2B, ...").
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
  // Derived snapshot goalsA/goalsB use the 90-minute score (NOT after-ET).
  const goalsA = Number(f[R("goalsAAt90")]);
  const goalsB = Number(f[R("goalsBAt90")]);
  const groupVal = f[R("group")].trim();
  const wentToExtraTime = bool(f[R("extraTime")]);
  const pA = num(f[R("penaltiesA")]);
  const pB = num(f[R("penaltiesB")]);
  // Actual knockout winner (after ET/penalties), source-backed from the raw `winner`
  // column. RECONSTRUCTION METADATA ONLY - never used for 90-minute W/D/L scoring and
  // never drives resultAt90. Emitted on knockout matches only; group-stage rows omit it.
  let winner;
  if (stage !== "group") {
    const rawWinner = f[R("winner")].trim();
    if (rawWinner !== "") {
      const wTeamA = id(f[R("teamA")]);
      const wTeamB = id(f[R("teamB")]);
      const w = id(rawWinner); // fail-fast: throws if the raw winner name is unmapped
      const mid = f[R("matchId")].trim();
      if (w !== wTeamA && w !== wTeamB) throw new Error(`winner "${rawWinner}" is neither teamA nor teamB in ${mid}`);
      if (resultAt90 === "A" && w !== wTeamA) throw new Error(`winner contradicts decisive resultAt90 in ${mid}`);
      if (resultAt90 === "B" && w !== wTeamB) throw new Error(`winner contradicts decisive resultAt90 in ${mid}`);
      if (pA !== undefined && pB !== undefined) {
        const penWinner = pA > pB ? wTeamA : wTeamB;
        if (w !== penWinner) throw new Error(`winner contradicts penalty winner in ${mid}`);
      }
      winner = w;
    }
  }
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
    ...(winner ? { winner } : {}),
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
// 4. Pre-tournament FIFA ranking
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
  tournamentYear: 2010,
  hostCountries: [hostCountry],
  openingKickoff: OPENING_KICKOFF,
  format: "32-team-8-groups",
  teamIds,
  confederations,
  groups,
  bracket,
  provenance: {
    sourceName: "OpenFootball World Cup repository (2010--south-africa) + FIFA 2010 page (user-supplied derived CSV)",
    sourceUrl: identitySourceRef,
    sourceFile: FILES.identity,
    sha256: identityRaw.sha256,
    licence: "OpenFootball CC0-1.0; Fjelstul (richer coverage) CC-BY-SA-4.0; FIFA pages reference-only",
    retrievedAt: "2026-06-21",
    notes:
      "Compact raw identity (1 row; groups as JSON, confederations as colon-style string) normalized to " +
      "teamIds[]/groups{}/confederations{}. Per-team confederation is the known 2010 FIFA membership; " +
      "aggregate counts (" + confCountsText + ") cross-checked by the validator. format text: " +
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
 * Phase 1.18B-8 - WC-2010 historical source-pack snapshot (32 teams, 64 matches).
 * GENERATED by scripts/generate-historical-2010.mjs - DO NOT EDIT BY HAND.
 *
 * ISOLATED + UNWIRED: part of the backtesting layer (\`data/historical/\`,
 * \`lib/backtesting/\`). NEVER imported by the production 2026 app; nothing is wired
 * into lib/model/*; no probabilities change; no calibration, no tournament replay.
 * Validated by lib/backtesting/validate-historical.ts.
 *
 * DERIVED-ONLY: raw CSV/MD source files are NOT committed; their SHA-256 anchors live
 * in WC2010_SOURCE. Fourth historical pack (after 2022, 2018, 2014); completes the
 * primary scope (2010, 2014, 2018, 2022). Per-tournament diagnostics are NOT pooled.
 *
 * LEAKAGE: every Elo asOfDate (2010-06-10) and FIFA rankingDate (2010-05-26) is
 * strictly before the opening kickoff (${OPENING_KICKOFF} = 2010-06-11T14:00:00Z).
 * Match results are OUTCOMES ONLY and must never feed a pre-tournament feature.
 *
 * SCORE CONVENTION (mirrors 2022/2018/2014): snapshot goalsA/goalsB store the
 * 90-MINUTE score; resultAt90 is derived from the 90' score; extra time
 * (afterExtraTime) and penalties (penalties MADE, not attempts) are recorded
 * separately. The evaluator targets only 90-minute W/D/L. Final: Netherlands 0-1
 * Spain after extra time (0-0 at 90, so goalsA=0/goalsB=0, resultAt90 "D",
 * afterExtraTime true).
 *
 * North Korea (north-korea) is DISTINCT from South Korea (south-korea); New Zealand
 * is the sole OFC entrant (OFC:1).
 */
import type { HistoricalSourcePack, BacktestProvenance } from "@/lib/backtesting/types";

/** Per-file source provenance + SHA-256 anchors (raw files NOT committed). */
export const WC2010_SOURCE: {
  label: string;
  openingKickoff: string;
  retrievedAt: string;
  files: Record<string, BacktestProvenance>;
  notes: string;
} = {
  label: "FIFA World Cup 2010 (South Africa) historical source pack - backtesting",
  openingKickoff: ${JSON.stringify(OPENING_KICKOFF)},
  retrievedAt: "2026-06-21",
  files: {
    identity: {
      sourceName: "OpenFootball World Cup repository (2010--south-africa) + FIFA 2010 page",
      sourceUrl: "https://github.com/openfootball/worldcup",
      sourceFile: ${JSON.stringify(FILES.identity)},
      sha256: ${JSON.stringify(identityRaw.sha256)},
      licence: "OpenFootball CC0-1.0 (Fjelstul alt. CC-BY-SA-4.0); FIFA page reference-only",
      retrievedAt: "2026-06-21",
      notes: "Compact 1-row identity (JSON groups, colon-style confederations) normalized; raw not committed.",
    },
    results: {
      sourceName: "OpenFootball World Cup repository (2010--south-africa)",
      sourceUrl: "https://github.com/openfootball/worldcup",
      sourceFile: ${JSON.stringify(FILES.results)},
      sha256: ${JSON.stringify(resultsRaw.sha256)},
      licence: "OpenFootball CC0-1.0 (Fjelstul alt. CC-BY-SA-4.0)",
      retrievedAt: "2026-06-21",
      notes:
        "64 matches; stage/outcome labels normalized to contract enums; outcomes only. Snapshot " +
        "goalsA/goalsB = 90-minute score (raw goalsA/goalsB are after-ET). Final: Netherlands 0-1 Spain AET.",
    },
    elo: {
      sourceName: "World Football Elo Ratings 2010 World Cup start (eloratings.net)",
      sourceUrl: "https://www.eloratings.net/2010_World_Cup_start",
      sourceFile: ${JSON.stringify(FILES.elo)},
      sha256: ${JSON.stringify(eloRaw.sha256)},
      licence: "eloratings/international-football.net reference; small derived values only",
      retrievedAt: "2026-06-21",
      asOfDate: "2010-06-10",
      notes: "Pre-tournament Elo as-of 2010-06-10, strictly before the opening kickoff. No host adjustment.",
    },
    fifa: {
      sourceName: "FIFA men's ranking 2010-05-26 (en.fifaranking.net mirror)",
      sourceUrl: "https://en.fifaranking.net/ranking/index.php?d=2010-05-26",
      sourceFile: ${JSON.stringify(FILES.fifa)},
      sha256: ${JSON.stringify(fifaRaw.sha256)},
      licence: "Public ranking mirror licensing unclear / reference-grade; official values conceptually",
      retrievedAt: "2026-06-21",
      asOfDate: "2010-05-26",
      notes:
        "Last pre-tournament FIFA release (exact date 2010-05-26); no post-tournament ranking used. Raw " +
        "mirror not committed - SHA-256 is the anchor.",
    },
    readme: {
      sourceName: "User-supplied source notes (README_SOURCE_NOTES.md)",
      sourceFile: ${JSON.stringify(FILES.readme)},
      sha256: ${JSON.stringify(readme.sha256)},
      licence: "n/a (documentation of source strategy + licence notes)",
      retrievedAt: "2026-06-21",
      notes: "Records source strategy, leakage rules, and licence notes for the pack.",
    },
  },
  notes:
    "Backtesting pack (2010). Optional packs (macro, recent form, squads, managers, " +
    "venues/tournamentContext) are intentionally deferred. Sources: OpenFootball (CC0) is the " +
    "permissive fixtures/results route; Fjelstul is the richer backbone but carries CC-BY-SA " +
    "obligations; FIFA ranking values are official conceptually but supplied via a public mirror " +
    "(treat licensing cautiously); eloratings is a small derived Elo reference, not a raw dump. " +
    "Raw source files are NOT committed; checksums are the reproducibility anchor.",
};

/** Declared per-confederation entrant counts (from the compact identity row). */
export const WC2010_CONFEDERATION_COUNTS: Record<string, number> = ${JSON.stringify(confederationCounts, null, 2)};

/** Source team display name -> historical team id (historical id space). */
export const WC2010_NAME_TO_ID: Record<string, string> = ${JSON.stringify(NAME_TO_ID, null, 2)};

export const WC2010_PACK: HistoricalSourcePack = ${JSON.stringify(pack, null, 2)};
`;

writeFileSync(OUT, banner);
console.log(
  `wrote ${OUT}: ${teamIds.length} teams, ${results.length} matches, ` +
  `${elo.length} elo, ${fifa.length} fifa\n` +
  `  identity=${identityRaw.sha256}\n  results =${resultsRaw.sha256}\n` +
  `  elo     =${eloRaw.sha256}\n  fifa    =${fifaRaw.sha256}\n  readme  =${readme.sha256}`,
);
