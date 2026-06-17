/**
 * World Cup Probability Lab — Domain Types
 * ----------------------------------------
 * Single source of truth for the shapes that flow through the data layer,
 * the prediction model, and the simulation engine. Keep these types pure
 * (no runtime logic) so they can be imported anywhere without side effects.
 */

/** Six FIFA confederations. */
export type Confederation =
  | "UEFA"
  | "CONMEBOL"
  | "CONCACAF"
  | "CAF"
  | "AFC"
  | "OFC";

/** The three co-hosts of the 2026 tournament. */
export type HostNation = "USA" | "Canada" | "Mexico";

/** Knockout / tournament stages a team can reach (ordered). */
export type TournamentStage =
  | "groupStage"
  | "roundOf32"
  | "roundOf16"
  | "quarterFinal"
  | "semiFinal"
  | "final"
  | "winner";

/**
 * A national team participating in the tournament.
 * Numeric fields prefixed conceptually as "placeholder" in seed data are
 * realistic but mockable — swap them for real feeds later (see docs).
 */
export interface Team {
  /** Stable lowercase slug, e.g. "argentina". Used as a key everywhere. */
  id: string;
  name: string;
  /** ISO 3166-1 alpha-3 country code, e.g. "ARG". */
  countryCode: string;
  confederation: Confederation;
  /** Group id this team belongs to, e.g. "A". */
  group: GroupId;
  /** Unicode flag emoji for lightweight rendering without image assets. */
  flag: string;
  /** FIFA ranking position (1 = best). Placeholder. */
  fifaRanking: number;
  /** Elo rating (~1300 weak .. ~2100 elite). Placeholder. */
  elo: number;
  /** GDP per capita in USD. Placeholder economic indicator. */
  gdpPerCapita: number;
  /** Population (people). Placeholder economic indicator. */
  population: number;
  /** Nationality (country name) of the head coach. */
  managerNationality: string;
  /** True when the manager shares the team's nationality. */
  sameNationalityManager: boolean;
  /** Composite squad quality 0..100. Placeholder. */
  squadQuality: number;
  /** Recent form 0..100 (results over last ~10 matches). Placeholder. */
  recentForm: number;
  /**
   * Climate / acclimatization familiarity 0..100 — how well the squad copes
   * with North American summer venues (heat, humidity, altitude). Placeholder.
   */
  climateFamiliarity: number;
}

export type GroupId =
  | "A" | "B" | "C" | "D" | "E" | "F"
  | "G" | "H" | "I" | "J" | "K" | "L";

/** A first-round group of four teams. */
export interface Group {
  id: GroupId;
  teamIds: string[];
}

/** A stadium hosting matches. */
export interface Venue {
  id: string;
  name: string;
  city: string;
  country: HostNation;
  /** Rough climate descriptor used by the acclimatization signal. */
  climate: "hot" | "humid" | "temperate" | "altitude" | "arid";
  /** Average daytime temperature in °C during the tournament window. */
  avgTempC: number;
  capacity: number;
}

/** A scheduled group-stage match between two teams. */
export interface Fixture {
  id: string;
  /** Round-robin matchday within the group (1..3). */
  matchday: number;
  group: GroupId;
  homeTeamId: string;
  awayTeamId: string;
  venueId: string;
  /** ISO date string (kickoff). */
  date: string;
}

/**
 * Normalized, model-ready feature vector derived from a Team (plus context
 * such as host status). The model consumes this rather than raw Team fields
 * so that feature engineering stays in one place.
 */
export interface TeamFeatureSet {
  teamId: string;
  elo: number;
  fifaRanking: number;
  squadQuality: number;
  recentForm: number;
  climateFamiliarity: number;
  sameNationalityManager: boolean;
  /** True if the team is a co-host. */
  isHost: boolean;
  /** True if the team's confederation is regionally close to host region. */
  isRegional: boolean;
}

/** A single driver (feature) contribution to a prediction's explanation. */
export interface ModelDriver {
  /** Human label, e.g. "Elo difference". */
  label: string;
  /**
   * Signed contribution to Team A's rating advantage. Positive favours
   * Team A (home), negative favours Team B (away).
   */
  contribution: number;
  /** Short plain-English description of why this matters. */
  detail: string;
}

/** Aggregated, ordered explanation for a prediction. */
export interface ModelExplanation {
  positiveDrivers: ModelDriver[];
  negativeDrivers: ModelDriver[];
  /** Net rating advantage for Team A (sum of all driver contributions). */
  netAdvantage: number;
}

/** Probability of a specific exact scoreline. */
export interface ScorelineProbability {
  homeGoals: number;
  awayGoals: number;
  probability: number;
}

/** Full prediction for a single match. */
export interface MatchPrediction {
  fixtureId?: string;
  homeTeamId: string;
  awayTeamId: string;
  /** Probabilities sum to ~1. */
  homeWin: number;
  draw: number;
  awayWin: number;
  /** Expected goals (Poisson lambda) for each side. */
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  /** Most likely scorelines, descending by probability. */
  topScorelines: ScorelineProbability[];
  explanation: ModelExplanation;
}

/** A team's computed standing within its group. */
export interface GroupStanding {
  teamId: string;
  group: GroupId;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** 1-based rank within the group after tiebreakers. */
  rank: number;
}

/** Probabilities of a team reaching each stage of the tournament. */
export interface TournamentStageProbability {
  teamId: string;
  /** Probability of finishing top-2 in the group. */
  qualifyTop2: number;
  /** Probability of advancing as a best third-placed team. */
  qualifyThird: number;
  roundOf32: number;
  roundOf16: number;
  quarterFinal: number;
  semiFinal: number;
  final: number;
  winner: number;
}

/** Immutable result of one full Monte Carlo simulation run. */
export interface SimulationSnapshot {
  /** Number of tournaments simulated. */
  iterations: number;
  /** RNG seed used (deterministic reproducibility). */
  seed: number;
  /** Per-team stage probabilities. */
  stageProbabilities: TournamentStageProbability[];
  /** Expected group standings averaged across runs (rank by avg points). */
  expectedStandings: GroupStanding[];
  /** Wall-clock timestamp the snapshot was produced. */
  generatedAt: string;
}

/** A change in a probability metric between two snapshots (top movers). */
export interface ProbabilityDelta {
  teamId: string;
  metric: keyof Omit<TournamentStageProbability, "teamId">;
  previous: number;
  current: number;
  delta: number;
}
