/**
 * Phase 1.24B - Model input registry (GOVERNANCE CATALOG, NOT BEHAVIOURAL CONFIG).
 * ------------------------------------------------------------------------------
 * A standalone, metadata-only catalog of every model input the World Cup
 * Probability Lab uses today, has available-but-unwired, or plans (including
 * future-live inputs). It exists for GOVERNANCE and DOCUMENTATION only.
 *
 * HARD RULES (enforced by tests/input-registry.test.ts):
 *   - This module has NO imports and is imported by NO production prediction code
 *     (not `prediction-core`, not the simulator, not feature builders). It must
 *     never influence runtime behaviour.
 *   - It is NOT a source of truth. The sources of truth are:
 *       * `lib/model/config.ts`            -> weights, caps, production config.
 *       * `data/model-inputs/sources.ts`   -> existing source/status metadata.
 *   - It REFERENCES, never duplicates:
 *       * `weightRef`  points to a key (or keys) in `MODEL_WEIGHTS` - NEVER a
 *         numeric weight or cap value.
 *       * `sourceRef`  points to a `ModelFeatureFamily` key in `sources.ts`
 *         (`MODEL_INPUT_SOURCES`) when one exists, otherwise `null`. It never
 *         re-declares a family's provenance status (that lives in `sources.ts`).
 *   - Planned / future inputs that have no code field yet use a governance
 *     `inputId`, `sourceRef: null`, `weightRef: null`, and explicit
 *     `status` / `phase` values rather than forcing runtime symbols.
 *
 * Human-readable catalog: `docs/MODEL_INPUT_REGISTRY.md`.
 */

/* ----------------------------------------------------------------------------
 * Controlled vocabularies (exported so tests validate against the same lists).
 * -------------------------------------------------------------------------- */

/** Implementation status of an input in the system today. */
export const INPUT_STATUSES = [
  "implemented", // wired into production probabilities today
  "partiallyImplemented", // wired but as a capped placeholder awaiting a source
  "availableDataOnly", // ingested/validated data that the model does NOT read
  "planned", // intended; no code/data yet
  "deferred", // explicitly postponed (e.g. needs a reliable live source)
] as const;
export type InputStatus = (typeof INPUT_STATUSES)[number];

/** Temporal phase the input belongs to. */
export const INPUT_PHASES = [
  "static", // structural; effectively immutable
  "preTournament", // frozen at a declared pre-kickoff cutoff
  "matchContext", // updates between matches (rolling tournament state)
  "postMatch", // realised results after a match completes
  "liveFuture", // requires live ingestion; not built
] as const;
export type InputPhase = (typeof INPUT_PHASES)[number];

/** Origin/format of the input's data. */
export const SOURCE_TYPES = [
  "manual", // hand-authored / encoded constant
  "csv", // transcribed from a supplied CSV/snapshot
  "api", // would come from an external API (future)
  "generated", // computed/derived by a script or at build time
  "external", // external dataset/provider (future)
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** How often the input would refresh. */
export const REFRESH_CADENCES = [
  "static",
  "annual",
  "preTournamentFreeze",
  "daily",
  "perMatch",
  "live",
] as const;
export type RefreshCadence = (typeof REFRESH_CADENCES)[number];

/** How the input is used by the system today. */
export const CURRENT_USAGES = [
  "productionProbability", // affects the live forecast numbers
  "backtestingOnly", // used only by the isolated historical harness
  "explanationOnly", // shown for transparency; not a driver
  "availableNotUsed", // ingested but not read by the model
  "futureCandidate", // planned/deferred; not used yet
] as const;
export type CurrentUsage = (typeof CURRENT_USAGES)[number];

/** Qualitative confidence in the input (NOT a metric). */
export const CONFIDENCE_LEVELS = ["high", "medium", "low", "none"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

/* ----------------------------------------------------------------------------
 * Entry shape.
 * -------------------------------------------------------------------------- */

export interface InputRegistryEntry {
  /** Stable governance identifier (not necessarily a runtime symbol). */
  inputId: string;
  displayName: string;
  /** Governance family grouping (free-text label, e.g. "team strength"). */
  family: string;
  description: string;
  status: InputStatus;
  phase: InputPhase;
  /**
   * Key into `MODEL_INPUT_SOURCES` (`data/model-inputs/sources.ts`) when a
   * production family exists for this input, else `null`. Never re-declares the
   * family's provenance status.
   */
  sourceRef: string | null;
  sourceType: SourceType | null;
  refreshCadence: RefreshCadence;
  currentUsage: CurrentUsage;
  /**
   * Key (or keys) into `MODEL_WEIGHTS` (`lib/model/config.ts`). NEVER a numeric
   * weight/cap value. `null` for inputs that carry no production weight.
   */
  weightRef: string | string[] | null;
  fallback: string;
  freshnessRequirement: string;
  confidenceLevel: ConfidenceLevel;
  publicExplanationAllowed: boolean;
  /** Calibration is formally NO-GO project-wide; every entry is `false`. */
  calibrationEligible: boolean;
  /** No tuning is approved; every entry is `false`. */
  tuningEligible: boolean;
  /** Whether this input could be fed by a live/rolling source (future-gated). */
  liveEligible: boolean;
  knownLimitations: string;
  testsRequired: string;
  governanceNotes: string;
}

/* ----------------------------------------------------------------------------
 * The catalog. Grouped by section for readability; order is not significant.
 * -------------------------------------------------------------------------- */

export const INPUT_REGISTRY: readonly InputRegistryEntry[] = [
  // ---- Implemented production probability drivers ----------------------------
  {
    inputId: "elo",
    displayName: "Elo rating",
    family: "team strength",
    description:
      "World Football Elo rating difference; the anchor strength signal consumed pairwise.",
    status: "implemented",
    phase: "preTournament",
    sourceRef: "eloRating",
    sourceType: "csv",
    refreshCadence: "preTournamentFreeze",
    currentUsage: "productionProbability",
    weightRef: "elo",
    fallback: "Team.elo identity field (finite-guarded) if the snapshot row is missing.",
    freshnessRequirement: "Frozen pre-tournament snapshot (cutoff before opening kickoff).",
    confidenceLevel: "high",
    publicExplanationAllowed: true,
    calibrationEligible: false,
    tuningEligible: false,
    liveEligible: false,
    knownLimitations: "Published ratings, not recalculated; frozen, so it does not move during the tournament.",
    testsRequired: "elo-rating-snapshot; forecast-behavior; prediction-core-parity.",
    governanceNotes: "Anchor driver (weightRef elo). source-backed in sources.ts.",
  },
  {
    inputId: "fifaRanking",
    displayName: "FIFA ranking",
    family: "team strength",
    description:
      "FIFA/Coca-Cola ranking-place advantage, converted to Elo-equivalent points per place and capped.",
    status: "implemented",
    phase: "preTournament",
    sourceRef: "fifaRanking",
    sourceType: "csv",
    refreshCadence: "preTournamentFreeze",
    currentUsage: "productionProbability",
    weightRef: ["fifaRankingPerPlace", "fifaRankingCap"],
    fallback: "Team.fifaRanking identity field (finite-guarded) if the snapshot row is missing.",
    freshnessRequirement: "Frozen pre-tournament snapshot (cutoff before opening kickoff).",
    confidenceLevel: "high",
    publicExplanationAllowed: true,
    calibrationEligible: false,
    tuningEligible: false,
    liveEligible: false,
    knownLimitations: "Per-place contribution is hard-capped to avoid tail blowups.",
    testsRequired: "fifa-ranking-snapshot; forecast-behavior; prediction-core-parity.",
    governanceNotes: "source-backed in sources.ts. Two weight keys (slope + cap).",
  },
  {
    inputId: "squadQuality",
    displayName: "Squad quality",
    family: "squad / player",
    description:
      "Per-team squad-quality driver, currently a hand-authored placeholder pending a licensed player-data source.",
    status: "partiallyImplemented",
    phase: "preTournament",
    sourceRef: "squadQuality",
    sourceType: "manual",
    refreshCadence: "preTournamentFreeze",
    currentUsage: "productionProbability",
    weightRef: "squadQuality",
    fallback: "Hand-authored Team.squadQuality value; driver clamped by the placeholder caps.",
    freshnessRequirement: "Placeholder; promotion needs a supplied, validated source snapshot.",
    confidenceLevel: "low",
    publicExplanationAllowed: true,
    calibrationEligible: false,
    tuningEligible: false,
    liveEligible: false,
    knownLimitations: "Placeholder status: per-driver and pooled placeholder caps keep it from dominating.",
    testsRequired: "forecast-behavior (caps bind); squad-no-wiring (snapshot stays unwired).",
    governanceNotes: "placeholder in sources.ts. Capped via PLACEHOLDER/TOTAL_PLACEHOLDER caps.",
  },
  {
    inputId: "recentForm",
    displayName: "Recent form",
    family: "team strength",
    description:
      "Per-team recent-form driver, currently a hand-authored placeholder; a real last-10 snapshot exists but is unwired.",
    status: "partiallyImplemented",
    phase: "preTournament",
    sourceRef: "recentForm",
    sourceType: "manual",
    refreshCadence: "preTournamentFreeze",
    currentUsage: "productionProbability",
    weightRef: "recentForm",
    fallback: "Hand-authored Team.recentForm value; driver clamped by the placeholder caps.",
    freshnessRequirement: "Placeholder; promotion needs a wired, leakage-safe rolling-results source.",
    confidenceLevel: "low",
    publicExplanationAllowed: true,
    calibrationEligible: false,
    tuningEligible: false,
    liveEligible: false,
    knownLimitations: "Placeholder; the available snapshot overlaps Elo/FIFA and is intentionally not wired.",
    testsRequired: "recent-form-no-wiring; forecast-behavior (caps bind).",
    governanceNotes: "placeholder in sources.ts. See available-but-unwired entry recentFormSnapshot.",
  },
  {
    inputId: "managerCohesion",
    displayName: "Manager cohesion",
    family: "squad / player",
    description:
      "Binary same-nationality-manager cohesion proxy, derived from cross-verified identity data.",
    status: "implemented",
    phase: "preTournament",
    sourceRef: "managerCohesion",
    sourceType: "manual",
    refreshCadence: "preTournamentFreeze",
    currentUsage: "productionProbability",
    weightRef: "manager",
    fallback: "Defaults to no-cohesion (false) if manager identity is unknown.",
    freshnessRequirement: "Encoded from team identity as of squad submission; static thereafter.",
    confidenceLevel: "medium",
    publicExplanationAllowed: true,
    calibrationEligible: false,
    tuningEligible: false,
    liveEligible: false,
    knownLimitations: "Crude binary proxy; not a measure of actual cohesion.",
    testsRequired: "forecast-behavior; prediction-core-parity.",
    governanceNotes: "candidate in sources.ts. Binary, uncapped, modest weight.",
  },
  {
    inputId: "hostAdvantage",
    displayName: "Host advantage",
    family: "tournament context",
    description: "Binary co-host advantage (USA/Canada/Mexico), a FIFA regulation fact.",
    status: "implemented",
    phase: "static",
    sourceRef: "hostAdvantage",
    sourceType: "manual",
    refreshCadence: "static",
    currentUsage: "productionProbability",
    weightRef: "host",
    fallback: "Non-host (false) for any team not in the co-host set.",
    freshnessRequirement: "Regulation fact; immutable for 2026.",
    confidenceLevel: "high",
    publicExplanationAllowed: true,
    calibrationEligible: false,
    tuningEligible: false,
    liveEligible: false,
    knownLimitations: "Single aggregate host term; no venue-level home advantage.",
    testsRequired: "forecast-behavior; model-sensitivity (no-host-regional variant).",
    governanceNotes: "verified in sources.ts. Largest single binary weight.",
  },
  {
    inputId: "regionalAdvantage",
    displayName: "Regional advantage",
    family: "tournament context",
    description: "Binary host-region (CONCACAF non-host) advantage, derived from confederation membership.",
    status: "implemented",
    phase: "static",
    sourceRef: "regionalAdvantage",
    sourceType: "manual",
    refreshCadence: "static",
    currentUsage: "productionProbability",
    weightRef: "regional",
    fallback: "Non-regional (false) outside the host confederation.",
    freshnessRequirement: "Confederation membership; immutable for 2026.",
    confidenceLevel: "high",
    publicExplanationAllowed: true,
    calibrationEligible: false,
    tuningEligible: false,
    liveEligible: false,
    knownLimitations: "Binary; does not scale with actual travel/familiarity.",
    testsRequired: "forecast-behavior; model-sensitivity (no-host-regional variant).",
    governanceNotes: "candidate in sources.ts. Excludes hosts (no double-count).",
  },
  {
    inputId: "climateFamiliarity",
    displayName: "Climate suitability",
    family: "climate / venue",
    description:
      "Home-country 1991-2020 year-round playability score (temperature/precipitation normals), scaled to 0..100.",
    status: "implemented",
    phase: "static",
    sourceRef: "climateFamiliarity",
    sourceType: "generated",
    refreshCadence: "static",
    currentUsage: "productionProbability",
    weightRef: "climate",
    fallback: "Team.climateFamiliarity identity value; driver clamped by the climate cap.",
    freshnessRequirement: "Static climatological normals (1991-2020).",
    confidenceLevel: "medium",
    publicExplanationAllowed: true,
    calibrationEligible: false,
    tuningEligible: false,
    liveEligible: false,
    knownLimitations: "Home-country playability, NOT a tournament-window/venue acclimatisation score; no humidity/heat.",
    testsRequired: "climate-suitability-snapshot; climate-suitability-score.",
    governanceNotes: "candidate in sources.ts. Separately capped (CLIMATE_CONTRIBUTION_CAP).",
  },
  {
    inputId: "structural",
    displayName: "Structural / economic depth",
    family: "structural / economic",
    description:
      "Weak structural prior blending log-scaled GDP per capita and population into a 0..1 depth score.",
    status: "implemented",
    phase: "static",
    sourceRef: "structural",
    sourceType: "csv",
    refreshCadence: "annual",
    currentUsage: "productionProbability",
    weightRef: "structural",
    fallback: "Team.gdpPerCapita / Team.population identity values if the snapshot row is missing.",
    freshnessRequirement: "Annual World Bank WDI baseline (frozen 2024).",
    confidenceLevel: "medium",
    publicExplanationAllowed: true,
    calibrationEligible: false,
    tuningEligible: false,
    liveEligible: false,
    knownLimitations: "Deliberately weak prior; never a determinative match-level predictor; risk of being overstated.",
    testsRequired: "structural-economic-snapshot; economic-driver.",
    governanceNotes: "candidate (mixed: 46 source-backed + 2 official-derived) in sources.ts.",
  },
  {
    inputId: "tournamentContext",
    displayName: "Tournament context (group-stage logistics)",
    family: "travel / acclimatisation",
    description:
      "Signed -1..+1 composite of travel/rest/altitude/time-zone/venue-continuity from the fixed group-stage itinerary; consumed pairwise.",
    status: "implemented",
    phase: "preTournament",
    sourceRef: "tournamentContext",
    sourceType: "generated",
    refreshCadence: "preTournamentFreeze",
    currentUsage: "productionProbability",
    weightRef: "tournamentContext",
    fallback: "Neutral 0 for any team whose itinerary cannot be resolved.",
    freshnessRequirement: "Derived once from the fixed draw/fixtures; not updated live today.",
    confidenceLevel: "medium",
    publicExplanationAllowed: true,
    calibrationEligible: false,
    tuningEligible: false,
    liveEligible: false,
    knownLimitations: "Favourability-skewed (offset cancels pairwise); heat/venue-climate deferred; no live updates.",
    testsRequired: "tournament-context-itineraries/score/driver.",
    governanceNotes: "candidate in sources.ts. Separately capped (TOURNAMENT_CONTEXT_CONTRIBUTION_CAP); venue geo source-backed.",
  },

  // ---- Available-but-unwired data packs -------------------------------------
  {
    inputId: "recentFormSnapshot",
    displayName: "Recent-form snapshot (last 10)",
    family: "team strength",
    description:
      "Source-backed last-5/last-10 results aggregates per team. Standalone and unwired; does not affect probabilities.",
    status: "availableDataOnly",
    phase: "preTournament",
    sourceRef: null,
    sourceType: "csv",
    refreshCadence: "preTournamentFreeze",
    currentUsage: "availableNotUsed",
    weightRef: null,
    fallback: "n/a (not consumed by the model).",
    freshnessRequirement: "Leakage-safe cutoff strictly before opening kickoff.",
    confidenceLevel: "low",
    publicExplanationAllowed: false,
    calibrationEligible: false,
    tuningEligible: false,
    liveEligible: false,
    knownLimitations: "Overlaps Elo/FIFA; opponent-adjusted residual deferred. Source-backed but intentionally not wired.",
    testsRequired: "recent-form-snapshot; recent-form-no-wiring.",
    governanceNotes: "Artifact: data/model-inputs/snapshots/recent-form-2026-06-11.ts. Active recentForm driver stays placeholder.",
  },
  {
    inputId: "squadRosterSnapshot",
    displayName: "Squad roster snapshot",
    family: "squad / player",
    description:
      "48x26 player roster metadata (club/DOB/caps/goals). Standalone and unwired; no quality score computed.",
    status: "availableDataOnly",
    phase: "preTournament",
    sourceRef: null,
    sourceType: "csv",
    refreshCadence: "preTournamentFreeze",
    currentUsage: "availableNotUsed",
    weightRef: null,
    fallback: "n/a (not consumed by the model).",
    freshnessRequirement: "Leakage-risk flagged: source PDF dated after the freeze; do NOT use pre-tournament.",
    confidenceLevel: "low",
    publicExplanationAllowed: false,
    calibrationEligible: false,
    tuningEligible: false,
    liveEligible: false,
    knownLimitations: "No proprietary player-value data; clubStrengthScore/squadDepthScore are null; leakage risk.",
    testsRequired: "squad-snapshot; squad-no-wiring.",
    governanceNotes: "Artifact: data/model-inputs/snapshots/squad-2026-06-11.ts. Active squadQuality driver stays placeholder.",
  },
  {
    inputId: "venueClimateNormals",
    displayName: "Venue climate normals (deferred)",
    family: "climate / venue",
    description:
      "Per-venue temperature/climate at match locations. Placeholder fields exist on venues; not source-backed, not consumed.",
    status: "deferred",
    phase: "static",
    sourceRef: null,
    sourceType: "generated",
    refreshCadence: "static",
    currentUsage: "availableNotUsed",
    weightRef: null,
    fallback: "n/a (not consumed by the model).",
    freshnessRequirement: "Needs a source-backed venue-climate dataset before any use.",
    confidenceLevel: "none",
    publicExplanationAllowed: false,
    calibrationEligible: false,
    tuningEligible: false,
    liveEligible: false,
    knownLimitations: "Distinct from home-country climate; tournament-window heat/humidity deferred.",
    testsRequired: "venue-geo-snapshot (asserts climate fields stay deferred).",
    governanceNotes: "Venue geo (lat/long/altitude/TZ) IS used via tournamentContext; venue CLIMATE is not.",
  },

  // ---- Backtesting-only inputs (isolated historical harness) ----------------
  {
    inputId: "backtestingHistoricalElo",
    displayName: "Historical Elo (backtesting)",
    family: "team strength",
    description: "Pre-tournament Elo from each historical source pack, used only by the isolated backtesting harness.",
    status: "implemented",
    phase: "preTournament",
    sourceRef: null,
    sourceType: "csv",
    refreshCadence: "preTournamentFreeze",
    currentUsage: "backtestingOnly",
    weightRef: null,
    fallback: "n/a (historical packs are complete per tournament).",
    freshnessRequirement: "Dates strictly before each historical opening kickoff (leakage-guarded).",
    confidenceLevel: "high",
    publicExplanationAllowed: false,
    calibrationEligible: false,
    tuningEligible: false,
    liveEligible: false,
    knownLimitations: "Only Elo + FIFA + host/regional are active in historical mode; all other features are neutral.",
    testsRequired: "backtesting-isolation; backtesting-core-parity.",
    governanceNotes: "Artifacts: data/historical/snapshots/*; lib/backtesting/feature-adapter.ts. Import-isolated from production.",
  },
  {
    inputId: "backtestingHistoricalFifa",
    displayName: "Historical FIFA ranking (backtesting)",
    family: "team strength",
    description: "Pre-tournament FIFA ranking from each historical source pack, used only by the backtesting harness.",
    status: "implemented",
    phase: "preTournament",
    sourceRef: null,
    sourceType: "csv",
    refreshCadence: "preTournamentFreeze",
    currentUsage: "backtestingOnly",
    weightRef: null,
    fallback: "n/a (historical packs are complete per tournament).",
    freshnessRequirement: "Dates strictly before each historical opening kickoff (leakage-guarded).",
    confidenceLevel: "high",
    publicExplanationAllowed: false,
    calibrationEligible: false,
    tuningEligible: false,
    liveEligible: false,
    knownLimitations: "Active alongside Elo in historical mode; other families neutral.",
    testsRequired: "backtesting-isolation; backtesting-core-parity.",
    governanceNotes: "Artifacts: data/historical/snapshots/*; lib/backtesting/feature-adapter.ts.",
  },
  {
    inputId: "backtestingHostRegional",
    displayName: "Historical host/regional (backtesting)",
    family: "tournament context",
    description:
      "Host and host-region flags computed relative to each historical tournament's host, used only by the backtesting harness.",
    status: "implemented",
    phase: "preTournament",
    sourceRef: null,
    sourceType: "generated",
    refreshCadence: "preTournamentFreeze",
    currentUsage: "backtestingOnly",
    weightRef: null,
    fallback: "Non-host/non-regional where the pack host is unknown.",
    freshnessRequirement: "Derived from each pack's declared host countries.",
    confidenceLevel: "medium",
    publicExplanationAllowed: false,
    calibrationEligible: false,
    tuningEligible: false,
    liveEligible: false,
    knownLimitations: "Historical-host relative only; not the 2026 production host/regional terms.",
    testsRequired: "backtesting-isolation; backtesting-core-parity.",
    governanceNotes: "Artifact: lib/backtesting/feature-adapter.ts.",
  },

  // ---- Explanation-only inputs (transparency, not drivers) -------------------
  {
    inputId: "ratingRankDisplay",
    displayName: "Elo/FIFA rank & points (display)",
    family: "team strength",
    description:
      "Elo global rank, FIFA rank and FIFA points carried for explainability/UI; not consumed as drivers.",
    status: "implemented",
    phase: "preTournament",
    sourceRef: "fifaRanking",
    sourceType: "csv",
    refreshCadence: "preTournamentFreeze",
    currentUsage: "explanationOnly",
    weightRef: null,
    fallback: "Omitted from explanation if absent.",
    freshnessRequirement: "Same snapshots as the Elo/FIFA drivers.",
    confidenceLevel: "high",
    publicExplanationAllowed: true,
    calibrationEligible: false,
    tuningEligible: false,
    liveEligible: false,
    knownLimitations: "Display/explanation only; the driver uses the rating/rank difference, not these fields directly.",
    testsRequired: "elo-rating-snapshot; fifa-ranking-snapshot.",
    governanceNotes: "Carried on TeamModelInputs (eloRank, fifaRankingPoints).",
  },
  {
    inputId: "economicIndicatorsDisplay",
    displayName: "Raw economic indicators (display)",
    family: "structural / economic",
    description: "Raw GDP (current US$), GDP per capita and population carried for transparency; not direct drivers.",
    status: "implemented",
    phase: "static",
    sourceRef: "structural",
    sourceType: "csv",
    refreshCadence: "annual",
    currentUsage: "explanationOnly",
    weightRef: null,
    fallback: "Omitted from explanation if absent.",
    freshnessRequirement: "Same WDI 2024 baseline as the structural driver.",
    confidenceLevel: "medium",
    publicExplanationAllowed: true,
    calibrationEligible: false,
    tuningEligible: false,
    liveEligible: false,
    knownLimitations: "Raw indicators feed the structuralDepth score; shown for transparency, not consumed pairwise.",
    testsRequired: "structural-economic-snapshot.",
    governanceNotes: "Carried on TeamModelInputs (gdpCurrentUsd, gdpPerCapita, population).",
  },

  // ---- Planned inputs (intended; no code/data yet) --------------------------
  {
    inputId: "plannedWorldBankDevProxies",
    displayName: "Additional development proxies (planned)",
    family: "structural / economic",
    description: "Further World Bank / football-development indicators beyond GDP and population.",
    status: "planned",
    phase: "static",
    sourceRef: null,
    sourceType: "external",
    refreshCadence: "annual",
    currentUsage: "futureCandidate",
    weightRef: null,
    fallback: "n/a (not built).",
    freshnessRequirement: "Annual source snapshot before any wiring.",
    confidenceLevel: "none",
    publicExplanationAllowed: false,
    calibrationEligible: false,
    tuningEligible: false,
    liveEligible: false,
    knownLimitations: "Risk of overstating economic signals; would stay a weak, capped prior if ever wired.",
    testsRequired: "snapshot + no-wiring tests before promotion.",
    governanceNotes: "Enters production only with explicit approval; no calibration.",
  },
  {
    inputId: "plannedSquadQualityScore",
    displayName: "Bottom-up squad-quality score (planned)",
    family: "squad / player",
    description: "A source-backed squad-quality score derived from player value/club strength to replace the placeholder.",
    status: "planned",
    phase: "preTournament",
    sourceRef: null,
    sourceType: "external",
    refreshCadence: "preTournamentFreeze",
    currentUsage: "futureCandidate",
    weightRef: null,
    fallback: "n/a (placeholder squadQuality remains active).",
    freshnessRequirement: "Licensed/source-backed player data before wiring.",
    confidenceLevel: "none",
    publicExplanationAllowed: false,
    calibrationEligible: false,
    tuningEligible: false,
    liveEligible: false,
    knownLimitations: "No licensed player-value data available today.",
    testsRequired: "snapshot + no-wiring tests before promotion.",
    governanceNotes: "Would promote squadQuality from placeholder; explicit approval required.",
  },
  {
    inputId: "plannedPlayerAvailability",
    displayName: "Player availability / injuries / suspensions (planned)",
    family: "squad / player",
    description: "Per-match squad adjustments for injuries and suspensions.",
    status: "planned",
    phase: "matchContext",
    sourceRef: null,
    sourceType: "api",
    refreshCadence: "perMatch",
    currentUsage: "futureCandidate",
    weightRef: null,
    fallback: "n/a (not built); would require a visible freshness flag if added.",
    freshnessRequirement: "Reliable per-match availability source before any use.",
    confidenceLevel: "none",
    publicExplanationAllowed: false,
    calibrationEligible: false,
    tuningEligible: false,
    liveEligible: true,
    knownLimitations: "Player-context completeness is hard; partial data must not silently drive probabilities.",
    testsRequired: "source + fallback-flag tests before promotion.",
    governanceNotes: "Rolling/match-context; no silent fallback; explicit approval required.",
  },
  {
    inputId: "plannedRollingTournamentState",
    displayName: "Rolling tournament state (planned)",
    family: "tournament context",
    description:
      "Rolling group standings/points/GD, qualification pressure, bracket path and realised rest/travel between matches.",
    status: "planned",
    phase: "matchContext",
    sourceRef: null,
    sourceType: "generated",
    refreshCadence: "perMatch",
    currentUsage: "futureCandidate",
    weightRef: null,
    fallback: "Pre-tournament frozen itinerary/context if rolling data is unavailable (flagged).",
    freshnessRequirement: "Recomputed from realised results between matches.",
    confidenceLevel: "none",
    publicExplanationAllowed: false,
    calibrationEligible: false,
    tuningEligible: false,
    liveEligible: true,
    knownLimitations: "Today only the fixed pre-tournament itinerary exists; rolling updates are future work.",
    testsRequired: "rolling-vs-frozen parity + fallback-flag tests before promotion.",
    governanceNotes: "Depends on the live results/standings runway (see live entries).",
  },

  // ---- Future-live inputs (require live ingestion; staged runway) -----------
  {
    inputId: "liveFixturesResults",
    displayName: "Live fixtures & results (future-live)",
    family: "live match context",
    description: "Official live fixtures and final scores to resolve played matches; safest first live ingestion stage.",
    status: "planned",
    phase: "liveFuture",
    sourceRef: null,
    sourceType: "api",
    refreshCadence: "daily",
    currentUsage: "futureCandidate",
    weightRef: null,
    fallback: "Fall back to the last frozen snapshot, with a visible 'as-of' / freshness flag.",
    freshnessRequirement: "Per-match/daily; never silently stale.",
    confidenceLevel: "none",
    publicExplanationAllowed: false,
    calibrationEligible: false,
    tuningEligible: false,
    liveEligible: true,
    knownLimitations: "Requires a reliable feed; first live phase is results/standings/bracket only, NOT in-play prediction.",
    testsRequired: "schema; leakage/ordering; fallback-flag tests before promotion.",
    governanceNotes: "Recommended safest first live phase after the registry; results refresh, re-sim remaining matches only.",
  },
  {
    inputId: "liveStandings",
    displayName: "Live standings (future-live)",
    family: "live match context",
    description: "Group standings derived from live results via the existing Article-13 standings logic.",
    status: "planned",
    phase: "liveFuture",
    sourceRef: null,
    sourceType: "generated",
    refreshCadence: "daily",
    currentUsage: "futureCandidate",
    weightRef: null,
    fallback: "Stale flag if upstream results are unavailable.",
    freshnessRequirement: "Derived per results update.",
    confidenceLevel: "none",
    publicExplanationAllowed: false,
    calibrationEligible: false,
    tuningEligible: false,
    liveEligible: true,
    knownLimitations: "Only as fresh as the live results feed.",
    testsRequired: "standings parity with results before promotion.",
    governanceNotes: "Stage 2 of the live runway; depends on liveFixturesResults.",
  },
  {
    inputId: "liveBracketProgression",
    displayName: "Live bracket progression (future-live)",
    family: "live match context",
    description: "Knockout bracket progression derived from live standings and the official R32 mapping.",
    status: "planned",
    phase: "liveFuture",
    sourceRef: null,
    sourceType: "generated",
    refreshCadence: "perMatch",
    currentUsage: "futureCandidate",
    weightRef: null,
    fallback: "Stale flag if upstream standings are unavailable.",
    freshnessRequirement: "Derived per stage completion.",
    confidenceLevel: "none",
    publicExplanationAllowed: false,
    calibrationEligible: false,
    tuningEligible: false,
    liveEligible: true,
    knownLimitations: "Depends on the official knockout mapping and live standings.",
    testsRequired: "bracket propagation tests before promotion.",
    governanceNotes: "Stage 3 of the live runway.",
  },
  {
    inputId: "inPlayContext",
    displayName: "In-play context: lineups/cards/subs/xG/shots (deferred)",
    family: "live match context",
    description:
      "In-play events (lineups, cards, substitutions, xG, shots, in-play state). Deferred indefinitely absent a reliable source.",
    status: "deferred",
    phase: "liveFuture",
    sourceRef: null,
    sourceType: "api",
    refreshCadence: "live",
    currentUsage: "futureCandidate",
    weightRef: null,
    fallback: "n/a (not built).",
    freshnessRequirement: "Reliable live in-play feed required before any consideration.",
    confidenceLevel: "none",
    publicExplanationAllowed: false,
    calibrationEligible: false,
    tuningEligible: false,
    liveEligible: true,
    knownLimitations: "Not an in-play prediction product; must not be treated as a model without data support.",
    testsRequired: "n/a until a source exists.",
    governanceNotes: "Last/most-deferred live stage; well beyond the registry and the first live phase.",
  },
] as const;

/** Convenience lookup by `inputId` (non-behavioural helper). */
export function getInputRegistryEntry(inputId: string): InputRegistryEntry | undefined {
  return INPUT_REGISTRY.find((e) => e.inputId === inputId);
}
