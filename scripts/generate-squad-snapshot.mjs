#!/usr/bin/env node
/**
 * Phase 1.17B - squad roster snapshot generator (dev-only).
 * --------------------------------------------------------
 * Transcribes the USER-SUPPLIED, pre-derived final-squad PLAYER CSV (source-backed
 * from the FIFA final-squad PDF) into the committed snapshot
 * `data/model-inputs/snapshots/squad-2026-06-11.ts`. Raw CSV/XLSX are NOT committed;
 * only the derived snapshot is. Deterministic; no network.
 *
 * Usage: node scripts/generate-squad-snapshot.mjs <players.csv>  (or SQUAD_CSV=<path>)
 *
 * ROSTER METADATA ONLY - no squad-quality score, nothing wired into the model.
 * LEAKAGE: the FIFA PDF version postdates tournament start; the snapshot is marked
 * leakage-risk and must not feed pre-tournament probabilities.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const CSV = process.argv[2] ?? process.env.SQUAD_CSV;
if (!CSV) {
  console.error("usage: node scripts/generate-squad-snapshot.mjs <players.csv>");
  process.exit(2);
}
const OUT = "data/model-inputs/snapshots/squad-2026-06-11.ts";

/** FIFA code (CSV teamId/fifaCode) -> repo team id. */
const FIFACODE_TO_ID = {
  MEX: "mexico", KOR: "south-korea", RSA: "south-africa", CZE: "czechia", CAN: "canada",
  SUI: "switzerland", QAT: "qatar", BIH: "bosnia-herzegovina", BRA: "brazil", MAR: "morocco",
  SCO: "scotland", HAI: "haiti", USA: "usa", AUS: "australia", PAR: "paraguay", TUR: "turkiye",
  GER: "germany", ECU: "ecuador", CIV: "ivory-coast", CUW: "curacao", NED: "netherlands",
  JPN: "japan", TUN: "tunisia", SWE: "sweden", BEL: "belgium", IRN: "iran", EGY: "egypt",
  NZL: "new-zealand", ESP: "spain", URU: "uruguay", KSA: "saudi-arabia", CPV: "cape-verde",
  FRA: "france", SEN: "senegal", NOR: "norway", IRQ: "iraq", ARG: "argentina", AUT: "austria",
  ALG: "algeria", JOR: "jordan", POR: "portugal", COL: "colombia", UZB: "uzbekistan",
  COD: "congo-dr", ENG: "england", CRO: "croatia", PAN: "panama", GHA: "ghana",
};

const raw = readFileSync(CSV, "utf8");
const sha = createHash("sha256").update(raw).digest("hex");
const lines = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim().split("\n");
const header = lines[0].split(",");
const ix = (n) => { const i = header.indexOf(n); if (i < 0) throw new Error(`missing column ${n}`); return i; };
const C = {
  fifaCode: ix("fifaCode"), sourceTeamName: ix("sourceTeamName"), squadDate: ix("squadDate"),
  squadFreezeDate: ix("squadFreezeDate"), squadType: ix("squadType"),
  squadSourceVersion: ix("squadSourceVersion"), dataStatus: ix("dataStatus"),
  sourceRef: ix("sourceRef"), sourcePdfPage: ix("sourcePdfPage"), playerNumber: ix("playerNumber"),
  playerName: ix("playerName"), firstNames: ix("firstNames"), lastNames: ix("lastNames"),
  nameOnShirt: ix("nameOnShirt"), position: ix("position"), dateOfBirth: ix("dateOfBirth"),
  ageAtTournamentStart: ix("ageAtTournamentStart"), club: ix("club"), clubCountry: ix("clubCountry"),
  heightCm: ix("heightCm"), caps: ix("caps"), goals: ix("goals"),
  isTop5: ix("isTop5EuropeanLeagueAssociation"), sourceTeamPageRef: ix("sourceTeamPageRef"),
  playerNotes: ix("playerNotes"), clubStrengthScoreStatus: ix("clubStrengthScoreStatus"),
  squadDepthScoreStatus: ix("squadDepthScoreStatus"),
};
const bool = (s) => String(s).trim().toLowerCase() === "true";
const r = (x, n = 6) => Number(x.toFixed(n));

const byTeam = new Map();
for (let i = 1; i < lines.length; i++) {
  const f = lines[i].split(",");
  const fifaCode = f[C.fifaCode];
  const teamId = FIFACODE_TO_ID[fifaCode];
  if (!teamId) throw new Error(`unmapped fifaCode "${fifaCode}" (line ${i + 1})`);
  const rec = byTeam.get(teamId) ?? { meta: null, players: [] };
  if (!rec.meta) {
    rec.meta = {
      teamId, fifaCode, sourceTeamName: f[C.sourceTeamName], squadDate: f[C.squadDate],
      squadFreezeDate: f[C.squadFreezeDate], squadType: f[C.squadType],
      squadSourceVersion: f[C.squadSourceVersion], dataStatus: f[C.dataStatus],
      sourceRef: f[C.sourceRef], sourcePdfPage: Number(f[C.sourcePdfPage]),
      clubStrengthScoreStatus: f[C.clubStrengthScoreStatus], squadDepthScoreStatus: f[C.squadDepthScoreStatus],
    };
  }
  const player = {
    playerNumber: Number(f[C.playerNumber]), playerName: f[C.playerName], firstNames: f[C.firstNames],
    lastNames: f[C.lastNames], nameOnShirt: f[C.nameOnShirt], position: f[C.position],
    dateOfBirth: f[C.dateOfBirth], ageAtTournamentStart: Number(f[C.ageAtTournamentStart]),
    club: f[C.club], clubCountry: f[C.clubCountry], heightCm: Number(f[C.heightCm]),
    caps: Number(f[C.caps]), goals: Number(f[C.goals]), clubInTop5AssociationCountry: bool(f[C.isTop5]),
    sourceTeamPageRef: f[C.sourceTeamPageRef],
    ...(f[C.playerNotes] ? { playerNotes: f[C.playerNotes] } : {}),
  };
  rec.players.push(player);
  byTeam.set(teamId, rec);
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length, m = Math.floor(n / 2);
  return n % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const rows = [...byTeam.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([teamId, rec]) => {
  const ps = rec.players.sort((a, b) => a.playerNumber - b.playerNumber);
  const n = ps.length;
  const ages = ps.map((p) => p.ageAtTournamentStart);
  const sum = (g) => ps.reduce((s, p) => s + g(p), 0);
  const totalCaps = sum((p) => p.caps), totalGoals = sum((p) => p.goals);
  const dist = {};
  for (const p of ps) dist[p.clubCountry] = (dist[p.clubCountry] ?? 0) + 1;
  const sortedDist = Object.fromEntries(Object.keys(dist).sort().map((k) => [k, dist[k]]));
  const top5 = ps.filter((p) => p.clubInTop5AssociationCountry).length;
  const aggregates = {
    playerCount: n,
    averageAge: r(ages.reduce((a, b) => a + b, 0) / n),
    medianAge: r(median(ages)),
    averageHeightCm: r(sum((p) => p.heightCm) / n),
    totalCaps, capsPerPlayer: r(totalCaps / n),
    totalInternationalGoals: totalGoals, goalsPerPlayer: r(totalGoals / n),
    goalkeepersCount: ps.filter((p) => p.position === "GK").length,
    defendersCount: ps.filter((p) => p.position === "DF").length,
    midfieldersCount: ps.filter((p) => p.position === "MF").length,
    forwardsCount: ps.filter((p) => p.position === "FW").length,
    playersAtClubsInTop5AssociationCountries: top5,
    top5AssociationCountryShare: r(top5 / n),
    clubCountryDistribution: sortedDist,
    distinctClubCountryCount: Object.keys(dist).length,
    clubStrengthScore: null,
    clubStrengthScoreStatus: rec.meta.clubStrengthScoreStatus,
    squadDepthScore: null,
    squadDepthScoreStatus: rec.meta.squadDepthScoreStatus,
  };
  const { clubStrengthScoreStatus, squadDepthScoreStatus, ...meta } = rec.meta;
  return { ...meta, players: ps, aggregates };
});

const LEAKAGE_STATUS = rows[0].dataStatus;
const banner = `/**
 * Phase 1.17B - final-squad roster snapshot (48 teams x 26 players).
 * GENERATED by scripts/generate-squad-snapshot.mjs - DO NOT EDIT BY HAND.
 *
 * ROSTER METADATA ONLY + STANDALONE + UNWIRED: not read by lib/model/*, no
 * squad-quality score, the active \`squadQuality\` placeholder is untouched, and no
 * probabilities change.
 *
 * LEAKAGE RISK: transcribed from the FIFA final-squad PDF whose generated version is
 * dated AFTER the tournament start (squadDate ${rows[0].squadDate}, freeze ${rows[0].squadFreezeDate}).
 * dataStatus carries this explicitly; DO NOT wire into pre-tournament probabilities or
 * claim a verified pre-start baseline. See docs/SQUAD_PLAYER_LEAKAGE_CONTROL.md.
 *
 * NAMING: \`clubInTop5AssociationCountry\` / \`top5AssociationCountryShare\` are a club
 * ASSOCIATION-COUNTRY proxy (ENG/ESP/FRA/GER/ITA), NOT true top-five league tiers.
 * clubStrengthScore / squadDepthScore are intentionally null (deferred). Raw CSV/XLSX
 * NOT committed; SHA-256 anchors live in SQUAD_SOURCE.
 */
import type { SquadRow, SquadSource } from "@/lib/types";

export const SQUAD_SOURCE: SquadSource = {
  label: "FIFA World Cup 2026 final squads (roster metadata only)",
  sourceName: "FIFA final squad list PDF (SquadLists-English.pdf), user-supplied derived CSV",
  sourceUrl: "https://fdp.fifa.org/assetspublic/ce281/pdf/SquadLists-English.pdf",
  sourceFile: "wc2026_final_squad_players_source_backed.csv",
  aggregateSourceFile: "wc2026_final_squad_team_aggregates.csv",
  xlsxFile: "wc2026_final_squad_players_source_backed.xlsx",
  playerCsvSha256: ${JSON.stringify(sha)},
  aggregateCsvSha256: "47ba078e3751f3198b4c1493991798aace639471127ebf74687299da25458c4a",
  xlsxSha256: "9db68c6dfea77dced9377c37a5df84cfdc565cae9e2774571badb02707ecde5d",
  retrievedAt: "2026-06-20",
  squadDate: ${JSON.stringify(rows[0].squadDate)},
  squadFreezeDate: ${JSON.stringify(rows[0].squadFreezeDate)},
  squadType: "final",
  dataStatus: ${JSON.stringify(LEAKAGE_STATUS)},
  leakageRisk: true,
  status: "source-backed",
  notes:
    "Roster metadata from the FIFA final-squad PDF. The PDF's generated version postdates tournament start, so this is leakage-risk: a standalone roster foundation only, NOT a verified pre-start baseline and NOT wired into the model. clubInTop5AssociationCountry is a club-country proxy, not true top-5 league tier. No market value / proprietary ratings.",
};

/** FIFA code -> repo team id (authoritative join). */
export const SQUAD_FIFACODE_TO_ID: Record<string, string> = ${JSON.stringify(FIFACODE_TO_ID, null, 2)};

export const squadSnapshot: SquadRow[] = ${JSON.stringify(rows, null, 2)};

/** teamId -> squad row. */
export const squadById: Map<string, SquadRow> = new Map(
  squadSnapshot.map((row) => [row.teamId, row]),
);
`;
writeFileSync(OUT, banner);
console.log(`wrote ${OUT}: ${rows.length} teams, ${rows.reduce((s, r2) => s + r2.players.length, 0)} players, sha256=${sha}`);
