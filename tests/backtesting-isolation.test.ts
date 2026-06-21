import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Phase 1.18B-0: the historical backtesting layer (`lib/backtesting/`, `data/historical/`)
 * must stay ISOLATED - production 2026 code must never import it, and no historical data
 * may be ingested yet (templates are header-only).
 */
describe("backtesting layer is isolated from production (Phase 1.18B-0)", () => {
  const root = process.cwd();
  const collect = (dir: string): string[] => {
    if (!existsSync(dir)) return [];
    const out: string[] = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) out.push(...collect(p));
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
    }
    return out;
  };
  // Production paths that must NOT depend on the historical/backtesting layer.
  const PROD_DIRS = [
    "app", "components",
    join("lib", "model"), join("lib", "simulation"), join("lib", "data"),
    join("lib", "tournament-context"), join("lib", "recent-form"),
    join("data", "model-inputs"), join("data", "official"), join("data", "mock"),
  ];
  const importsHistorical = (src: string) =>
    /(?:from|import|require)\s*\(?\s*["'][^"']*(lib\/backtesting|data\/historical)[^"']*["']/.test(src);

  it("no production module imports lib/backtesting or data/historical", () => {
    for (const dir of PROD_DIRS) {
      for (const file of collect(join(root, dir))) {
        expect({ file, imports: importsHistorical(readFileSync(file, "utf8")) }).toEqual({ file, imports: false });
      }
    }
  });

  it("the contract types module is standalone (no imports)", () => {
    const src = readFileSync(join(root, "lib", "backtesting", "types.ts"), "utf8");
    expect(/^\s*import\s/m.test(src)).toBe(false);
  });

  it("no historical data ingested yet: templates are header-only (one line each)", () => {
    const dir = join(root, "data", "historical", "templates");
    const csvs = readdirSync(dir).filter((f) => f.endsWith(".csv"));
    expect(csvs.length).toBeGreaterThan(0);
    for (const f of csvs) {
      const lines = readFileSync(join(dir, f), "utf8").replace(/\n+$/, "").split("\n");
      expect({ f, lines: lines.length }).toEqual({ f, lines: 1 });
    }
  });

  it("no historical snapshots committed yet (snapshots dir absent or empty)", () => {
    const snaps = join(root, "data", "historical", "snapshots");
    const files = existsSync(snaps) ? readdirSync(snaps) : [];
    expect(files).toEqual([]);
  });
});
