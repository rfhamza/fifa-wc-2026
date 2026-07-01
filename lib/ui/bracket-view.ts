/**
 * Tournament Bracket — pure node/round building + state/label logic (UX-4A).
 * ---------------------------------------------------------------------------
 * Builds the knockout tree from the OFFICIAL graph skeleton (always M73–M104),
 * overlaid with the public-safe live-state (`bracket[]` participants/winner +
 * `matches[]` status/scores/penalties). The skeleton guarantees every round renders
 * today (unresolved slots show honest human placeholders); live-state fills teams and
 * results where known. Forecast provenance drives a lightweight, state-aware badge
 * (retrospective is NEVER labelled pre-match).
 *
 * PURE: no React, no I/O, no env, no Blob, no fetch. Type-imports only (plus the pure
 * label helpers from match-centre), so it is node-testable and safe on server or client.
 */
import {
  matchProvenanceLabel,
  provenanceTone,
  stageLabel,
  type CentreProvenanceKind,
} from "@/lib/ui/match-centre";
import type {
  KnockoutMatchDefinition,
  KnockoutStage,
  QualifierSlot,
} from "@/lib/types";
import type { MatchForecastProvenance } from "@/lib/model/match-forecast";
import type {
  LiveViewBracketMatch,
  LiveViewMatch,
  LiveViewMatchStatus,
} from "@/lib/live-client/public-safe-view.client";

/** Minimal team identity the bracket needs (the page passes a public-safe lookup). */
export interface BracketTeamRef {
  id: string;
  name: string;
  flag: string;
  countryCode: string;
}

/** The main title-tree rounds, in column order (third place is surfaced separately). */
export const BRACKET_MAIN_ROUNDS: readonly KnockoutStage[] = [
  "roundOf32",
  "roundOf16",
  "quarterFinal",
  "semiFinal",
  "final",
];

/** A node's lifecycle state, derived from participant resolution + live status. */
export type BracketNodeState = "awaiting" | "partial" | "scheduled" | "live" | "completed";

/** A resolved participant (team known) or an unresolved slot placeholder. */
export interface BracketParticipant {
  teamId: string | null;
  name: string;
  flag: string | null;
  countryCode: string | null;
  /** Human placeholder ("Winner of Match 97") when the team is not yet known. */
  placeholder: string | null;
  isWinner: boolean;
}

export interface BracketForecastBadge {
  label: string;
  tone: "default" | "accent" | "muted" | "outline";
}

export interface BracketScore {
  homeGoals: number;
  awayGoals: number;
  penalties?: { home: number; away: number };
}

export interface BracketNode {
  matchNumber: number;
  stage: KnockoutStage;
  stageLabel: string;
  state: BracketNodeState;
  home: BracketParticipant;
  away: BracketParticipant;
  kickoff: string | null;
  score: BracketScore | null;
  /** Lightweight forecast-provenance badge; null when not applicable (awaiting/partial). */
  forecast: BracketForecastBadge | null;
}

export interface BracketRound {
  stage: KnockoutStage;
  label: string;
  nodes: BracketNode[];
}

export interface BracketView {
  /** Main title tree, R32 → Final, in column order. */
  rounds: BracketRound[];
  /** The third-place play-off (M103), surfaced on its own — never in the title tree. */
  thirdPlace: BracketNode | null;
}

const GROUP_LABEL = (group: string, position: 1 | 2): string =>
  position === 1 ? `Winner Group ${group}` : `Runner-up Group ${group}`;

/** Human-readable placeholder for an unresolved slot (never a raw code / provider id). */
export function slotLabel(slot: QualifierSlot): string {
  switch (slot.kind) {
    case "groupPosition":
      return GROUP_LABEL(slot.group, slot.position);
    case "thirdPlace":
      return "Third-place qualifier";
    case "matchWinner":
      return `Winner of Match ${slot.matchNumber}`;
    case "matchLoser":
      return `Loser of Match ${slot.matchNumber}`;
    default:
      return "Awaiting teams";
  }
}

function participant(
  teamId: string | null,
  slot: QualifierSlot,
  winnerId: string | null,
  resolveTeam: (id: string) => BracketTeamRef | null,
): BracketParticipant {
  const team = teamId ? resolveTeam(teamId) : null;
  if (team) {
    return {
      teamId: team.id,
      name: team.name,
      flag: team.flag,
      countryCode: team.countryCode,
      placeholder: null,
      isWinner: winnerId != null && winnerId === team.id,
    };
  }
  return {
    teamId: null,
    name: slotLabel(slot),
    flag: null,
    countryCode: null,
    placeholder: slotLabel(slot),
    isWinner: false,
  };
}

/** Node state from participant resolution + live match status. */
export function deriveNodeState(
  homeResolved: boolean,
  awayResolved: boolean,
  status: LiveViewMatchStatus | null,
): BracketNodeState {
  if (!homeResolved && !awayResolved) return "awaiting";
  if (!homeResolved || !awayResolved) return "partial";
  if (status === "in-progress") return "live";
  if (status === "complete") return "completed";
  return "scheduled";
}

/**
 * State-aware forecast badge. Awaiting/partial nodes carry no forecast badge (their
 * status already says "Awaiting teams"). Otherwise: retrospective → retrospective;
 * a captured pre-match entry → pre-match-captured; no entry → coming-soon (future) /
 * no-pre-match-captured (completed) / unavailable (no matches object).
 */
export function bracketForecastBadge(args: {
  state: BracketNodeState;
  provenance: MatchForecastProvenance | null | undefined;
  matchesObjectAvailable: boolean;
  status: LiveViewMatchStatus | null;
}): BracketForecastBadge | null {
  const { state, provenance, matchesObjectAvailable, status } = args;
  if (state === "awaiting" || state === "partial") return null;

  let kind: CentreProvenanceKind;
  if (provenance === "retrospective-model-forecast") {
    kind = "retrospective";
  } else if (
    provenance === "current-pre-match-forecast" ||
    provenance === "archived-pre-match-forecast"
  ) {
    kind = "pre-match-captured";
  } else if (!matchesObjectAvailable) {
    kind = "unavailable";
  } else if (status === "complete") {
    kind = "no-pre-match-captured";
  } else {
    kind = "coming-soon";
  }
  return { label: matchProvenanceLabel(kind), tone: provenanceTone(kind) };
}

export interface BuildBracketViewInput {
  /** Official knockout graph matches (the reliable skeleton, M73–M104). */
  skeleton: readonly KnockoutMatchDefinition[];
  /** Public-safe live-state bracket nodes (participants/winner/resolution). */
  liveBracket: readonly LiveViewBracketMatch[];
  /** Public-safe live-state matches (status/scores/penalties). */
  liveMatches: readonly LiveViewMatch[];
  /** Serialized knockout forecast provenance by matchNumber. */
  provenanceByMatch: Record<number, MatchForecastProvenance>;
  matchesObjectAvailable: boolean;
  resolveTeam: (id: string) => BracketTeamRef | null;
}

/**
 * Build the bracket view: main title tree (rounds in column order) + third-place node.
 * Pure; never throws. Renders fully from the skeleton alone (all "Awaiting teams") when
 * live-state is unavailable.
 */
export function buildBracketView(input: BuildBracketViewInput): BracketView {
  const { skeleton, liveBracket, liveMatches, provenanceByMatch, matchesObjectAvailable, resolveTeam } =
    input;

  const bracketByMatch = new Map(liveBracket.map((b) => [b.matchNumber, b]));
  const matchByNumber = new Map(liveMatches.map((m) => [m.matchNumber, m]));

  const nodeOf = (def: KnockoutMatchDefinition): BracketNode => {
    const lb = bracketByMatch.get(def.matchNumber);
    const lm = matchByNumber.get(def.matchNumber);

    // Participant ids: prefer the resolution-aware bracket node, then the live match.
    const homeId = lb?.homeTeamId ?? lm?.teamA ?? null;
    const awayId = lb?.awayTeamId ?? lm?.teamB ?? null;
    const winnerId = lb?.winner ?? lm?.winner ?? null;

    const home = participant(homeId, def.home, winnerId, resolveTeam);
    const away = participant(awayId, def.away, winnerId, resolveTeam);
    const status = lm?.status ?? null;
    const state = deriveNodeState(home.teamId != null, away.teamId != null, status);

    // Score (completed only), oriented to our home/away by team id.
    let score: BracketScore | null = null;
    if (
      lm &&
      lm.status === "complete" &&
      typeof lm.goalsA === "number" &&
      typeof lm.goalsB === "number"
    ) {
      const homeIsA = homeId != null && homeId === lm.teamA;
      const homeGoals = homeIsA ? lm.goalsA : lm.goalsB;
      const awayGoals = homeIsA ? lm.goalsB : lm.goalsA;
      score = { homeGoals, awayGoals };
      if (lm.penalties) {
        score.penalties = homeIsA
          ? { home: lm.penalties.a, away: lm.penalties.b }
          : { home: lm.penalties.b, away: lm.penalties.a };
      }
    }

    return {
      matchNumber: def.matchNumber,
      stage: def.stage,
      stageLabel: stageLabel(def.stage),
      state,
      home,
      away,
      kickoff: lm?.kickoff ?? null,
      score,
      forecast: bracketForecastBadge({
        state,
        provenance: provenanceByMatch[def.matchNumber],
        matchesObjectAvailable,
        status,
      }),
    };
  };

  const sorted = [...skeleton].sort((a, b) => a.matchNumber - b.matchNumber);

  const rounds: BracketRound[] = BRACKET_MAIN_ROUNDS.map((stage) => ({
    stage,
    label: stageLabel(stage),
    nodes: sorted.filter((d) => d.stage === stage).map(nodeOf),
  }));

  const thirdDef = sorted.find((d) => d.stage === "thirdPlace");
  const thirdPlace = thirdDef ? nodeOf(thirdDef) : null;

  return { rounds, thirdPlace };
}
