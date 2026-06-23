#!/usr/bin/env node
/**
 * Phase 1.18B-4 - WC-2018 historical source-pack snapshot generator (dev-only).
 * ---------------------------------------------------------------------------
 * Transcribes the USER-SUPPLIED, source-backed WC-2018 pack (4 CSVs + a README of
 * source notes) into the committed, derived TypeScript snapshot
 * `data/historical/snapshots/wc-2018.ts`. Raw CSV/MD files are NOT committed; only
 * the derived snapshot is. Deterministic; no network.
 *
 * This is a DEDICATED copy of the 2022 generator pattern with 2018-specific
 * constants (it intentionally does NOT refactor the 2022 generator). A shared
 * generator is deferred until a third tournament (2014) justifies extraction.
 *
 * Usage:
 *   node scripts/generate-historical-2018.mjs <dir-with-raw-files>
 *   (or set WC2018_RAW_DIR=<dir>)
 *
 * The supplied raw files are the reproducibility anchor: each file's SHA-256 is
 * recorded in the snapshot provenance (WC2018_SOURCE). This snapshot lives in the
 * ISOLATED backtesting layer (`data/historical/`, `lib/backtesting/`): it is NEVER
 * imported by the production 2026 app, nothing is wired into the model, and no
 * probability changes. See docs/BACKTESTING_WC2018_SNAPSHOT.md.
 *
 * Normalization performed here (compact raw -> normalized contract):
 *  - identity: 1 compact row (groups/confederations encoded as strings) ->
 *    normalized HistoricalTournamentIdentity (teamIds[], groups{}, confederations{},
 *    hostCountries[], openingKickoff, format, bracket).
 *  - results: stage labels ("group stage" -> "group", "round of 16" ->
 *    "round-of-16", "third-place match" -> "third-place", ...) and outcomes
 *    ("teamA_win" -> "A", "draw" -> "D", "teamB_win" -> "B"); goalsA/goalsB are the
 *    90-MINUTE goals (goalsAAt90/goalsBAt90); extra time / penalties (penalties MADE,
 *    not attempts) recorded separately. Results are OUTCOMES ONLY, never features.
 *  - elo/fifa: pass-through values mapped to historical team ids.
 *
 * LEAKAGE: every Elo asOfDate (2018-06-13) and FIFA rankingDate (2018-06-07) is
 * strictly before the 2018 opening kickoff (2018-06-14T18:00:00+03:00 =
 * 2018-06-14T15:00:00Z). FIFA uses the last pre-tournament release (2018-06-07),
 * NOT the post-tournament July 2018 ranking.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const RAW_DIR = process.argv[2] ?? process.env.WC2018_RAW_DIR;
if (!RAW_DIR) {
  console.error("usage: node scripts/generate-historical-2018.mjs <dir-with-raw-files>");
  process.exit(2);
}
const OUT = "data/historical/snapshots/wc-2018.ts";
const OPENING_KICKOFF = "2018-06-14T18:00:00+03:00"; // = 2018-06-14T15:00:00Z (leakage cutoff)

const FILES = {
  readme: "README_SOURCE_NOTES.md",
  identity: "wc2018-identity.csv",
  results: "wc2018-results.csv",
  elo: "wc2018-elo.csv",
  fifa: "wc2018-fifa.csv",
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
 * project (2026 `data/official/teams.ts` or the 2022 historical snapshot). Only
 * russia/peru/iceland/nigeria are new historical slugs (no canonical id exists). The
 * validator asserts all 32 identity/result/elo/fifa teams resolve.
 */
const NAME_TO_ID = {
  Russia: "russia", "Saudi Arabia": "saudi-arabia", Egypt: "egypt", Uruguay: "uruguay",
  Portugal: "portugal", Spain: "spain", Morocco: "morocco", Iran: "iran",
  France: "france", Australia: "australia", Peru: "peru", Denmark: "denmark",
  Argentina: "argentina", Iceland: "iceland", Croatia: "croatia", Nigeria: "nigeria",
  Brazil: "brazil", Switzerland: "switzerland", "Costa Rica": "costa-rica", Serbia: "serbia",
  Germany: "germany", Mexico: "mexico", Sweden: "sweden", "South Korea": "south-korea",
  Belgium: "belgium", Panama: "panama", Tunisia: "tunisia", England: "england",
  Poland: "poland", Senegal: "senegal", Colombia: "colombia", Japan: "japan",
};

/**
 * teamId -> confederation. The compact identity row carries only aggregate counts
 * (AFC=5; CAF=5; CONCACAF=3; CONMEBOL=5; UEFA=14; OFC=0); per-team membership is the
 * well-known 2018 FIFA confederation fact. The validator cross-checks that the tally
 * of this map equals the identity-declared counts.
 */
const CONFEDERATION_BY_ID = {
  "saudi-arabia": "AFC", iran: "AFC", australia: "AFC", "south-korea": "AFC", japan: "AFC",
  egypt: "CAF", morocco: "CAF", nigeria: "CAF", tunisia: "CAF", senegal: "CAF",
  mexico: "CONCACAF", "costa-rica": "CONCACAF", panama: "CONCACAF",
  uruguay: "CONMEBOL", peru: "CONMEBOL", argentina: "CONMEBOL", brazil: "CONMEBOL", colombia: "CONMEBOL",
  russia: "UEFA", portugal: "UEFA", spain: "UEFA", france: "UEFA", denmark: "UEFA",
  iceland: "UEFA", croatia: "UEFA", switzerland: "UEFA", serbia: "UEFA", germany: "UEFA",
  sweden: "UEFA", belgium: "UEFA", england: "UEFA", poland: "UEFA",
};

const id = (name) => {
  const teamId = NAME_TO_ID[name.trim()];
  if (!teamId) throw new Error(`unmapped team name: "${name}"`);
  return teamId;
};

/** Minimal CSV splitter honouring double-quoted fields (identity has quoted commas). */
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
// 1. Identity (compact 1 row -> normalized)
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

// groups: "A: Russia|Saudi Arabia|...; B: ..." -> { A: [ids], ... }
const groups = {};
for (const seg of groupsText.split(";")) {
  const [g, teams] = seg.split(":");
  if (!g || !teams) continue;
  groups[g.trim()] = teams.split("|").map((t) => id(t));
}
const groupTeamIds = Object.values(groups).flat();
const teamIds = [...groupTeamIds].sort((a, b) => a.localeCompare(b));

// confederation counts string -> { AFC: 5, ... } (cross-check anchor)
const confederationCounts = {};
for (const seg of confCountsText.split(";")) {
  const [k, v] = seg.split("=");
  if (k && v !== undefined) confederationCounts[k.trim()] = Number(v.trim());
}
const confederations = {};
for (const tid of teamIds) {
  const conf = CONFEDERATION_BY_ID[tid];
  if (!conf) throw new Error(`no confederation mapped for ${tid}`);
  confederations[tid] = conf;
}

// bracket: keep the raw R16 pairing string plus a parsed R16 edge list (slot -> winners).
const r16Match = bracketText.match(/R16:\s*([^;]+)/);
const roundOf16 = r16Match
  ? r16Match[1].split(",").map((p) => {
      const [home, away] = p.trim().split("-");
      return { home: home.trim(), away: away.trim() };
    })
  : [];
const bracket = {
  description: bracketText,
  roundOf16,
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
const OUTCOME_MAP = { teamA_win: "A", draw: "D", teamB_win: "B" };
const rCsv = parseCsv(resultsRaw.raw);
const R = rCsv.ix;
const num = (s) => (s === "" || s == null ? undefined : Number(s));
const bool = (s) => String(s).trim().toUpperCase() === "TRUE";

const results = rCsv.rows.map((f) => {
  const rawStage = f[R("stage")].trim();
  const stage = STAGE_MAP[rawStage];
  if (!stage) throw new Error(`unmapped stage "${rawStage}"`);
  const rawOutcome = f[R("resultAt90")].trim();
  const resultAt90 = OUTCOME_MAP[rawOutcome];
  if (!resultAt90) throw new Error(`unmapped resultAt90 "${rawOutcome}"`);
  const goalsA = Number(f[R("goalsAAt90")]);
  const goalsB = Number(f[R("goalsBAt90")]);
  const groupVal = f[R("group")].trim();
  const wentToExtraTime = bool(f[R("wentToExtraTime")]);
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
  tournamentYear: 2018,
  hostCountries: [hostCountry],
  openingKickoff: OPENING_KICKOFF,
  format: "32-team-8-groups",
  teamIds,
  confederations,
  groups,
  bracket,
  provenance: {
    sourceName: "OpenFootball World Cup repository + FIFA 2018 tournament page (user-supplied derived CSV)",
    sourceUrl: identitySourceRef,
    sourceFile: FILES.identity,
    sha256: identityRaw.sha256,
    licence: "OpenFootball CC0-1.0; Fjelstul (richer coverage) CC-BY-SA-4.0; FIFA pages reference-only",
    retrievedAt: "2026-06-21",
    notes:
      "Compact raw identity (1 row, groups/confederations as strings) normalized to teamIds[]/groups{}/confederations{}. " +
      "Per-team confederation is the known 2018 FIFA membership; aggregate counts (" + confCountsText + ") cross-checked by the validator. " +
      "format text: " + JSON.stringify(formatText) + ".",
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
 * Phase 1.18B-4 - WC-2018 historical source-pack snapshot (32 teams, 64 matches).
 * GENERATED by scripts/generate-historical-2018.mjs - DO NOT EDIT BY HAND.
 *
 * ISOLATED + UNWIRED: part of the backtesting layer (\`data/historical/\`,
 * \`lib/backtesting/\`). NEVER imported by the production 2026 app; nothing is wired
 * into lib/model/*; no probabilities change; no calibration, no tournament replay.
 * Validated by lib/backtesting/validate-historical.ts.
 *
 * DERIVED-ONLY: raw CSV/MD source files are NOT committed; their SHA-256 anchors live
 * in WC2018_SOURCE. Second historical pack (after WC-2022) for the match-level bench.
 *
 * LEAKAGE: every Elo asOfDate (2018-06-13) and FIFA rankingDate (2018-06-07) is
 * strictly before the opening kickoff (${OPENING_KICKOFF} = 2018-06-14T15:00:00Z).
 * FIFA uses the last pre-tournament release (2018-06-07), NOT the post-tournament
 * July 2018 ranking. Match results are OUTCOMES ONLY and must never feed a
 * pre-tournament feature; goalsA/goalsB are the 90-minute goals (ET/penalties, which
 * store penalties MADE not attempts, recorded separately). Final: France 4-2 Croatia.
 */
import type { HistoricalSourcePack, BacktestProvenance } from "@/lib/backtesting/types";

/** Per-file source provenance + SHA-256 anchors (raw files NOT committed). */
export const WC2018_SOURCE: {
  label: string;
  openingKickoff: string;
  retrievedAt: string;
  files: Record<string, BacktestProvenance>;
  notes: string;
} = {
  label: "FIFA World Cup 2018 (Russia) historical source pack - backtesting",
  openingKickoff: ${JSON.stringify(OPENING_KICKOFF)},
  retrievedAt: "2026-06-21",
  files: {
    identity: {
      sourceName: "OpenFootball World Cup repository + FIFA 2018 page (Fjelstul backbone)",
      sourceUrl: "https://github.com/openfootball/worldcup",
      sourceFile: ${JSON.stringify(FILES.identity)},
      sha256: ${JSON.stringify(identityRaw.sha256)},
      licence: "OpenFootball CC0-1.0 (Fjelstul alt. CC-BY-SA-4.0); FIFA page reference-only",
      retrievedAt: "2026-06-21",
      notes: "Compact 1-row identity normalized into the snapshot; raw not committed.",
    },
    results: {
      sourceName: "OpenFootball World Cup repository + FIFA 2018 page",
      sourceUrl: "https://github.com/openfootball/worldcup",
      sourceFile: ${JSON.stringify(FILES.results)},
      sha256: ${JSON.stringify(resultsRaw.sha256)},
      licence: "OpenFootball CC0-1.0 (Fjelstul alt. CC-BY-SA-4.0)",
      retrievedAt: "2026-06-21",
      notes:
        "64 matches; stage/outcome labels normalized to contract enums; outcomes only. " +
        "Final correctly stored France 4-2 Croatia; penalty fields store penalties made.",
    },
    elo: {
      sourceName: "International-football.net Elo table as on 2018-06-13 (calculated on eloratings.net)",
      sourceUrl: "https://www.eloratings.net/",
      sourceFile: ${JSON.stringify(FILES.elo)},
      sha256: ${JSON.stringify(eloRaw.sha256)},
      licence: "eloratings/international-football.net reference; small derived values only",
      retrievedAt: "2026-06-21",
      asOfDate: "2018-06-13",
      notes: "Pre-tournament Elo as-of 2018-06-13, strictly before the opening kickoff.",
    },
    fifa: {
      sourceName: "FIFA men's ranking 2018-06-07 (Dato-Futbol historical CSV + kjytay cross-check)",
      sourceUrl: "https://inside.fifa.com/fifa-world-ranking/men",
      sourceFile: ${JSON.stringify(FILES.fifa)},
      sha256: ${JSON.stringify(fifaRaw.sha256)},
      licence: "Public CSV mirror licensing unclear / reference-grade; official values conceptually",
      retrievedAt: "2026-06-21",
      asOfDate: "2018-06-07",
      notes:
        "Last pre-tournament FIFA release (2018-06-07); the post-tournament July 2018 ranking is " +
        "deliberately NOT used. Raw mirror not committed - SHA-256 is the anchor.",
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
    "Backtesting pack (2018). Optional packs (macro, recent form, squads, managers, " +
    "venues/tournamentContext) are intentionally deferred. Sources: OpenFootball (CC0) is the " +
    "permissive fixtures/results route; Fjelstul is the richer backbone but carries CC-BY-SA " +
    "obligations; FIFA ranking values are official conceptually but supplied via public mirrors " +
    "(treat licensing cautiously); eloratings/international-football.net are small derived Elo " +
    "references, not raw dumps. Raw source files are NOT committed; checksums are the anchor.",
};

/** Declared per-confederation entrant counts (from the compact identity row). */
export const WC2018_CONFEDERATION_COUNTS: Record<string, number> = ${JSON.stringify(confederationCounts, null, 2)};

/** Source team display name -> historical team id (historical id space). */
export const WC2018_NAME_TO_ID: Record<string, string> = ${JSON.stringify(NAME_TO_ID, null, 2)};

export const WC2018_PACK: HistoricalSourcePack = ${JSON.stringify(pack, null, 2)};
`;

writeFileSync(OUT, banner);
console.log(
  `wrote ${OUT}: ${teamIds.length} teams, ${results.length} matches, ` +
  `${elo.length} elo, ${fifa.length} fifa\n` +
  `  identity=${identityRaw.sha256}\n  results =${resultsRaw.sha256}\n` +
  `  elo     =${eloRaw.sha256}\n  fifa    =${fifaRaw.sha256}\n  readme  =${readme.sha256}`,
);
