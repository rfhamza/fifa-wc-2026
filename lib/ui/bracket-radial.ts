/**
 * Home "Road to the trophy" radial — pure concentric-knockout geometry + state model.
 * -----------------------------------------------------------------------------------
 * Turns the existing BracketView (built from the OFFICIAL graph skeleton + public-safe
 * live-state) into a deterministic set of ring slots, connector lines and a text table
 * for a radial/concentric rendering: the Round of 32 on the outer ring, winners advancing
 * inward round by round, the two finalists either side of a champion focal point at the
 * centre. Geometry is derived from the official graph's winner edges (the M101 subtree is
 * one half, M102 the other — the same split the two-sided bracket uses), NEVER from raw
 * match-number slicing. The third-place match (M103) is intentionally excluded from the
 * rings (it is not on the title path) but is kept in the text table.
 *
 * PURE: no React, no DOM, no I/O, no env, no Blob, no fetch, no runtime-store import, no
 * provider payload, no tokens. Type-imports only (+ the pure `stageLabel` label helper).
 * Output is deterministic (unit-fraction coordinates rounded to 4 dp), so it is
 * node-testable and safe on server or client.
 */
import { stageLabel } from "@/lib/ui/match-centre";
import type { BracketNode, BracketParticipant, BracketView } from "@/lib/ui/bracket-view";
import type { KnockoutGraph, KnockoutMatchDefinition, KnockoutStage } from "@/lib/types";

/** A slot's lifecycle for the radial (team-level for the "survivors" metaphor). */
export type RadialSlotState = "tbd" | "scheduled" | "live" | "alive" | "eliminated" | "champion";

/** Which ring a slot sits on ("champion" is the centre focal point). */
export type RadialStage = KnockoutStage | "champion";

export interface RadialParticipant {
  teamId: string | null;
  name: string;
  flag: string | null;
  countryCode: string | null;
  /** Human placeholder ("Winner of Match 97") when the team is not yet known. */
  placeholder: string | null;
}

export interface RadialSlot {
  key: string;
  matchNumber: number;
  stage: RadialStage;
  stageLabel: string;
  /** Position on the plot in unit fractions of the square (0..1), centre at (0.5, 0.5). */
  xFrac: number;
  yFrac: number;
  /** Angle in degrees (0 = 3 o'clock, +y downward). 0 for the centre champion. */
  angleDeg: number;
  /** Ring radius as a fraction of the half-dimension (0 at centre, ~0.9 outer). */
  radiusFrac: number;
  participant: RadialParticipant;
  slotState: RadialSlotState;
}

export interface RadialConnector {
  key: string;
  x1Frac: number;
  y1Frac: number;
  x2Frac: number;
  y2Frac: number;
  /** `advanced` = the feeder match is decided (a winner progressed); else `structural`. */
  kind: "structural" | "advanced";
}

export interface RadialRing {
  stage: RadialStage;
  shortLabel: string;
  radiusFrac: number;
}

/** One row of the accessible text twin — every knockout match, INCLUDING M103. */
export interface RadialTableRow {
  matchNumber: number;
  stageLabel: string;
  homeName: string;
  awayName: string;
  statusLabel: string;
}

export interface BracketRadialModel {
  slots: RadialSlot[];
  connectors: RadialConnector[];
  rings: RadialRing[];
  tableRows: RadialTableRow[];
  decidedCount: number;
  totalCount: number;
}

type Side = "home" | "away";
const SIDES: readonly Side[] = ["home", "away"];

/** Ring radii as fractions of the half-dimension, outer → centre. */
const RING_CONFIG: readonly { stage: RadialStage; shortLabel: string; radiusFrac: number }[] = [
  { stage: "roundOf32", shortLabel: "R32", radiusFrac: 0.9 },
  { stage: "roundOf16", shortLabel: "R16", radiusFrac: 0.7 },
  { stage: "quarterFinal", shortLabel: "QF", radiusFrac: 0.51 },
  { stage: "semiFinal", shortLabel: "SF", radiusFrac: 0.33 },
  { stage: "final", shortLabel: "Final", radiusFrac: 0.17 },
];
const RADIUS_BY_STAGE = new Map<RadialStage, number>(RING_CONFIG.map((r) => [r.stage, r.radiusFrac]));

const HALF = 0.5;
const SEAM_HALF_DEG = 8; // half of the 16° seam gap held open at 12 and 6 o'clock
const LEAF_COUNT_PER_HALF = 16;
const ARC_START = 90 + SEAM_HALF_DEG; // 98° — just past 6 o'clock
const ARC_SPAN = 180 - 2 * SEAM_HALF_DEG; // 164° per half
const LEAF_PITCH_DEG = ARC_SPAN / LEAF_COUNT_PER_HALF; // 10.25°

const ROOT_MATCH = 104;

const r4 = (n: number): number => Math.round(n * 10000) / 10000;

/** Polar → unit-square fraction. angle in degrees, +y downward (SVG convention). */
function polar(radiusFrac: number, angleDeg: number): { xFrac: number; yFrac: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    xFrac: r4(0.5 + radiusFrac * HALF * Math.cos(rad)),
    yFrac: r4(0.5 + radiusFrac * HALF * Math.sin(rad)),
  };
}

const slotKey = (matchNumber: number, side: Side): string => `${matchNumber}-${side}`;
const isMatchWinner = (slot: KnockoutMatchDefinition["home"]): slot is { kind: "matchWinner"; matchNumber: number } =>
  slot.kind === "matchWinner";

/**
 * Build the radial model from the bracket view + official graph. Pure; never throws.
 * Renders the full skeleton (all "tbd") when live-state is unavailable.
 */
export function buildBracketRadialModel(view: BracketView, graph: KnockoutGraph): BracketRadialModel {
  const defByNumber = new Map<number, KnockoutMatchDefinition>(
    graph.matches.map((m) => [m.matchNumber, m]),
  );
  const nodeByNumber = new Map<number, BracketNode>();
  for (const round of view.rounds) for (const node of round.nodes) nodeByNumber.set(node.matchNumber, node);
  if (view.thirdPlace) nodeByNumber.set(view.thirdPlace.matchNumber, view.thirdPlace);

  // 1. In-order traversal of the winner tree from the Final: emit the 32 outer leaf slots
  //    (each Round-of-32 match contributes its home slot then its away slot). Home-feeder
  //    first means the M101 subtree fills the first 16 (left half), M102 the last 16.
  const leafOrder: { matchNumber: number; side: Side }[] = [];
  const collectLeaves = (matchNumber: number): void => {
    const def = defByNumber.get(matchNumber);
    if (!def) return;
    for (const side of SIDES) {
      const slot = def[side];
      if (isMatchWinner(slot)) collectLeaves(slot.matchNumber);
      else leafOrder.push({ matchNumber, side });
    }
  };
  collectLeaves(ROOT_MATCH);

  // 2. Assign each outer leaf an angle: left half on the left arc (98°→262°, cos<0), the
  //    right half mirrored on the right arc (−82°→82°, cos>0). Sibling slots (the two
  //    sides of one match) are one pitch apart by construction.
  const angleByKey = new Map<string, number>();
  leafOrder.forEach((leaf, index) => {
    const withinHalf = index % LEAF_COUNT_PER_HALF;
    const angle =
      index < LEAF_COUNT_PER_HALF
        ? ARC_START + (withinHalf + 0.5) * LEAF_PITCH_DEG // left arc
        : -(90 - SEAM_HALF_DEG) + (withinHalf + 0.5) * LEAF_PITCH_DEG; // right arc (−82°→82°)
    angleByKey.set(slotKey(leaf.matchNumber, leaf.side), angle);
  });

  // 3. Inner slot angle = mean of its feeder match's two slot angles (recursive, memoised).
  const angleOf = (matchNumber: number, side: Side): number => {
    const key = slotKey(matchNumber, side);
    const known = angleByKey.get(key);
    if (known !== undefined) return known;
    const def = defByNumber.get(matchNumber);
    const slot = def?.[side];
    let value = 0;
    if (slot && isMatchWinner(slot)) {
      value = (angleOf(slot.matchNumber, "home") + angleOf(slot.matchNumber, "away")) / 2;
    }
    angleByKey.set(key, value);
    return value;
  };
  const midAngle = (matchNumber: number): number =>
    (angleOf(matchNumber, "home") + angleOf(matchNumber, "away")) / 2;

  // Team-level elimination: any resolved non-winner of a COMPLETED title-tree match is out
  // (and stays out at every earlier appearance). Title tree only — M103 is not in view.rounds.
  const eliminated = new Set<string>();
  for (const round of view.rounds) {
    for (const node of round.nodes) {
      if (node.state !== "completed") continue;
      for (const side of SIDES) {
        const p = node[side];
        if (p.teamId && !p.isWinner) eliminated.add(p.teamId);
      }
    }
  }

  const finalNode = nodeByNumber.get(ROOT_MATCH) ?? null;
  const championParticipant: BracketParticipant | null =
    finalNode && finalNode.state === "completed"
      ? finalNode.home.isWinner
        ? finalNode.home
        : finalNode.away.isWinner
          ? finalNode.away
          : null
      : null;

  const toRadialParticipant = (p: BracketParticipant): RadialParticipant => ({
    teamId: p.teamId,
    name: p.name,
    flag: p.flag,
    countryCode: p.countryCode,
    placeholder: p.placeholder,
  });

  const slotStateOf = (node: BracketNode | null, p: BracketParticipant): RadialSlotState => {
    if (!p.teamId) return "tbd";
    if (eliminated.has(p.teamId)) return "eliminated";
    if (!node) return "alive";
    if (node.state === "live") return "live";
    if (node.state === "scheduled") return "scheduled";
    return "alive";
  };

  // 4. Emit ring slots for every title match (R32→Final); M103 is skipped by ring config.
  const slots: RadialSlot[] = [];
  for (const [stage, radiusFrac] of RADIUS_BY_STAGE) {
    for (const def of graph.matches) {
      if (def.stage !== stage) continue;
      const node = nodeByNumber.get(def.matchNumber) ?? null;
      for (const side of SIDES) {
        const participant = node ? node[side] : null;
        const angleDeg = r4(angleOf(def.matchNumber, side));
        const { xFrac, yFrac } = polar(radiusFrac, angleDeg);
        slots.push({
          key: slotKey(def.matchNumber, side),
          matchNumber: def.matchNumber,
          stage,
          stageLabel: stageLabel(stage),
          xFrac,
          yFrac,
          angleDeg,
          radiusFrac,
          participant: participant
            ? toRadialParticipant(participant)
            : { teamId: null, name: "Awaiting teams", flag: null, countryCode: null, placeholder: "Awaiting teams" },
          slotState: participant ? slotStateOf(node, participant) : "tbd",
        });
      }
    }
  }

  // 5. Champion focal slot at the centre.
  slots.push({
    key: "champion",
    matchNumber: ROOT_MATCH,
    stage: "champion",
    stageLabel: "Champion",
    xFrac: 0.5,
    yFrac: 0.5,
    angleDeg: 0,
    radiusFrac: 0,
    participant: championParticipant
      ? toRadialParticipant(championParticipant)
      : { teamId: null, name: "Champion", flag: null, countryCode: null, placeholder: "Champion" },
    slotState: championParticipant ? "champion" : "tbd",
  });

  // 6. Connectors. Each inner match's slot draws a radial line from its feeder match's merge
  //    point; `advanced` once that feeder is completed (a winner progressed). The two
  //    finalists draw to the centre; the winner's line is `advanced` when the Final is done.
  const connectors: RadialConnector[] = [];
  for (const def of graph.matches) {
    if (def.stage === "thirdPlace" || def.stage === "roundOf32") continue;
    const toRadius = RADIUS_BY_STAGE.get(def.stage);
    if (toRadius === undefined) continue;
    for (const side of SIDES) {
      const slot = def[side];
      if (!isMatchWinner(slot)) continue;
      const feeder = slot.matchNumber;
      const feederDef = defByNumber.get(feeder);
      if (!feederDef) continue;
      const feederRadius = RADIUS_BY_STAGE.get(feederDef.stage);
      if (feederRadius === undefined) continue;
      const from = polar(feederRadius, midAngle(feeder));
      const to = polar(toRadius, angleOf(def.matchNumber, side));
      const feederNode = nodeByNumber.get(feeder) ?? null;
      connectors.push({
        key: `c-${feeder}-${def.matchNumber}-${side}`,
        x1Frac: from.xFrac,
        y1Frac: from.yFrac,
        x2Frac: to.xFrac,
        y2Frac: to.yFrac,
        kind: feederNode?.state === "completed" ? "advanced" : "structural",
      });
    }
  }
  // Finalists → champion centre.
  const finalRadius = RADIUS_BY_STAGE.get("final")!;
  for (const side of SIDES) {
    const from = polar(finalRadius, angleOf(ROOT_MATCH, side));
    const finalist = finalNode ? finalNode[side] : null;
    const advanced = finalNode?.state === "completed" && !!finalist?.isWinner;
    connectors.push({
      key: `c-champion-${side}`,
      x1Frac: from.xFrac,
      y1Frac: from.yFrac,
      x2Frac: 0.5,
      y2Frac: 0.5,
      kind: advanced ? "advanced" : "structural",
    });
  }

  // 7. Accessible text twin — every match M73–M104 including the third-place match.
  const statusLabelOf = (node: BracketNode): string => {
    switch (node.state) {
      case "awaiting":
        return "Awaiting teams";
      case "partial":
        return "Awaiting opponent";
      case "scheduled":
        return "Scheduled";
      case "live":
        return "Live";
      case "completed": {
        const winner = node.home.isWinner ? node.home : node.away.isWinner ? node.away : null;
        return winner ? `${winner.name} won` : "Completed";
      }
      default:
        return "Scheduled";
    }
  };
  const allNodes = [...view.rounds.flatMap((r) => r.nodes), ...(view.thirdPlace ? [view.thirdPlace] : [])].sort(
    (a, b) => a.matchNumber - b.matchNumber,
  );
  const tableRows: RadialTableRow[] = allNodes.map((node) => ({
    matchNumber: node.matchNumber,
    stageLabel: node.stageLabel,
    homeName: node.home.name,
    awayName: node.away.name,
    statusLabel: statusLabelOf(node),
  }));

  // Decided/total counts over the title tree (R32→Final; M103 excluded).
  const titleNodes = view.rounds.flatMap((r) => r.nodes);
  const decidedCount = titleNodes.filter((n) => n.state === "completed").length;
  const totalCount = titleNodes.length;

  const rings: RadialRing[] = RING_CONFIG.map((r) => ({
    stage: r.stage,
    shortLabel: r.shortLabel,
    radiusFrac: r.radiusFrac,
  }));

  return { slots, connectors, rings, tableRows, decidedCount, totalCount };
}

/**
 * Accessible one-line summary of the radial. No probabilities, no speculative-opponent or
 * certainty claims, no provider ids — just the honest count of decided matches and the
 * reading order (outer ring inward to the centre).
 */
export function radialAriaSummary(model: BracketRadialModel): string {
  if (model.totalCount === 0) return "Knockout bracket radial. The knockout stage has not started yet.";
  return (
    `Knockout bracket shown as rings, from the round of 32 on the outer ring to the final at the centre. ` +
    `${model.decidedCount} of ${model.totalCount} knockout matches decided. Winners advance inward toward the trophy.`
  );
}
