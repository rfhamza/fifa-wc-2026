/**
 * Two-sided bracket layout — pure, graph-derived (corrective UX pass).
 * -------------------------------------------------------------------
 * Splits the knockout tree into a LEFT half (everything whose winner flows to semi-final
 * M101) and a RIGHT half (flows to M102), with the Final (M104) centered and the
 * third-place play-off (M103) kept separate. The split is derived from the OFFICIAL graph
 * winner edges (via buildForwardEdges) — never from arbitrary match-number slicing and
 * never from provider bracket semantics.
 *
 * PURE: no React, no I/O, no env, no Blob. Type-imports only (+ the pure buildForwardEdges).
 * Node-testable and safe on server or client.
 */
import { buildForwardEdges } from "@/lib/ui/bracket-path";
import type { BracketNode, BracketView } from "@/lib/ui/bracket-view";
import type { KnockoutGraph, KnockoutStage } from "@/lib/types";

export interface BracketHalf {
  roundOf32: BracketNode[];
  roundOf16: BracketNode[];
  quarterFinal: BracketNode[];
  semiFinal: BracketNode[];
}

export interface BracketLayout {
  left: BracketHalf;
  right: BracketHalf;
  /** The Final (M104), centered between the two halves. */
  final: BracketNode | null;
  /** The third-place play-off (M103) — never part of either half or the title tree. */
  thirdPlace: BracketNode | null;
}

/** SF matchNumber each half converges on. */
const LEFT_SEMI_FINAL = 101;
const RIGHT_SEMI_FINAL = 102;

/**
 * Match numbers feeding each finalist slot, derived from the official graph: the set of
 * winner-edge ancestors of M101 (left) and M102 (right). Disjoint; together they cover
 * every knockout match except the Final (M104) and the third-place match (M103).
 */
export function bracketHalfMembership(graph: KnockoutGraph): { left: Set<number>; right: Set<number> } {
  const edges = buildForwardEdges(graph);
  // Invert winner edges into a predecessor map: match -> [matches whose winner feeds it].
  const predecessors = new Map<number, number[]>();
  for (const [matchNumber, edge] of edges) {
    if (edge.winnerTo != null) {
      const list = predecessors.get(edge.winnerTo) ?? [];
      list.push(matchNumber);
      predecessors.set(edge.winnerTo, list);
    }
  }
  const ancestors = (root: number): Set<number> => {
    const out = new Set<number>();
    const stack = [root];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (out.has(cur)) continue;
      out.add(cur);
      for (const p of predecessors.get(cur) ?? []) stack.push(p);
    }
    return out;
  };
  return { left: ancestors(LEFT_SEMI_FINAL), right: ancestors(RIGHT_SEMI_FINAL) };
}

/**
 * Build the two-sided layout from the bracket view + official graph. Pure; never throws.
 * Nodes within each stage keep official match-number order.
 */
export function buildBracketLayout(view: BracketView, graph: KnockoutGraph): BracketLayout {
  const { left, right } = bracketHalfMembership(graph);

  const nodesForStage = (stage: KnockoutStage): BracketNode[] =>
    view.rounds.find((r) => r.stage === stage)?.nodes ?? [];

  const half = (members: Set<number>): BracketHalf => {
    const pick = (stage: KnockoutStage): BracketNode[] =>
      nodesForStage(stage)
        .filter((n) => members.has(n.matchNumber))
        .sort((a, b) => a.matchNumber - b.matchNumber);
    return {
      roundOf32: pick("roundOf32"),
      roundOf16: pick("roundOf16"),
      quarterFinal: pick("quarterFinal"),
      semiFinal: pick("semiFinal"),
    };
  };

  return {
    left: half(left),
    right: half(right),
    final: nodesForStage("final")[0] ?? null,
    thirdPlace: view.thirdPlace,
  };
}
