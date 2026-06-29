import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildOfficialReference, ingestLiveSnapshot } from "@/lib/live-state/ingest";
import {
  deriveGroupStandings,
  finaliseThirdPlace,
  resolveThirdPlaceSlots,
} from "@/lib/live-state/derive";
import { toPublicSafeLiveState } from "@/lib/live-state/public-safe";
import { officialBracket } from "@/data/official/bracket";
import { normalizeCombinationKey } from "@/lib/simulation/bracket-validate";
import { findForbiddenSubstrings } from "@/lib/model/forecast-snapshots";
import type { GroupResult } from "@/lib/simulation/bracket";
import type { GroupId } from "@/lib/types";
import {
  loadReferenceFixture,
  referenceFixtureToRawSnapshot,
  regeneratePublicSafeSample,
  REFERENCE_FIXTURE_PATH,
  SAMPLE_OUTPUT_PATH,
} from "../scripts/regen-public-safe-sample";

/**
 * Phase 1.29 (PR-3F) - live tournament-state correctness. With the whole group stage
 * complete, the internal derivation must finalise third-place qualification (8 qualified
 * / 4 eliminated), resolve the Annexe C third-place slots, and populate every Round-of-32
 * match - then propagate completed knockout results (M73 Canada). Provider supplies
 * sanitized scores only; standings / third-place / Annexe C / bracket are internal.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const reference = loadReferenceFixture();
const ref = buildOfficialReference();
const ingest = (matches = referenceFixtureToRawSnapshot(reference).matches) =>
  ingestLiveSnapshot(
    { ...referenceFixtureToRawSnapshot(reference), matches },
    ref,
    { generatedAt: reference.generatedAt },
  );
const fullState = ingest();

const bracketMatch = (n: number) => fullState.bracket.matches.find((b) => b.matchNumber === n)!;

describe("live-state derivation: full group stage complete", () => {
  it("consumes all 72 group results (plus the completed R32 M73)", () => {
    const completed = fullState.matches.filter((m) => m.status === "complete");
    expect(completed.filter((m) => m.stage === "group")).toHaveLength(72);
    expect(completed.filter((m) => m.stage === "roundOf32")).toHaveLength(1);
    expect(fullState.warnings).toEqual([]);
  });

  it("derives final standings (all 48 teams played 3)", () => {
    expect(fullState.groupStandings).toHaveLength(48);
    expect(fullState.groupStandings.every((s) => s.played === 3)).toBe(true);
  });

  it("finalises third-place qualification: 8 qualified, 4 eliminated, 0 undecided", () => {
    const thirds = fullState.groupStandings.filter((s) => s.rank === 3);
    expect(thirds).toHaveLength(12);
    expect(thirds.filter((s) => s.qualificationState === "qualified")).toHaveLength(8);
    expect(thirds.filter((s) => s.qualificationState === "eliminated")).toHaveLength(4);
    expect(thirds.filter((s) => s.qualificationState === "undecided")).toHaveLength(0);
  });

  it("the finalised top-eight third-place combination has an Annexe C allocation", () => {
    const qualifyingGroups = fullState.groupStandings
      .filter((s) => s.rank === 3 && s.qualificationState === "qualified")
      .map((s) => s.group);
    expect(qualifyingGroups).toHaveLength(8);
    const key = normalizeCombinationKey(qualifyingGroups);
    expect(officialBracket.thirdPlaceAllocation[key]).toBeDefined();
  });

  it("populates BOTH participants of all 16 Round-of-32 matches (no third-place bubble)", () => {
    const r32 = fullState.bracket.matches.filter((b) => b.stage === "roundOf32");
    expect(r32).toHaveLength(16);
    for (const m of r32) {
      expect(m.homeTeamId, `M${m.matchNumber} home`).not.toBeNull();
      expect(m.awayTeamId, `M${m.matchNumber} away`).not.toBeNull();
    }
    // The eight previously-stuck third-place-fed R32 matches are now fully populated.
    for (const n of [74, 77, 79, 80, 81, 82, 85, 87]) {
      const m = bracketMatch(n);
      expect(m.homeTeamId, `M${n} home`).not.toBeNull();
      expect(m.awayTeamId, `M${n} away`).not.toBeNull();
    }
    expect(fullState.bracket.unresolvedTies).toEqual([]);
  });

  it("recognises M73 (Canada over South Africa) and propagates Canada into the R16 (M90 home)", () => {
    const m73 = bracketMatch(73);
    expect(new Set([m73.homeTeamId, m73.awayTeamId])).toEqual(new Set(["south-africa", "canada"]));
    expect(m73.winner).toBe("canada");
    expect(m73.resolved).toBe(true);
    // South Africa eliminated from the knockout-derived state (it is M73's loser).
    expect(m73.homeTeamId === "south-africa" || m73.awayTeamId === "south-africa").toBe(true);
    expect(bracketMatch(90).homeTeamId).toBe("canada"); // M90 home = winner of M73
  });
});

describe("live-state derivation: partial group stage stays cautious", () => {
  // Drop every Group L group-stage match -> the group stage is no longer complete.
  const lGroupMatchIds = new Set(
    ref.groupMatches.filter((g) => g.group === "L").map((g) => g.matchId),
  );
  const partial = ingest(
    referenceFixtureToRawSnapshot(reference).matches.filter((m) => !lGroupMatchIds.has(m.matchId)),
  );

  it("leaves every third-placed team undecided when any group is incomplete", () => {
    const thirds = partial.groupStandings.filter((s) => s.rank === 3);
    expect(thirds.length).toBeGreaterThan(0);
    expect(thirds.every((s) => s.qualificationState === "undecided")).toBe(true);
  });

  it("leaves third-place-fed R32 slots null (M74 away unresolved)", () => {
    const m74 = partial.bracket.matches.find((b) => b.matchNumber === 74)!;
    expect(m74.awayTeamId).toBeNull(); // T1 third-place slot deferred until groups complete
  });
});

describe("resolveThirdPlaceSlots fail-safe", () => {
  it("returns an empty map (no force-assign) when the Annexe C allocation is missing", () => {
    const finalised = finaliseThirdPlace(ref, deriveGroupStandings(ref, fullState.matches));
    const slots = resolveThirdPlaceSlots(ref, finalised, new Map<GroupId, GroupResult>(), {});
    expect(slots.size).toBe(0);
  });
});

describe("committed fallback/reference fixture (refreshed, provider-public-delayed)", () => {
  it("is byte-reproducible from the committed reference fixture via the fixed offline pipeline", () => {
    const regenerated = regeneratePublicSafeSample(reference);
    expect(JSON.stringify(regenerated, null, 2) + "\n").toBe(read(SAMPLE_OUTPUT_PATH));
  });

  it("keeps honest provider-public-delayed provenance, is public-safe, and carries no serving key", () => {
    const sample = JSON.parse(read(SAMPLE_OUTPUT_PATH)) as {
      isProviderDerived: boolean;
      publicSourcePolicy: string;
      serving?: unknown;
    };
    expect(sample.isProviderDerived).toBe(true);
    expect(sample.publicSourcePolicy).toBe("provider-public-delayed");
    expect(sample.serving).toBeUndefined(); // serving metadata is added by the route, never committed
    expect(findForbiddenSubstrings(read(SAMPLE_OUTPUT_PATH))).toEqual([]);
    expect(findForbiddenSubstrings(read(REFERENCE_FIXTURE_PATH))).toEqual([]);
  });

  it("demonstrates the resolved third-place + R32 state (8 qualified, all 16 R32 populated)", () => {
    const sample = JSON.parse(read(SAMPLE_OUTPUT_PATH)) as {
      standings: { position: number; qualificationState: string }[];
      bracket: { round: string; homeTeamId: string | null; awayTeamId: string | null }[];
    };
    expect(sample.standings.filter((s) => s.position === 3 && s.qualificationState === "qualified")).toHaveLength(8);
    const r32 = sample.bracket.filter((b) => b.round === "roundOf32");
    expect(r32).toHaveLength(16);
    expect(r32.every((b) => b.homeTeamId !== null && b.awayTeamId !== null)).toBe(true);
  });

  it("public-safe projection of the ingested state exposes the resolved state with no leakage", () => {
    const pub = toPublicSafeLiveState(fullState, {
      attribution: reference.attribution,
      isProviderDerived: true,
      publicSourcePolicy: "provider-public-delayed",
    });
    expect(pub.standings.filter((s) => s.position === 3 && s.qualificationState === "qualified")).toHaveLength(8);
    expect(pub.bracket.filter((b) => b.round === "roundOf32").every((b) => b.resolution === "resolved")).toBe(true);
    expect(findForbiddenSubstrings(JSON.stringify(pub))).toEqual([]);
  });
});
