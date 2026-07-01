/**
 * UX-1 — forecast hero data + presentational-helper tests. PURE: synthetic fixtures +
 * real team lookup; no Blob, no token, no network, no React rendering (the repo has no
 * DOM test setup — we test the pure formatting/mapping the components consume).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTeam } from "@/lib/data";
import type { Team } from "@/lib/types";
import type { ForecastSnapshot } from "@/lib/model/forecast-snapshots";
import type { ForecastMover, ForecastMoversResult } from "@/lib/model/forecast-deltas";
import {
  buildForecastHeroData,
  formatAsOf,
  formatPpDelta,
  moverDirection,
  ppDeltaSrText,
  sourceLabel,
  sourceTone,
} from "@/lib/ui/forecast-hero-data";

function safeTeam(id: string): Team | null {
  try {
    return getTeam(id);
  } catch {
    return null;
  }
}

function snap(asOf: string, teamProbs: Array<{ teamId: string; winner: number }>): ForecastSnapshot {
  return {
    meta: { asOf },
    teams: teamProbs.map((t, i) => ({
      teamId: t.teamId,
      rank: i + 1,
      winner: t.winner,
      final: 0,
      semiFinal: 0,
      quarterFinal: 0,
      roundOf16: 0,
      roundOf32: 0,
      qualifyTop2: 0,
      qualifyThird: 0,
    })),
  } as unknown as ForecastSnapshot;
}

function mover(teamId: string, from: number, to: number, pp: number): ForecastMover {
  return {
    teamId,
    stage: "winner",
    fromProbability: from,
    toProbability: to,
    delta: to - from,
    deltaPercentagePoints: pp,
  } as unknown as ForecastMover;
}

const EMPTY_MOVERS: ForecastMoversResult = { stage: "winner", mode: "signed", risers: [], fallers: [] };

describe("source label/tone", () => {
  it("maps each source kind", () => {
    expect(sourceLabel("blob")).toBe("Live forecast");
    expect(sourceLabel("committed-fallback")).toBe("Showing last published forecast");
    expect(sourceLabel("unavailable")).toBe("Forecast unavailable");
    expect(sourceTone("blob")).toBe("default");
    expect(sourceTone("committed-fallback")).toBe("muted");
    expect(sourceTone("unavailable")).toBe("outline");
  });
});

describe("mover formatting", () => {
  it("classifies direction with a neutral band", () => {
    expect(moverDirection(3.2)).toBe("up");
    expect(moverDirection(-1.5)).toBe("down");
    expect(moverDirection(0)).toBe("neutral");
    expect(moverDirection(0.02)).toBe("neutral");
  });
  it("formats signed pp labels", () => {
    expect(formatPpDelta(3.2)).toBe("+3.2 pts");
    expect(formatPpDelta(-1.5)).toBe("−1.5 pts");
    expect(formatPpDelta(0)).toBe("±0.0 pts");
  });
  it("produces screen-reader text", () => {
    expect(ppDeltaSrText(3.2)).toBe("up 3.2 percentage points");
    expect(ppDeltaSrText(-1.5)).toBe("down 1.5 percentage points");
    expect(ppDeltaSrText(0)).toBe("unchanged, 0.0 percentage points");
  });
});

describe("formatAsOf", () => {
  it("formats a deterministic UTC date label", () => {
    expect(formatAsOf("2026-06-11")).toBe("11 Jun 2026");
    expect(formatAsOf("2026-07-03T18:30:00.000Z")).toBe("3 Jul 2026");
  });
  it("returns null for missing/invalid input", () => {
    expect(formatAsOf(null)).toBeNull();
    expect(formatAsOf(undefined)).toBeNull();
    expect(formatAsOf("not-a-date")).toBeNull();
  });
});

describe("buildForecastHeroData", () => {
  const snapshot = snap("2026-06-29", [
    { teamId: "brazil", winner: 0.18 },
    { teamId: "spain", winner: 0.21 },
    { teamId: "argentina", winner: 0.12 },
  ]);
  const movers: ForecastMoversResult = {
    stage: "winner",
    mode: "signed",
    risers: [mover("brazil", 0.14, 0.18, 4.0)],
    fallers: [mover("argentina", 0.17, 0.12, -5.0)],
  };

  it("uses the Blob current: favourite = top winner, source blob, asOf set, movers mapped", () => {
    const data = buildForecastHeroData({
      snapshot,
      policy: { currentSource: "blob" },
      movers,
      resolveTeam: safeTeam,
    });
    expect(data.source).toBe("blob");
    expect(data.asOfLabel).toBe("29 Jun 2026");
    expect(data.favourite?.teamId).toBe("spain");
    expect(data.favourite?.titleProbability).toBeCloseTo(0.21);
    expect(data.riser?.teamId).toBe("brazil");
    expect(data.riser?.deltaPp).toBe(4.0);
    expect(data.faller?.teamId).toBe("argentina");
    expect(data.faller?.deltaPp).toBe(-5.0);
  });

  it("reflects a committed fallback source", () => {
    const data = buildForecastHeroData({
      snapshot,
      policy: { currentSource: "committed-fallback" },
      movers: EMPTY_MOVERS,
      resolveTeam: safeTeam,
    });
    expect(data.source).toBe("committed-fallback");
    expect(data.favourite?.teamId).toBe("spain");
    expect(data.riser).toBeNull();
    expect(data.faller).toBeNull();
  });

  it("handles the unavailable/empty state safely", () => {
    const data = buildForecastHeroData({
      snapshot: null,
      policy: { currentSource: "unavailable" },
      movers: EMPTY_MOVERS,
      resolveTeam: safeTeam,
    });
    expect(data.source).toBe("unavailable");
    expect(data.favourite).toBeNull();
    expect(data.riser).toBeNull();
    expect(data.faller).toBeNull();
    expect(data.asOfLabel).toBeNull();
  });

  it("drops a mover whose team id cannot be resolved (never throws)", () => {
    const data = buildForecastHeroData({
      snapshot,
      policy: { currentSource: "blob" },
      movers: { stage: "winner", mode: "signed", risers: [mover("atlantis", 0.1, 0.2, 10)], fallers: [] },
      resolveTeam: safeTeam,
    });
    expect(data.riser).toBeNull();
  });

  it("emits no token / Blob URL in the hero view-model", () => {
    const data = buildForecastHeroData({
      snapshot,
      policy: { currentSource: "blob" },
      movers,
      resolveTeam: safeTeam,
    });
    const serialized = JSON.stringify(data);
    for (const bad of ["vercel-storage", "blob.vercel-storage", "BLOB_READ_WRITE_TOKEN", "https://", "http://"]) {
      expect(serialized.includes(bad)).toBe(false);
    }
  });
});

describe("server-only isolation", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const componentFiles = [
    "components/ui/source-badge.tsx",
    "components/ui/mover-chip.tsx",
    "components/home/forecast-hero.tsx",
  ];

  it("presentational components import no server-only forecast modules or the Blob SDK", () => {
    for (const file of componentFiles) {
      const src = read(file);
      const imports = src.split("\n").filter((l) => l.trimStart().startsWith("import")).join("\n");
      expect(imports).not.toMatch(/forecast-runtime-store|forecast-snapshot-store/);
      expect(imports).not.toMatch(/@vercel\/blob/);
      expect(imports).not.toMatch(/@\/lib\/live-state|football-data|provider/);
    }
  });

  it("the pure hero-data module only type-imports the runtime store (no value import)", () => {
    const src = read("lib/ui/forecast-hero-data.ts");
    // A value import (no `type` keyword) of the server-only runtime store would pull it
    // into any client bundle; only `import type` is allowed.
    expect(/import\s+\{[^}]*\}\s+from\s+"@\/lib\/model\/forecast-runtime-store"/.test(src)).toBe(false);
    expect(src.includes("from \"react\"")).toBe(false);
  });
});
