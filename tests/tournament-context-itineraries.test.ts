import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  groupStageItineraries,
  itineraryForTeam,
  deriveItineraries,
} from "@/lib/tournament-context";
import { venueGeoById } from "@/data/model-inputs/snapshots/venue-geo-2026";
import { teams, fixtures, fixtureSource } from "@/lib/data";
import type { Fixture } from "@/lib/types";

describe("group-stage itineraries - derivation from resolved fixtures", () => {
  const itineraries = groupStageItineraries();

  it("covers every team with exactly 3 ordered group-stage stops", () => {
    expect(itineraries).toHaveLength(teams.length);
    for (const it of itineraries) {
      expect(it.stops).toHaveLength(3);
      const days = it.stops.map((s) => s.matchday);
      expect(days).toEqual([...days].sort((a, b) => a - b));
    }
  });

  it("every stop resolves to a source-backed venue-geo row", () => {
    for (const it of itineraries) {
      for (const s of it.stops) {
        expect(venueGeoById.has(s.venueId)).toBe(true);
        expect(s.geo.venueId).toBe(s.venueId);
        expect(s.geo.dataStatus).toBe("source-backed");
      }
    }
  });

  it("stops are sorted chronologically within a team", () => {
    for (const it of itineraries) {
      const times = it.stops.map((s) => Date.parse(s.date));
      expect(times).toEqual([...times].sort((a, b) => a - b));
    }
  });

  it("itineraryForTeam returns a single team's itinerary", () => {
    const sample = teams[0]!;
    const itin = itineraryForTeam(sample.id);
    expect(itin?.teamId).toBe(sample.id);
    expect(itin?.stops).toHaveLength(3);
  });

  it("deriveItineraries throws on a venue with no geo row (referential honesty)", () => {
    const bad: Fixture[] = [
      {
        id: "X1",
        matchday: 1,
        group: "A",
        homeTeamId: "alpha",
        awayTeamId: "beta",
        venueId: "atlantis",
        date: "2026-06-12T19:00:00Z",
      },
    ];
    expect(() => deriveItineraries(bad, venueGeoById)).toThrow(/no geo row/);
  });
});

describe("tournament-context is NOT wired into the model (scope guard)", () => {
  const root = process.cwd();

  const collectTs = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...collectTs(p));
      else if (entry.name.endsWith(".ts")) out.push(p);
    }
    return out;
  };

  // Match actual import/require/dynamic-import of a module path (not prose in
  // comments, which legitimately mention the "tournament-context phase").
  const importsModule = (src: string, needle: string): boolean => {
    const re = new RegExp(
      `(?:from|import|require)\\s*\\(?\\s*["'][^"']*${needle}[^"']*["']`,
    );
    return re.test(src);
  };

  it("no file under lib/model imports the tournament-context layer", () => {
    for (const file of collectTs(join(root, "lib", "model"))) {
      const src = readFileSync(file, "utf8");
      expect(importsModule(src, "tournament-context")).toBe(false);
    }
  });

  it("no file under lib/model imports venue-geo", () => {
    for (const file of collectTs(join(root, "lib", "model"))) {
      const src = readFileSync(file, "utf8");
      expect(importsModule(src, "venue-geo")).toBe(false);
    }
  });

  it("officialDataset still serves the official schedule unchanged", () => {
    // Venue-geo is a standalone snapshot; it must not alter fixtures/resolution.
    expect(fixtureSource).toBe("official");
    expect(fixtures).toHaveLength(72);
  });
});
