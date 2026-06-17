/**
 * SYNTHETIC bracket fixture for engine tests - NOT the official 2026 bracket.
 *
 * It is a structurally-valid knockout graph (passes `validateGraph`) plus a
 * programmatically generated, structurally-valid full 495-row allocation (passes
 * `validateAllocation`). This lets us exercise the realiser, propagation,
 * determinism, and tournament invariants end-to-end WITHOUT any real
 * (unverified) FIFA data.
 */
import type {
  BracketDefinition,
  KnockoutGraph,
  KnockoutMatchDefinition,
  QualifierSlot,
  ThirdPlaceAllocationMap,
} from "@/lib/types";
import {
  GROUP_LETTERS,
  THIRD_SLOT_IDS,
  enumerateThirdPlaceCombinations,
} from "@/lib/simulation/bracket-validate";

const W = (i: number): QualifierSlot => ({
  kind: "groupPosition",
  group: GROUP_LETTERS[i]!,
  position: 1,
});
const R = (i: number): QualifierSlot => ({
  kind: "groupPosition",
  group: GROUP_LETTERS[i]!,
  position: 2,
});
const T = (n: number): QualifierSlot => ({ kind: "thirdPlace", slot: THIRD_SLOT_IDS[n]! });
const MW = (matchNumber: number): QualifierSlot => ({ kind: "matchWinner", matchNumber });
const ML = (matchNumber: number): QualifierSlot => ({ kind: "matchLoser", matchNumber });

/** Build a valid synthetic graph: 16 R32 + R16 + QF + SF + 3rd + final. */
export function buildSampleGraph(): KnockoutGraph {
  const matches: KnockoutMatchDefinition[] = [];

  // R32 (M73-M88): 8 winner-vs-third, 4 winner-vs-runnerUp, 4 runnerUp-vs-runnerUp.
  // Uses every winner (A-L) once, every runner-up (A-L) once, T1-T8 once.
  let mn = 73;
  for (let i = 0; i < 8; i++) {
    matches.push({ matchNumber: mn++, stage: "roundOf32", home: W(i), away: T(i) });
  }
  for (let i = 0; i < 4; i++) {
    matches.push({ matchNumber: mn++, stage: "roundOf32", home: W(8 + i), away: R(i) });
  }
  for (let i = 0; i < 4; i++) {
    matches.push({ matchNumber: mn++, stage: "roundOf32", home: R(4 + 2 * i), away: R(5 + 2 * i) });
  }

  // R16 (M89-M96): pair adjacent R32 winners.
  for (let i = 0; i < 8; i++) {
    matches.push({ matchNumber: 89 + i, stage: "roundOf16", home: MW(73 + 2 * i), away: MW(74 + 2 * i) });
  }
  // QF (M97-M100): pair adjacent R16 winners.
  for (let i = 0; i < 4; i++) {
    matches.push({ matchNumber: 97 + i, stage: "quarterFinal", home: MW(89 + 2 * i), away: MW(90 + 2 * i) });
  }
  // SF (M101-M102).
  matches.push({ matchNumber: 101, stage: "semiFinal", home: MW(97), away: MW(98) });
  matches.push({ matchNumber: 102, stage: "semiFinal", home: MW(99), away: MW(100) });
  // Third place (M103): SF losers. Final (M104): SF winners.
  matches.push({ matchNumber: 103, stage: "thirdPlace", home: ML(101), away: ML(102) });
  matches.push({ matchNumber: 104, stage: "final", home: MW(101), away: MW(102) });

  return { matches };
}

/** Generate a valid full 495-row allocation: combo "ABCDEFGH" -> T1=A..T8=H. */
export function generateFullAllocation(): ThirdPlaceAllocationMap {
  const map: ThirdPlaceAllocationMap = {};
  for (const key of enumerateThirdPlaceCombinations()) {
    const letters = key.split("");
    const slots = {} as ThirdPlaceAllocationMap[string];
    THIRD_SLOT_IDS.forEach((t, i) => {
      slots[t] = letters[i] as ThirdPlaceAllocationMap[string][typeof t];
    });
    map[key] = slots;
  }
  return map;
}

/** A fully-valid, "verified" synthetic bracket for tests. */
export const sampleBracket: BracketDefinition = {
  sourceStatus: "verified",
  graph: buildSampleGraph(),
  thirdPlaceAllocation: generateFullAllocation(),
  sources: [],
  notes: "SYNTHETIC test fixture - not the official 2026 bracket.",
};
