import type { CandidateSourceFixture } from "@/lib/types/candidate";
import { candidateGroupFixtures } from "./group-fixtures";
import { MANUAL_CONFLICT_RESOLUTIONS } from "./manual-resolutions";

/**
 * CANDIDATE Excel cross-check source (72) — DERIVED, NOT OFFICIAL.
 *
 * The genuine Excel-derived source values, used by reconcileSources() as the
 * Excel side of the comparison. For fixtures whose conflict was manually
 * resolved in favour of the Telegraph, the candidate value (in group-fixtures.ts)
 * now holds the Telegraph kickoff — so here we restore the ORIGINAL Excel value
 * (from data/candidate/manual-resolutions.ts) so the reconciliation record still
 * shows that Excel conflicted and the Telegraph was selected after manual review.
 */
const excelKickoffByMatch = new Map(
  MANUAL_CONFLICT_RESOLUTIONS.filter((r) => r.field === "kickoff").map(
    (r) => [r.matchNumber, r.excelValue] as const,
  ),
);

export const excelCrossCheckFixtures: CandidateSourceFixture[] = candidateGroupFixtures.map(
  (f) => ({
    group: f.group,
    homeTeamId: f.homeTeamId,
    awayTeamId: f.awayTeamId,
    kickoffUtc: excelKickoffByMatch.get(f.matchNumber) ?? f.kickoffUtc,
    matchNumber: f.matchNumber,
    venueId: f.venueId,
  }),
);
