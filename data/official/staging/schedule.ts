import type {
  OfficialScheduleProvenance,
  StagedDrawPosition,
  StagedOfficialFixture,
} from "@/lib/types";

/**
 * Phase 1.6 - STAGED OFFICIAL group-stage schedule (M1-M72).
 *
 * WARNING: STAGING ONLY - TRANSCRIBED FOR VERIFICATION, NOT YET ACTIVATED.
 *
 * Transcribed from the OFFICIAL FIFA match schedule PDF (see provenance below).
 * This module is intentionally NOT imported by the resolver (`lib/data/source.ts`)
 * or `data/official/index.ts`, so production fixtures stay `position-generated`
 * and no draw slot is written onto a `Team`. Activation (populating
 * `data/official/fixtures.ts` + the 48 verified draw positions) is a separate,
 * explicitly-approved step (see docs/OFFICIAL_SCHEDULE_TRANSCRIPTION_AUDIT.md).
 *
 * The FIFA PDF is OFFICIAL but still labelled "Subject to change"; that status,
 * the version (v17) and date (10 Apr 2026) are kept in provenance and must be
 * surfaced in any future UI. The Telegraph/Excel candidate layer is used ONLY as
 * an independent cross-check (lib/data/validate-official-schedule.ts).
 *
 * All kickoff times are Eastern Time (ET). The 2026 tournament window
 * (11 Jun - 19 Jul) is entirely in EDT (UTC-4), so `kickoffUtc = ET + 4h`.
 */
export const OFFICIAL_SCHEDULE_SOURCE: OfficialScheduleProvenance = {
  sourceName: "FIFA World Cup 2026 Match Schedule",
  sourceFile: "FWC26_Match_Schedule_v17_10042026_EN.pdf",
  version: "v17",
  sourceDate: "2026-04-10",
  timezone: "America/New_York (ET)",
  subjectToChange: true,
  extractionMethod:
    "scripts/extract-official-schedule.py (PDF text layer) + reviewer transcription of date/venue from the wallchart grid; cross-checked against the candidate layer",
  extractedAt: "2026-06-18T00:00:00Z",
  notes:
    "OFFICIAL FIFA source. Still labelled 'Subject to change'. All times Eastern Time (ET); kickoffUtc = ET + 4h (EDT). Staged for verification only - not used in production until activation is approved.",
};

const SRC = "FWC26 Match Schedule v17 (10 Apr 2026), subject to change";

/**
 * Draw positions (A1-L4) SOLVED from the official schedule's directed pairings
 * under FIFA Art. 12.4, anchored by the verified host slots (Mexico A1, Canada
 * B1, USA D1). Unique solution per group (asserted in the validator). Committed
 * for audit/diff; NOT written onto `Team` until activation is approved.
 */
export const stagedDrawPositions: StagedDrawPosition[] = [
  { group: "A", position: 1, teamId: "mexico", slot: "A1" },
  { group: "A", position: 2, teamId: "south-africa", slot: "A2" },
  { group: "A", position: 3, teamId: "south-korea", slot: "A3" },
  { group: "A", position: 4, teamId: "czechia", slot: "A4" },
  { group: "B", position: 1, teamId: "canada", slot: "B1" },
  { group: "B", position: 2, teamId: "bosnia-herzegovina", slot: "B2" },
  { group: "B", position: 3, teamId: "qatar", slot: "B3" },
  { group: "B", position: 4, teamId: "switzerland", slot: "B4" },
  { group: "C", position: 1, teamId: "brazil", slot: "C1" },
  { group: "C", position: 2, teamId: "morocco", slot: "C2" },
  { group: "C", position: 3, teamId: "haiti", slot: "C3" },
  { group: "C", position: 4, teamId: "scotland", slot: "C4" },
  { group: "D", position: 1, teamId: "usa", slot: "D1" },
  { group: "D", position: 2, teamId: "paraguay", slot: "D2" },
  { group: "D", position: 3, teamId: "australia", slot: "D3" },
  { group: "D", position: 4, teamId: "turkiye", slot: "D4" },
  { group: "E", position: 1, teamId: "germany", slot: "E1" },
  { group: "E", position: 2, teamId: "curacao", slot: "E2" },
  { group: "E", position: 3, teamId: "ivory-coast", slot: "E3" },
  { group: "E", position: 4, teamId: "ecuador", slot: "E4" },
  { group: "F", position: 1, teamId: "netherlands", slot: "F1" },
  { group: "F", position: 2, teamId: "japan", slot: "F2" },
  { group: "F", position: 3, teamId: "sweden", slot: "F3" },
  { group: "F", position: 4, teamId: "tunisia", slot: "F4" },
  { group: "G", position: 1, teamId: "belgium", slot: "G1" },
  { group: "G", position: 2, teamId: "egypt", slot: "G2" },
  { group: "G", position: 3, teamId: "iran", slot: "G3" },
  { group: "G", position: 4, teamId: "new-zealand", slot: "G4" },
  { group: "H", position: 1, teamId: "spain", slot: "H1" },
  { group: "H", position: 2, teamId: "cape-verde", slot: "H2" },
  { group: "H", position: 3, teamId: "saudi-arabia", slot: "H3" },
  { group: "H", position: 4, teamId: "uruguay", slot: "H4" },
  { group: "I", position: 1, teamId: "france", slot: "I1" },
  { group: "I", position: 2, teamId: "senegal", slot: "I2" },
  { group: "I", position: 3, teamId: "iraq", slot: "I3" },
  { group: "I", position: 4, teamId: "norway", slot: "I4" },
  { group: "J", position: 1, teamId: "argentina", slot: "J1" },
  { group: "J", position: 2, teamId: "algeria", slot: "J2" },
  { group: "J", position: 3, teamId: "austria", slot: "J3" },
  { group: "J", position: 4, teamId: "jordan", slot: "J4" },
  { group: "K", position: 1, teamId: "portugal", slot: "K1" },
  { group: "K", position: 2, teamId: "congo-dr", slot: "K2" },
  { group: "K", position: 3, teamId: "uzbekistan", slot: "K3" },
  { group: "K", position: 4, teamId: "colombia", slot: "K4" },
  { group: "L", position: 1, teamId: "england", slot: "L1" },
  { group: "L", position: 2, teamId: "croatia", slot: "L2" },
  { group: "L", position: 3, teamId: "ghana", slot: "L3" },
  { group: "L", position: 4, teamId: "panama", slot: "L4" },
];

/**
 * The 72 staged group-stage fixtures, in match-number order. Home/away order,
 * group, match number and ET kickoff are transcribed from the official PDF;
 * draw positions are the solved Art. 12.4 positions; kickoffUtc = ET + 4h.
 */
export const stagedOfficialSchedule: StagedOfficialFixture[] = [
  { matchNumber: 1, group: "A", matchday: 1, homeTeamId: "mexico", awayTeamId: "south-africa", homePosition: 1, awayPosition: 2, venueId: "mexico-city", venueLabelRaw: "MEXICO CITY", kickoffLocalSourceTime: "2026-06-11 15:00 ET", kickoffUtc: "2026-06-11T19:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 2, group: "A", matchday: 1, homeTeamId: "south-korea", awayTeamId: "czechia", homePosition: 3, awayPosition: 4, venueId: "guadalajara", venueLabelRaw: "GUADALAJARA", kickoffLocalSourceTime: "2026-06-11 22:00 ET", kickoffUtc: "2026-06-12T02:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 3, group: "B", matchday: 1, homeTeamId: "canada", awayTeamId: "bosnia-herzegovina", homePosition: 1, awayPosition: 2, venueId: "toronto", venueLabelRaw: "TORONTO", kickoffLocalSourceTime: "2026-06-12 15:00 ET", kickoffUtc: "2026-06-12T19:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 4, group: "D", matchday: 1, homeTeamId: "usa", awayTeamId: "paraguay", homePosition: 1, awayPosition: 2, venueId: "los-angeles", venueLabelRaw: "LOS ANGELES", kickoffLocalSourceTime: "2026-06-12 21:00 ET", kickoffUtc: "2026-06-13T01:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 5, group: "C", matchday: 1, homeTeamId: "haiti", awayTeamId: "scotland", homePosition: 3, awayPosition: 4, venueId: "boston", venueLabelRaw: "BOSTON", kickoffLocalSourceTime: "2026-06-13 21:00 ET", kickoffUtc: "2026-06-14T01:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 6, group: "D", matchday: 1, homeTeamId: "australia", awayTeamId: "turkiye", homePosition: 3, awayPosition: 4, venueId: "vancouver", venueLabelRaw: "VANCOUVER", kickoffLocalSourceTime: "2026-06-14 00:00 ET", kickoffUtc: "2026-06-14T04:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 7, group: "C", matchday: 1, homeTeamId: "brazil", awayTeamId: "morocco", homePosition: 1, awayPosition: 2, venueId: "new-york", venueLabelRaw: "NEW YORK NEW JERSEY", kickoffLocalSourceTime: "2026-06-13 18:00 ET", kickoffUtc: "2026-06-13T22:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 8, group: "B", matchday: 1, homeTeamId: "qatar", awayTeamId: "switzerland", homePosition: 3, awayPosition: 4, venueId: "san-francisco", venueLabelRaw: "SAN FRANCISCO BAY AREA", kickoffLocalSourceTime: "2026-06-13 15:00 ET", kickoffUtc: "2026-06-13T19:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 9, group: "E", matchday: 1, homeTeamId: "ivory-coast", awayTeamId: "ecuador", homePosition: 3, awayPosition: 4, venueId: "philadelphia", venueLabelRaw: "PHILADELPHIA", kickoffLocalSourceTime: "2026-06-14 19:00 ET", kickoffUtc: "2026-06-14T23:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 10, group: "E", matchday: 1, homeTeamId: "germany", awayTeamId: "curacao", homePosition: 1, awayPosition: 2, venueId: "houston", venueLabelRaw: "HOUSTON", kickoffLocalSourceTime: "2026-06-14 13:00 ET", kickoffUtc: "2026-06-14T17:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 11, group: "F", matchday: 1, homeTeamId: "netherlands", awayTeamId: "japan", homePosition: 1, awayPosition: 2, venueId: "dallas", venueLabelRaw: "DALLAS", kickoffLocalSourceTime: "2026-06-14 16:00 ET", kickoffUtc: "2026-06-14T20:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 12, group: "F", matchday: 1, homeTeamId: "sweden", awayTeamId: "tunisia", homePosition: 3, awayPosition: 4, venueId: "monterrey", venueLabelRaw: "MONTERREY", kickoffLocalSourceTime: "2026-06-14 22:00 ET", kickoffUtc: "2026-06-15T02:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 13, group: "H", matchday: 1, homeTeamId: "saudi-arabia", awayTeamId: "uruguay", homePosition: 3, awayPosition: 4, venueId: "miami", venueLabelRaw: "MIAMI", kickoffLocalSourceTime: "2026-06-15 18:00 ET", kickoffUtc: "2026-06-15T22:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 14, group: "H", matchday: 1, homeTeamId: "spain", awayTeamId: "cape-verde", homePosition: 1, awayPosition: 2, venueId: "atlanta", venueLabelRaw: "ATLANTA", kickoffLocalSourceTime: "2026-06-15 12:00 ET", kickoffUtc: "2026-06-15T16:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 15, group: "G", matchday: 1, homeTeamId: "iran", awayTeamId: "new-zealand", homePosition: 3, awayPosition: 4, venueId: "los-angeles", venueLabelRaw: "LOS ANGELES", kickoffLocalSourceTime: "2026-06-15 21:00 ET", kickoffUtc: "2026-06-16T01:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 16, group: "G", matchday: 1, homeTeamId: "belgium", awayTeamId: "egypt", homePosition: 1, awayPosition: 2, venueId: "seattle", venueLabelRaw: "SEATTLE", kickoffLocalSourceTime: "2026-06-15 15:00 ET", kickoffUtc: "2026-06-15T19:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 17, group: "I", matchday: 1, homeTeamId: "france", awayTeamId: "senegal", homePosition: 1, awayPosition: 2, venueId: "new-york", venueLabelRaw: "NEW YORK NEW JERSEY", kickoffLocalSourceTime: "2026-06-16 15:00 ET", kickoffUtc: "2026-06-16T19:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 18, group: "I", matchday: 1, homeTeamId: "iraq", awayTeamId: "norway", homePosition: 3, awayPosition: 4, venueId: "boston", venueLabelRaw: "BOSTON", kickoffLocalSourceTime: "2026-06-16 18:00 ET", kickoffUtc: "2026-06-16T22:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 19, group: "J", matchday: 1, homeTeamId: "argentina", awayTeamId: "algeria", homePosition: 1, awayPosition: 2, venueId: "kansas-city", venueLabelRaw: "KANSAS CITY", kickoffLocalSourceTime: "2026-06-16 21:00 ET", kickoffUtc: "2026-06-17T01:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 20, group: "J", matchday: 1, homeTeamId: "austria", awayTeamId: "jordan", homePosition: 3, awayPosition: 4, venueId: "san-francisco", venueLabelRaw: "SAN FRANCISCO BAY AREA", kickoffLocalSourceTime: "2026-06-17 00:00 ET", kickoffUtc: "2026-06-17T04:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 21, group: "L", matchday: 1, homeTeamId: "ghana", awayTeamId: "panama", homePosition: 3, awayPosition: 4, venueId: "toronto", venueLabelRaw: "TORONTO", kickoffLocalSourceTime: "2026-06-17 19:00 ET", kickoffUtc: "2026-06-17T23:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 22, group: "L", matchday: 1, homeTeamId: "england", awayTeamId: "croatia", homePosition: 1, awayPosition: 2, venueId: "dallas", venueLabelRaw: "DALLAS", kickoffLocalSourceTime: "2026-06-17 16:00 ET", kickoffUtc: "2026-06-17T20:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 23, group: "K", matchday: 1, homeTeamId: "portugal", awayTeamId: "congo-dr", homePosition: 1, awayPosition: 2, venueId: "houston", venueLabelRaw: "HOUSTON", kickoffLocalSourceTime: "2026-06-17 13:00 ET", kickoffUtc: "2026-06-17T17:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 24, group: "K", matchday: 1, homeTeamId: "uzbekistan", awayTeamId: "colombia", homePosition: 3, awayPosition: 4, venueId: "mexico-city", venueLabelRaw: "MEXICO CITY", kickoffLocalSourceTime: "2026-06-17 22:00 ET", kickoffUtc: "2026-06-18T02:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 25, group: "A", matchday: 2, homeTeamId: "czechia", awayTeamId: "south-africa", homePosition: 4, awayPosition: 2, venueId: "atlanta", venueLabelRaw: "ATLANTA", kickoffLocalSourceTime: "2026-06-18 12:00 ET", kickoffUtc: "2026-06-18T16:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 26, group: "B", matchday: 2, homeTeamId: "switzerland", awayTeamId: "bosnia-herzegovina", homePosition: 4, awayPosition: 2, venueId: "los-angeles", venueLabelRaw: "LOS ANGELES", kickoffLocalSourceTime: "2026-06-18 15:00 ET", kickoffUtc: "2026-06-18T19:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 27, group: "B", matchday: 2, homeTeamId: "canada", awayTeamId: "qatar", homePosition: 1, awayPosition: 3, venueId: "vancouver", venueLabelRaw: "VANCOUVER", kickoffLocalSourceTime: "2026-06-18 18:00 ET", kickoffUtc: "2026-06-18T22:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 28, group: "A", matchday: 2, homeTeamId: "mexico", awayTeamId: "south-korea", homePosition: 1, awayPosition: 3, venueId: "guadalajara", venueLabelRaw: "GUADALAJARA", kickoffLocalSourceTime: "2026-06-18 21:00 ET", kickoffUtc: "2026-06-19T01:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 29, group: "C", matchday: 2, homeTeamId: "brazil", awayTeamId: "haiti", homePosition: 1, awayPosition: 3, venueId: "philadelphia", venueLabelRaw: "PHILADELPHIA", kickoffLocalSourceTime: "2026-06-19 20:30 ET", kickoffUtc: "2026-06-20T00:30:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 30, group: "C", matchday: 2, homeTeamId: "scotland", awayTeamId: "morocco", homePosition: 4, awayPosition: 2, venueId: "boston", venueLabelRaw: "BOSTON", kickoffLocalSourceTime: "2026-06-19 18:00 ET", kickoffUtc: "2026-06-19T22:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 31, group: "D", matchday: 2, homeTeamId: "turkiye", awayTeamId: "paraguay", homePosition: 4, awayPosition: 2, venueId: "san-francisco", venueLabelRaw: "SAN FRANCISCO BAY AREA", kickoffLocalSourceTime: "2026-06-19 23:00 ET", kickoffUtc: "2026-06-20T03:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 32, group: "D", matchday: 2, homeTeamId: "usa", awayTeamId: "australia", homePosition: 1, awayPosition: 3, venueId: "seattle", venueLabelRaw: "SEATTLE", kickoffLocalSourceTime: "2026-06-19 15:00 ET", kickoffUtc: "2026-06-19T19:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 33, group: "E", matchday: 2, homeTeamId: "germany", awayTeamId: "ivory-coast", homePosition: 1, awayPosition: 3, venueId: "toronto", venueLabelRaw: "TORONTO", kickoffLocalSourceTime: "2026-06-20 16:00 ET", kickoffUtc: "2026-06-20T20:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 34, group: "E", matchday: 2, homeTeamId: "ecuador", awayTeamId: "curacao", homePosition: 4, awayPosition: 2, venueId: "kansas-city", venueLabelRaw: "KANSAS CITY", kickoffLocalSourceTime: "2026-06-20 20:00 ET", kickoffUtc: "2026-06-21T00:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 35, group: "F", matchday: 2, homeTeamId: "netherlands", awayTeamId: "sweden", homePosition: 1, awayPosition: 3, venueId: "houston", venueLabelRaw: "HOUSTON", kickoffLocalSourceTime: "2026-06-20 13:00 ET", kickoffUtc: "2026-06-20T17:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 36, group: "F", matchday: 2, homeTeamId: "tunisia", awayTeamId: "japan", homePosition: 4, awayPosition: 2, venueId: "monterrey", venueLabelRaw: "MONTERREY", kickoffLocalSourceTime: "2026-06-21 00:00 ET", kickoffUtc: "2026-06-21T04:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 37, group: "H", matchday: 2, homeTeamId: "uruguay", awayTeamId: "cape-verde", homePosition: 4, awayPosition: 2, venueId: "miami", venueLabelRaw: "MIAMI", kickoffLocalSourceTime: "2026-06-21 18:00 ET", kickoffUtc: "2026-06-21T22:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 38, group: "H", matchday: 2, homeTeamId: "spain", awayTeamId: "saudi-arabia", homePosition: 1, awayPosition: 3, venueId: "atlanta", venueLabelRaw: "ATLANTA", kickoffLocalSourceTime: "2026-06-21 12:00 ET", kickoffUtc: "2026-06-21T16:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 39, group: "G", matchday: 2, homeTeamId: "belgium", awayTeamId: "iran", homePosition: 1, awayPosition: 3, venueId: "los-angeles", venueLabelRaw: "LOS ANGELES", kickoffLocalSourceTime: "2026-06-21 15:00 ET", kickoffUtc: "2026-06-21T19:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 40, group: "G", matchday: 2, homeTeamId: "new-zealand", awayTeamId: "egypt", homePosition: 4, awayPosition: 2, venueId: "vancouver", venueLabelRaw: "VANCOUVER", kickoffLocalSourceTime: "2026-06-21 21:00 ET", kickoffUtc: "2026-06-22T01:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 41, group: "I", matchday: 2, homeTeamId: "norway", awayTeamId: "senegal", homePosition: 4, awayPosition: 2, venueId: "new-york", venueLabelRaw: "NEW YORK NEW JERSEY", kickoffLocalSourceTime: "2026-06-22 20:00 ET", kickoffUtc: "2026-06-23T00:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 42, group: "I", matchday: 2, homeTeamId: "france", awayTeamId: "iraq", homePosition: 1, awayPosition: 3, venueId: "philadelphia", venueLabelRaw: "PHILADELPHIA", kickoffLocalSourceTime: "2026-06-22 17:00 ET", kickoffUtc: "2026-06-22T21:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 43, group: "J", matchday: 2, homeTeamId: "argentina", awayTeamId: "austria", homePosition: 1, awayPosition: 3, venueId: "dallas", venueLabelRaw: "DALLAS", kickoffLocalSourceTime: "2026-06-22 13:00 ET", kickoffUtc: "2026-06-22T17:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 44, group: "J", matchday: 2, homeTeamId: "jordan", awayTeamId: "algeria", homePosition: 4, awayPosition: 2, venueId: "san-francisco", venueLabelRaw: "SAN FRANCISCO BAY AREA", kickoffLocalSourceTime: "2026-06-22 23:00 ET", kickoffUtc: "2026-06-23T03:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 45, group: "L", matchday: 2, homeTeamId: "england", awayTeamId: "ghana", homePosition: 1, awayPosition: 3, venueId: "boston", venueLabelRaw: "BOSTON", kickoffLocalSourceTime: "2026-06-23 16:00 ET", kickoffUtc: "2026-06-23T20:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 46, group: "L", matchday: 2, homeTeamId: "panama", awayTeamId: "croatia", homePosition: 4, awayPosition: 2, venueId: "toronto", venueLabelRaw: "TORONTO", kickoffLocalSourceTime: "2026-06-23 19:00 ET", kickoffUtc: "2026-06-23T23:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 47, group: "K", matchday: 2, homeTeamId: "portugal", awayTeamId: "uzbekistan", homePosition: 1, awayPosition: 3, venueId: "houston", venueLabelRaw: "HOUSTON", kickoffLocalSourceTime: "2026-06-23 13:00 ET", kickoffUtc: "2026-06-23T17:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 48, group: "K", matchday: 2, homeTeamId: "colombia", awayTeamId: "congo-dr", homePosition: 4, awayPosition: 2, venueId: "guadalajara", venueLabelRaw: "GUADALAJARA", kickoffLocalSourceTime: "2026-06-23 22:00 ET", kickoffUtc: "2026-06-24T02:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 49, group: "C", matchday: 3, homeTeamId: "scotland", awayTeamId: "brazil", homePosition: 4, awayPosition: 1, venueId: "miami", venueLabelRaw: "MIAMI", kickoffLocalSourceTime: "2026-06-24 18:00 ET", kickoffUtc: "2026-06-24T22:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 50, group: "C", matchday: 3, homeTeamId: "morocco", awayTeamId: "haiti", homePosition: 2, awayPosition: 3, venueId: "atlanta", venueLabelRaw: "ATLANTA", kickoffLocalSourceTime: "2026-06-24 18:00 ET", kickoffUtc: "2026-06-24T22:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 51, group: "B", matchday: 3, homeTeamId: "switzerland", awayTeamId: "canada", homePosition: 4, awayPosition: 1, venueId: "vancouver", venueLabelRaw: "VANCOUVER", kickoffLocalSourceTime: "2026-06-24 15:00 ET", kickoffUtc: "2026-06-24T19:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 52, group: "B", matchday: 3, homeTeamId: "bosnia-herzegovina", awayTeamId: "qatar", homePosition: 2, awayPosition: 3, venueId: "seattle", venueLabelRaw: "SEATTLE", kickoffLocalSourceTime: "2026-06-24 15:00 ET", kickoffUtc: "2026-06-24T19:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 53, group: "A", matchday: 3, homeTeamId: "czechia", awayTeamId: "mexico", homePosition: 4, awayPosition: 1, venueId: "mexico-city", venueLabelRaw: "MEXICO CITY", kickoffLocalSourceTime: "2026-06-24 21:00 ET", kickoffUtc: "2026-06-25T01:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 54, group: "A", matchday: 3, homeTeamId: "south-africa", awayTeamId: "south-korea", homePosition: 2, awayPosition: 3, venueId: "monterrey", venueLabelRaw: "MONTERREY", kickoffLocalSourceTime: "2026-06-24 21:00 ET", kickoffUtc: "2026-06-25T01:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 55, group: "E", matchday: 3, homeTeamId: "curacao", awayTeamId: "ivory-coast", homePosition: 2, awayPosition: 3, venueId: "philadelphia", venueLabelRaw: "PHILADELPHIA", kickoffLocalSourceTime: "2026-06-25 16:00 ET", kickoffUtc: "2026-06-25T20:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 56, group: "E", matchday: 3, homeTeamId: "ecuador", awayTeamId: "germany", homePosition: 4, awayPosition: 1, venueId: "new-york", venueLabelRaw: "NEW YORK NEW JERSEY", kickoffLocalSourceTime: "2026-06-25 16:00 ET", kickoffUtc: "2026-06-25T20:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 57, group: "F", matchday: 3, homeTeamId: "japan", awayTeamId: "sweden", homePosition: 2, awayPosition: 3, venueId: "dallas", venueLabelRaw: "DALLAS", kickoffLocalSourceTime: "2026-06-25 19:00 ET", kickoffUtc: "2026-06-25T23:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 58, group: "F", matchday: 3, homeTeamId: "tunisia", awayTeamId: "netherlands", homePosition: 4, awayPosition: 1, venueId: "kansas-city", venueLabelRaw: "KANSAS CITY", kickoffLocalSourceTime: "2026-06-25 19:00 ET", kickoffUtc: "2026-06-25T23:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 59, group: "D", matchday: 3, homeTeamId: "turkiye", awayTeamId: "usa", homePosition: 4, awayPosition: 1, venueId: "los-angeles", venueLabelRaw: "LOS ANGELES", kickoffLocalSourceTime: "2026-06-25 22:00 ET", kickoffUtc: "2026-06-26T02:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 60, group: "D", matchday: 3, homeTeamId: "paraguay", awayTeamId: "australia", homePosition: 2, awayPosition: 3, venueId: "san-francisco", venueLabelRaw: "SAN FRANCISCO BAY AREA", kickoffLocalSourceTime: "2026-06-25 22:00 ET", kickoffUtc: "2026-06-26T02:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 61, group: "I", matchday: 3, homeTeamId: "norway", awayTeamId: "france", homePosition: 4, awayPosition: 1, venueId: "boston", venueLabelRaw: "BOSTON", kickoffLocalSourceTime: "2026-06-26 15:00 ET", kickoffUtc: "2026-06-26T19:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 62, group: "I", matchday: 3, homeTeamId: "senegal", awayTeamId: "iraq", homePosition: 2, awayPosition: 3, venueId: "toronto", venueLabelRaw: "TORONTO", kickoffLocalSourceTime: "2026-06-26 15:00 ET", kickoffUtc: "2026-06-26T19:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 63, group: "G", matchday: 3, homeTeamId: "egypt", awayTeamId: "iran", homePosition: 2, awayPosition: 3, venueId: "seattle", venueLabelRaw: "SEATTLE", kickoffLocalSourceTime: "2026-06-26 23:00 ET", kickoffUtc: "2026-06-27T03:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 64, group: "G", matchday: 3, homeTeamId: "new-zealand", awayTeamId: "belgium", homePosition: 4, awayPosition: 1, venueId: "vancouver", venueLabelRaw: "VANCOUVER", kickoffLocalSourceTime: "2026-06-26 23:00 ET", kickoffUtc: "2026-06-27T03:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 65, group: "H", matchday: 3, homeTeamId: "cape-verde", awayTeamId: "saudi-arabia", homePosition: 2, awayPosition: 3, venueId: "houston", venueLabelRaw: "HOUSTON", kickoffLocalSourceTime: "2026-06-26 20:00 ET", kickoffUtc: "2026-06-27T00:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 66, group: "H", matchday: 3, homeTeamId: "uruguay", awayTeamId: "spain", homePosition: 4, awayPosition: 1, venueId: "guadalajara", venueLabelRaw: "GUADALAJARA", kickoffLocalSourceTime: "2026-06-26 20:00 ET", kickoffUtc: "2026-06-27T00:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 67, group: "L", matchday: 3, homeTeamId: "panama", awayTeamId: "england", homePosition: 4, awayPosition: 1, venueId: "new-york", venueLabelRaw: "NEW YORK NEW JERSEY", kickoffLocalSourceTime: "2026-06-27 17:00 ET", kickoffUtc: "2026-06-27T21:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 68, group: "L", matchday: 3, homeTeamId: "croatia", awayTeamId: "ghana", homePosition: 2, awayPosition: 3, venueId: "philadelphia", venueLabelRaw: "PHILADELPHIA", kickoffLocalSourceTime: "2026-06-27 17:00 ET", kickoffUtc: "2026-06-27T21:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 69, group: "J", matchday: 3, homeTeamId: "algeria", awayTeamId: "austria", homePosition: 2, awayPosition: 3, venueId: "kansas-city", venueLabelRaw: "KANSAS CITY", kickoffLocalSourceTime: "2026-06-27 22:00 ET", kickoffUtc: "2026-06-28T02:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 70, group: "J", matchday: 3, homeTeamId: "jordan", awayTeamId: "argentina", homePosition: 4, awayPosition: 1, venueId: "dallas", venueLabelRaw: "DALLAS", kickoffLocalSourceTime: "2026-06-27 22:00 ET", kickoffUtc: "2026-06-28T02:00:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 71, group: "K", matchday: 3, homeTeamId: "colombia", awayTeamId: "portugal", homePosition: 4, awayPosition: 1, venueId: "miami", venueLabelRaw: "MIAMI", kickoffLocalSourceTime: "2026-06-27 19:30 ET", kickoffUtc: "2026-06-27T23:30:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
  { matchNumber: 72, group: "K", matchday: 3, homeTeamId: "congo-dr", awayTeamId: "uzbekistan", homePosition: 2, awayPosition: 3, venueId: "atlanta", venueLabelRaw: "ATLANTA", kickoffLocalSourceTime: "2026-06-27 19:30 ET", kickoffUtc: "2026-06-27T23:30:00Z", status: "scheduled", subjectToChange: true, sourceRef: SRC },
];
