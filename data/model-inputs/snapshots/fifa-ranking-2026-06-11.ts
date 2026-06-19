import type { FifaRankingRow, ModelInputSource } from "@/lib/types";

/**
 * Phase 1.8 - SOURCE-BACKED FIFA/Coca-Cola Men's World Ranking snapshot.
 *
 * User-supplied static FIFA PDF snapshot, reviewer-transcribed + verified from
 * the PDF text layer and visually cross-checked against the rendered pages. The
 * 48 World Cup teams only. FIFA ranking POINTS are published by FIFA and are NOT
 * recalculated in this app (the SUM methodology PDF is explanatory context only).
 * Names are stored as FIFA displays them (`fifaNameRaw`) and mapped to app team
 * ids via FIFA_NAME_TO_ID. See docs/FIFA_RANKING_SNAPSHOT_AUDIT.md.
 */
export const FIFA_RANKING_SOURCE: ModelInputSource = {
  family: "fifaRanking",
  label: "FIFA ranking",
  sourceName: "FIFA/Coca-Cola Men's World Ranking",
  sourceFile: "FIFA_Coca-Cola Men's World Ranking.pdf",
  sourceDate: "2026-06-11",
  retrievedAt: "2026-06-19",
  status: "source-backed",
  notes:
    "User-supplied static FIFA PDF snapshot (user-stated date 11 Jun 2026), reviewer-transcribed + verified from the PDF text layer and the rendered pages. FIFA points are FIFA-published and are NOT recalculated here; methodology reference: edbm045h0udbwkqew35a.pdf. Covers the 48 World Cup teams only.",
};

/** FIFA display name -> app team id (built against the real officialTeams ids). */
export const FIFA_NAME_TO_ID: Record<string, string> = {
  Argentina: "argentina",
  Spain: "spain",
  France: "france",
  England: "england",
  Portugal: "portugal",
  Brazil: "brazil",
  Morocco: "morocco",
  Netherlands: "netherlands",
  Belgium: "belgium",
  Germany: "germany",
  Croatia: "croatia",
  Colombia: "colombia",
  Mexico: "mexico",
  Senegal: "senegal",
  Uruguay: "uruguay",
  USA: "usa",
  Japan: "japan",
  Switzerland: "switzerland",
  "IR Iran": "iran",
  "Türkiye": "turkiye",
  Ecuador: "ecuador",
  Austria: "austria",
  "Korea Republic": "south-korea",
  Australia: "australia",
  Algeria: "algeria",
  Egypt: "egypt",
  Canada: "canada",
  Norway: "norway",
  "Côte d'Ivoire": "ivory-coast",
  Panama: "panama",
  Sweden: "sweden",
  Czechia: "czechia",
  Paraguay: "paraguay",
  Scotland: "scotland",
  Tunisia: "tunisia",
  "Congo DR": "congo-dr",
  Uzbekistan: "uzbekistan",
  Qatar: "qatar",
  Iraq: "iraq",
  "South Africa": "south-africa",
  "Saudi Arabia": "saudi-arabia",
  Jordan: "jordan",
  "Bosnia and Herzegovina": "bosnia-herzegovina",
  "Cabo Verde": "cape-verde",
  Ghana: "ghana",
  "Curaçao": "curacao",
  Haiti: "haiti",
  "New Zealand": "new-zealand",
};

/**
 * The 48 World Cup teams' FIFA ranking rows (rank + points), in rank order, as
 * transcribed from the supplied snapshot.
 */
export const fifaRankingSnapshot: FifaRankingRow[] = [
  { teamId: "argentina", fifaNameRaw: "Argentina", fifaRank: 1, fifaPoints: 1877.27 },
  { teamId: "spain", fifaNameRaw: "Spain", fifaRank: 2, fifaPoints: 1874.71 },
  { teamId: "france", fifaNameRaw: "France", fifaRank: 3, fifaPoints: 1870.7 },
  { teamId: "england", fifaNameRaw: "England", fifaRank: 4, fifaPoints: 1828.02 },
  { teamId: "portugal", fifaNameRaw: "Portugal", fifaRank: 5, fifaPoints: 1767.85 },
  { teamId: "brazil", fifaNameRaw: "Brazil", fifaRank: 6, fifaPoints: 1765.86 },
  { teamId: "morocco", fifaNameRaw: "Morocco", fifaRank: 7, fifaPoints: 1755.1 },
  { teamId: "netherlands", fifaNameRaw: "Netherlands", fifaRank: 8, fifaPoints: 1753.57 },
  { teamId: "belgium", fifaNameRaw: "Belgium", fifaRank: 9, fifaPoints: 1742.24 },
  { teamId: "germany", fifaNameRaw: "Germany", fifaRank: 10, fifaPoints: 1735.77 },
  { teamId: "croatia", fifaNameRaw: "Croatia", fifaRank: 11, fifaPoints: 1714.87 },
  { teamId: "colombia", fifaNameRaw: "Colombia", fifaRank: 13, fifaPoints: 1698.35 },
  { teamId: "mexico", fifaNameRaw: "Mexico", fifaRank: 14, fifaPoints: 1687.48 },
  { teamId: "senegal", fifaNameRaw: "Senegal", fifaRank: 15, fifaPoints: 1684.07 },
  { teamId: "uruguay", fifaNameRaw: "Uruguay", fifaRank: 16, fifaPoints: 1673.07 },
  { teamId: "usa", fifaNameRaw: "USA", fifaRank: 17, fifaPoints: 1671.23 },
  { teamId: "japan", fifaNameRaw: "Japan", fifaRank: 18, fifaPoints: 1661.58 },
  { teamId: "switzerland", fifaNameRaw: "Switzerland", fifaRank: 19, fifaPoints: 1650.06 },
  { teamId: "iran", fifaNameRaw: "IR Iran", fifaRank: 20, fifaPoints: 1619.58 },
  { teamId: "turkiye", fifaNameRaw: "Türkiye", fifaRank: 22, fifaPoints: 1605.73 },
  { teamId: "ecuador", fifaNameRaw: "Ecuador", fifaRank: 23, fifaPoints: 1598.52 },
  { teamId: "austria", fifaNameRaw: "Austria", fifaRank: 24, fifaPoints: 1597.4 },
  { teamId: "south-korea", fifaNameRaw: "Korea Republic", fifaRank: 25, fifaPoints: 1591.63 },
  { teamId: "australia", fifaNameRaw: "Australia", fifaRank: 27, fifaPoints: 1579.34 },
  { teamId: "algeria", fifaNameRaw: "Algeria", fifaRank: 28, fifaPoints: 1571.03 },
  { teamId: "egypt", fifaNameRaw: "Egypt", fifaRank: 29, fifaPoints: 1562.37 },
  { teamId: "canada", fifaNameRaw: "Canada", fifaRank: 30, fifaPoints: 1559.48 },
  { teamId: "norway", fifaNameRaw: "Norway", fifaRank: 31, fifaPoints: 1557.44 },
  { teamId: "ivory-coast", fifaNameRaw: "Côte d'Ivoire", fifaRank: 33, fifaPoints: 1540.87 },
  { teamId: "panama", fifaNameRaw: "Panama", fifaRank: 34, fifaPoints: 1539.16 },
  { teamId: "sweden", fifaNameRaw: "Sweden", fifaRank: 38, fifaPoints: 1509.79 },
  { teamId: "czechia", fifaNameRaw: "Czechia", fifaRank: 40, fifaPoints: 1505.74 },
  { teamId: "paraguay", fifaNameRaw: "Paraguay", fifaRank: 41, fifaPoints: 1505.35 },
  { teamId: "scotland", fifaNameRaw: "Scotland", fifaRank: 42, fifaPoints: 1503.34 },
  { teamId: "tunisia", fifaNameRaw: "Tunisia", fifaRank: 45, fifaPoints: 1476.41 },
  { teamId: "congo-dr", fifaNameRaw: "Congo DR", fifaRank: 46, fifaPoints: 1474.43 },
  { teamId: "uzbekistan", fifaNameRaw: "Uzbekistan", fifaRank: 50, fifaPoints: 1458.73 },
  { teamId: "qatar", fifaNameRaw: "Qatar", fifaRank: 56, fifaPoints: 1450.31 },
  { teamId: "iraq", fifaNameRaw: "Iraq", fifaRank: 57, fifaPoints: 1446.28 },
  { teamId: "south-africa", fifaNameRaw: "South Africa", fifaRank: 60, fifaPoints: 1428.38 },
  { teamId: "saudi-arabia", fifaNameRaw: "Saudi Arabia", fifaRank: 61, fifaPoints: 1423.88 },
  { teamId: "jordan", fifaNameRaw: "Jordan", fifaRank: 63, fifaPoints: 1387.74 },
  { teamId: "bosnia-herzegovina", fifaNameRaw: "Bosnia and Herzegovina", fifaRank: 64, fifaPoints: 1387.22 },
  { teamId: "cape-verde", fifaNameRaw: "Cabo Verde", fifaRank: 67, fifaPoints: 1371.11 },
  { teamId: "ghana", fifaNameRaw: "Ghana", fifaRank: 73, fifaPoints: 1346.88 },
  { teamId: "curacao", fifaNameRaw: "Curaçao", fifaRank: 82, fifaPoints: 1294.77 },
  { teamId: "haiti", fifaNameRaw: "Haiti", fifaRank: 83, fifaPoints: 1293.1 },
  { teamId: "new-zealand", fifaNameRaw: "New Zealand", fifaRank: 85, fifaPoints: 1275.58 },
];
