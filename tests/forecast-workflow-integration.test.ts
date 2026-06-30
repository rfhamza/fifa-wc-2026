/**
 * PR-83E1 — forecast workflow integration governance tests. Asserts the forecast
 * steps appended to the live-state write workflows: same-run sequencing, blob-only
 * source, correct object paths, no forbidden flags, Blob-token-only env, the manual
 * opt-in gate + safety block, and no token echo. Reads the YAML; no dispatch.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const scheduled = readFileSync(
  join(process.cwd(), ".github/workflows/live-state-write-blob-scheduled.yml"),
  "utf8",
);
const manual = readFileSync(
  join(process.cwd(), ".github/workflows/live-state-write-blob-manual.yml"),
  "utf8",
);

const CURRENT_OBJ = "forecast-current.provider.sanitized.json";
const MATCHES_OBJ = "forecast-matches.provider.sanitized.json";
const LIVE_OBJ = "live-state.provider.sanitized.json";

describe("scheduled workflow — forecast steps", () => {
  it("runs live-state write, then forecast-current, then forecast-matches, then smoke", () => {
    const write = scheduled.indexOf("live:state:write-blob");
    const cur = scheduled.indexOf("forecast:refresh:current");
    const mat = scheduled.indexOf("forecast:refresh:matches");
    const smoke = scheduled.indexOf("forecast:smoke");
    expect(write).toBeGreaterThanOrEqual(0);
    expect(cur).toBeGreaterThan(write);
    expect(mat).toBeGreaterThan(cur);
    expect(smoke).toBeGreaterThan(mat);
  });

  it("forecast steps all read --source blob and reference the three object paths", () => {
    expect(scheduled.includes("forecast:refresh:current -- --source blob")).toBe(true);
    expect(scheduled.includes("forecast:refresh:matches -- --source blob")).toBe(true);
    expect(scheduled.includes("forecast:smoke -- --source blob --strict")).toBe(true);
    expect(scheduled.includes(`--live-state-object-path ${LIVE_OBJ}`)).toBe(true);
    expect(scheduled.includes(`--forecast-object-path ${CURRENT_OBJ}`)).toBe(true);
    expect(scheduled.includes(`--matches-object-path ${MATCHES_OBJ}`)).toBe(true);
    expect(scheduled.includes(`--current-object-path ${CURRENT_OBJ}`)).toBe(true);
  });

  it("gates the forecast steps behind the same kill-switch guard as the write", () => {
    // Three forecast steps + the write step are all gated on the guard output.
    const gated = (scheduled.match(/if:\s*steps\.guard\.outputs\.run == 'true'/g) ?? []).length;
    expect(gated).toBeGreaterThanOrEqual(4);
  });

  it("never passes file-source or destructive forecast flags on the schedule", () => {
    expect(scheduled.includes("--source file")).toBe(false);
    expect(scheduled.includes("--allow-file-write")).toBe(false);
    expect(scheduled.includes("--include-retrospective")).toBe(false);
    expect(scheduled.includes("--force-rebuild")).toBe(false);
  });

  it("gives the forecast steps the Blob token only (no football-data token)", () => {
    const blob = (scheduled.match(/BLOB_READ_WRITE_TOKEN: \$\{\{ secrets\.BLOB_READ_WRITE_TOKEN \}\}/g) ?? []).length;
    const fd = (scheduled.match(/FOOTBALL_DATA_TOKEN: \$\{\{ secrets\.FOOTBALL_DATA_TOKEN \}\}/g) ?? []).length;
    // write step + 3 forecast steps all use the Blob token; only the write step uses FD.
    expect(blob).toBeGreaterThanOrEqual(4);
    expect(fd).toBe(1);
  });

  it("never echoes a token", () => {
    expect(/echo[^\n]*TOKEN/.test(scheduled)).toBe(false);
    expect(/echo[^\n]*\$\{\{\s*secrets\./.test(scheduled)).toBe(false);
  });
});

describe("manual workflow — forecast inputs + gating", () => {
  it("adds refresh_forecast / include_retrospective / forecast_force inputs (default false)", () => {
    for (const name of ["refresh_forecast", "include_retrospective", "forecast_force"]) {
      expect(new RegExp(`${name}:\\s*\\n\\s*description:[^\\n]*\\n\\s*type: boolean\\n\\s*default: false`).test(manual)).toBe(true);
    }
  });

  it("does NOT expose a force_rebuild input", () => {
    expect(/^\s*force_rebuild:/m.test(manual)).toBe(false);
    expect(manual.includes("--force-rebuild")).toBe(false);
  });

  it("gates the forecast step behind refresh_forecast", () => {
    expect(manual.includes("if: ${{ inputs.refresh_forecast }}")).toBe(true);
  });

  it("runs forecast refresh blob-only, never file-source or allow-file-write", () => {
    expect(manual.includes("forecast:refresh:current -- $current_flags")).toBe(true);
    expect(manual.includes("forecast:refresh:matches -- $matches_flags")).toBe(true);
    expect(manual.includes("--source blob")).toBe(true);
    expect(manual.includes("--source file")).toBe(false);
    expect(manual.includes("--allow-file-write")).toBe(false);
    expect(manual.includes("forecast:smoke -- --source blob --strict")).toBe(true);
  });

  it("skips the forecast refresh on a dry run (objects never written)", () => {
    expect(manual.includes('if [ "$DRY_RUN" = "true" ]')).toBe(true);
    expect(manual.includes("SKIPPING forecast refresh")).toBe(true);
  });

  it("blocks a real forecast refresh unless source+object_path are the production provider objects", () => {
    expect(manual.includes('[ "$SOURCE" != "football-data" ]')).toBe(true);
    expect(manual.includes(`[ "$OBJECT_PATH" != "${LIVE_OBJ}" ]`)).toBe(true);
    expect(manual.includes("BLOCKED:")).toBe(true);
  });

  it("appends retrospective/force only via their inputs", () => {
    expect(manual.includes('if [ "$INCLUDE_RETROSPECTIVE" = "true" ]')).toBe(true);
    expect(manual.includes("--include-retrospective")).toBe(true);
    expect(manual.includes('if [ "$FORECAST_FORCE" = "true" ]')).toBe(true);
    expect(manual.includes("--force")).toBe(true);
  });

  it("gives the forecast step the Blob token and never echoes a token", () => {
    expect(manual.includes("BLOB_READ_WRITE_TOKEN: ${{ secrets.BLOB_READ_WRITE_TOKEN }}")).toBe(true);
    expect(/echo[^\n]*TOKEN/.test(manual)).toBe(false);
  });
});
