import type { CandidateGroupMembership } from "@/lib/types/candidate";
import { EXCEL_SOURCE, TELEGRAPH_SOURCE } from "./schedule-sources";

/**
 * CANDIDATE group membership (12 x 4) — DERIVED, NOT OFFICIAL.
 *
 * Both third-party sources agree on membership, and it matches the existing
 * candidate field in data/official/teams.ts (validated in
 * lib/data/validate-candidate.ts). Team ids are listed in candidate draw-order
 * (position 1..4) order. NOT official; never imported by the resolver.
 */
export const candidateGroups: CandidateGroupMembership[] = [
  { group: "A", teamIds: ["mexico", "south-africa", "south-korea", "czechia"], agreement: "matches", provenance: [EXCEL_SOURCE, TELEGRAPH_SOURCE] },
  { group: "B", teamIds: ["canada", "bosnia-herzegovina", "qatar", "switzerland"], agreement: "matches", provenance: [EXCEL_SOURCE, TELEGRAPH_SOURCE] },
  { group: "C", teamIds: ["brazil", "morocco", "haiti", "scotland"], agreement: "matches", provenance: [EXCEL_SOURCE, TELEGRAPH_SOURCE] },
  { group: "D", teamIds: ["usa", "paraguay", "australia", "turkiye"], agreement: "matches", provenance: [EXCEL_SOURCE, TELEGRAPH_SOURCE] },
  { group: "E", teamIds: ["germany", "curacao", "ivory-coast", "ecuador"], agreement: "matches", provenance: [EXCEL_SOURCE, TELEGRAPH_SOURCE] },
  { group: "F", teamIds: ["netherlands", "japan", "sweden", "tunisia"], agreement: "matches", provenance: [EXCEL_SOURCE, TELEGRAPH_SOURCE] },
  { group: "G", teamIds: ["belgium", "egypt", "iran", "new-zealand"], agreement: "matches", provenance: [EXCEL_SOURCE, TELEGRAPH_SOURCE] },
  { group: "H", teamIds: ["spain", "cape-verde", "saudi-arabia", "uruguay"], agreement: "matches", provenance: [EXCEL_SOURCE, TELEGRAPH_SOURCE] },
  { group: "I", teamIds: ["france", "senegal", "iraq", "norway"], agreement: "matches", provenance: [EXCEL_SOURCE, TELEGRAPH_SOURCE] },
  { group: "J", teamIds: ["argentina", "algeria", "austria", "jordan"], agreement: "matches", provenance: [EXCEL_SOURCE, TELEGRAPH_SOURCE] },
  { group: "K", teamIds: ["portugal", "congo-dr", "uzbekistan", "colombia"], agreement: "matches", provenance: [EXCEL_SOURCE, TELEGRAPH_SOURCE] },
  { group: "L", teamIds: ["england", "croatia", "ghana", "panama"], agreement: "matches", provenance: [EXCEL_SOURCE, TELEGRAPH_SOURCE] },
];
