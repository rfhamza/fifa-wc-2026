/**
 * Post-tournament retrospective (PR B) - actual outcomes.
 * ------------------------------------------------------
 * Derives WHAT ACTUALLY HAPPENED from the validated retrospective results ledger, using
 * INTERNAL BeyondVAR logic only: Article 13 group standings (`computeGroupStandings` /
 * `rankThirdPlacedTeams`) and the official knockout graph. The provider's own standings
 * and bracket projections are deliberately not inputs here - they were never committed as
 * artifacts, so they cannot become the source of truth by accident.
 *
 * PURE: no I/O, no fetch, no Blob, no provider access, no simulation, no model call.
 * Reads the ledger it is handed and nothing else.
 */
import { isKnockoutLedgerRow, type ForecastResultsLedger, type KnockoutResultLedgerRow, type ResultLedgerRow } from "@/lib/model/forecast-results-ledger";
import { computeGroupStandings, rankThirdPlacedTeams } from "@/lib/simulation/standings";
import type { GroupId, GroupStanding, KnockoutStage } from "@/lib/types";

/** Stage ladder, shallow -> deep. `champion` is a terminal marker, not a played round. */
export const STAGE_LADDER = [
  "groupStage",
  "roundOf32",
  "roundOf16",
  "quarterFinal",
  "semiFinal",
  "final",
  "champion",
] as const;
export type ReachedStage = (typeof STAGE_LADDER)[number];

/** Public-facing stage label (never an internal id like `roundOf16`). */
export const STAGE_LABELS: Readonly<Record<ReachedStage, string>> = {
  groupStage: "Group stage",
  roundOf32: "Round of 32",
  roundOf16: "Round of 16",
  quarterFinal: "Quarterfinal",
  semiFinal: "Semifinal",
  final: "Final",
  champion: "Champion",
};

/** Stage depth as an ordinal, for surprise arithmetic (group stage = 0). */
export function stageDepth(stage: ReachedStage): number {
  return STAGE_LADDER.indexOf(stage);
}

export interface TeamMetaLite {
  teamId: string;
  fifaRanking: number;
  conductScore?: number;
}

export interface GroupOutcome {
  group: GroupId;
  table: GroupStanding[];
  winner: string;
  runnerUp: string;
  thirdPlaced: string;
  fourthPlaced: string;
  /** Top two, in finishing order. */
  topTwo: string[];
}

export interface ActualOutcomes {
  /** Article 13 tables, keyed by group id. */
  groups: GroupOutcome[];
  groupWinners: string[];
  topTwoQualifiers: string[];
  /** All twelve third-placed teams, in Annexe C ranking order (best first). */
  thirdPlacedRanked: string[];
  /** The eight third-placed teams that advanced. */
  thirdPlaceQualifiers: string[];
  /** The four third-placed teams that did not advance. */
  thirdPlaceEliminated: string[];
  /** All 32 teams that reached the Round of 32. */
  qualifiers: string[];
  /** The 16 teams eliminated in the group stage. */
  eliminatedInGroup: string[];
  /** Deepest stage reached, per team id. */
  deepestStage: Map<string, ReachedStage>;
  /** Teams reaching each knockout stage (participants of that round). */
  reachedByStage: Map<ReachedStage, string[]>;
  knockoutWinners: Map<number, string>;
  quarterFinalists: string[];
  semiFinalists: string[];
  finalists: string[];
  champion: string;
  runnerUp: string;
  thirdPlaceMatchWinner: string | null;
}

/** Knockout stage -> the ladder rung a participant of that round has reached. */
const KNOCKOUT_STAGE_TO_REACHED: Readonly<Record<string, ReachedStage>> = {
  roundOf32: "roundOf32",
  roundOf16: "roundOf16",
  quarterFinal: "quarterFinal",
  semiFinal: "semiFinal",
  final: "final",
};

function loserOf(row: KnockoutResultLedgerRow): string {
  return row.winnerTeamId === row.homeTeamId ? row.awayTeamId : row.homeTeamId;
}

/**
 * Derive every actual tournament outcome from the ledger. `teamMeta` supplies the FIFA
 * ranking / conduct tiebreakers Article 13 needs; omit it only in synthetic tests where
 * no tiebreak is required.
 */
export function deriveActualOutcomes(
  ledger: ForecastResultsLedger,
  teamMeta: TeamMetaLite[] = [],
): ActualOutcomes {
  const rows = ledger.results;
  const meta = teamMeta.map((m) => ({
    teamId: m.teamId,
    fifaRanking: m.fifaRanking,
    conductScore: m.conductScore ?? 0,
  }));

  // --- Group stage (Article 13, internal) ---------------------------------------
  const groupRows = rows.filter((r): r is ResultLedgerRow & { group: GroupId } => r.stage === "group");
  const groupIds = [...new Set(groupRows.map((r) => r.group))].sort() as GroupId[];
  const groups: GroupOutcome[] = groupIds.map((g) => {
    const inGroup = groupRows.filter((r) => r.group === g);
    const teamIds = [...new Set(inGroup.flatMap((r) => [r.homeTeamId, r.awayTeamId]))];
    const table = computeGroupStandings(g, teamIds, inGroup, meta);
    return {
      group: g,
      table,
      winner: table[0]!.teamId,
      runnerUp: table[1]!.teamId,
      thirdPlaced: table[2]!.teamId,
      fourthPlaced: table[3]!.teamId,
      topTwo: [table[0]!.teamId, table[1]!.teamId],
    };
  });

  const groupWinners = groups.map((g) => g.winner);
  const topTwoQualifiers = groups.flatMap((g) => g.topTwo);
  const thirdStandings = groups.map((g) => g.table[2]!);
  const thirdPlacedRanked = rankThirdPlacedTeams(thirdStandings, meta).map((s) => s.teamId);

  // --- Knockout (official graph + ledger winners) --------------------------------
  const knockoutRows = rows.filter(isKnockoutLedgerRow);
  const knockoutWinners = new Map<number, string>(knockoutRows.map((r) => [r.matchNumber, r.winnerTeamId]));

  const reachedByStage = new Map<ReachedStage, string[]>();
  for (const row of knockoutRows) {
    const reached = KNOCKOUT_STAGE_TO_REACHED[row.stage as KnockoutStage];
    if (!reached) continue; // thirdPlace is a placement match, not a ladder rung
    const list = reachedByStage.get(reached) ?? [];
    list.push(row.homeTeamId, row.awayTeamId);
    reachedByStage.set(reached, list);
  }
  for (const [k, v] of reachedByStage) reachedByStage.set(k, [...new Set(v)].sort());

  // Round-of-32 participation IS the qualification set - derived from played matches,
  // never from the provider's qualificationState flags.
  const qualifiers = reachedByStage.get("roundOf32") ?? [];
  const qualifierSet = new Set(qualifiers);
  const thirdPlaceQualifiers = thirdPlacedRanked.filter((t) => qualifierSet.has(t));
  const thirdPlaceEliminated = thirdPlacedRanked.filter((t) => !qualifierSet.has(t));
  const allTeams = [...new Set(groupRows.flatMap((r) => [r.homeTeamId, r.awayTeamId]))];
  const eliminatedInGroup = allTeams.filter((t) => !qualifierSet.has(t)).sort();

  const finalRow = knockoutRows.find((r) => r.stage === "final");
  if (!finalRow) throw new Error("deriveActualOutcomes: ledger has no final (M104) row");
  const champion = finalRow.winnerTeamId;
  const runnerUp = loserOf(finalRow);
  const thirdPlaceRow = knockoutRows.find((r) => r.stage === "thirdPlace");

  // Deepest stage per team: start everyone at the group stage, then promote.
  const deepestStage = new Map<string, ReachedStage>(allTeams.map((t) => [t, "groupStage" as ReachedStage]));
  for (const [stage, teamsAtStage] of reachedByStage) {
    for (const t of teamsAtStage) {
      const cur = deepestStage.get(t) ?? "groupStage";
      if (stageDepth(stage) > stageDepth(cur)) deepestStage.set(t, stage);
    }
  }
  deepestStage.set(champion, "champion");

  return {
    groups,
    groupWinners,
    topTwoQualifiers,
    thirdPlacedRanked,
    thirdPlaceQualifiers,
    thirdPlaceEliminated,
    qualifiers: [...qualifiers].sort(),
    eliminatedInGroup,
    deepestStage,
    reachedByStage,
    knockoutWinners,
    quarterFinalists: reachedByStage.get("quarterFinal") ?? [],
    semiFinalists: reachedByStage.get("semiFinal") ?? [],
    finalists: reachedByStage.get("final") ?? [],
    champion,
    runnerUp,
    thirdPlaceMatchWinner: thirdPlaceRow?.winnerTeamId ?? null,
  };
}
