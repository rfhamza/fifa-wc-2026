import type { KnockoutGraph } from "@/lib/types";

/**
 * OFFICIAL KNOCKOUT GRAPH (M73-M104) - VERIFIED TRANSCRIPTION.
 *
 * Transcribed verbatim from the official FIFA World Cup 26 regulations PDF
 * (FWC26_regulations_EN.pdf) supplied by the user:
 *   - Round of 32 (M73-M88):  p.23, Art. 12.6
 *   - Round of 16 (M89-M96):  p.24, Art. 12.7
 *   - Quarter-finals (M97-M100): p.25, Art. 12.8
 *   - Semi-finals (M101-M102):   p.25, Art. 12.9
 *   - Play-off for 3rd (M103):   p.25, Art. 12.10
 *   - Final (M104):              p.25, Art. 12.11
 *
 * Eligible-group sets for the eight R32 third-place slots are preserved exactly
 * as printed in Art. 12.6. Third-place slot ids (T1..T8) map to Annexe C columns
 * (see third-place-allocation.ts):
 *   T1 = M74 opp (col 1E)  T2 = M77 opp (col 1I)  T3 = M79 opp (col 1A)
 *   T4 = M80 opp (col 1L)  T5 = M81 opp (col 1D)  T6 = M82 opp (col 1G)
 *   T7 = M85 opp (col 1B)  T8 = M87 opp (col 1K)
 *
 * VERIFIED: the user manually reviewed the R32 mapping (p.23), the
 * R16/QF/SF/M103/M104 propagation (p.24-25), the column-to-slot mapping, and
 * Annexe C spot-checks (Options 1, 60, 150, 248, 372, 460) on 2026-06-17.
 */
export const officialKnockoutGraph: KnockoutGraph = {
  matches: [
    {
      matchNumber: 73,
      stage: "roundOf32",
      home: { kind: "groupPosition", group: "A", position: 2 },
      away: { kind: "groupPosition", group: "B", position: 2 },
      source: "FWC26_regulations_EN.pdf, p.23, Art. 12.6",
      validationStatus: "verified",
    },
    {
      matchNumber: 74,
      stage: "roundOf32",
      home: { kind: "groupPosition", group: "E", position: 1 },
      away: {
        kind: "thirdPlace",
        slot: "T1",
        eligibleGroups: ["A", "B", "C", "D", "F"],
      },
      source: "FWC26_regulations_EN.pdf, p.23, Art. 12.6",
      validationStatus: "verified",
    },
    {
      matchNumber: 75,
      stage: "roundOf32",
      home: { kind: "groupPosition", group: "F", position: 1 },
      away: { kind: "groupPosition", group: "C", position: 2 },
      source: "FWC26_regulations_EN.pdf, p.23, Art. 12.6",
      validationStatus: "verified",
    },
    {
      matchNumber: 76,
      stage: "roundOf32",
      home: { kind: "groupPosition", group: "C", position: 1 },
      away: { kind: "groupPosition", group: "F", position: 2 },
      source: "FWC26_regulations_EN.pdf, p.23, Art. 12.6",
      validationStatus: "verified",
    },
    {
      matchNumber: 77,
      stage: "roundOf32",
      home: { kind: "groupPosition", group: "I", position: 1 },
      away: {
        kind: "thirdPlace",
        slot: "T2",
        eligibleGroups: ["C", "D", "F", "G", "H"],
      },
      source: "FWC26_regulations_EN.pdf, p.23, Art. 12.6",
      validationStatus: "verified",
    },
    {
      matchNumber: 78,
      stage: "roundOf32",
      home: { kind: "groupPosition", group: "E", position: 2 },
      away: { kind: "groupPosition", group: "I", position: 2 },
      source: "FWC26_regulations_EN.pdf, p.23, Art. 12.6",
      validationStatus: "verified",
    },
    {
      matchNumber: 79,
      stage: "roundOf32",
      home: { kind: "groupPosition", group: "A", position: 1 },
      away: {
        kind: "thirdPlace",
        slot: "T3",
        eligibleGroups: ["C", "E", "F", "H", "I"],
      },
      source: "FWC26_regulations_EN.pdf, p.23, Art. 12.6",
      validationStatus: "verified",
    },
    {
      matchNumber: 80,
      stage: "roundOf32",
      home: { kind: "groupPosition", group: "L", position: 1 },
      away: {
        kind: "thirdPlace",
        slot: "T4",
        eligibleGroups: ["E", "H", "I", "J", "K"],
      },
      source: "FWC26_regulations_EN.pdf, p.23, Art. 12.6",
      validationStatus: "verified",
    },
    {
      matchNumber: 81,
      stage: "roundOf32",
      home: { kind: "groupPosition", group: "D", position: 1 },
      away: {
        kind: "thirdPlace",
        slot: "T5",
        eligibleGroups: ["B", "E", "F", "I", "J"],
      },
      source: "FWC26_regulations_EN.pdf, p.23, Art. 12.6",
      validationStatus: "verified",
    },
    {
      matchNumber: 82,
      stage: "roundOf32",
      home: { kind: "groupPosition", group: "G", position: 1 },
      away: {
        kind: "thirdPlace",
        slot: "T6",
        eligibleGroups: ["A", "E", "H", "I", "J"],
      },
      source: "FWC26_regulations_EN.pdf, p.23, Art. 12.6",
      validationStatus: "verified",
    },
    {
      matchNumber: 83,
      stage: "roundOf32",
      home: { kind: "groupPosition", group: "K", position: 2 },
      away: { kind: "groupPosition", group: "L", position: 2 },
      source: "FWC26_regulations_EN.pdf, p.23, Art. 12.6",
      validationStatus: "verified",
    },
    {
      matchNumber: 84,
      stage: "roundOf32",
      home: { kind: "groupPosition", group: "H", position: 1 },
      away: { kind: "groupPosition", group: "J", position: 2 },
      source: "FWC26_regulations_EN.pdf, p.23, Art. 12.6",
      validationStatus: "verified",
    },
    {
      matchNumber: 85,
      stage: "roundOf32",
      home: { kind: "groupPosition", group: "B", position: 1 },
      away: {
        kind: "thirdPlace",
        slot: "T7",
        eligibleGroups: ["E", "F", "G", "I", "J"],
      },
      source: "FWC26_regulations_EN.pdf, p.23, Art. 12.6",
      validationStatus: "verified",
    },
    {
      matchNumber: 86,
      stage: "roundOf32",
      home: { kind: "groupPosition", group: "J", position: 1 },
      away: { kind: "groupPosition", group: "H", position: 2 },
      source: "FWC26_regulations_EN.pdf, p.23, Art. 12.6",
      validationStatus: "verified",
    },
    {
      matchNumber: 87,
      stage: "roundOf32",
      home: { kind: "groupPosition", group: "K", position: 1 },
      away: {
        kind: "thirdPlace",
        slot: "T8",
        eligibleGroups: ["D", "E", "I", "J", "L"],
      },
      source: "FWC26_regulations_EN.pdf, p.23, Art. 12.6",
      validationStatus: "verified",
    },
    {
      matchNumber: 88,
      stage: "roundOf32",
      home: { kind: "groupPosition", group: "D", position: 2 },
      away: { kind: "groupPosition", group: "G", position: 2 },
      source: "FWC26_regulations_EN.pdf, p.23, Art. 12.6",
      validationStatus: "verified",
    },
    {
      matchNumber: 89,
      stage: "roundOf16",
      home: { kind: "matchWinner", matchNumber: 74 },
      away: { kind: "matchWinner", matchNumber: 77 },
      source: "FWC26_regulations_EN.pdf, p.24, Art. 12.7",
      validationStatus: "verified",
    },
    {
      matchNumber: 90,
      stage: "roundOf16",
      home: { kind: "matchWinner", matchNumber: 73 },
      away: { kind: "matchWinner", matchNumber: 75 },
      source: "FWC26_regulations_EN.pdf, p.24, Art. 12.7",
      validationStatus: "verified",
    },
    {
      matchNumber: 91,
      stage: "roundOf16",
      home: { kind: "matchWinner", matchNumber: 76 },
      away: { kind: "matchWinner", matchNumber: 78 },
      source: "FWC26_regulations_EN.pdf, p.24, Art. 12.7",
      validationStatus: "verified",
    },
    {
      matchNumber: 92,
      stage: "roundOf16",
      home: { kind: "matchWinner", matchNumber: 79 },
      away: { kind: "matchWinner", matchNumber: 80 },
      source: "FWC26_regulations_EN.pdf, p.24, Art. 12.7",
      validationStatus: "verified",
    },
    {
      matchNumber: 93,
      stage: "roundOf16",
      home: { kind: "matchWinner", matchNumber: 83 },
      away: { kind: "matchWinner", matchNumber: 84 },
      source: "FWC26_regulations_EN.pdf, p.24, Art. 12.7",
      validationStatus: "verified",
    },
    {
      matchNumber: 94,
      stage: "roundOf16",
      home: { kind: "matchWinner", matchNumber: 81 },
      away: { kind: "matchWinner", matchNumber: 82 },
      source: "FWC26_regulations_EN.pdf, p.24, Art. 12.7",
      validationStatus: "verified",
    },
    {
      matchNumber: 95,
      stage: "roundOf16",
      home: { kind: "matchWinner", matchNumber: 86 },
      away: { kind: "matchWinner", matchNumber: 88 },
      source: "FWC26_regulations_EN.pdf, p.24, Art. 12.7",
      validationStatus: "verified",
    },
    {
      matchNumber: 96,
      stage: "roundOf16",
      home: { kind: "matchWinner", matchNumber: 85 },
      away: { kind: "matchWinner", matchNumber: 87 },
      source: "FWC26_regulations_EN.pdf, p.24, Art. 12.7",
      validationStatus: "verified",
    },
    {
      matchNumber: 97,
      stage: "quarterFinal",
      home: { kind: "matchWinner", matchNumber: 89 },
      away: { kind: "matchWinner", matchNumber: 90 },
      source: "FWC26_regulations_EN.pdf, p.25, Art. 12.8",
      validationStatus: "verified",
    },
    {
      matchNumber: 98,
      stage: "quarterFinal",
      home: { kind: "matchWinner", matchNumber: 93 },
      away: { kind: "matchWinner", matchNumber: 94 },
      source: "FWC26_regulations_EN.pdf, p.25, Art. 12.8",
      validationStatus: "verified",
    },
    {
      matchNumber: 99,
      stage: "quarterFinal",
      home: { kind: "matchWinner", matchNumber: 91 },
      away: { kind: "matchWinner", matchNumber: 92 },
      source: "FWC26_regulations_EN.pdf, p.25, Art. 12.8",
      validationStatus: "verified",
    },
    {
      matchNumber: 100,
      stage: "quarterFinal",
      home: { kind: "matchWinner", matchNumber: 95 },
      away: { kind: "matchWinner", matchNumber: 96 },
      source: "FWC26_regulations_EN.pdf, p.25, Art. 12.8",
      validationStatus: "verified",
    },
    {
      matchNumber: 101,
      stage: "semiFinal",
      home: { kind: "matchWinner", matchNumber: 97 },
      away: { kind: "matchWinner", matchNumber: 98 },
      source: "FWC26_regulations_EN.pdf, p.25, Art. 12.9",
      validationStatus: "verified",
    },
    {
      matchNumber: 102,
      stage: "semiFinal",
      home: { kind: "matchWinner", matchNumber: 99 },
      away: { kind: "matchWinner", matchNumber: 100 },
      source: "FWC26_regulations_EN.pdf, p.25, Art. 12.9",
      validationStatus: "verified",
    },
    {
      matchNumber: 103,
      stage: "thirdPlace",
      home: { kind: "matchLoser", matchNumber: 101 },
      away: { kind: "matchLoser", matchNumber: 102 },
      source: "FWC26_regulations_EN.pdf, p.25, Art. 12.10",
      validationStatus: "verified",
    },
    {
      matchNumber: 104,
      stage: "final",
      home: { kind: "matchWinner", matchNumber: 101 },
      away: { kind: "matchWinner", matchNumber: 102 },
      source: "FWC26_regulations_EN.pdf, p.25, Art. 12.11",
      validationStatus: "verified",
    },
  ],
};
