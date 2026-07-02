/**
 * Selected-team path-to-final — pure graph/path model (UX-4C).
 * -----------------------------------------------------------
 * Traces a team through the knockout bracket using ONLY the official graph forward edges
 * (winner edges toward M104; loser edges only for semi-final losers into M103) and the
 * live-state-overlaid bracket view (participants + `isWinner`). It answers where a team
 * is, its deterministic possible path forward, the next (known or placeholder) opponent,
 * and where an eliminated path ended — with NO probabilities, NO "easy/hard path" claims,
 * and NO provider bracket semantics.
 *
 * PURE: no React, no I/O, no env, no Blob, no fetch. Type-imports only. Node-testable and
 * safe on server or client.
 */
import { slotLabel } from "@/lib/ui/bracket-view";
import type { BracketNode, BracketParticipant, BracketTeamRef, BracketView } from "@/lib/ui/bracket-view";
import type { KnockoutGraph } from "@/lib/types";

export type TeamPathStatus =
  | "active"
  | "eliminated"
  | "champion"
  | "third-place"
  | "notInKnockout"
  | "unknown";

export interface TeamPathNextMatch {
  matchNumber: number;
  opponentLabel: string;
}
export interface TeamPathEndpoint {
  matchNumber: number;
  kind: "final" | "third-place" | "eliminated";
}

export interface TeamBracketPath {
  teamId: string;
  name: string;
  flag?: string;
  countryCode?: string;
  status: TeamPathStatus;
  currentMatchNumber: number | null;
  playedMatchNumbers: number[];
  futureMatchNumbers: number[];
  nextMatch: TeamPathNextMatch | null;
  endpoint: TeamPathEndpoint | null;
  includesThirdPlace: boolean;
  pathMatchNumbers: number[];
  summary: string;
}

/** A match's forward edges: where its winner (and, for SFs, its loser) flow. */
export interface ForwardEdge {
  winnerTo?: number;
  loserTo?: number;
}

/**
 * Build the forward-edge map from the official graph: for each match N, the later match
 * that consumes its winner (`matchWinner: N`) and — only for SF M101/M102 — its loser
 * (`matchLoser: N` → M103). Pure; derived solely from the graph array.
 */
export function buildForwardEdges(graph: KnockoutGraph): Map<number, ForwardEdge> {
  const edges = new Map<number, ForwardEdge>();
  const ensure = (mn: number): ForwardEdge => {
    let e = edges.get(mn);
    if (!e) {
      e = {};
      edges.set(mn, e);
    }
    return e;
  };
  for (const m of graph.matches) {
    for (const slot of [m.home, m.away]) {
      if (slot.kind === "matchWinner") ensure(slot.matchNumber).winnerTo = m.matchNumber;
      else if (slot.kind === "matchLoser") ensure(slot.matchNumber).loserTo = m.matchNumber;
    }
  }
  return edges;
}

function allNodes(view: BracketView): BracketNode[] {
  return [...view.rounds.flatMap((r) => r.nodes), ...(view.thirdPlace ? [view.thirdPlace] : [])];
}

function teamParticipant(node: BracketNode, teamId: string): BracketParticipant | null {
  if (node.home.teamId === teamId) return node.home;
  if (node.away.teamId === teamId) return node.away;
  return null;
}

/** Follow winner edges from `matchNumber` toward the Final; the chain excludes the start. */
function winnerChainFrom(matchNumber: number, edges: Map<number, ForwardEdge>): number[] {
  const out: number[] = [];
  let cur = edges.get(matchNumber)?.winnerTo;
  const guard = new Set<number>();
  while (cur != null && !guard.has(cur)) {
    out.push(cur);
    guard.add(cur);
    cur = edges.get(cur)?.winnerTo;
  }
  return out;
}

/**
 * Label the opponent in `matchNumber` for a team arriving there from `fromMatchNumber`
 * (via winner edge, or loser edge when `viaLoser`). Uses the known team name if the
 * opponent slot is already resolved in the view; otherwise the human slot placeholder.
 */
function opponentLabel(
  graph: KnockoutGraph,
  view: BracketView,
  matchNumber: number,
  fromMatchNumber: number,
  viaLoser: boolean,
): string {
  const def = graph.matches.find((m) => m.matchNumber === matchNumber);
  const node = allNodes(view).find((n) => n.matchNumber === matchNumber);
  const edgeKind = viaLoser ? "matchLoser" : "matchWinner";
  const homeIsThem =
    def?.home.kind === edgeKind &&
    (def.home as { matchNumber: number }).matchNumber === fromMatchNumber;
  const oppSlot = def ? (homeIsThem ? def.away : def.home) : null;
  const oppPart = node ? (homeIsThem ? node.away : node.home) : null;
  if (oppPart?.teamId) return oppPart.name;
  return oppSlot ? slotLabel(oppSlot) : "Opponent not decided yet";
}

export interface BuildTeamBracketPathInput {
  teamId: string;
  view: BracketView;
  graph: KnockoutGraph;
  /** Fallback identity (name/flag) for a team not resolved into any bracket node. */
  team?: BracketTeamRef;
}

/**
 * Build a team's bracket path. Deterministic: status from `isWinner`/completion, future
 * from winner edges, honest M103 only after an actual completed semi-final loss. Pure;
 * never throws.
 */
export function buildTeamBracketPath(input: BuildTeamBracketPathInput): TeamBracketPath {
  const { teamId, view, graph } = input;
  const edges = buildForwardEdges(graph);
  const teamNodes = allNodes(view)
    .filter((n) => n.home.teamId === teamId || n.away.teamId === teamId)
    .sort((a, b) => a.matchNumber - b.matchNumber);

  const anyPart = teamNodes.length ? teamParticipant(teamNodes[0]!, teamId) : null;
  const name = anyPart?.name ?? input.team?.name ?? teamId;
  const identity = {
    teamId,
    name,
    flag: anyPart?.flag ?? input.team?.flag ?? undefined,
    countryCode: anyPart?.countryCode ?? input.team?.countryCode ?? undefined,
  };

  if (teamNodes.length === 0) {
    return {
      ...identity,
      status: "notInKnockout",
      currentMatchNumber: null,
      playedMatchNumbers: [],
      futureMatchNumbers: [],
      nextMatch: null,
      endpoint: null,
      includesThirdPlace: false,
      pathMatchNumbers: [],
      summary: `${name} is not in the knockout stage.`,
    };
  }

  const played = teamNodes.map((n) => n.matchNumber);
  const current = teamNodes[teamNodes.length - 1]!;
  const cp = teamParticipant(current, teamId)!;
  const completed = current.state === "completed";
  const won = cp.isWinner;

  let status: TeamPathStatus = "active";
  let endpoint: TeamPathEndpoint | null = null;
  let futureMatchNumbers: number[] = [];
  let nextMatch: TeamPathNextMatch | null = null;
  let includesThirdPlace = false;

  if (current.stage === "thirdPlace") {
    // The team is IN the third-place match (M103) — resolved there the moment its
    // semi-final completed, whether M103 is scheduled/live/completed. Never "active".
    status = "third-place";
    includesThirdPlace = true;
    endpoint = { matchNumber: current.matchNumber, kind: "third-place" };
  } else if (completed && won && current.matchNumber === 104) {
    status = "champion";
    endpoint = { matchNumber: 104, kind: "final" };
  } else if (completed && !won && current.stage === "semiFinal") {
    // Defensive: lost a completed semi-final but M103 is not yet populated into a node —
    // route via the loser edge so the third-place match still shows honestly.
    status = "third-place";
    includesThirdPlace = true;
    const loserTo = edges.get(current.matchNumber)?.loserTo ?? 103;
    nextMatch = { matchNumber: loserTo, opponentLabel: opponentLabel(graph, view, loserTo, current.matchNumber, true) };
    futureMatchNumbers = [loserTo];
    endpoint = { matchNumber: loserTo, kind: "third-place" };
  } else if (completed && !won) {
    status = "eliminated";
    endpoint = { matchNumber: current.matchNumber, kind: current.matchNumber === 104 ? "final" : "eliminated" };
  } else {
    // Active: still to play the current node, or won a non-final match and is through.
    status = "active";
    futureMatchNumbers = winnerChainFrom(current.matchNumber, edges);
    const nextMn = futureMatchNumbers[0] ?? null;
    if (nextMn != null) {
      nextMatch = { matchNumber: nextMn, opponentLabel: opponentLabel(graph, view, nextMn, current.matchNumber, false) };
    }
    if (current.matchNumber === 104 || futureMatchNumbers[futureMatchNumbers.length - 1] === 104) {
      endpoint = { matchNumber: 104, kind: "final" };
    }
  }

  const pathMatchNumbers = Array.from(new Set([...played, ...futureMatchNumbers])).sort((a, b) => a - b);
  const summary = buildSummary({ name, status, current, completed, won, nextMatch, endpoint });

  return {
    ...identity,
    status,
    currentMatchNumber: current.matchNumber,
    playedMatchNumbers: played,
    futureMatchNumbers,
    nextMatch,
    endpoint,
    includesThirdPlace,
    pathMatchNumbers,
    summary,
  };
}

function buildSummary(args: {
  name: string;
  status: TeamPathStatus;
  current: BracketNode;
  completed: boolean;
  won: boolean;
  nextMatch: TeamPathNextMatch | null;
  endpoint: TeamPathEndpoint | null;
}): string {
  const { name, status, current, completed, won, nextMatch, endpoint } = args;
  switch (status) {
    case "champion":
      return `${name} — Champion. Path completed in the Final (Match 104).`;
    case "third-place":
      if (current.stage === "semiFinal" || !completed) {
        return `${name} lost the semi-final and plays the third-place match (Match ${nextMatch?.matchNumber ?? 103}).`;
      }
      return won
        ? `${name} finished third — won the third-place match (Match 103).`
        : `${name} finished fourth — lost the third-place match (Match 103).`;
    case "eliminated":
      return `${name}'s path ended in Match ${endpoint?.matchNumber ?? current.matchNumber}. Eliminated.`;
    case "active":
      if (completed) {
        return `${name} is still alive — won Match ${current.matchNumber}${nextMatch ? `, next Match ${nextMatch.matchNumber}` : ""}.`;
      }
      return `${name} is still alive. Current match: Match ${current.matchNumber}${nextMatch ? `; winner advances to Match ${nextMatch.matchNumber}` : ""}.`;
    default:
      return `${name} is not in the knockout stage.`;
  }
}

/** The set of match numbers to highlight for a team's path (played ∪ future). */
export function teamPathMatchNumbers(path: TeamBracketPath): Set<number> {
  return new Set(path.pathMatchNumbers);
}
