/**
 * World Cup Probability Lab - Domain Types
 * ----------------------------------------
 * Single source of truth for the shapes that flow through the data layer,
 * the prediction model, and the simulation engine. Keep these types pure
 * (no runtime logic) so they can be imported anywhere without side effects.
 */

/**
 * Provenance of a dataset (A2). Tri-state, never a boolean:
 *  - "mock":      hand-authored placeholder values.
 *  - "candidate": cross-verified from credible non-FIFA sources, NOT official.
 *  - "verified":  official FIFA source or user-supplied authoritative JSON.
 */
import type { ModelFeatureFamily, ModelInputStatus } from "./model-inputs";
export type {
  ModelInputStatus,
  ModelFeatureFamily,
  ModelInputSource,
  TeamModelInputs,
  FifaRankingRow,
  ModelInputValidationResult,
} from "./model-inputs";

export type SourceStatus = "mock" | "candidate" | "verified";

/**
 * Provenance of the fixture list (A3):
 *  - "official":           the published FIFA chronological match schedule
 *                          (dates, kickoffs, venues, match numbers) - verified.
 *  - "position-generated": built from draw positions per FIFA Article 12.4
 *                          pairings on the official/candidate field. Pairings are
 *                          regulation-correct, but dates/venues/order are
 *                          illustrative, pending the official schedule.
 *  - "mock-generated":     generated from the hand-authored mock field; entirely
 *                          placeholder.
 */
export type FixtureSource = "official" | "position-generated" | "mock-generated";

/** A team's draw position within its group (1..4), assigned at the Final Draw. */
export type DrawPosition = 1 | 2 | 3 | 4;

/** A draw slot, e.g. "A1".."L4" - the group letter plus the draw position. */
export type DrawSlot = `${GroupId}${DrawPosition}`;

/** Lifecycle of a single fixture. "unknown" for position-generated (no date). */
export type FixtureStatus = "scheduled" | "in-progress" | "complete" | "unknown";

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
 * realistic but mockable - swap them for real feeds later (see docs).
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
  /**
   * Draw position within the group (1..4) from the Final Draw. Present ONLY for
   * teams whose slot is source-backed (currently the three co-hosts). Undefined
   * for every other team until official draw-position data is supplied - a
   * placeholder ordering is NEVER written here (see lib/data/fixtures.ts).
   */
  drawPosition?: DrawPosition;
  /** Draw slot ("A1".."L4"), present iff `drawPosition` is. Source-backed only. */
  drawSlot?: DrawSlot;
  /** Provenance of the draw slot (only set when `drawSlot` is set). */
  drawSlotStatus?: SourceStatus;
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
   * Climate / acclimatization familiarity 0..100 - how well the squad copes
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
  /** Average daytime temperature in deg C during the tournament window. */
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
  /** ISO date string. Illustrative for generated fixtures (not the FIFA date). */
  date: string;
  /** Per-fixture provenance (defaults to the dataset's `fixtureSource`). */
  source?: FixtureSource;
  /** Article 12.4 draw positions this fixture pairs (home vs away). */
  homePosition?: DrawPosition;
  awayPosition?: DrawPosition;
  /** Official FIFA match number (M1..M72). Set only for official schedules. */
  matchNumber?: number;
  /** ISO datetime of kickoff. Set only for official schedules. */
  kickoff?: string;
  /** Fixture lifecycle. "unknown" for position-generated fixtures. */
  status?: FixtureStatus;
  /** Source reference for an official row (transcription provenance). */
  sourceRef?: string;
  /** True when the official source is still labelled "subject to change". */
  subjectToChange?: boolean;
  /** IANA tz the source printed kickoffs in (e.g. "America/New_York"). */
  kickoffSourceTz?: string;
  /** Human kickoff in the source timezone (e.g. "2026-06-11 15:00 ET"). */
  kickoffLocalSourceTime?: string;
  /** Raw venue label as printed in the source. */
  venueLabelRaw?: string;
}

/**
 * One row of an OFFICIAL chronological schedule template (FIFA Art. 16). Keyed by
 * draw position so it can be authored before the Final Draw resolves teams; the
 * resolver maps positions -> teams. Shipped empty until an authoritative source
 * is supplied (see data/official/fixtures.ts).
 */
export interface OfficialFixture {
  /** Official match number (M1..M72). */
  matchNumber: number;
  group: GroupId;
  /** Round-robin matchday within the group (1..3). */
  matchday: number;
  homePosition: DrawPosition;
  awayPosition: DrawPosition;
  venueId: string;
  /** ISO datetime of kickoff. */
  kickoff: string;
  status?: FixtureStatus;
  sourceRef?: string;
  /** True when the source schedule is still labelled "subject to change". */
  subjectToChange?: boolean;
  /** IANA tz the source printed kickoffs in (e.g. "America/New_York"). */
  kickoffSourceTz?: string;
  /** Human kickoff in the source timezone (e.g. "2026-06-11 15:00 ET"). */
  kickoffLocalSourceTime?: string;
  /** Raw venue label as printed in the source (e.g. "NEW YORK NEW JERSEY"). */
  venueLabelRaw?: string;
}

/**
 * Provenance for a transcribed OFFICIAL schedule source (Phase 1.6 staging).
 * The source binary is never committed; this header travels with the staged
 * data and audit so the version/date and "subject to change" status are explicit.
 */
export interface OfficialScheduleProvenance {
  sourceName: string;
  /** Original file name (the PDF itself is NOT committed). */
  sourceFile: string;
  /** Schedule version, e.g. "v17". */
  version: string;
  /** Source publication date (ISO), e.g. "2026-04-10". */
  sourceDate: string;
  /** Timezone the source prints kickoffs in, e.g. "America/New_York (ET)". */
  timezone: string;
  /** The source carries a "Subject to change" note. */
  subjectToChange: boolean;
  extractionMethod: string;
  extractedAt: string;
  notes?: string;
}

/**
 * A TEAM-keyed staged row transcribed from the official schedule (Phase 1.6).
 * Lives only in `data/official/staging/` - never read by the resolver. It carries
 * both the solved draw positions and the resolved team ids so it can be
 * cross-checked and (in a later, approved step) converted into position-keyed
 * `OfficialFixture`s + verified draw positions.
 */
export interface StagedOfficialFixture {
  matchNumber: number;
  group: GroupId;
  matchday: number;
  homeTeamId: string;
  awayTeamId: string;
  /** Draw positions solved from the schedule + FIFA Art. 12.4 (see validators). */
  homePosition: DrawPosition;
  awayPosition: DrawPosition;
  venueId: string;
  /** Raw venue label as printed in the source (e.g. "SAN FRANCISCO BAY AREA"). */
  venueLabelRaw: string;
  /** Human kickoff in the source timezone (e.g. "2026-06-11 15:00 ET"). */
  kickoffLocalSourceTime: string;
  /** ISO UTC kickoff (= ET + 4h across the EDT tournament window). */
  kickoffUtc: string;
  status?: FixtureStatus;
  subjectToChange: boolean;
  sourceRef: string;
}

/** A solved draw slot for a single team (Phase 1.6 staging; not yet verified). */
export interface StagedDrawPosition {
  group: GroupId;
  position: DrawPosition;
  teamId: string;
  slot: DrawSlot;
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
  /** Raw GDP per capita (USD) - carried for transparency. */
  gdpPerCapita: number;
  /** Raw population - carried for transparency. */
  population: number;
  /**
   * Normalized 0..1 "structural depth" prior, blended from log-scaled GDP per
   * capita and log-scaled population. Experimental weak prior - NOT a strong
   * match-level predictor (see docs/MODEL_METHOD.md).
   */
  structuralDepth: number;
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
  /** Model-input feature family this driver comes from (Phase 1.7). */
  family?: ModelFeatureFamily;
  /** Provenance status of the underlying input family (Phase 1.7). */
  status?: ModelInputStatus;
  /** True when a placeholder-weight cap reduced this driver's contribution. */
  capped?: boolean;
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

/**
 * Per-team metadata the standings tiebreaker needs beyond match results
 * (FIFA Article 13 lower-priority criteria). `conductScore` is a documented
 * placeholder (0 for all teams) until real disciplinary data is integrated.
 */
export interface TeamMeta {
  teamId: string;
  fifaRanking: number;
  /** Fair-play / disciplinary points placeholder (lower = better). Always 0 for now. */
  conductScore: number;
}

/* ----------------------------------------------------------------------------
 * Official knockout bracket (Phase 1.2)
 * ------------------------------------------------------------------------- */

/** Provenance of the bracket data (tri-state, reuses the dataset scale). */
export type BracketSourceStatus = SourceStatus;

/** Knockout stages a match can belong to (M73..M104). */
export type KnockoutStage =
  | "roundOf32"
  | "roundOf16"
  | "quarterFinal"
  | "semiFinal"
  | "thirdPlace"
  | "final";

/** The eight R32 slots that receive a best third-placed team (Annexe C). */
export type ThirdPlaceSlotId = "T1" | "T2" | "T3" | "T4" | "T5" | "T6" | "T7" | "T8";

/** A slot filled by a group finisher (winner = position 1, runner-up = 2). */
export interface GroupPositionQualifier {
  kind: "groupPosition";
  group: GroupId;
  position: 1 | 2;
}

/** A slot filled by a best third-placed team, resolved via Annexe C. */
export interface ThirdPlaceQualifierSlot {
  kind: "thirdPlace";
  slot: ThirdPlaceSlotId;
  /** Display/validation hint, e.g. the "3C/D/E/F" eligible groups. */
  eligibleGroups?: GroupId[];
}

/** A slot filled by the winner of an earlier match. */
export interface MatchWinnerQualifier {
  kind: "matchWinner";
  matchNumber: number;
}

/** A slot filled by the loser of an earlier match (third-place playoff). */
export interface MatchLoserQualifier {
  kind: "matchLoser";
  matchNumber: number;
}

export type QualifierSlot =
  | GroupPositionQualifier
  | ThirdPlaceQualifierSlot
  | MatchWinnerQualifier
  | MatchLoserQualifier;

/** One official knockout match (M73..M104) with its two qualifier slots. */
export interface KnockoutMatchDefinition {
  /** Official match number, e.g. 73..104. */
  matchNumber: number;
  stage: KnockoutStage;
  home: QualifierSlot;
  away: QualifierSlot;
  /** Source reference for this row (transcription provenance). */
  source?: string;
  /** Per-row provenance, defaults to the bracket's overall status. */
  validationStatus?: BracketSourceStatus;
}

/** The full knockout graph: R32 through final, deterministic by matchNumber. */
export interface KnockoutGraph {
  matches: KnockoutMatchDefinition[];
}

/**
 * Annexe C combination key - the eight selected third-placed groups, NORMALIZED
 * (sorted, uppercase), e.g. "ABCDEFGH". Use `normalizeCombinationKey`.
 */
export type ThirdPlaceCombinationKey = string;

/**
 * Annexe C table: for each of the 495 (= C(12,8)) combinations of qualifying
 * third-placed groups, which group fills each of the eight T-slots.
 */
export type ThirdPlaceAllocationMap = Record<
  ThirdPlaceCombinationKey,
  Record<ThirdPlaceSlotId, GroupId>
>;

/** A cited source for transcribed bracket data. */
export interface BracketSource {
  url: string;
  method: string;
  retrievedAt: string;
}

/** The official bracket definition + its provenance. */
export interface BracketDefinition {
  sourceStatus: BracketSourceStatus;
  /** R32 -> final match graph. Empty until transcribed. */
  graph: KnockoutGraph;
  /** Annexe C allocation. Empty until transcribed (must be all 495 to verify). */
  thirdPlaceAllocation: ThirdPlaceAllocationMap;
  sources: BracketSource[];
  notes?: string;
}

/** Result of validating a bracket definition. */
export interface BracketValidationResult {
  valid: boolean;
  errors: string[];
  coverage: {
    combinations: number;
    expected: number;
    complete: boolean;
  };
}

/** A resolved dataset plus its provenance, returned by the data layer. */
export interface ResolvedDataset {
  sourceStatus: SourceStatus;
  fixtureSource: FixtureSource;
  teams: Team[];
  venues: Venue[];
  groups: Group[];
  fixtures: Fixture[];
  bracket: BracketDefinition;
}
