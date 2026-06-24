import { describe, expect, it } from "vitest";
import { GROUP_IDS } from "@/lib/data";
import { validateLiveSnapshot } from "@/lib/live-state/validate";
import { buildOfficialReference, ingestLiveSnapshot } from "@/lib/live-state/ingest";
import { deriveGroupStandings } from "@/lib/live-state/derive";
import {
  currentResultsSnapshot,
  currentResultsProvenance,
} from "./fixtures/live-state/current-results-snapshot";
import { currentStandingsExpected } from "./fixtures/live-state/current-standings-expected";

/**
 * Phase 1.25C: the FIRST REAL WC 2026 current-results snapshot validates through the
 * existing live-state layer, and standings DERIVED from those results match the
 * supplied (comparison-only) standings on core fields. The uploaded standings are
 * never trusted as source of truth; no validator/official-data changes are made.
 */

const ASOF = "2026-06-24T14:09:06Z";
const RETRIEVED = "2026-06-24T14:33:36Z";
const FRESH = { asOf: ASOF, staleAfterSeconds: 24 * 60 * 60 };

const reference = buildOfficialReference();
const validation = validateLiveSnapshot(currentResultsSnapshot, reference, FRESH);

describe("current snapshot validates against the official reference", () => {
  it("validates cleanly: ok, zero errors/warnings, no invalid rows", () => {
    expect(validation.ok).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(validation.warnings).toEqual([]);
    expect(validation.matches.some((m) => m.freshnessStatus === "invalid")).toBe(false);
  });

  it("ingests exactly 48 matches", () => {
    expect(validation.matches).toHaveLength(48);
    expect(currentResultsSnapshot.matches).toHaveLength(48);
  });

  it("match numbers 1-48 are present and unique", () => {
    const nums = currentResultsSnapshot.matches.map((m) => Number(m.matchId.replace(/^M/, "")));
    expect(new Set(nums).size).toBe(48);
    expect([...nums].sort((a, b) => a - b)).toEqual(Array.from({ length: 48 }, (_, i) => i + 1));
  });

  it("every row is status 'complete' and stage 'group'", () => {
    for (const m of currentResultsSnapshot.matches) {
      expect(m.status).toBe("complete");
      expect(m.stage).toBe("group");
    }
  });

  it("all groups A-L are represented with exactly 4 completed matches each", () => {
    const byGroup = new Map<string, number>();
    for (const m of currentResultsSnapshot.matches) byGroup.set(m.group!, (byGroup.get(m.group!) ?? 0) + 1);
    for (const g of GROUP_IDS) {
      expect({ group: g, count: byGroup.get(g) ?? 0 }).toEqual({ group: g, count: 4 });
    }
    expect(byGroup.size).toBe(12);
  });

  it("group-stage rows carry no winner and no penalties", () => {
    for (const m of currentResultsSnapshot.matches) {
      expect(m.winner).toBeUndefined();
      expect(m.penalties).toBeUndefined();
    }
  });
});

describe("current snapshot freshness, timestamps and provenance", () => {
  const state = ingestLiveSnapshot(currentResultsSnapshot, reference, {
    generatedAt: "2026-06-24T14:40:00Z",
    staleAfterSeconds: 24 * 60 * 60,
  });

  it("preserves asOf and source-update timestamps; data is fresh", () => {
    expect(state.asOf).toBe(ASOF);
    expect(state.freshness.sourceLastUpdatedAt).toBe(RETRIEVED);
    expect(state.freshness.overall).toBe("fresh");
  });

  it("applies no silent or forced fallback", () => {
    expect(state.freshness.fallbackReason).toBeUndefined();
    expect(state.freshness.sections.matches).not.toBe("fallback");
    expect(state.freshness.sections.standings).not.toBe("fallback");
    expect(state.freshness.sections.bracket).not.toBe("fallback");
  });

  it("preserves provider match ids as provenance only (not used for matching)", () => {
    expect(currentResultsProvenance.asOf).toBe(ASOF);
    expect(currentResultsProvenance.retrievedAt).toBe(RETRIEVED);
    expect(currentResultsProvenance.matches).toHaveLength(48);
    for (const p of currentResultsProvenance.matches) {
      expect(p.providerMatchId.length).toBeGreaterThan(0);
    }
    // The official fixture key is the matchNumber ("M{n}"), NOT the provider id.
    const providerIds = new Set(currentResultsProvenance.matches.map((p) => p.providerMatchId));
    const matchIds = new Set(currentResultsSnapshot.matches.map((m) => m.matchId));
    expect([...matchIds].every((id) => /^M\d+$/.test(id))).toBe(true);
    expect([...providerIds].some((id) => matchIds.has(id))).toBe(false);
  });
});

describe("standings DERIVED from results (upload is comparison-only)", () => {
  const standings = deriveGroupStandings(reference, validation.matches);
  const derivedByTeam = new Map(standings.map((s) => [s.teamId, s]));
  const expectedByTeam = new Map(currentStandingsExpected.map((e) => [e.teamId, e]));

  it("produces 48 derived rows; every team has exactly 2 played", () => {
    expect(standings).toHaveLength(48);
    expect(currentStandingsExpected).toHaveLength(48);
    expect(standings.every((s) => s.played === 2)).toBe(true);
  });

  it("derived teams are a bijection with the expected (comparison) teams", () => {
    expect(new Set(standings.map((s) => s.teamId)).size).toBe(48);
    for (const s of standings) expect(expectedByTeam.has(s.teamId)).toBe(true);
    for (const e of currentStandingsExpected) expect(derivedByTeam.has(e.teamId)).toBe(true);
  });

  it("derived standings match the supplied standings on ALL core fields", () => {
    for (const s of standings) {
      const e = expectedByTeam.get(s.teamId)!;
      expect({
        teamId: s.teamId,
        group: s.group,
        played: s.played,
        won: s.won,
        drawn: s.drawn,
        lost: s.lost,
        goalsFor: s.goalsFor,
        goalsAgainst: s.goalsAgainst,
        goalDifference: s.goalDifference,
        points: s.points,
      }).toEqual({
        teamId: e.teamId,
        group: e.group,
        played: e.matchesPlayed,
        won: e.wins,
        drawn: e.draws,
        lost: e.losses,
        goalsFor: e.goalsFor,
        goalsAgainst: e.goalsAgainst,
        goalDifference: e.goalDifference,
        points: e.points,
      });
    }
  });

  it("position parity holds, flagging (not forcing) any deep-tie Article-13 difference", () => {
    const forcedDivergences: string[] = [];
    const tieDivergences: string[] = [];

    for (const g of GROUP_IDS) {
      const expectedSorted = currentStandingsExpected
        .filter((e) => e.group === g)
        .sort((a, b) => a.position - b.position);
      const derivedSorted = standings.filter((s) => s.group === g).sort((a, b) => a.rank - b.rank);

      for (let i = 0; i < expectedSorted.length; i++) {
        const exp = expectedSorted[i]!.teamId;
        const der = derivedSorted[i]!.teamId;
        if (exp === der) continue;
        const a = derivedByTeam.get(exp)!;
        const b = derivedByTeam.get(der)!;
        const legitimateTie =
          a.points === b.points && a.goalDifference === b.goalDifference && a.goalsFor === b.goalsFor;
        const note = `Group ${g} pos ${i + 1}: expected ${exp}, derived ${der}`;
        (legitimateTie ? tieDivergences : forcedDivergences).push(note);
      }
    }

    // Article-13 (app) vs the simplified upload may differ ONLY on deep ties; never
    // on core ordering. We flag deep-tie differences rather than forcing CSV order.
    if (tieDivergences.length > 0) {
      // eslint-disable-next-line no-console
      console.warn("Live-state standings deep-tie ordering differences (flagged, not forced):", tieDivergences);
    }
    expect(forcedDivergences).toEqual([]);
  });
});
