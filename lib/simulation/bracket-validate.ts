/**
 * Bracket validation (Phase 1.2)
 * ------------------------------
 * Pure validators for the official knockout graph and the Annexe C third-place
 * allocation. The simulator only switches to the official path when
 * `validateBracket` returns `valid: true` AND the bracket is marked verified
 * (see lib/simulation/bracket.ts -> isBracketActive). Nothing is ever partially
 * "verified": the allocation must cover all 495 combinations.
 */
import type {
  BracketDefinition,
  BracketValidationResult,
  GroupId,
  KnockoutGraph,
  ThirdPlaceAllocationMap,
  ThirdPlaceSlotId,
} from "@/lib/types";

/** The 12 group letters A..L. */
export const GROUP_LETTERS: GroupId[] = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L",
];

/** The eight third-place R32 slots. */
export const THIRD_SLOT_IDS: ThirdPlaceSlotId[] = [
  "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8",
];

/** Number of best third-placed teams that qualify (and the combination size). */
export const THIRDS_SELECTED = 8;

/** C(12,8) = 495 valid third-placed-group combinations. */
export const EXPECTED_COMBINATIONS = 495;

/** Normalize a set of groups to a canonical key, e.g. ["C","A",...] -> "ABCDEFGH". */
export function normalizeCombinationKey(groups: GroupId[]): string {
  return [...groups].map((g) => g.toUpperCase()).sort().join("");
}

/** Enumerate all C(12,8)=495 combinations as normalized (sorted) keys. */
export function enumerateThirdPlaceCombinations(): string[] {
  const out: string[] = [];
  const n = GROUP_LETTERS.length;
  const rec = (start: number, acc: GroupId[]): void => {
    if (acc.length === THIRDS_SELECTED) {
      out.push(acc.join(""));
      return;
    }
    for (let i = start; i < n; i++) {
      acc.push(GROUP_LETTERS[i]!);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}

/**
 * Validate the knockout graph: 16 R32 matches; every group winner + runner-up
 * used exactly once; exactly eight third-place slots (T1..T8 once each); match
 * references point to earlier existing matches; final/3rd-place fed by the SFs.
 */
export function validateGraph(graph: KnockoutGraph): string[] {
  const errors: string[] = [];
  const matches = graph.matches;
  const byNumber = new Map(matches.map((m) => [m.matchNumber, m]));

  const r32 = matches.filter((m) => m.stage === "roundOf32");
  if (r32.length !== 16) {
    errors.push(`expected 16 R32 matches, got ${r32.length}`);
  }

  const winnerUse = new Map<GroupId, number>();
  const runnerUpUse = new Map<GroupId, number>();
  const thirdSlots = new Set<string>();

  for (const m of r32) {
    for (const slot of [m.home, m.away]) {
      if (slot.kind === "groupPosition") {
        const map = slot.position === 1 ? winnerUse : runnerUpUse;
        map.set(slot.group, (map.get(slot.group) ?? 0) + 1);
      } else if (slot.kind === "thirdPlace") {
        if (thirdSlots.has(slot.slot)) {
          errors.push(`third-place slot ${slot.slot} used more than once`);
        }
        thirdSlots.add(slot.slot);
      } else {
        errors.push(`R32 match ${m.matchNumber}: slot must be groupPosition or thirdPlace, got ${slot.kind}`);
      }
    }
  }

  for (const g of GROUP_LETTERS) {
    if ((winnerUse.get(g) ?? 0) !== 1) {
      errors.push(`group ${g} winner used ${winnerUse.get(g) ?? 0} times (expected 1)`);
    }
    if ((runnerUpUse.get(g) ?? 0) !== 1) {
      errors.push(`group ${g} runner-up used ${runnerUpUse.get(g) ?? 0} times (expected 1)`);
    }
  }
  if (thirdSlots.size !== THIRDS_SELECTED) {
    errors.push(`expected ${THIRDS_SELECTED} third-place slots, got ${thirdSlots.size}`);
  }
  for (const t of THIRD_SLOT_IDS) {
    if (!thirdSlots.has(t)) errors.push(`missing third-place slot ${t}`);
  }

  // Match references must point to earlier, existing matches (no cycles/forward refs).
  for (const m of matches) {
    for (const slot of [m.home, m.away]) {
      if (slot.kind === "matchWinner" || slot.kind === "matchLoser") {
        if (!byNumber.has(slot.matchNumber)) {
          errors.push(`match ${m.matchNumber} references missing match ${slot.matchNumber}`);
        } else if (slot.matchNumber >= m.matchNumber) {
          errors.push(`match ${m.matchNumber} references non-earlier match ${slot.matchNumber}`);
        }
      }
    }
  }

  // Final fed by SF winners; third-place fed by SF losers.
  const semiNumbers = new Set(
    matches.filter((m) => m.stage === "semiFinal").map((m) => m.matchNumber),
  );
  const finals = matches.filter((m) => m.stage === "final");
  if (finals.length !== 1) errors.push(`expected exactly 1 final, got ${finals.length}`);
  for (const f of finals) {
    for (const slot of [f.home, f.away]) {
      if (slot.kind !== "matchWinner" || !semiNumbers.has(slot.matchNumber)) {
        errors.push(`final ${f.matchNumber} slot must be the winner of a semi-final`);
      }
    }
  }
  const thirdPlace = matches.filter((m) => m.stage === "thirdPlace");
  if (thirdPlace.length > 1) errors.push(`expected at most 1 third-place match, got ${thirdPlace.length}`);
  for (const tp of thirdPlace) {
    for (const slot of [tp.home, tp.away]) {
      if (slot.kind !== "matchLoser" || !semiNumbers.has(slot.matchNumber)) {
        errors.push(`third-place ${tp.matchNumber} slot must be the loser of a semi-final`);
      }
    }
  }

  return errors;
}

/**
 * Validate the Annexe C allocation: keys normalized + unique 8-group subsets,
 * valid letters, each value assigns all 8 T-slots, selected groups assigned
 * exactly once, unselected never assigned; reports coverage vs 495.
 */
export function validateAllocation(map: ThirdPlaceAllocationMap): {
  errors: string[];
  coverage: BracketValidationResult["coverage"];
} {
  const errors: string[] = [];
  const validLetters = new Set<string>(GROUP_LETTERS);
  const keys = Object.keys(map);
  const expected = enumerateThirdPlaceCombinations();
  const expectedSet = new Set(expected);

  for (const key of keys) {
    const letters = key.split("");
    if (letters.length !== THIRDS_SELECTED) {
      errors.push(`key ${key}: expected ${THIRDS_SELECTED} groups`);
    }
    if (normalizeCombinationKey(letters as GroupId[]) !== key) {
      errors.push(`key ${key}: not normalized (sorted, unique, uppercase)`);
    }
    if (new Set(letters).size !== letters.length) {
      errors.push(`key ${key}: duplicate groups`);
    }
    for (const l of letters) {
      if (!validLetters.has(l)) errors.push(`key ${key}: invalid group letter ${l}`);
    }
    if (!expectedSet.has(key)) {
      errors.push(`key ${key}: not a valid 8-of-12 combination`);
    }

    const assign = map[key]!;
    const assigned: GroupId[] = [];
    for (const t of THIRD_SLOT_IDS) {
      const g = assign[t];
      if (g === undefined) {
        errors.push(`key ${key}: missing slot ${t}`);
      } else {
        assigned.push(g);
        if (!validLetters.has(g)) errors.push(`key ${key}: invalid assigned group ${g} in ${t}`);
      }
    }
    const keyGroups = new Set<string>(letters);
    const assignedSet = new Set<string>(assigned);
    if (assignedSet.size !== assigned.length) {
      errors.push(`key ${key}: a group is assigned to more than one slot`);
    }
    for (const g of assigned) {
      if (!keyGroups.has(g)) errors.push(`key ${key}: unselected group ${g} assigned`);
    }
    for (const g of letters) {
      if (!assignedSet.has(g)) errors.push(`key ${key}: selected group ${g} not assigned`);
    }
  }

  const complete =
    keys.length === EXPECTED_COMBINATIONS &&
    errors.length === 0 &&
    expected.every((k) => k in map);

  return {
    errors,
    coverage: { combinations: keys.length, expected: EXPECTED_COMBINATIONS, complete },
  };
}

/** Compose graph + allocation validation into a single result. */
export function validateBracket(def: BracketDefinition): BracketValidationResult {
  const graphErrors = validateGraph(def.graph);
  const { errors: allocErrors, coverage } = validateAllocation(def.thirdPlaceAllocation);
  const errors = [...graphErrors, ...allocErrors];
  return {
    valid: errors.length === 0 && coverage.complete,
    errors,
    coverage,
  };
}
