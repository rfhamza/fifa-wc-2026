import { describe, expect, it } from "vitest";
import {
  selectMatchDriverChips,
  MATCH_DRIVER_LABELS,
  MATCH_DRIVER_HEADING,
  MATCH_DRIVER_EMPTY_LABEL,
  MATCH_DRIVER_MIN_MAGNITUDE,
  OMITTED_DRIVER_FAMILIES,
  type MatchDriverContribution,
} from "@/lib/ui/match-drivers";
import { computeDrivers } from "@/lib/model/predict";
import { buildFeatureSet } from "@/lib/model/features";
import { officialTeams } from "@/data/official/teams";

const TEAMS = {
  homeTeamId: "home",
  homeTeamName: "Homeland",
  awayTeamId: "away",
  awayTeamName: "Awayland",
} as const;

/** A full, realistic decomposition (home minus away), families as computeDrivers emits. */
const MIXED: MatchDriverContribution[] = [
  { family: "eloRating", contribution: -39 }, // favours away
  { family: "fifaRanking", contribution: -32 }, // favours away
  { family: "squadQuality", contribution: -20 }, // favours away
  { family: "recentForm", contribution: -20 }, // OMITTED (frozen placeholder)
  { family: "managerCohesion", contribution: 0 }, // disabled / zero
  { family: "hostAdvantage", contribution: 60 }, // favours home
  { family: "regionalAdvantage", contribution: 0 },
  { family: "climateFamiliarity", contribution: -25 }, // favours away
  { family: "structural", contribution: 2.9 }, // negligible (< threshold)
  { family: "tournamentContext", contribution: -0.3 }, // negligible
];

describe("selectMatchDriverChips: derivation, filtering, ranking", () => {
  it("renders chips for a match and heading/empty constants are stable copy", () => {
    const sel = selectMatchDriverChips(MIXED, TEAMS);
    expect(sel.dominates).toBe(true);
    expect(sel.chips.length).toBeGreaterThan(0);
    expect(MATCH_DRIVER_HEADING).toBe("Why the model leans");
    expect(MATCH_DRIVER_EMPTY_LABEL).toBe("No single driver dominates");
  });

  it("is derived from real model driver output (computeDrivers), not invented", () => {
    const canada = officialTeams.find((t) => t.id === "canada")!;
    const morocco = officialTeams.find((t) => t.id === "morocco")!;
    const drivers = computeDrivers(buildFeatureSet(canada), buildFeatureSet(morocco));
    const sel = selectMatchDriverChips(drivers, {
      homeTeamId: canada.id,
      homeTeamName: canada.name,
      awayTeamId: morocco.id,
      awayTeamName: morocco.name,
    });
    // Every chip must trace back to a real family present in the model output.
    const families = new Set<string | undefined>(drivers.map((d) => d.family));
    for (const chip of sel.chips) expect(families.has(chip.family)).toBe(true);
    // Host edge favours the home host; Elo/FIFA favour the stronger away side — a
    // genuine mixed case, both sides represented honestly.
    const texts = sel.chips.map((c) => c.text);
    expect(texts).toContain("Host edge favours Canada");
    expect(texts.some((t) => t.includes("favours Morocco"))).toBe(true);
  });

  it("omits the disabled/zero-weight manager driver", () => {
    const sel = selectMatchDriverChips(MIXED, TEAMS);
    expect(sel.chips.some((c) => c.family === "managerCohesion")).toBe(false);
    expect(OMITTED_DRIVER_FAMILIES.has("managerCohesion")).toBe(true);
  });

  it("omits recentForm entirely (frozen placeholder, never labelled current form)", () => {
    const sel = selectMatchDriverChips(MIXED, TEAMS);
    expect(sel.chips.some((c) => c.family === "recentForm")).toBe(false);
    expect(OMITTED_DRIVER_FAMILIES.has("recentForm")).toBe(true);
    expect(Object.keys(MATCH_DRIVER_LABELS)).not.toContain("recentForm");
  });

  it("filters out negligible contributions below the threshold", () => {
    const sel = selectMatchDriverChips(MIXED, { ...TEAMS, max: 5 });
    // structural (2.9) and tournamentContext (0.3) are below MATCH_DRIVER_MIN_MAGNITUDE.
    expect(sel.chips.some((c) => c.family === "structural")).toBe(false);
    expect(sel.chips.some((c) => c.family === "tournamentContext")).toBe(false);
    for (const c of sel.chips) expect(c.magnitude).toBeGreaterThanOrEqual(MATCH_DRIVER_MIN_MAGNITUDE);
  });

  it("sorts by absolute contribution and defaults to top 3", () => {
    const sel = selectMatchDriverChips(MIXED, TEAMS);
    expect(sel.chips.length).toBe(3);
    const mags = sel.chips.map((c) => c.magnitude);
    expect(mags).toEqual([...mags].sort((a, b) => b - a));
    // Top three by |contribution|: host 60, elo 39, fifa 32.
    expect(sel.chips.map((c) => c.family)).toEqual(["hostAdvantage", "eloRating", "fifaRanking"]);
  });

  it("renders both sides in a mixed-driver case", () => {
    const sel = selectMatchDriverChips(MIXED, TEAMS);
    const favoured = new Set(sel.chips.map((c) => c.favouredTeamId));
    expect(favoured.has("home")).toBe(true); // host edge
    expect(favoured.has("away")).toBe(true); // elo / fifa
  });

  it("respects the max cap (hard max 5)", () => {
    const big: MatchDriverContribution[] = Object.keys(MATCH_DRIVER_LABELS).map((family, i) => ({
      family,
      contribution: 100 - i, // all above threshold, descending
    }));
    expect(selectMatchDriverChips(big, { ...TEAMS, max: 4 }).chips.length).toBe(4);
    expect(selectMatchDriverChips(big, { ...TEAMS, max: 99 }).chips.length).toBe(5);
  });

  it("falls back to 'No single driver dominates' when nothing clears the threshold", () => {
    const flat: MatchDriverContribution[] = [
      { family: "eloRating", contribution: 1 },
      { family: "structural", contribution: -2 },
      { family: "managerCohesion", contribution: 0 },
    ];
    const sel = selectMatchDriverChips(flat, TEAMS);
    expect(sel.dominates).toBe(false);
    expect(sel.chips).toHaveLength(0);
  });

  it("is orientation-independent: swapping home/away names the same favoured teams", () => {
    const swapped = MIXED.map((d) => ({ ...d, contribution: -d.contribution }));
    const a = selectMatchDriverChips(MIXED, TEAMS);
    const b = selectMatchDriverChips(swapped, {
      homeTeamId: "away",
      homeTeamName: "Awayland",
      awayTeamId: "home",
      awayTeamName: "Homeland",
    });
    const key = (s: ReturnType<typeof selectMatchDriverChips>) =>
      s.chips.map((c) => `${c.family}:${c.favouredTeamId}`).sort();
    expect(key(a)).toEqual(key(b));
  });
});

describe("selectMatchDriverChips: no misleading live-form / betting wording", () => {
  it("chip text never implies live/in-tournament form or betting certainty", () => {
    const canada = officialTeams.find((t) => t.id === "canada")!;
    const morocco = officialTeams.find((t) => t.id === "morocco")!;
    const drivers = computeDrivers(buildFeatureSet(canada), buildFeatureSet(morocco));
    const sel = selectMatchDriverChips(drivers, {
      homeTeamId: canada.id,
      homeTeamName: canada.name,
      awayTeamId: morocco.id,
      awayTeamName: morocco.name,
    });
    const allText = `${sel.chips.map((c) => c.text).join(" ")} ${Object.values(MATCH_DRIVER_LABELS).join(" ")}`.toLowerCase();
    for (const bad of [
      "live form",
      "current form",
      "in-tournament form",
      "recent tournament performance",
      "re-rated",
      "guaranteed",
      "will beat",
      "betting odds",
      "easy path",
      "hard path",
    ]) {
      expect(allText, `chip wording overclaims: "${bad}"`).not.toContain(bad);
    }
  });
});
