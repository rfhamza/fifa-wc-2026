/**
 * Phase 1.17B - squad/player roster types (standalone, UNWIRED).
 * ------------------------------------------------------------
 * Types for the source-backed final-squad roster snapshot + recomputed team
 * aggregates. ROSTER METADATA ONLY: there is NO squad-quality score, nothing here
 * is read by lib/model/*, and the active `squadQuality` placeholder is untouched.
 *
 * LEAKAGE NOTE: the snapshot is transcribed from the FIFA final-squad PDF whose
 * generated version is dated AFTER the tournament start, so it is explicitly marked
 * leakage-risk and MUST NOT be wired into pre-tournament probabilities. See
 * docs/SQUAD_PLAYER_LEAKAGE_CONTROL.md.
 *
 * NAMING HONESTY: the source column `isTop5EuropeanLeagueAssociation` is a club
 * ASSOCIATION-COUNTRY proxy (club registered in ENG/ESP/FRA/GER/ITA), NOT a true
 * top-five league-tier check (it does not exclude lower divisions). It is exposed
 * here as `clubInTop5AssociationCountry` / `playersAtClubsInTop5AssociationCountries`
 * / `top5AssociationCountryShare` and must not be used as a squad-quality score.
 */

export type SquadType = "final" | "provisional" | "inferred";
export type PlayerPosition = "GK" | "DF" | "MF" | "FW";

/** Provenance for the squad snapshot (own type; not the model-input status union). */
export interface SquadSource {
  label: string;
  sourceName: string;
  /** FIFA squad-list PDF URL. */
  sourceUrl?: string;
  /** User-supplied derived CSV file names (raw NOT committed). */
  sourceFile?: string;
  aggregateSourceFile?: string;
  xlsxFile?: string;
  /** SHA-256 anchors for the supplied files. */
  playerCsvSha256?: string;
  aggregateCsvSha256?: string;
  xlsxSha256?: string;
  retrievedAt?: string;
  squadDate: string;
  squadFreezeDate: string;
  squadType: SquadType;
  /** Long honest status string carried through from the source. */
  dataStatus: string;
  /** TRUE: the PDF version postdates tournament start - do not use pre-tournament. */
  leakageRisk: boolean;
  /** Raw facts are source-backed; timing is leakage-risk (see leakageRisk). */
  status: "source-backed";
  notes?: string;
}

/** One squad player (roster metadata only; no ratings/values). */
export interface SquadPlayer {
  playerNumber: number;
  playerName: string;
  firstNames: string;
  lastNames: string;
  nameOnShirt: string;
  position: PlayerPosition;
  /** ISO YYYY-MM-DD. */
  dateOfBirth: string;
  ageAtTournamentStart: number;
  club: string;
  /** Club association/country code (e.g. "ENG", "SUI"). */
  clubCountry: string;
  heightCm: number;
  caps: number;
  goals: number;
  /**
   * Club registered in a top-5 ASSOCIATION COUNTRY (ENG/ESP/FRA/GER/ITA). This is a
   * club-country proxy, NOT true top-five league-tier participation (it does not
   * exclude lower divisions) and must NOT be used as a quality score.
   */
  clubInTop5AssociationCountry: boolean;
  sourceTeamPageRef: string;
  playerNotes?: string;
}

/** Recomputed team aggregates (derived from the player rows). */
export interface SquadAggregates {
  playerCount: number;
  averageAge: number;
  medianAge: number;
  averageHeightCm: number;
  totalCaps: number;
  capsPerPlayer: number;
  totalInternationalGoals: number;
  goalsPerPlayer: number;
  goalkeepersCount: number;
  defendersCount: number;
  midfieldersCount: number;
  forwardsCount: number;
  /** Club association-country proxy count (see SquadPlayer.clubInTop5AssociationCountry). */
  playersAtClubsInTop5AssociationCountries: number;
  /** proxy share in [0,1]; association-country based, NOT true top-5 league share. */
  top5AssociationCountryShare: number;
  /** clubCountry code -> count. */
  clubCountryDistribution: Record<string, number>;
  distinctClubCountryCount: number;
  /** DEFERRED: no clean non-proprietary club-strength source selected. */
  clubStrengthScore: number | null;
  clubStrengthScoreStatus: string;
  /** DEFERRED: methodology unwired pending backtesting. */
  squadDepthScore: number | null;
  squadDepthScoreStatus: string;
}

/** One team's final-squad row: identity + leakage metadata + players + aggregates. */
export interface SquadRow {
  teamId: string;
  fifaCode: string;
  sourceTeamName: string;
  squadDate: string;
  squadFreezeDate: string;
  squadType: SquadType;
  squadSourceVersion: string;
  dataStatus: string;
  sourceRef: string;
  sourcePdfPage: number;
  players: SquadPlayer[];
  aggregates: SquadAggregates;
  notes?: string;
}

export interface SquadValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
