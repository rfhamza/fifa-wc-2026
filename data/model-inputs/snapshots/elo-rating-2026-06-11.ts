import type { EloRatingRow, ModelInputSource } from "@/lib/types";

/**
 * Phase 1.10 - SOURCE-BACKED World Football Elo Ratings snapshot.
 *
 * Frozen tournament-start snapshot (as on 11 June 2026), user-supplied PDF,
 * reviewer-transcribed + visually verified from the PDF text layer. The 48 World
 * Cup teams only. These are PUBLISHED Elo values (World Football Elo Ratings,
 * eloratings.net) used as-is - they are NOT recalculated in this app. Names are
 * stored as the source displays them (`eloNameRaw`) and mapped to app team ids via
 * ELO_NAME_TO_ID. See docs/ELO_RATING_SNAPSHOT_AUDIT.md.
 *
 * Note: Elo ranks may TIE (equal ratings share a rank, e.g. ranks 30 and 42), so
 * rank uniqueness is NOT required.
 *
 * The Kaggle CSV (`elo_ratings_wc2026.csv`) is NOT the source here: its live
 * snapshot is 2026-05-27 (no exact 2026-06-11 rows), so it is retained only as
 * historical/backtesting context for a later phase (CC BY-SA 4.0; attribute the
 * Kaggle dataset and upstream World Football Elo Ratings / eloratings.net).
 */
export const ELO_RATING_SOURCE: ModelInputSource = {
  family: "eloRating",
  label: "Elo rating",
  sourceName: "World Football Elo Ratings",
  sourceUrl: "https://www.eloratings.net/",
  sourceFile: "Elo ratings table_11June.pdf",
  sourceDate: "2026-06-11",
  retrievedAt: "2026-06-19",
  status: "source-backed",
  notes:
    "Frozen tournament-start snapshot (World football Elo ratings as on 11 Jun 2026, eloratings.net), user-supplied PDF, reviewer-transcribed + visually verified. Published Elo values, NOT recalculated here (Elo update method: new_rating = old_rating + K * G * (W - W_e)). The Kaggle CSV (snapshot 2026-05-27) is historical/backtesting context only, not the active snapshot.",
};

/** Source Elo display name -> app team id (built against the real officialTeams ids). */
export const ELO_NAME_TO_ID: Record<string, string> = {
  Spain: "spain",
  Argentina: "argentina",
  France: "france",
  England: "england",
  Brazil: "brazil",
  Portugal: "portugal",
  Colombia: "colombia",
  Netherlands: "netherlands",
  Ecuador: "ecuador",
  Germany: "germany",
  Norway: "norway",
  Croatia: "croatia",
  Turkey: "turkiye",
  Japan: "japan",
  Belgium: "belgium",
  Uruguay: "uruguay",
  Switzerland: "switzerland",
  Mexico: "mexico",
  Senegal: "senegal",
  Paraguay: "paraguay",
  Austria: "austria",
  Morocco: "morocco",
  Canada: "canada",
  "South Korea": "south-korea",
  Scotland: "scotland",
  Australia: "australia",
  Algeria: "algeria",
  Iran: "iran",
  Panama: "panama",
  "United States": "usa",
  Uzbekistan: "uzbekistan",
  "Czech Republic": "czechia",
  Sweden: "sweden",
  Egypt: "egypt",
  "Ivory Coast": "ivory-coast",
  Jordan: "jordan",
  "Dem. Rep. of Congo": "congo-dr",
  Tunisia: "tunisia",
  Iraq: "iraq",
  "Bosnia and Herzegovina": "bosnia-herzegovina",
  "Cape Verde": "cape-verde",
  "Saudi Arabia": "saudi-arabia",
  "New Zealand": "new-zealand",
  Haiti: "haiti",
  "South Africa": "south-africa",
  Ghana: "ghana",
  "Curaçao": "curacao",
  Qatar: "qatar",
};

/**
 * The 48 World Cup teams' Elo rows (rank + rating), in rank order, as transcribed
 * from the supplied 11 Jun 2026 snapshot. Ranks may tie.
 */
export const eloRatingSnapshot: EloRatingRow[] = [
  { teamId: "spain", eloNameRaw: "Spain", eloRank: 1, eloRating: 2157 },
  { teamId: "argentina", eloNameRaw: "Argentina", eloRank: 2, eloRating: 2115 },
  { teamId: "france", eloNameRaw: "France", eloRank: 3, eloRating: 2063 },
  { teamId: "england", eloNameRaw: "England", eloRank: 4, eloRating: 2024 },
  { teamId: "brazil", eloNameRaw: "Brazil", eloRank: 5, eloRating: 1991 },
  { teamId: "portugal", eloNameRaw: "Portugal", eloRank: 6, eloRating: 1989 },
  { teamId: "colombia", eloNameRaw: "Colombia", eloRank: 7, eloRating: 1982 },
  { teamId: "netherlands", eloNameRaw: "Netherlands", eloRank: 8, eloRating: 1948 },
  { teamId: "ecuador", eloNameRaw: "Ecuador", eloRank: 9, eloRating: 1938 },
  { teamId: "germany", eloNameRaw: "Germany", eloRank: 10, eloRating: 1932 },
  { teamId: "norway", eloNameRaw: "Norway", eloRank: 11, eloRating: 1914 },
  { teamId: "croatia", eloNameRaw: "Croatia", eloRank: 12, eloRating: 1912 },
  { teamId: "turkiye", eloNameRaw: "Turkey", eloRank: 13, eloRating: 1911 },
  { teamId: "japan", eloNameRaw: "Japan", eloRank: 14, eloRating: 1906 },
  { teamId: "belgium", eloNameRaw: "Belgium", eloRank: 15, eloRating: 1894 },
  { teamId: "uruguay", eloNameRaw: "Uruguay", eloRank: 16, eloRating: 1892 },
  { teamId: "switzerland", eloNameRaw: "Switzerland", eloRank: 17, eloRating: 1891 },
  { teamId: "mexico", eloNameRaw: "Mexico", eloRank: 18, eloRating: 1881 },
  { teamId: "senegal", eloNameRaw: "Senegal", eloRank: 21, eloRating: 1860 },
  { teamId: "paraguay", eloNameRaw: "Paraguay", eloRank: 22, eloRating: 1834 },
  { teamId: "austria", eloNameRaw: "Austria", eloRank: 23, eloRating: 1830 },
  { teamId: "morocco", eloNameRaw: "Morocco", eloRank: 24, eloRating: 1827 },
  { teamId: "canada", eloNameRaw: "Canada", eloRank: 25, eloRating: 1788 },
  { teamId: "south-korea", eloNameRaw: "South Korea", eloRank: 26, eloRating: 1786 },
  { teamId: "scotland", eloNameRaw: "Scotland", eloRank: 27, eloRating: 1782 },
  { teamId: "australia", eloNameRaw: "Australia", eloRank: 29, eloRating: 1777 },
  { teamId: "algeria", eloNameRaw: "Algeria", eloRank: 30, eloRating: 1772 },
  { teamId: "iran", eloNameRaw: "Iran", eloRank: 30, eloRating: 1772 },
  { teamId: "panama", eloNameRaw: "Panama", eloRank: 37, eloRating: 1730 },
  { teamId: "usa", eloNameRaw: "United States", eloRank: 38, eloRating: 1726 },
  { teamId: "uzbekistan", eloNameRaw: "Uzbekistan", eloRank: 41, eloRating: 1714 },
  { teamId: "czechia", eloNameRaw: "Czech Republic", eloRank: 42, eloRating: 1712 },
  { teamId: "sweden", eloNameRaw: "Sweden", eloRank: 42, eloRating: 1712 },
  { teamId: "egypt", eloNameRaw: "Egypt", eloRank: 48, eloRating: 1696 },
  { teamId: "ivory-coast", eloNameRaw: "Ivory Coast", eloRank: 49, eloRating: 1695 },
  { teamId: "jordan", eloNameRaw: "Jordan", eloRank: 52, eloRating: 1680 },
  { teamId: "congo-dr", eloNameRaw: "Dem. Rep. of Congo", eloRank: 55, eloRating: 1652 },
  { teamId: "tunisia", eloNameRaw: "Tunisia", eloRank: 58, eloRating: 1628 },
  { teamId: "iraq", eloNameRaw: "Iraq", eloRank: 63, eloRating: 1607 },
  { teamId: "bosnia-herzegovina", eloNameRaw: "Bosnia and Herzegovina", eloRank: 65, eloRating: 1595 },
  { teamId: "cape-verde", eloNameRaw: "Cape Verde", eloRank: 68, eloRating: 1578 },
  { teamId: "saudi-arabia", eloNameRaw: "Saudi Arabia", eloRank: 69, eloRating: 1576 },
  { teamId: "new-zealand", eloNameRaw: "New Zealand", eloRank: 72, eloRating: 1562 },
  { teamId: "haiti", eloNameRaw: "Haiti", eloRank: 73, eloRating: 1548 },
  { teamId: "south-africa", eloNameRaw: "South Africa", eloRank: 80, eloRating: 1511 },
  { teamId: "ghana", eloNameRaw: "Ghana", eloRank: 81, eloRating: 1510 },
  { teamId: "curacao", eloNameRaw: "Curaçao", eloRank: 91, eloRating: 1434 },
  { teamId: "qatar", eloNameRaw: "Qatar", eloRank: 96, eloRating: 1421 },
];
