/**
 * Phase 1.25C - EXPECTED current group standings (COMPARISON ONLY).
 * ----------------------------------------------------------------
 * Transcribed from the user-supplied wc2026-current-group-standings CSV, with the
 * app's internal `teamId` added. This file is a VALIDATION/COMPARISON artifact only:
 * the app derives standings from results through the live-state path; this upload is
 * NEVER the source of truth.
 *
 * Caveat (per README_SOURCE_NOTES): the supplied standings use a simplified ordering
 * (points > H2H > overall GD > overall GF > team-name fallback) and do NOT include
 * fair-play/conduct or the official FIFA-ranking fallback. So core stats are compared
 * strictly; rank/position is compared only where it is safe (see the test), and any
 * Article-13 ordering difference is FLAGGED rather than forced onto the app.
 */
import type { GroupId } from "@/lib/types";

export interface ExpectedStandingRow {
  group: GroupId;
  position: number;
  teamId: string;
  teamCode: string;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export const currentStandingsExpected: ExpectedStandingRow[] = [
  { group: "A", position: 1, teamId: "mexico", teamCode: "MEX", matchesPlayed: 2, wins: 2, draws: 0, losses: 0, goalsFor: 3, goalsAgainst: 0, goalDifference: 3, points: 6 },
  { group: "A", position: 2, teamId: "south-korea", teamCode: "KOR", matchesPlayed: 2, wins: 1, draws: 0, losses: 1, goalsFor: 2, goalsAgainst: 2, goalDifference: 0, points: 3 },
  { group: "A", position: 3, teamId: "czechia", teamCode: "CZE", matchesPlayed: 2, wins: 0, draws: 1, losses: 1, goalsFor: 2, goalsAgainst: 3, goalDifference: -1, points: 1 },
  { group: "A", position: 4, teamId: "south-africa", teamCode: "RSA", matchesPlayed: 2, wins: 0, draws: 1, losses: 1, goalsFor: 1, goalsAgainst: 3, goalDifference: -2, points: 1 },

  { group: "B", position: 1, teamId: "canada", teamCode: "CAN", matchesPlayed: 2, wins: 1, draws: 1, losses: 0, goalsFor: 7, goalsAgainst: 1, goalDifference: 6, points: 4 },
  { group: "B", position: 2, teamId: "switzerland", teamCode: "SUI", matchesPlayed: 2, wins: 1, draws: 1, losses: 0, goalsFor: 5, goalsAgainst: 2, goalDifference: 3, points: 4 },
  { group: "B", position: 3, teamId: "bosnia-herzegovina", teamCode: "BIH", matchesPlayed: 2, wins: 0, draws: 1, losses: 1, goalsFor: 2, goalsAgainst: 5, goalDifference: -3, points: 1 },
  { group: "B", position: 4, teamId: "qatar", teamCode: "QAT", matchesPlayed: 2, wins: 0, draws: 1, losses: 1, goalsFor: 1, goalsAgainst: 7, goalDifference: -6, points: 1 },

  { group: "C", position: 1, teamId: "brazil", teamCode: "BRA", matchesPlayed: 2, wins: 1, draws: 1, losses: 0, goalsFor: 4, goalsAgainst: 1, goalDifference: 3, points: 4 },
  { group: "C", position: 2, teamId: "morocco", teamCode: "MAR", matchesPlayed: 2, wins: 1, draws: 1, losses: 0, goalsFor: 2, goalsAgainst: 1, goalDifference: 1, points: 4 },
  { group: "C", position: 3, teamId: "scotland", teamCode: "SCO", matchesPlayed: 2, wins: 1, draws: 0, losses: 1, goalsFor: 1, goalsAgainst: 1, goalDifference: 0, points: 3 },
  { group: "C", position: 4, teamId: "haiti", teamCode: "HTI", matchesPlayed: 2, wins: 0, draws: 0, losses: 2, goalsFor: 0, goalsAgainst: 4, goalDifference: -4, points: 0 },

  { group: "D", position: 1, teamId: "usa", teamCode: "USA", matchesPlayed: 2, wins: 2, draws: 0, losses: 0, goalsFor: 6, goalsAgainst: 1, goalDifference: 5, points: 6 },
  { group: "D", position: 2, teamId: "australia", teamCode: "AUS", matchesPlayed: 2, wins: 1, draws: 0, losses: 1, goalsFor: 2, goalsAgainst: 2, goalDifference: 0, points: 3 },
  { group: "D", position: 3, teamId: "paraguay", teamCode: "PAR", matchesPlayed: 2, wins: 1, draws: 0, losses: 1, goalsFor: 2, goalsAgainst: 4, goalDifference: -2, points: 3 },
  { group: "D", position: 4, teamId: "turkiye", teamCode: "TUR", matchesPlayed: 2, wins: 0, draws: 0, losses: 2, goalsFor: 0, goalsAgainst: 3, goalDifference: -3, points: 0 },

  { group: "E", position: 1, teamId: "germany", teamCode: "GER", matchesPlayed: 2, wins: 2, draws: 0, losses: 0, goalsFor: 9, goalsAgainst: 2, goalDifference: 7, points: 6 },
  { group: "E", position: 2, teamId: "ivory-coast", teamCode: "CIV", matchesPlayed: 2, wins: 1, draws: 0, losses: 1, goalsFor: 2, goalsAgainst: 2, goalDifference: 0, points: 3 },
  { group: "E", position: 3, teamId: "ecuador", teamCode: "ECU", matchesPlayed: 2, wins: 0, draws: 1, losses: 1, goalsFor: 0, goalsAgainst: 1, goalDifference: -1, points: 1 },
  { group: "E", position: 4, teamId: "curacao", teamCode: "CUW", matchesPlayed: 2, wins: 0, draws: 1, losses: 1, goalsFor: 1, goalsAgainst: 7, goalDifference: -6, points: 1 },

  { group: "F", position: 1, teamId: "netherlands", teamCode: "NED", matchesPlayed: 2, wins: 1, draws: 1, losses: 0, goalsFor: 7, goalsAgainst: 3, goalDifference: 4, points: 4 },
  { group: "F", position: 2, teamId: "japan", teamCode: "JPN", matchesPlayed: 2, wins: 1, draws: 1, losses: 0, goalsFor: 6, goalsAgainst: 2, goalDifference: 4, points: 4 },
  { group: "F", position: 3, teamId: "sweden", teamCode: "SWE", matchesPlayed: 2, wins: 1, draws: 0, losses: 1, goalsFor: 6, goalsAgainst: 6, goalDifference: 0, points: 3 },
  { group: "F", position: 4, teamId: "tunisia", teamCode: "TUN", matchesPlayed: 2, wins: 0, draws: 0, losses: 2, goalsFor: 1, goalsAgainst: 9, goalDifference: -8, points: 0 },

  { group: "G", position: 1, teamId: "egypt", teamCode: "EGY", matchesPlayed: 2, wins: 1, draws: 1, losses: 0, goalsFor: 4, goalsAgainst: 2, goalDifference: 2, points: 4 },
  { group: "G", position: 2, teamId: "iran", teamCode: "IRI", matchesPlayed: 2, wins: 0, draws: 2, losses: 0, goalsFor: 2, goalsAgainst: 2, goalDifference: 0, points: 2 },
  { group: "G", position: 3, teamId: "belgium", teamCode: "BEL", matchesPlayed: 2, wins: 0, draws: 2, losses: 0, goalsFor: 1, goalsAgainst: 1, goalDifference: 0, points: 2 },
  { group: "G", position: 4, teamId: "new-zealand", teamCode: "NZL", matchesPlayed: 2, wins: 0, draws: 1, losses: 1, goalsFor: 3, goalsAgainst: 5, goalDifference: -2, points: 1 },

  { group: "H", position: 1, teamId: "spain", teamCode: "ESP", matchesPlayed: 2, wins: 1, draws: 1, losses: 0, goalsFor: 4, goalsAgainst: 0, goalDifference: 4, points: 4 },
  { group: "H", position: 2, teamId: "uruguay", teamCode: "URU", matchesPlayed: 2, wins: 0, draws: 2, losses: 0, goalsFor: 3, goalsAgainst: 3, goalDifference: 0, points: 2 },
  { group: "H", position: 3, teamId: "cape-verde", teamCode: "CPV", matchesPlayed: 2, wins: 0, draws: 2, losses: 0, goalsFor: 2, goalsAgainst: 2, goalDifference: 0, points: 2 },
  { group: "H", position: 4, teamId: "saudi-arabia", teamCode: "KSA", matchesPlayed: 2, wins: 0, draws: 1, losses: 1, goalsFor: 1, goalsAgainst: 5, goalDifference: -4, points: 1 },

  { group: "I", position: 1, teamId: "france", teamCode: "FRA", matchesPlayed: 2, wins: 2, draws: 0, losses: 0, goalsFor: 6, goalsAgainst: 1, goalDifference: 5, points: 6 },
  { group: "I", position: 2, teamId: "norway", teamCode: "NOR", matchesPlayed: 2, wins: 2, draws: 0, losses: 0, goalsFor: 7, goalsAgainst: 3, goalDifference: 4, points: 6 },
  { group: "I", position: 3, teamId: "senegal", teamCode: "SEN", matchesPlayed: 2, wins: 0, draws: 0, losses: 2, goalsFor: 3, goalsAgainst: 6, goalDifference: -3, points: 0 },
  { group: "I", position: 4, teamId: "iraq", teamCode: "IRQ", matchesPlayed: 2, wins: 0, draws: 0, losses: 2, goalsFor: 1, goalsAgainst: 7, goalDifference: -6, points: 0 },

  { group: "J", position: 1, teamId: "argentina", teamCode: "ARG", matchesPlayed: 2, wins: 2, draws: 0, losses: 0, goalsFor: 5, goalsAgainst: 0, goalDifference: 5, points: 6 },
  { group: "J", position: 2, teamId: "austria", teamCode: "AUT", matchesPlayed: 2, wins: 1, draws: 0, losses: 1, goalsFor: 3, goalsAgainst: 3, goalDifference: 0, points: 3 },
  { group: "J", position: 3, teamId: "algeria", teamCode: "DZA", matchesPlayed: 2, wins: 1, draws: 0, losses: 1, goalsFor: 2, goalsAgainst: 4, goalDifference: -2, points: 3 },
  { group: "J", position: 4, teamId: "jordan", teamCode: "JOR", matchesPlayed: 2, wins: 0, draws: 0, losses: 2, goalsFor: 2, goalsAgainst: 5, goalDifference: -3, points: 0 },

  { group: "K", position: 1, teamId: "colombia", teamCode: "COL", matchesPlayed: 2, wins: 2, draws: 0, losses: 0, goalsFor: 4, goalsAgainst: 1, goalDifference: 3, points: 6 },
  { group: "K", position: 2, teamId: "portugal", teamCode: "POR", matchesPlayed: 2, wins: 1, draws: 1, losses: 0, goalsFor: 6, goalsAgainst: 1, goalDifference: 5, points: 4 },
  { group: "K", position: 3, teamId: "congo-dr", teamCode: "COD", matchesPlayed: 2, wins: 0, draws: 1, losses: 1, goalsFor: 1, goalsAgainst: 2, goalDifference: -1, points: 1 },
  { group: "K", position: 4, teamId: "uzbekistan", teamCode: "UZB", matchesPlayed: 2, wins: 0, draws: 0, losses: 2, goalsFor: 1, goalsAgainst: 8, goalDifference: -7, points: 0 },

  { group: "L", position: 1, teamId: "england", teamCode: "ENG", matchesPlayed: 2, wins: 1, draws: 1, losses: 0, goalsFor: 4, goalsAgainst: 2, goalDifference: 2, points: 4 },
  { group: "L", position: 2, teamId: "ghana", teamCode: "GHA", matchesPlayed: 2, wins: 1, draws: 1, losses: 0, goalsFor: 1, goalsAgainst: 0, goalDifference: 1, points: 4 },
  { group: "L", position: 3, teamId: "croatia", teamCode: "CRO", matchesPlayed: 2, wins: 1, draws: 0, losses: 1, goalsFor: 3, goalsAgainst: 4, goalDifference: -1, points: 3 },
  { group: "L", position: 4, teamId: "panama", teamCode: "PAN", matchesPlayed: 2, wins: 0, draws: 0, losses: 2, goalsFor: 0, goalsAgainst: 2, goalDifference: -2, points: 0 },
];
