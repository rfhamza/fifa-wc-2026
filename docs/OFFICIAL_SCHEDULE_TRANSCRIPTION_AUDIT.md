# Official Schedule Transcription Audit (Phase 1.6, Step A)

> ⚠️ **STAGING / VERIFICATION ONLY — NOT YET ACTIVATED.**
>
> This records the transcription of the OFFICIAL FIFA 2026 group-stage schedule
> (M1–M72) into the isolated staging layer (`data/official/staging/`) and the
> verification that a future activation (Step B) would pass every existing
> resolver validator. **Production is unchanged:** `data/official/fixtures.ts` is
> still empty, no non-host draw slot is written onto a `Team`, and
> `resolveDataset().fixtureSource` stays `position-generated`. Activation is a
> separate, explicitly-approved step.

## 1. Source & provenance

| Field | Value |
| --- | --- |
| Source | **Official FIFA World Cup 2026 Match Schedule** |
| File (not committed) | `FWC26_Match_Schedule_v17_10042026_EN.pdf` |
| Version | **v17** |
| Source date | **10 April 2026** |
| Timezone | **All times Eastern Time (ET)** |
| Status | **Subject to change** (retained in provenance + every staged row) |
| Extraction | `scripts/extract-official-schedule.py` over the PDF text layer (match #, group, teams, ET time) + reviewer transcription of date/venue from the wallchart grid; cross-checked against the candidate layer |

The **PDF binary is not committed** (third-party copyright). Committed artifacts:
`data/official/staging/raw/official-schedule.json` (provenance-headed text-layer
snapshot), `data/official/staging/schedule.ts` (typed staged rows + solved draw
positions), `scripts/extract-official-schedule.py`, and this audit.

Telegraph/Excel are **candidate cross-checks only** — never treated as official.
The official PDF wins on any discrepancy.

## 2. Extraction method & timezone

- The match number, group, home/away teams and ET kickoff come from the PDF
  **text layer** (parsed by the script; FIFA 3-letter codes mapped to team ids).
- The **ET calendar date** and **venue** are reviewer-transcribed from the
  wallchart grid (date columns Thu 11 Jun → Sat 27 Jun; venue rows) and
  cross-checked against the candidate layer, which independently carries date +
  venue per match. All 72 agree (§5).
- ET → UTC: the 2026 window (11 Jun – 19 Jul) is entirely **EDT (UTC−4)**, so
  `kickoffUtc = ET + 4h`. Validated for every row (incl. midnight-crossers and
  the 19:30/20:30 kickoffs) by `validateStagedSchedule`.

## 3. Coverage & validation results

`validateStagedSchedule` + `solveDrawPositionsFromSchedule` +
`validateSolvedDrawPositions` + `dryRunActivation` (all in
`lib/data/validate-official-schedule.ts`) return **zero errors**:

| Check | Result |
| --- | --- |
| Group-stage rows | **72** |
| Unique match numbers 1..72 | ✓ |
| 12 groups × 6 fixtures | ✓ |
| Each team in exactly 3 group games | ✓ |
| No duplicate pairings; all ⊆ FIFA Art. 12.4 | ✓ |
| Matchday consistent with pairing | ✓ |
| Every venue id resolves | ✓ |
| `kickoffUtc == ET + 4h` for all 72 | ✓ |
| Unique draw-position solution per group | ✓ (12/12) |
| Host slots preserved (Mexico A1, Canada B1, USA D1) | ✓ |
| **Dry-run activation** through `validateOfficialFixtures` / `validateFixtures` / `validateDrawPositions` | ✓ would pass |

## 4. Inferred draw positions (solved from the schedule + Art. 12.4)

Solved by brute-forcing, per group, the unique team→position map whose **directed**
(home/away) pairings reproduce the Art. 12.4 chart, anchored by the verified host
slots. Unique solution in every group; identical to the candidate draw order.

| Group | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| A | Mexico **(verified host)** | South Africa | South Korea | Czechia |
| B | Canada **(verified host)** | Bosnia & Herzegovina | Qatar | Switzerland |
| C | Brazil | Morocco | Haiti | Scotland |
| D | United States **(verified host)** | Paraguay | Australia | Türkiye |
| E | Germany | Curaçao | Ivory Coast | Ecuador |
| F | Netherlands | Japan | Sweden | Tunisia |
| G | Belgium | Egypt | Iran | New Zealand |
| H | Spain | Cape Verde | Saudi Arabia | Uruguay |
| I | France | Senegal | Iraq | Norway |
| J | Argentina | Algeria | Austria | Jordan |
| K | Portugal | DR Congo | Uzbekistan | Colombia |
| L | England | Croatia | Ghana | Panama |

## 5. Cross-check vs candidate (Telegraph/Excel)

All **72/72** fixtures agree on group, home/away orientation, kickoff (UTC) and
venue; the solved draw order matches the candidate draw order with **zero
discrepancies**. Notably the official schedule **confirms the two manually
resolved candidate conflicts**: **M20** Austria v Jordan and **M36** Tunisia v
Japan both kick off **00:00 ET** (→ 04:00 UTC on 17 Jun / 21 Jun), i.e. the
Telegraph-aligned dates the candidate layer had adopted. No discrepancies remain;
nothing required the official to override the candidate.

Full M1–M72 table below, grouped A–L for spot-checking (slot = solved draw
position; cross-check column compares against the candidate row of the same match
number).

### Group A

| M# | Date (ET) | KO (ET) | KO (UTC) | Home (slot) | Away (slot) | Venue | Cross-check |
|---:|---|---|---|---|---|---|---|
| 1 | Thu 11 Jun | 15:00 ET | 2026-06-11T19:00:00Z | Mexico (A1) | South Africa (A2) | Estadio Azteca, Mexico City | ✓ match |
| 2 | Thu 11 Jun | 22:00 ET | 2026-06-12T02:00:00Z | South Korea (A3) | Czechia (A4) | Estadio Akron, Guadalajara | ✓ match |
| 25 | Thu 18 Jun | 12:00 ET | 2026-06-18T16:00:00Z | Czechia (A4) | South Africa (A2) | Mercedes-Benz Stadium, Atlanta | ✓ match |
| 28 | Thu 18 Jun | 21:00 ET | 2026-06-19T01:00:00Z | Mexico (A1) | South Korea (A3) | Estadio Akron, Guadalajara | ✓ match |
| 53 | Wed 24 Jun | 21:00 ET | 2026-06-25T01:00:00Z | Czechia (A4) | Mexico (A1) | Estadio Azteca, Mexico City | ✓ match |
| 54 | Wed 24 Jun | 21:00 ET | 2026-06-25T01:00:00Z | South Africa (A2) | South Korea (A3) | Estadio BBVA, Monterrey | ✓ match |

### Group B

| M# | Date (ET) | KO (ET) | KO (UTC) | Home (slot) | Away (slot) | Venue | Cross-check |
|---:|---|---|---|---|---|---|---|
| 3 | Fri 12 Jun | 15:00 ET | 2026-06-12T19:00:00Z | Canada (B1) | Bosnia & Herzegovina (B2) | BMO Field, Toronto | ✓ match |
| 8 | Sat 13 Jun | 15:00 ET | 2026-06-13T19:00:00Z | Qatar (B3) | Switzerland (B4) | Levi's Stadium, San Francisco Bay Area | ✓ match |
| 26 | Thu 18 Jun | 15:00 ET | 2026-06-18T19:00:00Z | Switzerland (B4) | Bosnia & Herzegovina (B2) | SoFi Stadium, Los Angeles | ✓ match |
| 27 | Thu 18 Jun | 18:00 ET | 2026-06-18T22:00:00Z | Canada (B1) | Qatar (B3) | BC Place, Vancouver | ✓ match |
| 51 | Wed 24 Jun | 15:00 ET | 2026-06-24T19:00:00Z | Switzerland (B4) | Canada (B1) | BC Place, Vancouver | ✓ match |
| 52 | Wed 24 Jun | 15:00 ET | 2026-06-24T19:00:00Z | Bosnia & Herzegovina (B2) | Qatar (B3) | Lumen Field, Seattle | ✓ match |

### Group C

| M# | Date (ET) | KO (ET) | KO (UTC) | Home (slot) | Away (slot) | Venue | Cross-check |
|---:|---|---|---|---|---|---|---|
| 5 | Sat 13 Jun | 21:00 ET | 2026-06-14T01:00:00Z | Haiti (C3) | Scotland (C4) | Gillette Stadium, Boston | ✓ match |
| 7 | Sat 13 Jun | 18:00 ET | 2026-06-13T22:00:00Z | Brazil (C1) | Morocco (C2) | MetLife Stadium, New York/New Jersey | ✓ match |
| 29 | Fri 19 Jun | 20:30 ET | 2026-06-20T00:30:00Z | Brazil (C1) | Haiti (C3) | Lincoln Financial Field, Philadelphia | ✓ match |
| 30 | Fri 19 Jun | 18:00 ET | 2026-06-19T22:00:00Z | Scotland (C4) | Morocco (C2) | Gillette Stadium, Boston | ✓ match |
| 49 | Wed 24 Jun | 18:00 ET | 2026-06-24T22:00:00Z | Scotland (C4) | Brazil (C1) | Hard Rock Stadium, Miami | ✓ match |
| 50 | Wed 24 Jun | 18:00 ET | 2026-06-24T22:00:00Z | Morocco (C2) | Haiti (C3) | Mercedes-Benz Stadium, Atlanta | ✓ match |

### Group D

| M# | Date (ET) | KO (ET) | KO (UTC) | Home (slot) | Away (slot) | Venue | Cross-check |
|---:|---|---|---|---|---|---|---|
| 4 | Fri 12 Jun | 21:00 ET | 2026-06-13T01:00:00Z | United States (D1) | Paraguay (D2) | SoFi Stadium, Los Angeles | ✓ match |
| 6 | Sun 14 Jun | 00:00 ET | 2026-06-14T04:00:00Z | Australia (D3) | Türkiye (D4) | BC Place, Vancouver | ✓ match |
| 31 | Fri 19 Jun | 23:00 ET | 2026-06-20T03:00:00Z | Türkiye (D4) | Paraguay (D2) | Levi's Stadium, San Francisco Bay Area | ✓ match |
| 32 | Fri 19 Jun | 15:00 ET | 2026-06-19T19:00:00Z | United States (D1) | Australia (D3) | Lumen Field, Seattle | ✓ match |
| 59 | Thu 25 Jun | 22:00 ET | 2026-06-26T02:00:00Z | Türkiye (D4) | United States (D1) | SoFi Stadium, Los Angeles | ✓ match |
| 60 | Thu 25 Jun | 22:00 ET | 2026-06-26T02:00:00Z | Paraguay (D2) | Australia (D3) | Levi's Stadium, San Francisco Bay Area | ✓ match |

### Group E

| M# | Date (ET) | KO (ET) | KO (UTC) | Home (slot) | Away (slot) | Venue | Cross-check |
|---:|---|---|---|---|---|---|---|
| 9 | Sun 14 Jun | 19:00 ET | 2026-06-14T23:00:00Z | Ivory Coast (E3) | Ecuador (E4) | Lincoln Financial Field, Philadelphia | ✓ match |
| 10 | Sun 14 Jun | 13:00 ET | 2026-06-14T17:00:00Z | Germany (E1) | Curaçao (E2) | NRG Stadium, Houston | ✓ match |
| 33 | Sat 20 Jun | 16:00 ET | 2026-06-20T20:00:00Z | Germany (E1) | Ivory Coast (E3) | BMO Field, Toronto | ✓ match |
| 34 | Sat 20 Jun | 20:00 ET | 2026-06-21T00:00:00Z | Ecuador (E4) | Curaçao (E2) | Arrowhead Stadium, Kansas City | ✓ match |
| 55 | Thu 25 Jun | 16:00 ET | 2026-06-25T20:00:00Z | Curaçao (E2) | Ivory Coast (E3) | Lincoln Financial Field, Philadelphia | ✓ match |
| 56 | Thu 25 Jun | 16:00 ET | 2026-06-25T20:00:00Z | Ecuador (E4) | Germany (E1) | MetLife Stadium, New York/New Jersey | ✓ match |

### Group F

| M# | Date (ET) | KO (ET) | KO (UTC) | Home (slot) | Away (slot) | Venue | Cross-check |
|---:|---|---|---|---|---|---|---|
| 11 | Sun 14 Jun | 16:00 ET | 2026-06-14T20:00:00Z | Netherlands (F1) | Japan (F2) | AT&T Stadium, Dallas | ✓ match |
| 12 | Sun 14 Jun | 22:00 ET | 2026-06-15T02:00:00Z | Sweden (F3) | Tunisia (F4) | Estadio BBVA, Monterrey | ✓ match |
| 35 | Sat 20 Jun | 13:00 ET | 2026-06-20T17:00:00Z | Netherlands (F1) | Sweden (F3) | NRG Stadium, Houston | ✓ match |
| 36 | Sun 21 Jun | 00:00 ET | 2026-06-21T04:00:00Z | Tunisia (F4) | Japan (F2) | Estadio BBVA, Monterrey | ✓ match (cand. resolved→official confirms) |
| 57 | Thu 25 Jun | 19:00 ET | 2026-06-25T23:00:00Z | Japan (F2) | Sweden (F3) | AT&T Stadium, Dallas | ✓ match |
| 58 | Thu 25 Jun | 19:00 ET | 2026-06-25T23:00:00Z | Tunisia (F4) | Netherlands (F1) | Arrowhead Stadium, Kansas City | ✓ match |

### Group G

| M# | Date (ET) | KO (ET) | KO (UTC) | Home (slot) | Away (slot) | Venue | Cross-check |
|---:|---|---|---|---|---|---|---|
| 15 | Mon 15 Jun | 21:00 ET | 2026-06-16T01:00:00Z | Iran (G3) | New Zealand (G4) | SoFi Stadium, Los Angeles | ✓ match |
| 16 | Mon 15 Jun | 15:00 ET | 2026-06-15T19:00:00Z | Belgium (G1) | Egypt (G2) | Lumen Field, Seattle | ✓ match |
| 39 | Sun 21 Jun | 15:00 ET | 2026-06-21T19:00:00Z | Belgium (G1) | Iran (G3) | SoFi Stadium, Los Angeles | ✓ match |
| 40 | Sun 21 Jun | 21:00 ET | 2026-06-22T01:00:00Z | New Zealand (G4) | Egypt (G2) | BC Place, Vancouver | ✓ match |
| 63 | Fri 26 Jun | 23:00 ET | 2026-06-27T03:00:00Z | Egypt (G2) | Iran (G3) | Lumen Field, Seattle | ✓ match |
| 64 | Fri 26 Jun | 23:00 ET | 2026-06-27T03:00:00Z | New Zealand (G4) | Belgium (G1) | BC Place, Vancouver | ✓ match |

### Group H

| M# | Date (ET) | KO (ET) | KO (UTC) | Home (slot) | Away (slot) | Venue | Cross-check |
|---:|---|---|---|---|---|---|---|
| 13 | Mon 15 Jun | 18:00 ET | 2026-06-15T22:00:00Z | Saudi Arabia (H3) | Uruguay (H4) | Hard Rock Stadium, Miami | ✓ match |
| 14 | Mon 15 Jun | 12:00 ET | 2026-06-15T16:00:00Z | Spain (H1) | Cape Verde (H2) | Mercedes-Benz Stadium, Atlanta | ✓ match |
| 37 | Sun 21 Jun | 18:00 ET | 2026-06-21T22:00:00Z | Uruguay (H4) | Cape Verde (H2) | Hard Rock Stadium, Miami | ✓ match |
| 38 | Sun 21 Jun | 12:00 ET | 2026-06-21T16:00:00Z | Spain (H1) | Saudi Arabia (H3) | Mercedes-Benz Stadium, Atlanta | ✓ match |
| 65 | Fri 26 Jun | 20:00 ET | 2026-06-27T00:00:00Z | Cape Verde (H2) | Saudi Arabia (H3) | NRG Stadium, Houston | ✓ match |
| 66 | Fri 26 Jun | 20:00 ET | 2026-06-27T00:00:00Z | Uruguay (H4) | Spain (H1) | Estadio Akron, Guadalajara | ✓ match |

### Group I

| M# | Date (ET) | KO (ET) | KO (UTC) | Home (slot) | Away (slot) | Venue | Cross-check |
|---:|---|---|---|---|---|---|---|
| 17 | Tue 16 Jun | 15:00 ET | 2026-06-16T19:00:00Z | France (I1) | Senegal (I2) | MetLife Stadium, New York/New Jersey | ✓ match |
| 18 | Tue 16 Jun | 18:00 ET | 2026-06-16T22:00:00Z | Iraq (I3) | Norway (I4) | Gillette Stadium, Boston | ✓ match |
| 41 | Mon 22 Jun | 20:00 ET | 2026-06-23T00:00:00Z | Norway (I4) | Senegal (I2) | MetLife Stadium, New York/New Jersey | ✓ match |
| 42 | Mon 22 Jun | 17:00 ET | 2026-06-22T21:00:00Z | France (I1) | Iraq (I3) | Lincoln Financial Field, Philadelphia | ✓ match |
| 61 | Fri 26 Jun | 15:00 ET | 2026-06-26T19:00:00Z | Norway (I4) | France (I1) | Gillette Stadium, Boston | ✓ match |
| 62 | Fri 26 Jun | 15:00 ET | 2026-06-26T19:00:00Z | Senegal (I2) | Iraq (I3) | BMO Field, Toronto | ✓ match |

### Group J

| M# | Date (ET) | KO (ET) | KO (UTC) | Home (slot) | Away (slot) | Venue | Cross-check |
|---:|---|---|---|---|---|---|---|
| 19 | Tue 16 Jun | 21:00 ET | 2026-06-17T01:00:00Z | Argentina (J1) | Algeria (J2) | Arrowhead Stadium, Kansas City | ✓ match |
| 20 | Wed 17 Jun | 00:00 ET | 2026-06-17T04:00:00Z | Austria (J3) | Jordan (J4) | Levi's Stadium, San Francisco Bay Area | ✓ match (cand. resolved→official confirms) |
| 43 | Mon 22 Jun | 13:00 ET | 2026-06-22T17:00:00Z | Argentina (J1) | Austria (J3) | AT&T Stadium, Dallas | ✓ match |
| 44 | Mon 22 Jun | 23:00 ET | 2026-06-23T03:00:00Z | Jordan (J4) | Algeria (J2) | Levi's Stadium, San Francisco Bay Area | ✓ match |
| 69 | Sat 27 Jun | 22:00 ET | 2026-06-28T02:00:00Z | Algeria (J2) | Austria (J3) | Arrowhead Stadium, Kansas City | ✓ match |
| 70 | Sat 27 Jun | 22:00 ET | 2026-06-28T02:00:00Z | Jordan (J4) | Argentina (J1) | AT&T Stadium, Dallas | ✓ match |

### Group K

| M# | Date (ET) | KO (ET) | KO (UTC) | Home (slot) | Away (slot) | Venue | Cross-check |
|---:|---|---|---|---|---|---|---|
| 23 | Wed 17 Jun | 13:00 ET | 2026-06-17T17:00:00Z | Portugal (K1) | DR Congo (K2) | NRG Stadium, Houston | ✓ match |
| 24 | Wed 17 Jun | 22:00 ET | 2026-06-18T02:00:00Z | Uzbekistan (K3) | Colombia (K4) | Estadio Azteca, Mexico City | ✓ match |
| 47 | Tue 23 Jun | 13:00 ET | 2026-06-23T17:00:00Z | Portugal (K1) | Uzbekistan (K3) | NRG Stadium, Houston | ✓ match |
| 48 | Tue 23 Jun | 22:00 ET | 2026-06-24T02:00:00Z | Colombia (K4) | DR Congo (K2) | Estadio Akron, Guadalajara | ✓ match |
| 71 | Sat 27 Jun | 19:30 ET | 2026-06-27T23:30:00Z | Colombia (K4) | Portugal (K1) | Hard Rock Stadium, Miami | ✓ match |
| 72 | Sat 27 Jun | 19:30 ET | 2026-06-27T23:30:00Z | DR Congo (K2) | Uzbekistan (K3) | Mercedes-Benz Stadium, Atlanta | ✓ match |

### Group L

| M# | Date (ET) | KO (ET) | KO (UTC) | Home (slot) | Away (slot) | Venue | Cross-check |
|---:|---|---|---|---|---|---|---|
| 21 | Wed 17 Jun | 19:00 ET | 2026-06-17T23:00:00Z | Ghana (L3) | Panama (L4) | BMO Field, Toronto | ✓ match |
| 22 | Wed 17 Jun | 16:00 ET | 2026-06-17T20:00:00Z | England (L1) | Croatia (L2) | AT&T Stadium, Dallas | ✓ match |
| 45 | Tue 23 Jun | 16:00 ET | 2026-06-23T20:00:00Z | England (L1) | Ghana (L3) | Gillette Stadium, Boston | ✓ match |
| 46 | Tue 23 Jun | 19:00 ET | 2026-06-23T23:00:00Z | Panama (L4) | Croatia (L2) | BMO Field, Toronto | ✓ match |
| 67 | Sat 27 Jun | 17:00 ET | 2026-06-27T21:00:00Z | Panama (L4) | England (L1) | MetLife Stadium, New York/New Jersey | ✓ match |
| 68 | Sat 27 Jun | 17:00 ET | 2026-06-27T21:00:00Z | Croatia (L2) | Ghana (L3) | Lincoln Financial Field, Philadelphia | ✓ match |

## 6. Discrepancies & resolutions

**None.** The official PDF and the candidate layer agree on all 72 fixtures,
orientations, kickoffs, venues and the full draw order. The official source would
take precedence over Telegraph/Excel on any future disagreement; none exists in
v17.

## 7. Manual reviewer checklist (before approving Step B)

- [ ] Open `FWC26_Match_Schedule_v17_10042026_EN.pdf` and confirm version **v17**,
      date **10 Apr 2026**, and the **"Subject to change"** note.
- [ ] Spot-check 8–10 matches across different groups/days against §5: home/away
      order, ET kickoff, venue, and ET date.
- [ ] Confirm **M20** (Austria v Jordan) and **M36** (Tunisia v Japan) are both
      **00:00 ET** on 17 Jun / 21 Jun respectively.
- [ ] Confirm the three host slots: Mexico **A1**, Canada **B1**, USA **D1**.
- [ ] Confirm the solved draw order (§4) reads sensibly per group.
- [ ] Confirm `npm run test` passes (incl. `tests/official-schedule.test.ts`).

## 8. Go / No-Go to activate (Step B — separate, approved PR)

Activate only when ALL hold: (1) all §3 validators clean (they are); (2) unique
draw-position solution per group preserving the host slots (✓); (3) the dry-run
through the existing resolver validators passes (✓); (4) ET→UTC verified (✓);
(5) candidate cross-check documented with discrepancies resolved in favour of the
official PDF (✓ — none); (6) **explicit user approval of this transcription**.

On activation: populate `data/official/fixtures.ts` with the 72 position-keyed
`OfficialFixture` rows (kickoff UTC + `sourceRef`/`subjectToChange`/version), and
set all 48 `Team.drawPosition`/`drawSlot`/`drawSlotStatus: "verified"` in
`data/official/teams.ts`. The resolver then flips `fixtureSource` to `"official"`.
The UI must continue to label the schedule **"Official FIFA schedule, v17,
10 Apr 2026 — subject to change."**
