/**
 * Home match-card driver chips — pure presentation helper.
 * --------------------------------------------------------
 * Turns the model's existing per-driver decomposition (the exact signed
 * contributions `computeDrivers` already produces for a match) into a small,
 * ranked list of neutral "why the model leans" chips. It performs NO model
 * calculation and invents NO values: it only filters, ranks and labels
 * contributions handed to it. No React, no I/O, no env — node-testable.
 *
 * Modelling honesty guardrails baked in here:
 *  - `recentForm` is a FROZEN pre-tournament placeholder (no rolling-results
 *    feed), so it is intentionally OMITTED from home chips to avoid any
 *    live-form or in-tournament-performance reading.
 *  - `managerCohesion` is DISABLED (zero weight); it never clears the threshold,
 *    and is omitted explicitly as well.
 *  - Chips describe pre-tournament model signals only; direction wording is the
 *    neutral "favours".
 */

/** Minimal shape consumed from a `computeDrivers` result item (A minus B). */
export interface MatchDriverContribution {
  /** Feature family key; `undefined`-tolerant to match the model's driver type. */
  family?: string;
  /** Signed Elo-equivalent points: > 0 favours the home team, < 0 the away team. */
  contribution: number;
}

/** A rendered driver chip: a neutral label + the team the signal favours. */
export interface MatchDriverChip {
  family: string;
  label: string;
  favouredTeamId: string;
  favouredTeamName: string;
  /** Absolute contribution magnitude (Elo-equivalent pts), for ordering/tests. */
  magnitude: number;
  /** Chip text, e.g. "Elo favours France". */
  text: string;
}

export interface MatchDriverSelection {
  chips: MatchDriverChip[];
  /** True when at least one driver cleared the threshold. */
  dominates: boolean;
}

/** Section heading on the card (a copy-truth-pinned string). */
export const MATCH_DRIVER_HEADING = "Why the model leans";

/** Shown when no single driver is meaningful enough to surface. */
export const MATCH_DRIVER_EMPTY_LABEL = "No single driver dominates";

/**
 * Neutral, honest labels for the families we surface on the home card. Families
 * NOT in this map are never shown (this is the allow-list). `recentForm` and
 * `managerCohesion` are deliberately absent (see file header).
 */
export const MATCH_DRIVER_LABELS: Readonly<Record<string, string>> = {
  eloRating: "Elo",
  fifaRanking: "FIFA ranking",
  squadQuality: "Squad signal",
  hostAdvantage: "Host edge",
  regionalAdvantage: "Regional context",
  climateFamiliarity: "Climate",
  structural: "Structural depth",
  tournamentContext: "Tournament logistics",
};

/**
 * Families explicitly excluded even if a label existed — belt-and-braces against
 * a future label being added without re-checking the modelling guardrail.
 */
export const OMITTED_DRIVER_FAMILIES: ReadonlySet<string> = new Set([
  "recentForm", // frozen pre-tournament placeholder (no rolling-results feed)
  "managerCohesion", // disabled (zero weight)
]);

/**
 * Contributions with |magnitude| below this (Elo-equivalent points) are treated
 * as negligible and dropped, so a card only shows drivers that actually move the
 * lean. Chosen small enough to keep host/climate/FIFA edges, large enough to drop
 * the deliberately-weak structural prior noise and near-cancelling terms.
 */
export const MATCH_DRIVER_MIN_MAGNITUDE = 5;

/** Default and hard-max chip counts. */
export const MATCH_DRIVER_DEFAULT_MAX = 3;
export const MATCH_DRIVER_HARD_MAX = 5;

export interface SelectMatchDriverChipsOptions {
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  /** Max chips to return (clamped to [1, MATCH_DRIVER_HARD_MAX]); default 3. */
  max?: number;
  /** Override the negligible-contribution threshold. */
  minMagnitude?: number;
}

/**
 * Select the top ranked driver chips for a match from an existing driver
 * decomposition. Pure: never touches the model, only filters/ranks/labels.
 */
export function selectMatchDriverChips(
  drivers: readonly MatchDriverContribution[],
  options: SelectMatchDriverChipsOptions,
): MatchDriverSelection {
  const {
    homeTeamId,
    homeTeamName,
    awayTeamId,
    awayTeamName,
    max = MATCH_DRIVER_DEFAULT_MAX,
    minMagnitude = MATCH_DRIVER_MIN_MAGNITUDE,
  } = options;

  const limit = Math.max(1, Math.min(MATCH_DRIVER_HARD_MAX, Math.trunc(max)));

  const ranked = drivers
    .filter((d): d is MatchDriverContribution & { family: string } => {
      if (!d.family) return false;
      if (OMITTED_DRIVER_FAMILIES.has(d.family)) return false;
      if (!(d.family in MATCH_DRIVER_LABELS)) return false;
      if (!Number.isFinite(d.contribution)) return false;
      return Math.abs(d.contribution) >= minMagnitude;
    })
    // Sort by magnitude desc; tie-break on family for deterministic output.
    .sort((a, b) => {
      const diff = Math.abs(b.contribution) - Math.abs(a.contribution);
      return diff !== 0 ? diff : a.family.localeCompare(b.family);
    })
    .slice(0, limit)
    .map<MatchDriverChip>((d) => {
      const favoursHome = d.contribution > 0;
      const favouredTeamId = favoursHome ? homeTeamId : awayTeamId;
      const favouredTeamName = favoursHome ? homeTeamName : awayTeamName;
      const label = MATCH_DRIVER_LABELS[d.family]!;
      return {
        family: d.family,
        label,
        favouredTeamId,
        favouredTeamName,
        magnitude: Math.abs(d.contribution),
        text: `${label} favours ${favouredTeamName}`,
      };
    });

  return { chips: ranked, dominates: ranked.length > 0 };
}
