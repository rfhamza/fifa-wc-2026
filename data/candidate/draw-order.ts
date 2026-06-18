import type { CandidateDrawOrder } from "@/lib/types/candidate";
import { EXCEL_SOURCE, TELEGRAPH_SOURCE } from "./schedule-sources";

/**
 * CANDIDATE intra-group draw order (positions 1..4) — DERIVED, NOT OFFICIAL.
 *
 * Solved from the Article 12.4 pairing chart implied by the Excel match list
 * (scripts/extract-candidate-schedule.py) and independently confirmed by the
 * Telegraph wallchart's group listings (both agree, so `agreement: "matches"`).
 * The three co-host slots match the regulation-fixed slots (Mexico A1, Canada
 * B1, USA D1). This is NOT written back onto any `Team` — see the isolation note
 * in lib/types/candidate.ts.
 */
export const candidateDrawOrder: CandidateDrawOrder[] = [
  { group: "A", slots: [{ position: 1, teamId: "mexico", candidateDrawSlot: "A1" }, { position: 2, teamId: "south-africa", candidateDrawSlot: "A2" }, { position: 3, teamId: "south-korea", candidateDrawSlot: "A3" }, { position: 4, teamId: "czechia", candidateDrawSlot: "A4" }], agreement: "matches", provenance: [EXCEL_SOURCE, TELEGRAPH_SOURCE] },
  { group: "B", slots: [{ position: 1, teamId: "canada", candidateDrawSlot: "B1" }, { position: 2, teamId: "bosnia-herzegovina", candidateDrawSlot: "B2" }, { position: 3, teamId: "qatar", candidateDrawSlot: "B3" }, { position: 4, teamId: "switzerland", candidateDrawSlot: "B4" }], agreement: "matches", provenance: [EXCEL_SOURCE, TELEGRAPH_SOURCE] },
  { group: "C", slots: [{ position: 1, teamId: "brazil", candidateDrawSlot: "C1" }, { position: 2, teamId: "morocco", candidateDrawSlot: "C2" }, { position: 3, teamId: "haiti", candidateDrawSlot: "C3" }, { position: 4, teamId: "scotland", candidateDrawSlot: "C4" }], agreement: "matches", provenance: [EXCEL_SOURCE, TELEGRAPH_SOURCE] },
  { group: "D", slots: [{ position: 1, teamId: "usa", candidateDrawSlot: "D1" }, { position: 2, teamId: "paraguay", candidateDrawSlot: "D2" }, { position: 3, teamId: "australia", candidateDrawSlot: "D3" }, { position: 4, teamId: "turkiye", candidateDrawSlot: "D4" }], agreement: "matches", provenance: [EXCEL_SOURCE, TELEGRAPH_SOURCE] },
  { group: "E", slots: [{ position: 1, teamId: "germany", candidateDrawSlot: "E1" }, { position: 2, teamId: "curacao", candidateDrawSlot: "E2" }, { position: 3, teamId: "ivory-coast", candidateDrawSlot: "E3" }, { position: 4, teamId: "ecuador", candidateDrawSlot: "E4" }], agreement: "matches", provenance: [EXCEL_SOURCE, TELEGRAPH_SOURCE] },
  { group: "F", slots: [{ position: 1, teamId: "netherlands", candidateDrawSlot: "F1" }, { position: 2, teamId: "japan", candidateDrawSlot: "F2" }, { position: 3, teamId: "sweden", candidateDrawSlot: "F3" }, { position: 4, teamId: "tunisia", candidateDrawSlot: "F4" }], agreement: "matches", provenance: [EXCEL_SOURCE, TELEGRAPH_SOURCE] },
  { group: "G", slots: [{ position: 1, teamId: "belgium", candidateDrawSlot: "G1" }, { position: 2, teamId: "egypt", candidateDrawSlot: "G2" }, { position: 3, teamId: "iran", candidateDrawSlot: "G3" }, { position: 4, teamId: "new-zealand", candidateDrawSlot: "G4" }], agreement: "matches", provenance: [EXCEL_SOURCE, TELEGRAPH_SOURCE] },
  { group: "H", slots: [{ position: 1, teamId: "spain", candidateDrawSlot: "H1" }, { position: 2, teamId: "cape-verde", candidateDrawSlot: "H2" }, { position: 3, teamId: "saudi-arabia", candidateDrawSlot: "H3" }, { position: 4, teamId: "uruguay", candidateDrawSlot: "H4" }], agreement: "matches", provenance: [EXCEL_SOURCE, TELEGRAPH_SOURCE] },
  { group: "I", slots: [{ position: 1, teamId: "france", candidateDrawSlot: "I1" }, { position: 2, teamId: "senegal", candidateDrawSlot: "I2" }, { position: 3, teamId: "iraq", candidateDrawSlot: "I3" }, { position: 4, teamId: "norway", candidateDrawSlot: "I4" }], agreement: "matches", provenance: [EXCEL_SOURCE, TELEGRAPH_SOURCE] },
  { group: "J", slots: [{ position: 1, teamId: "argentina", candidateDrawSlot: "J1" }, { position: 2, teamId: "algeria", candidateDrawSlot: "J2" }, { position: 3, teamId: "austria", candidateDrawSlot: "J3" }, { position: 4, teamId: "jordan", candidateDrawSlot: "J4" }], agreement: "matches", provenance: [EXCEL_SOURCE, TELEGRAPH_SOURCE] },
  { group: "K", slots: [{ position: 1, teamId: "portugal", candidateDrawSlot: "K1" }, { position: 2, teamId: "congo-dr", candidateDrawSlot: "K2" }, { position: 3, teamId: "uzbekistan", candidateDrawSlot: "K3" }, { position: 4, teamId: "colombia", candidateDrawSlot: "K4" }], agreement: "matches", provenance: [EXCEL_SOURCE, TELEGRAPH_SOURCE] },
  { group: "L", slots: [{ position: 1, teamId: "england", candidateDrawSlot: "L1" }, { position: 2, teamId: "croatia", candidateDrawSlot: "L2" }, { position: 3, teamId: "ghana", candidateDrawSlot: "L3" }, { position: 4, teamId: "panama", candidateDrawSlot: "L4" }], agreement: "matches", provenance: [EXCEL_SOURCE, TELEGRAPH_SOURCE] },
];
