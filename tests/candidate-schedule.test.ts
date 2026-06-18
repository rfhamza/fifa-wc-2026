import { describe, expect, it } from "vitest";
import {
  candidateSchedule,
  candidateGroupFixtures,
  candidateDrawOrder,
  candidateGroups,
  telegraphFixtures,
  excelCrossCheckFixtures,
  MANUAL_CONFLICT_RESOLUTIONS,
  CANDIDATE_SCHEDULE_PREVIEW,
} from "@/data/candidate";
import { resolveTeamId, resolveVenueId } from "@/data/candidate/name-map";
import {
  validateCandidateGroups,
  validateCandidateDrawOrder,
  validateCandidateFixtures,
  crossCheckArticle124,
  reconcileSources,
  buildResolvedKeySet,
  validateCandidateSchedule,
} from "@/lib/data/validate-candidate";
import { officialTeams } from "@/data/official/teams";
import type { CandidateSourceFixture } from "@/lib/types/candidate";

const HOST_SLOTS: Record<string, string> = { mexico: "A1", canada: "B1", usa: "D1" };

describe("candidate extraction shape", () => {
  it("every fixture carries required fields + provenance", () => {
    for (const f of candidateGroupFixtures) {
      expect(typeof f.matchNumber).toBe("number");
      expect(f.group).toMatch(/^[A-L]$/);
      expect(f.matchday).toBeGreaterThanOrEqual(1);
      expect(f.matchday).toBeLessThanOrEqual(3);
      expect(f.homeTeamId).toBeTruthy();
      expect(f.awayTeamId).toBeTruthy();
      expect(Number.isNaN(Date.parse(f.kickoffUtc))).toBe(false);
      // Excel-derived fixtures are New York time; manually resolved fixtures
      // take the Telegraph (UK) value.
      expect(["America/New_York", "Europe/London"]).toContain(f.kickoffSourceTz);
      expect(f.provenance.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("the two manually resolved fixtures use the Telegraph date + 'resolved' status", () => {
    const resolved = candidateGroupFixtures.filter((f) => f.agreement === "resolved");
    expect(resolved.map((f) => f.matchNumber).sort((a, b) => a - b)).toEqual([20, 36]);
    for (const f of resolved) {
      const r = MANUAL_CONFLICT_RESOLUTIONS.find((x) => x.matchNumber === f.matchNumber)!;
      expect(r).toBeTruthy();
      expect(r.selectedSource).toBe("telegraph");
      // Candidate value now equals the Telegraph value, not the Excel value.
      expect(f.kickoffUtc).toBe(r.telegraphValue);
      expect(f.kickoffUtc).not.toBe(r.excelValue);
      expect(f.kickoffSourceTz).toBe("Europe/London");
    }
  });

  it("every draw-order slot carries required fields + provenance", () => {
    for (const order of candidateDrawOrder) {
      expect(order.slots).toHaveLength(4);
      for (const slot of order.slots) {
        expect(slot.candidateDrawSlot).toBe(`${order.group}${slot.position}`);
        expect(slot.teamId).toBeTruthy();
      }
      expect(order.provenance.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("name-map resolves every team id used and every venue raw string", () => {
    const ids = new Set(officialTeams.map((t) => t.id));
    for (const f of candidateGroupFixtures) {
      expect(ids.has(f.homeTeamId)).toBe(true);
      expect(ids.has(f.awayTeamId)).toBe(true);
      expect(f.venueRaw).toBeTruthy();
      expect(resolveVenueId(f.venueRaw!)).toBe(f.venueId);
    }
    // The canonical source spellings all resolve.
    for (const name of ["Korea Republic", "Cote D'Voire", "Cabo Verde", "Türkiye", "DR Congo", "Bosnia and Herzegovina"]) {
      expect(resolveTeamId(name)).toBeTruthy();
    }
  });
});

describe("candidate coverage", () => {
  it("has 48 teams across 12 groups of 4, each team once", () => {
    expect(candidateGroups).toHaveLength(12);
    const seen = new Set<string>();
    for (const g of candidateGroups) {
      expect(g.teamIds).toHaveLength(4);
      for (const id of g.teamIds) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
    expect(seen.size).toBe(48);
  });

  it("has 72 fixtures, 6 per group, every team in exactly 3 games", () => {
    expect(candidateGroupFixtures).toHaveLength(72);
    const perGroup = new Map<string, number>();
    const perTeam = new Map<string, number>();
    for (const f of candidateGroupFixtures) {
      perGroup.set(f.group, (perGroup.get(f.group) ?? 0) + 1);
      perTeam.set(f.homeTeamId, (perTeam.get(f.homeTeamId) ?? 0) + 1);
      perTeam.set(f.awayTeamId, (perTeam.get(f.awayTeamId) ?? 0) + 1);
    }
    for (const [, count] of perGroup) expect(count).toBe(6);
    expect(perTeam.size).toBe(48);
    for (const [, count] of perTeam) expect(count).toBe(3);
  });

  it("passes structural validation (groups, draw order, fixtures, Article 12.4)", () => {
    expect(validateCandidateGroups(candidateGroups)).toEqual([]);
    expect(validateCandidateDrawOrder(candidateDrawOrder)).toEqual([]);
    expect(validateCandidateFixtures(candidateGroupFixtures).errors).toEqual([]);
    expect(crossCheckArticle124(candidateDrawOrder, candidateGroupFixtures)).toEqual([]);
  });
});

describe("candidate draw order", () => {
  it("preserves the three regulation host slots", () => {
    const slotOf = new Map<string, string>();
    for (const order of candidateDrawOrder) {
      for (const slot of order.slots) slotOf.set(slot.teamId, slot.candidateDrawSlot);
    }
    for (const [team, slot] of Object.entries(HOST_SLOTS)) {
      expect(slotOf.get(team)).toBe(slot);
    }
  });

  it("matches official (candidate) group membership", () => {
    expect(validateCandidateGroups(candidateGroups, officialTeams)).toEqual([]);
  });
});

describe("cross-source reconciliation", () => {
  // The genuine Excel source (the manually resolved fixtures keep their original
  // Excel value so the conflict is still detectable in the reconciliation).
  const excel: CandidateSourceFixture[] = excelCrossCheckFixtures;
  const resolvedKeys = buildResolvedKeySet(MANUAL_CONFLICT_RESOLUTIONS);

  it("the two known date conflicts are now manually resolved (zero unresolved)", () => {
    const result = reconcileSources(excel, telegraphFixtures, resolvedKeys);
    expect(result.agreement.matches).toBe(70);
    expect(result.agreement.resolved).toBe(2);
    expect(result.agreement.conflict).toBe(0);
    expect(result.agreement["missing-in-one-source"]).toBe(0);
    // Zero UNRESOLVED high-impact conflicts; two manually resolved ones.
    expect(result.manualReview).toHaveLength(0);
    expect(result.manuallyResolved).toHaveLength(2);
    expect(result.manuallyResolved.join(" ")).toContain("austria");
    expect(result.manuallyResolved.join(" ")).toContain("japan");
    expect(result.manuallyResolved.join(" ")).toContain("Telegraph value selected");
  });

  it("without a resolution record the same two conflicts surface as unresolved", () => {
    const result = reconcileSources(excel, telegraphFixtures);
    expect(result.agreement.conflict).toBe(2);
    expect(result.agreement.resolved).toBe(0);
    expect(result.manualReview).toHaveLength(2);
    expect(result.manualReview.join(" ")).toContain("austria");
    expect(result.manualReview.join(" ")).toContain("japan");
  });

  it("flags a synthetic home/away orientation conflict", () => {
    const flipped = telegraphFixtures.map((t, i) =>
      i === 0 ? { ...t, homeTeamId: t.awayTeamId, awayTeamId: t.homeTeamId } : t,
    );
    const result = reconcileSources(excel, flipped, resolvedKeys);
    expect(result.agreement.conflict).toBeGreaterThanOrEqual(1);
    expect(result.manualReview.join(" ")).toContain("orientation");
  });

  it("flags pairs missing in one source", () => {
    const result = reconcileSources(excel, telegraphFixtures.slice(0, 71), resolvedKeys);
    expect(result.agreement["missing-in-one-source"]).toBeGreaterThanOrEqual(1);
  });

  it("flags the MetLife venue-string variant as a warning (not an error)", () => {
    const { warnings, errors } = validateCandidateFixtures(candidateGroupFixtures);
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.toLowerCase().includes("ny/nj"))).toBe(true);
  });
});

describe("validateCandidateSchedule orchestrator", () => {
  it("is valid; 70 matches, 2 manually resolved, 0 unresolved conflicts", () => {
    const result = validateCandidateSchedule(candidateSchedule, telegraphFixtures);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.agreement.matches).toBe(70);
    expect(result.agreement.resolved).toBe(2);
    expect(result.agreement.conflict).toBe(0);
    expect(result.manualReview).toHaveLength(0);
    expect(result.manuallyResolved).toHaveLength(2);
  });
});

describe("candidate layer isolation (safety regression)", () => {
  it("preview flag is off by default", () => {
    expect(CANDIDATE_SCHEDULE_PREVIEW).toBe(false);
  });

  it("the resolver serves the official schedule (candidate layer is not the source)", async () => {
    const { resolveDataset } = await import("@/lib/data/source");
    const ds = resolveDataset();
    // The official FIFA schedule is now active (Phase 1.6 Step B); the candidate
    // layer remains a cross-check only and is never imported by the resolver.
    expect(ds.fixtureSource).toBe("official");
  });

  it("all 48 teams carry verified draw slots, hosts preserved", async () => {
    for (const t of officialTeams) {
      expect(t.drawPosition).toBeDefined();
      expect(t.drawSlotStatus).toBe("verified");
    }
    for (const [id, slot] of Object.entries(HOST_SLOTS)) {
      expect(officialTeams.find((t) => t.id === id)!.drawSlot).toBe(slot);
    }
  });

  it("importing the candidate layer does not change the resolved dataset", async () => {
    const { resolveDataset } = await import("@/lib/data/source");
    const before = resolveDataset();
    // Touch the candidate layer.
    expect(candidateSchedule.fixtures).toHaveLength(72);
    const after = resolveDataset();
    expect(after.fixtureSource).toBe(before.fixtureSource);
    expect(after.teams.length).toBe(before.teams.length);
  });
});
