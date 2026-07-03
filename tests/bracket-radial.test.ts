import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { officialKnockoutGraph } from "@/data/official/knockout-graph";
import { buildBracketView, type BracketTeamRef } from "@/lib/ui/bracket-view";
import { bracketHalfMembership } from "@/lib/ui/bracket-layout";
import {
  buildBracketRadialModel,
  radialAriaSummary,
  type RadialSlot,
} from "@/lib/ui/bracket-radial";
import type { LiveViewBracketMatch, LiveViewMatch } from "@/lib/live-client/public-safe-view.client";

/**
 * Home "Road to the trophy" radial — pure geometry + state model. Env `node`. Geometry is
 * derived from the official graph's winner edges (M101 subtree = one half, M102 the other),
 * never from arbitrary match-number slicing; M103 is excluded from the rings, M104 is centred.
 */

const skeleton = officialKnockoutGraph.matches;

// A tiny public-safe team lookup for the fixtures (only the ids the tests resolve).
const NAMES: Record<string, string> = {
  spain: "Spain",
  brazil: "Brazil",
  france: "France",
  argentina: "Argentina",
};
const resolveTeam = (id: string): BracketTeamRef | null =>
  NAMES[id] ? { id, name: NAMES[id]!, flag: "🏳️", countryCode: id.slice(0, 3).toUpperCase() } : null;

const emptyView = () =>
  buildBracketView({
    skeleton,
    liveBracket: [],
    liveMatches: [],
    provenanceByMatch: {},
    matchesObjectAvailable: false,
    resolveTeam,
  });

const viewWith = (bracket: LiveViewBracketMatch[], matches: LiveViewMatch[]) =>
  buildBracketView({
    skeleton,
    liveBracket: bracket,
    liveMatches: matches,
    provenanceByMatch: {},
    matchesObjectAvailable: true,
    resolveTeam,
  });

const slotsFor = (slots: RadialSlot[], stage: string) => slots.filter((s) => s.stage === stage);
const byKey = (slots: RadialSlot[], key: string) => slots.find((s) => s.key === key)!;

describe("buildBracketRadialModel — ring structure", () => {
  it("emits the right slot count per ring plus a champion focal slot", () => {
    const model = buildBracketRadialModel(emptyView(), officialKnockoutGraph);
    expect(slotsFor(model.slots, "roundOf32")).toHaveLength(32);
    expect(slotsFor(model.slots, "roundOf16")).toHaveLength(16);
    expect(slotsFor(model.slots, "quarterFinal")).toHaveLength(8);
    expect(slotsFor(model.slots, "semiFinal")).toHaveLength(4);
    expect(slotsFor(model.slots, "final")).toHaveLength(2);
    expect(slotsFor(model.slots, "champion")).toHaveLength(1);
    expect(model.slots).toHaveLength(63);
    expect(model.rings.map((r) => r.stage)).toEqual([
      "roundOf32",
      "roundOf16",
      "quarterFinal",
      "semiFinal",
      "final",
    ]);
  });

  it("excludes the third-place match (M103) from the rings but keeps M104 at the centre", () => {
    const model = buildBracketRadialModel(emptyView(), officialKnockoutGraph);
    expect(model.slots.some((s) => s.matchNumber === 103)).toBe(false);
    expect(model.connectors.some((c) => c.key.includes("103"))).toBe(false);
    const champion = byKey(model.slots, "champion");
    expect(champion.matchNumber).toBe(104);
    expect(champion.xFrac).toBe(0.5);
    expect(champion.yFrac).toBe(0.5);
    expect(champion.radiusFrac).toBe(0);
    // M104's two finalists are on the innermost ring, not the centre.
    expect(slotsFor(model.slots, "final").map((s) => s.matchNumber)).toEqual([104, 104]);
  });
});

describe("buildBracketRadialModel — graph-derived geometry", () => {
  const model = buildBracketRadialModel(emptyView(), officialKnockoutGraph);

  it("splits the halves by the official winner-edge subtrees, not match-number slicing", () => {
    // M101 subtree slots occupy the left semicircle (cos<0 → xFrac<0.5); M102 the right.
    const { left, right } = bracketHalfMembership(officialKnockoutGraph);
    for (const slot of model.slots) {
      if (slot.stage === "champion" || slot.matchNumber === 104) continue;
      if (left.has(slot.matchNumber)) expect(slot.xFrac).toBeLessThan(0.5);
      if (right.has(slot.matchNumber)) expect(slot.xFrac).toBeGreaterThan(0.5);
    }
    // A pure match-number split would put M73 (left subtree via M90→M97→M101) and M76
    // (right subtree via M91→M99→M102) on the same side — they must be opposite here.
    const m73 = model.slots.find((s) => s.matchNumber === 73)!;
    const m76 = model.slots.find((s) => s.matchNumber === 76)!;
    expect(m73.xFrac < 0.5).toBe(true);
    expect(m76.xFrac > 0.5).toBe(true);
  });

  it("places each match's two outer slots one angular pitch apart (sibling adjacency)", () => {
    for (const def of skeleton) {
      if (def.stage !== "roundOf32") continue;
      const home = byKey(model.slots, `${def.matchNumber}-home`);
      const away = byKey(model.slots, `${def.matchNumber}-away`);
      expect(Math.abs(home.angleDeg - away.angleDeg)).toBeCloseTo(10.25, 5);
    }
  });

  it("sets an inner slot's angle to the mean of its feeder match's two slots", () => {
    // M89.home is fed by M74; its angle must equal the mean of M74's two slot angles.
    const m74Home = byKey(model.slots, "74-home").angleDeg;
    const m74Away = byKey(model.slots, "74-away").angleDeg;
    const m89Home = byKey(model.slots, "89-home").angleDeg;
    expect(m89Home).toBeCloseTo((m74Home + m74Away) / 2, 4);
    // Both finalists converge on the centre horizontally (≈9 o'clock and ≈3 o'clock).
    const finalists = slotsFor(model.slots, "final");
    const xs = finalists.map((s) => s.xFrac).sort((a, b) => a - b);
    expect(xs[0]!).toBeLessThan(0.5);
    expect(xs[1]!).toBeGreaterThan(0.5);
  });

  it("produces deterministic coordinates rounded to 4 decimals", () => {
    for (const slot of model.slots) {
      expect(slot.xFrac).toBe(Math.round(slot.xFrac * 10000) / 10000);
      expect(slot.yFrac).toBe(Math.round(slot.yFrac * 10000) / 10000);
    }
    // Re-building yields identical output.
    const again = buildBracketRadialModel(emptyView(), officialKnockoutGraph);
    expect(JSON.stringify(again.slots)).toBe(JSON.stringify(model.slots));
  });
});

describe("buildBracketRadialModel — placeholders + counts (skeleton only)", () => {
  it("keeps human TBD placeholders and reports zero decided", () => {
    const model = buildBracketRadialModel(emptyView(), officialKnockoutGraph);
    for (const slot of model.slots) {
      expect(slot.slotState).toBe("tbd");
      expect(slot.participant.teamId).toBeNull();
    }
    // A resolved-by-graph placeholder ("Winner of Match 74") is preserved on the inner rings.
    const m89Home = byKey(model.slots, "89-home");
    expect(m89Home.participant.placeholder).toBe("Winner of Match 74");
    expect(model.decidedCount).toBe(0);
    expect(model.totalCount).toBe(31); // R32..Final, third place excluded
  });
});

describe("buildBracketRadialModel — live overlay: elimination + advancement", () => {
  // M73: Spain beats Brazil (completed). M90 (R16) then has Spain as home (winner of M73).
  const bracket: LiveViewBracketMatch[] = [
    { matchNumber: 73, homeTeamId: "spain", awayTeamId: "brazil", winner: "spain" } as LiveViewBracketMatch,
    { matchNumber: 90, homeTeamId: "spain", awayTeamId: "france", winner: null } as LiveViewBracketMatch,
  ];
  const matches: LiveViewMatch[] = [
    { matchNumber: 73, status: "complete", teamA: "spain", teamB: "brazil", goalsA: 2, goalsB: 0, winner: "spain" } as LiveViewMatch,
    { matchNumber: 90, status: "scheduled", teamA: "spain", teamB: "france" } as LiveViewMatch,
  ];
  const model = buildBracketRadialModel(viewWith(bracket, matches), officialKnockoutGraph);

  it("marks the losing team eliminated at every appearance and keeps the winner alive", () => {
    const brazilSlots = model.slots.filter((s) => s.participant.teamId === "brazil");
    expect(brazilSlots.length).toBeGreaterThan(0);
    for (const s of brazilSlots) expect(s.slotState).toBe("eliminated");
    const spainSlots = model.slots.filter((s) => s.participant.teamId === "spain");
    // Spain appears on the outer ring (M73) and the R16 ring (M90) and is never eliminated.
    expect(spainSlots.length).toBeGreaterThanOrEqual(2);
    for (const s of spainSlots) expect(s.slotState).not.toBe("eliminated");
    expect(model.decidedCount).toBe(1);
  });

  it("shows a completed feeder as an advanced connector (historical progression kept)", () => {
    // The winner of M73 flows into M90.home; that connector is `advanced` once M73 is done.
    const c = model.connectors.find((k) => k.key === "c-73-90-home")!;
    expect(c.kind).toBe("advanced");
    // An undecided feeder stays structural.
    const structural = model.connectors.find((k) => k.key === "c-75-90-away")!;
    expect(structural.kind).toBe("structural");
  });

  it("keeps the third-place match in the accessible table even though it is off the rings", () => {
    const row = model.tableRows.find((r) => r.matchNumber === 103);
    expect(row).toBeDefined();
    expect(model.tableRows.some((r) => r.matchNumber === 104)).toBe(true);
    // The completed match reads honestly with the winner named.
    const m73 = model.tableRows.find((r) => r.matchNumber === 73)!;
    expect(m73.statusLabel).toBe("Spain won");
  });
});

describe("radialAriaSummary + no-leak", () => {
  it("summarises the decided count without probabilities or provider ids", () => {
    const model = buildBracketRadialModel(emptyView(), officialKnockoutGraph);
    const summary = radialAriaSummary(model);
    expect(summary).toContain("0 of 31");
    expect(summary.toLowerCase()).not.toMatch(/will face|guaranteed|%|because/);
  });

  it("serialises with no token, Blob URL, or provider id leakage", () => {
    const model = buildBracketRadialModel(emptyView(), officialKnockoutGraph);
    const json = JSON.stringify(model);
    for (const bad of ["https://", "http://", "vercel-storage", "BLOB_READ_WRITE_TOKEN", "@vercel/blob", "providerId"]) {
      expect(json.includes(bad)).toBe(false);
    }
  });
});

describe("client/server isolation (source scan)", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const importsOf = (p: string) => read(p).split("\n").filter((l) => l.trimStart().startsWith("import")).join("\n");

  it("the pure radial lib imports no React, runtime store, or Blob SDK", () => {
    const imports = importsOf("lib/ui/bracket-radial.ts");
    expect(imports).not.toMatch(/from "react"/);
    expect(imports).not.toMatch(/forecast-runtime-store|forecast-snapshot-store/);
    expect(imports).not.toMatch(/@vercel\/blob/);
  });

  it("the client radial component imports no server-only store or Blob SDK", () => {
    const file = "components/home/home-knockout-radial.tsx";
    expect(read(file).startsWith('"use client"')).toBe(true);
    const imports = importsOf(file);
    expect(imports).not.toMatch(/forecast-runtime-store|forecast-snapshot-store/);
    expect(imports).not.toMatch(/@vercel\/blob/);
    expect(imports).not.toMatch(/@\/lib\/live-state|football-data|provider/);
  });
});
