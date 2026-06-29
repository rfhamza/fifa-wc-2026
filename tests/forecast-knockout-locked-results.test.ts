import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveKnockoutLockedResults,
  type KnockoutLockedResult,
} from "@/lib/simulation/locked-knockout-results";
import { runTournamentSimulation } from "@/lib/simulation/tournament";
import {
  loadForecastResultsLedger,
  ledgerToLockedResults,
  ledgerToKnockoutLockedResults,
  validateResultsLedger,
  isKnockoutLedgerRow,
  type ForecastResultsLedger,
  type KnockoutResultLedgerRow,
} from "@/lib/model/forecast-results-ledger";
import {
  loadForecastSnapshot,
  loadForecastManifest,
  buildLiveAwareForecastSnapshot,
  validateForecastSnapshot,
  findForbiddenSubstrings,
  FORECAST_PROBABILITY_KEYS,
} from "@/lib/model/forecast-snapshots";
import { bracket, fixtures } from "@/lib/data";
import { realiseOfficialBracket, type GroupResult } from "@/lib/simulation/bracket";
import { GROUP_LETTERS } from "@/lib/simulation/bracket-validate";
import { sampleBracket } from "./fixtures/sample-bracket";
import type { GroupId } from "@/lib/types";

/**
 * Phase 1.29 (PR-3E) - generic knockout locked-results support (M73..M104). The
 * engine locks the winner of any completed knockout match, eliminates the loser,
 * and propagates the winner through the official bracket; unresolved matches are
 * still simulated. M73 (Canada over South Africa) is the first acceptance fixture.
 */
const RESULTS_DIR = "data/forecast/results";
const SNAPSHOTS_DIR = "data/forecast/snapshots";
const LEDGER_073 = "results-as-of-2026-06-29-after-match-073.json";
const SNAPSHOT_073 = "snapshot-2026-06-29-after-match-073.json";
const LEDGER_072 = "results-as-of-2026-06-29-after-match-072.json";
const SNAPSHOT_072 = "snapshot-2026-06-29-after-match-072.json";

const GENERATED_AT = "2026-06-29T07:02:22.483Z";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const ledger073 = loadForecastResultsLedger(read(join(RESULTS_DIR, LEDGER_073)), fixtures);
const snapshot073 = loadForecastSnapshot(read(join(SNAPSHOTS_DIR, SNAPSHOT_073)));

const prob = (snap: typeof snapshot073, teamId: string) =>
  snap.teams.find((t) => t.teamId === teamId)!;

describe("resolveKnockoutLockedResults (graph + ancestor validation)", () => {
  const g = bracket.graph;

  it("resolves a valid R32 lock (M73, groupPosition feeders need no ancestors)", () => {
    const map = resolveKnockoutLockedResults(
      [{ matchNumber: 73, stage: "roundOf32", homeTeamId: "south-africa", awayTeamId: "canada", winnerTeamId: "canada" }],
      g,
    );
    expect(map.get(73)).toEqual({ homeTeamId: "south-africa", awayTeamId: "canada", winnerTeamId: "canada" });
  });

  it("rejects a matchNumber absent from the official graph", () => {
    expect(() =>
      resolveKnockoutLockedResults(
        [{ matchNumber: 999, stage: "roundOf32", homeTeamId: "a", awayTeamId: "b", winnerTeamId: "a" }],
        g,
      ),
    ).toThrow(/not in the official knockout graph/i);
  });

  it("rejects a stage that disagrees with the graph", () => {
    expect(() =>
      resolveKnockoutLockedResults(
        [{ matchNumber: 73, stage: "roundOf16", homeTeamId: "south-africa", awayTeamId: "canada", winnerTeamId: "canada" }],
        g,
      ),
    ).toThrow(/stage/i);
  });

  it("rejects a winner that is not one of the two participants", () => {
    expect(() =>
      resolveKnockoutLockedResults(
        [{ matchNumber: 73, stage: "roundOf32", homeTeamId: "south-africa", awayTeamId: "canada", winnerTeamId: "mexico" }],
        g,
      ),
    ).toThrow(/winnerTeamId/i);
  });

  it("rejects duplicate match numbers", () => {
    const row: KnockoutLockedResult = {
      matchNumber: 73, stage: "roundOf32", homeTeamId: "south-africa", awayTeamId: "canada", winnerTeamId: "canada",
    };
    expect(() => resolveKnockoutLockedResults([row, row], g)).toThrow(/duplicate/i);
  });

  it("rejects an R16 lock whose R32 feeders are not also locked (ancestor-closure)", () => {
    // M89 feeds from matchWinner:74 and matchWinner:77 - both must be locked.
    expect(() =>
      resolveKnockoutLockedResults(
        [{ matchNumber: 89, stage: "roundOf16", homeTeamId: "x", awayTeamId: "y", winnerTeamId: "x" }],
        g,
      ),
    ).toThrow(/ancestor-closure|must also be locked/i);
  });

  it("accepts an R16 lock when its R32 feeders are locked too (DAG closure satisfied)", () => {
    const locks: KnockoutLockedResult[] = [
      { matchNumber: 74, stage: "roundOf32", homeTeamId: "x", awayTeamId: "p", winnerTeamId: "x" },
      { matchNumber: 77, stage: "roundOf32", homeTeamId: "y", awayTeamId: "q", winnerTeamId: "y" },
      { matchNumber: 89, stage: "roundOf16", homeTeamId: "x", awayTeamId: "y", winnerTeamId: "x" },
    ];
    const map = resolveKnockoutLockedResults(locks, g);
    expect(map.size).toBe(3);
    expect(map.get(89)!.winnerTeamId).toBe("x");
  });

  it("accepts non-contiguous siblings (M76 without M74/M75)", () => {
    const map = resolveKnockoutLockedResults(
      [{ matchNumber: 76, stage: "roundOf32", homeTeamId: "a", awayTeamId: "b", winnerTeamId: "a" }],
      g,
    );
    expect(map.size).toBe(1);
  });
});

describe("simulator: empty knockout locks are inert (PR-3D parity)", () => {
  it("omitting vs passing [] lockedKnockoutResults yields identical probabilities", () => {
    const groupLocks = ledgerToLockedResults(ledger073);
    const a = runTournamentSimulation({ seed: 20260611, iterations: 200, lockedResults: groupLocks });
    const b = runTournamentSimulation({
      seed: 20260611, iterations: 200, lockedResults: groupLocks, lockedKnockoutResults: [],
    });
    expect(b.stageProbabilities).toEqual(a.stageProbabilities);
  });

  it("the M72 snapshot regenerates byte-for-byte (group-only path unaffected by the engine change)", () => {
    const m72 = loadForecastResultsLedger(read(join(RESULTS_DIR, LEDGER_072)), fixtures);
    const regenerated = buildLiveAwareForecastSnapshot({
      generatedAt: GENERATED_AT,
      lockedResults: ledgerToLockedResults(m72),
      snapshotType: "post-match",
      asOf: "2026-06-29",
      snapshotId: "snapshot-2026-06-29-after-match-072",
      liveStateSource: m72.sourcePolicy,
      liveStateAsOf: m72.asOf,
      providerCompletedMatchesTotal: m72.providerCompletedMatchesTotal,
      sourceObjectPath: m72.sourceObjectPath,
      latestCompletedSupportedMatchNumber: 72,
    });
    expect(JSON.stringify(regenerated, null, 2)).toBe(read(join(SNAPSHOTS_DIR, SNAPSHOT_072)).trim());
  });
});

describe("simulator: knockout preconditions (fail-closed)", () => {
  it("rejects a knockout lock without a complete group stage", () => {
    expect(() =>
      runTournamentSimulation({
        seed: 20260611,
        iterations: 10,
        lockedResults: [], // no group locks
        lockedKnockoutResults: [
          { matchNumber: 73, stage: "roundOf32", homeTeamId: "south-africa", awayTeamId: "canada", winnerTeamId: "canada" },
        ],
      }),
    ).toThrow(/group-stage matches to be locked|complete group stage/i);
  });
});

describe("M73 acceptance: locking the R32 winner refreshes the forecast", () => {
  it("forces Canada to the Round of 16 (1.0) and eliminates South Africa (R16+ = 0)", () => {
    const canada = prob(snapshot073, "canada");
    const southAfrica = prob(snapshot073, "south-africa");
    expect(canada.roundOf32).toBe(1);
    expect(canada.roundOf16).toBe(1);
    expect(southAfrica.roundOf32).toBe(1); // entered the R32 (completed the group stage)
    expect(southAfrica.roundOf16).toBe(0); // eliminated in M73
    expect(southAfrica.quarterFinal).toBe(0);
    expect(southAfrica.semiFinal).toBe(0);
    expect(southAfrica.final).toBe(0);
    expect(southAfrica.winner).toBe(0);
  });

  it("South Africa keeps its achieved group-stage certainty (qualifyTop2 = 1)", () => {
    expect(prob(snapshot073, "south-africa").qualifyTop2).toBe(1);
  });
});

describe("M73 ledger + snapshot artifacts", () => {
  it("ledger validates, has 73 rows (72 group + 1 knockout), and the M73 knockout row is correct", () => {
    expect(validateResultsLedger(ledger073)).toEqual([]);
    expect(ledger073.results).toHaveLength(73);
    const knockout = ledger073.results.filter(isKnockoutLedgerRow);
    expect(knockout).toHaveLength(1);
    const m73 = knockout[0]!;
    expect(m73).toMatchObject({
      matchNumber: 73,
      stage: "roundOf32",
      homeTeamId: "south-africa",
      awayTeamId: "canada",
      homeGoals: 0,
      awayGoals: 1,
      winnerTeamId: "canada",
      status: "complete",
    });
    expect(m73.penaltiesHome).toBeUndefined();
  });

  it("ledgerToKnockoutLockedResults yields exactly the M73 lock", () => {
    expect(ledgerToKnockoutLockedResults(ledger073)).toEqual([
      { matchNumber: 73, stage: "roundOf32", homeTeamId: "south-africa", awayTeamId: "canada", winnerTeamId: "canada" },
    ]);
  });

  it("snapshot validates; 48 teams; probabilities in [0,1]; manager weight 0; provenance recorded", () => {
    expect(validateForecastSnapshot(snapshot073)).toEqual([]);
    expect(snapshot073.teams).toHaveLength(48);
    for (const t of snapshot073.teams) {
      for (const key of FORECAST_PROBABILITY_KEYS) {
        expect(t[key]).toBeGreaterThanOrEqual(0);
        expect(t[key]).toBeLessThanOrEqual(1);
      }
    }
    const m = snapshot073.meta;
    expect(m.weightsSummary.manager).toBe(0);
    expect(m.snapshotType).toBe("post-match");
    expect(m.completedMatchesLocked).toBe(73);
    expect(m.latestCompletedSupportedMatchNumber).toBe(73);
    expect(m.providerCompletedMatchesTotal).toBe(73);
    expect(m.liveStateSource).toBe("provider-public-delayed");
    expect(m.sourceObjectPath).toBe("live-state.provider.sanitized.json");
  });

  it("leaks no provider/private data in the ledger or snapshot", () => {
    expect(findForbiddenSubstrings(JSON.stringify(ledger073))).toEqual([]);
    expect(findForbiddenSubstrings(JSON.stringify(snapshot073))).toEqual([]);
  });

  it("regenerates the snapshot byte-for-byte from the committed ledger", () => {
    const regenerated = buildLiveAwareForecastSnapshot({
      generatedAt: GENERATED_AT,
      lockedResults: ledgerToLockedResults(ledger073),
      lockedKnockoutResults: ledgerToKnockoutLockedResults(ledger073),
      snapshotType: "post-match",
      asOf: "2026-06-29",
      snapshotId: "snapshot-2026-06-29-after-match-073",
      notes: snapshot073.meta.notes,
      liveStateSource: ledger073.sourcePolicy,
      liveStateAsOf: ledger073.asOf,
      providerCompletedMatchesTotal: ledger073.providerCompletedMatchesTotal,
      sourceObjectPath: ledger073.sourceObjectPath,
      latestCompletedSupportedMatchNumber: 73,
    });
    expect(JSON.stringify(regenerated, null, 2)).toBe(read(join(SNAPSHOTS_DIR, SNAPSHOT_073)).trim());
  });

  it("chains the manifest baseline -> M54 -> M72 -> M73", () => {
    const man = loadForecastManifest(read(join(SNAPSHOTS_DIR, "manifest.json")));
    const entry = man.snapshots.find((s) => s.snapshotId === "snapshot-2026-06-29-after-match-073");
    expect(entry).toBeDefined();
    expect(entry!.isBaseline).toBe(false);
    expect(entry!.completedMatchesLocked).toBe(73);
    expect(entry!.previousSnapshotId).toBe("snapshot-2026-06-29-after-match-072");
  });
});

describe("knockout ledger schema validation (fail-closed)", () => {
  const baseKnockoutRow = (): KnockoutResultLedgerRow => ({
    matchNumber: 73,
    stage: "roundOf32",
    homeTeamId: "south-africa",
    awayTeamId: "canada",
    homeGoals: 0,
    awayGoals: 1,
    status: "complete",
    winnerTeamId: "canada",
  });
  const ledgerWith = (row: unknown): ForecastResultsLedger => ({
    ...ledger073,
    results: [row as KnockoutResultLedgerRow],
  });

  it("accepts a well-formed knockout row", () => {
    expect(validateResultsLedger(ledgerWith(baseKnockoutRow()))).toEqual([]);
  });

  it("rejects a winner that is not a participant", () => {
    const errors = validateResultsLedger(ledgerWith({ ...baseKnockoutRow(), winnerTeamId: "mexico" }));
    expect(errors.join(" ")).toMatch(/winnerTeamId/i);
  });

  it("rejects a knockout matchNumber outside 73..104", () => {
    const errors = validateResultsLedger(ledgerWith({ ...baseKnockoutRow(), matchNumber: 72 }));
    expect(errors.join(" ")).toMatch(/73\.\.104|knockout row/i);
  });

  it("rejects a decisive result whose winner is the lower-scoring side", () => {
    const errors = validateResultsLedger(ledgerWith({ ...baseKnockoutRow(), winnerTeamId: "south-africa" }));
    expect(errors.join(" ")).toMatch(/higher-scoring/i);
  });

  it("rejects a level result with no penalties", () => {
    const errors = validateResultsLedger(
      ledgerWith({ ...baseKnockoutRow(), homeGoals: 1, awayGoals: 1, winnerTeamId: "canada" }),
    );
    expect(errors.join(" ")).toMatch(/penalt/i);
  });

  it("accepts a level result decided by a consistent penalty shootout", () => {
    const errors = validateResultsLedger(
      ledgerWith({
        ...baseKnockoutRow(),
        homeGoals: 1,
        awayGoals: 1,
        winnerTeamId: "canada",
        penaltiesHome: 3,
        penaltiesAway: 5,
      }),
    );
    expect(errors).toEqual([]);
  });

  it("rejects a penalty shootout whose winner disagrees with winnerTeamId", () => {
    const errors = validateResultsLedger(
      ledgerWith({
        ...baseKnockoutRow(),
        homeGoals: 1,
        awayGoals: 1,
        winnerTeamId: "canada",
        penaltiesHome: 5,
        penaltiesAway: 3,
      }),
    );
    expect(errors.join(" ")).toMatch(/penalty-shootout winner/i);
  });

  it("rejects penalties present on a decisive (non-level) result", () => {
    const errors = validateResultsLedger(
      ledgerWith({ ...baseKnockoutRow(), penaltiesHome: 3, penaltiesAway: 4 }),
    );
    expect(errors.join(" ")).toMatch(/penalties must be absent/i);
  });
});

describe("M103 third-place playoff: lockable but no effect on any aggregated stage", () => {
  // The matchNumber-aware decideWinner lets us flip ONLY the third-place outcome
  // and prove the realised bracket (every aggregated array) is byte-identical -
  // i.e. locking M103 to either result never moves a single probability.
  const groupResults = new Map<GroupId, GroupResult>(
    GROUP_LETTERS.map((g) => [g, { winner: `${g}1`, runnerUp: `${g}2`, third: `${g}3` }]),
  );
  const thirdGroups: GroupId[] = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const realise = (decideWinner: (a: string, b: string, mn: number) => string) =>
    realiseOfficialBracket({
      graph: sampleBracket.graph,
      allocation: sampleBracket.thirdPlaceAllocation,
      groupResults,
      thirdGroups,
      decideWinner,
    });

  it("flipping only M103's winner leaves every aggregated stage unchanged", () => {
    const alwaysHome = realise((a) => a);
    const flipM103Only = realise((a, b, mn) => (mn === 103 ? b : a));
    expect(flipM103Only).toEqual(alwaysHome);
  });
});
