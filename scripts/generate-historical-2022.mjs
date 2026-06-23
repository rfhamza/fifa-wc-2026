#!/usr/bin/env node
/**
 * Phase 1.18B-2 - WC-2022 historical source-pack snapshot generator (dev-only).
 * ---------------------------------------------------------------------------
 * Transcribes the USER-SUPPLIED, source-backed WC-2022 pilot pack (4 CSVs + a
 * README of source notes) into the committed, derived TypeScript snapshot
 * `data/historical/snapshots/wc-2022.ts`. Raw CSV/MD files are NOT committed;
 * only the derived snapshot is. Deterministic; no network.
 *
 * Usage:
 *   node scripts/generate-historical-2022.mjs <dir-with-raw-files>
 *   (or set WC2022_RAW_DIR=<dir>)
 *
 * The supplied raw files are the reproducibility anchor: each file's SHA-256 is
 * recorded in the snapshot provenance (WC2022_SOURCE). This snapshot lives in the
 * ISOLATED backtesting layer (`data/historical/`, `lib/backtesting/`): it is NEVER
 * imported by the production 2026 app, nothing is wired into the model, and no
 * probability changes. See docs/BACKTESTING_WC2022_SNAPSHOT.md.
 *
 * Normalization performed here (compact raw -> normalized contract):
 *  - identity: 1 compact row (groups/confederations encoded as strings) ->
 *    normalized HistoricalTournamentIdentity (teamIds[], groups{}, confederations{},
 *    hostCountries[], openingKickoff, format, bracket).
 *  - results: stage labels ("group stage" -> "group", "round of 16" ->
 *    "round-of-16", "third-place match" -> "third-place", ...) and outcomes
 *    ("teamA_win" -> "A", "draw" -> "D", "teamB_win" -> "B"); goalsA/goalsB are the
 *    90-MINUTE goals (goalsAAt90/goalsBAt90); extra time / penalties recorded
 *    separately. Results are OUTCOMES ONLY, never pre-tournament features.
 *  - elo/fifa: pass-through values mapped to historical team ids; Qatar Elo kept at
 *    the unadjusted eloratings 1680 (NOT ProFootballLogic's host-adjusted 1780).
 *
 * LEAKAGE: every Elo asOfDate and FIFA rankingDate is strictly before the 2022
 * opening kickoff (2022-11-20T19:00:00+03:00 = 2022-11-20T16:00:00Z). FIFA uses the
 * last pre-tournament release (2022-10-06), NOT the post-tournament 2022-12-22 one.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const RAW_DIR = process.argv[2] ?? process.env.WC2022_RAW_DIR;
if (!RAW_DIR) {
  console.error("usage: node scripts/generate-historical-2022.mjs <dir-with-raw-files>");
  process.exit(2);
}
const OUT = "data/historical/snapshots/wc-2022.ts";
const OPENING_KICKOFF = "2022-11-20T19:00:00+03:00"; // = 2022-11-20T16:00:00Z (leakage cutoff)

const FILES = {
  readme: "README_SOURCE_NOTES.md",
  identity: "wc2022-identity.csv",
  results: "wc2022-results.csv",
  elo: "wc2022-elo.csv",
  fifa: "wc2022-fifa.csv",
};

/** Read a raw file and its SHA-256 (raw is NOT committed; checksum is the anchor). */
const readRaw = (name) => {
  const raw = readFileSync(join(RAW_DIR, name), "utf8");
  const sha256 = createHash("sha256").update(raw).digest("hex");
  return { raw, sha256 };
};

/**
 * Source team display name -> historical team id (historical id space).
 * Reuses the 2026 repo slug where the nation also plays in 2026; adds new slugs for
 * nations absent from the 2026 field (wales, poland, denmark, costa-rica, serbia,
 * cameroon). The validator asserts all 32 identity/result/elo/fifa teams resolve.
 */
const NAME_TO_ID = {
  Qatar: "qatar", Ecuador: "ecuador", Senegal: "senegal", Netherlands: "netherlands",
  England: "england", Iran: "iran", "United States": "usa", Wales: "wales",
  Argentina: "argentina", "Saudi Arabia": "saudi-arabia", Mexico: "mexico", Poland: "poland",
  France: "france", Australia: "australia", Denmark: "denmark", Tunisia: "tunisia",
  Spain: "spain", "Costa Rica": "costa-rica", Germany: "germany", Japan: "japan",
  Belgium: "belgium", Canada: "canada", Morocco: "morocco", Croatia: "croatia",
  Brazil: "brazil", Serbia: "serbia", Switzerland: "switzerland", Cameroon: "cameroon",
  Portugal: "portugal", Ghana: "ghana", Uruguay: "uruguay", "South Korea": "south-korea",
};

/**
 * teamId -> confederation. The compact identity row carries only aggregate counts
 * (AFC=6; CAF=5; CONCACAF=4; CONMEBOL=4; UEFA=13; OFC=0); per-team membership is the
 * well-known 2022 FIFA confederation fact. The validator cross-checks that the tally
 * of this map equals the identity-declared counts.
 */
const CONFEDERATION_BY_ID = {
  qatar: "AFC", iran: "AFC", "saudi-arabia": "AFC", australia: "AFC", japan: "AFC", "south-korea": "AFC",
  senegal: "CAF", tunisia: "CAF", morocco: "CAF", cameroon: "CAF", ghana: "CAF",
  usa: "CONCACAF", mexico: "CONCACAF", canada: "CONCACAF", "costa-rica": "CONCACAF",
  ecuador: "CONMEBOL", argentina: "CONMEBOL", brazil: "CONMEBOL", uruguay: "CONMEBOL",
  netherlands: "UEFA", england: "UEFA", wales: "UEFA", poland: "UEFA", france: "UEFA",
  denmark: "UEFA", spain: "UEFA", germany: "UEFA", belgium: "UEFA", croatia: "UEFA",
  serbia: "UEFA", switzerland: "UEFA", portugal: "UEFA",
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

// groups: "A: Qatar|Ecuador|...; B: ..." -> { A: [ids], ... }
const groups = {};
for (const seg of groupsText.split(";")) {
  const [g, teams] = seg.split(":");
  if (!g || !teams) continue;
  groups[g.trim()] = teams.split("|").map((t) => id(t));
}
const groupTeamIds = Object.values(groups).flat();
const teamIds = [...groupTeamIds].sort((a, b) => a.localeCompare(b));

// confederation counts string -> { AFC: 6, ... } (cross-check anchor)
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
  tournamentYear: 2022,
  hostCountries: [hostCountry],
  openingKickoff: OPENING_KICKOFF,
  format: "32-team-8-groups",
  teamIds,
  confederations,
  groups,
  bracket,
  provenance: {
    sourceName: "OpenFootball World Cup repository + FIFA Qatar 2022 tournament page (user-supplied derived CSV)",
    sourceUrl: identitySourceRef,
    sourceFile: FILES.identity,
    sha256: identityRaw.sha256,
    licence: "OpenFootball CC0-1.0; Fjelstul (richer coverage) CC-BY-SA-4.0; FIFA pages reference-only",
    retrievedAt: "2026-06-21",
    notes:
      "Compact raw identity (1 row, groups/confederations as strings) normalized to teamIds[]/groups{}/confederations{}. " +
      "Per-team confederation is the known 2022 FIFA membership; aggregate counts (" + confCountsText + ") cross-checked by the validator. " +
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
 * Phase 1.18B-2 - WC-2022 historical source-pack snapshot (32 teams, 64 matches).
 * GENERATED by scripts/generate-historical-2022.mjs - DO NOT EDIT BY HAND.
 *
 * ISOLATED + UNWIRED: part of the backtesting layer (\`data/historical/\`,
 * \`lib/backtesting/\`). NEVER imported by the production 2026 app; nothing is wired
 * into lib/model/*; no probabilities change; no calibration, no match-level harness,
 * no tournament replay in this phase. Validated by lib/backtesting/validate-historical.ts.
 *
 * DERIVED-ONLY: raw CSV/MD source files are NOT committed; their SHA-256 anchors live
 * in WC2022_SOURCE. Pilot to prove the source-pack contract, team mapping, leakage
 * controls, provenance/checksums, and validation flow on one clean recent tournament.
 *
 * LEAKAGE: every Elo asOfDate and FIFA rankingDate is strictly before the opening
 * kickoff (${OPENING_KICKOFF} = 2022-11-20T16:00:00Z). FIFA uses the last
 * pre-tournament release (2022-10-06), NOT the post-tournament 2022-12-22 ranking.
 * Match results are OUTCOMES ONLY and must never feed a pre-tournament feature;
 * goalsA/goalsB are the 90-minute goals (ET/penalties recorded separately).
 *
 * Qatar Elo is the unadjusted eloratings value 1680 (asOf 2022-11-09), NOT
 * ProFootballLogic's host-adjusted 1780; see WC2022_SOURCE.notes.
 */
import type { HistoricalSourcePack, BacktestProvenance } from "@/lib/backtesting/types";

/** Per-file source provenance + SHA-256 anchors (raw files NOT committed). */
export const WC2022_SOURCE: {
  label: string;
  openingKickoff: string;
  retrievedAt: string;
  files: Record<string, BacktestProvenance>;
  notes: string;
} = {
  label: "FIFA World Cup 2022 (Qatar) historical source pack - backtesting pilot",
  openingKickoff: ${JSON.stringify(OPENING_KICKOFF)},
  retrievedAt: "2026-06-21",
  files: {
    identity: {
      sourceName: "OpenFootball World Cup repository + FIFA Qatar 2022 page",
      sourceUrl: "https://github.com/openfootball/worldcup",
      sourceFile: ${JSON.stringify(FILES.identity)},
      sha256: ${JSON.stringify(identityRaw.sha256)},
      licence: "OpenFootball CC0-1.0 (Fjelstul alt. CC-BY-SA-4.0); FIFA page reference-only",
      retrievedAt: "2026-06-21",
      notes: "Compact 1-row identity normalized into the snapshot; raw not committed.",
    },
    results: {
      sourceName: "OpenFootball World Cup repository + FIFA Qatar 2022 page",
      sourceUrl: "https://github.com/openfootball/worldcup",
      sourceFile: ${JSON.stringify(FILES.results)},
      sha256: ${JSON.stringify(resultsRaw.sha256)},
      licence: "OpenFootball CC0-1.0 (Fjelstul alt. CC-BY-SA-4.0)",
      retrievedAt: "2026-06-21",
      notes: "64 matches; stage/outcome labels normalized to contract enums; outcomes only.",
    },
    elo: {
      sourceName: "ProFootballLogic 2022 WC odds page (Elo sourced from eloratings.net)",
      sourceUrl: "https://www.eloratings.net/",
      sourceFile: ${JSON.stringify(FILES.elo)},
      sha256: ${JSON.stringify(eloRaw.sha256)},
      licence: "eloratings/ProFootballLogic reference; small derived values only",
      retrievedAt: "2026-06-21",
      asOfDate: "2022-11-19",
      notes:
        "Pre-tournament Elo as-of 2022-11-19 (Qatar 2022-11-09). Qatar = 1680 (unadjusted " +
        "eloratings), NOT ProFootballLogic's host-adjusted 1780. All dates < opening kickoff.",
    },
    fifa: {
      sourceName: "FIFA men's ranking 2022-10-06 (public CSV mirror + official FIFA context)",
      sourceUrl: "https://inside.fifa.com/fifa-world-ranking/men",
      sourceFile: ${JSON.stringify(FILES.fifa)},
      sha256: ${JSON.stringify(fifaRaw.sha256)},
      licence: "Public CSV mirror licensing unclear / reference-grade; official values conceptually",
      retrievedAt: "2026-06-21",
      asOfDate: "2022-10-06",
      notes:
        "Last pre-tournament FIFA release (2022-10-06); the post-tournament 2022-12-22 ranking is " +
        "deliberately NOT used. Raw mirror not committed - SHA-256 is the anchor.",
    },
    readme: {
      sourceName: "User-supplied source notes (README_SOURCE_NOTES.md)",
      sourceFile: ${JSON.stringify(FILES.readme)},
      sha256: ${JSON.stringify(readme.sha256)},
      licence: "n/a (documentation of source strategy + licence notes)",
      retrievedAt: "2026-06-21",
      notes: "Records source strategy, leakage rules, and licence notes for the pilot pack.",
    },
  },
  notes:
    "Backtesting pilot pack (2022 only). Optional packs (macro, recent form, squads, managers, " +
    "venues/tournamentContext) are intentionally deferred. Sources: OpenFootball (CC0) is the " +
    "permissive fixtures/results route; Fjelstul is recommended for richer coverage but carries " +
    "CC-BY-SA obligations; FIFA ranking values are official conceptually but supplied via a public " +
    "mirror (treat licensing cautiously); ProFootballLogic/eloratings are small derived Elo " +
    "references, not raw dumps. Raw source files are NOT committed; checksums are the reproducibility anchor.",
};

/** Declared per-confederation entrant counts (from the compact identity row). */
export const WC2022_CONFEDERATION_COUNTS: Record<string, number> = ${JSON.stringify(confederationCounts, null, 2)};

/** Source team display name -> historical team id (historical id space). */
export const WC2022_NAME_TO_ID: Record<string, string> = ${JSON.stringify(NAME_TO_ID, null, 2)};

export const WC2022_PACK: HistoricalSourcePack = ${JSON.stringify(pack, null, 2)};
`;

writeFileSync(OUT, banner);
console.log(
  `wrote ${OUT}: ${teamIds.length} teams, ${results.length} matches, ` +
  `${elo.length} elo, ${fifa.length} fifa\n` +
  `  identity=${identityRaw.sha256}\n  results =${resultsRaw.sha256}\n` +
  `  elo     =${eloRaw.sha256}\n  fifa    =${fifaRaw.sha256}\n  readme  =${readme.sha256}`,
);
