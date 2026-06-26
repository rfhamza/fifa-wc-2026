# Official knockout-stage schedule transcription audit (Phase 1.28R)

> **Scope:** kickoff **timing** for the 32 knockout matches **M73-M104**
> (`data/official/knockout-schedule.ts`). This is additive official data; it does **not**
> change the bracket structure (`data/official/knockout-graph.ts`) or the group schedule
> (M1-M72). It exists so live/finished knockout provider records can be mapped to canonical
> `M{n}` by kickoff (the dynamic bridge in
> `lib/live-ingest/football-data-org/knockout-bridge.ts`).

## Source

- **Canonical source:** FIFA Digital Hub official match schedule
  **`FWC26 Match Schedule_v17_10042026_EN.pdf`**.
- **Visible version/date in the PDF:** footer **"10 April 2026 (c) FIFA"**.
- **Times:** the PDF header states **"All times are Eastern Time (ET)."**
- Same source document and provenance as the group-stage schedule (M1-M72).

## Transcription method

- The PDF is a graphical grid (venue rows x date columns). Each knockout cell carries a
  match number (73-104), an ET kickoff time, and the round band (ROUND OF 32 / ROUND OF 16
  / QUARTER-FINALS / SEMI-FINALS / FINAL / BRONZE FINAL).
- Cell text was extracted with positional bounding boxes; each match number was mapped to
  its **date column** (x-position vs the date headers) and its **ET time** (the time token
  in the same cell), then to its **round** (the column band / matchNumber range).
- Result: 32 rows, each `{ matchNumber, matchId, round, sourceDateEt, sourceTimeEt,
  sourceTimezone: "ET", kickoffUtc }`.

## ET -> UTC conversion rule

- The entire knockout window (**28 Jun - 19 Jul 2026**) is **Eastern Daylight Time
  (EDT = UTC-04:00)**, so **`kickoffUtc = ET + 4h`**, with **date rollover** for late ET
  kickoffs (e.g. M85 `2026-07-02 23:00 ET -> 2026-07-03T03:00:00Z`; M87 `21:30 ET ->
  next-day 01:30Z`; M81 `20:00 ET -> next-day 00:00Z`).
- Implemented by `etDaylightToUtc()` (uses `Date.UTC(..., h+4, ...)`, which carries the
  hour overflow into the next day). The stored `kickoffUtc` for every row is asserted by
  `validateKnockoutSchedule()` to equal `etDaylightToUtc(sourceDateEt, sourceTimeEt)`, and
  every source date is asserted to be in **Jun/Jul 2026** (the EDT assumption). This is the
  documented fallback to a full IANA library (`America/New_York`), valid because the whole
  window is unambiguously EDT.

## Cross-check against football-data.org (provider is NOT the source)

- The provider `/v4/competitions/WC/matches` payload was used **only as a cross-check**.
  All **16 Round-of-32** `kickoffUtc` values derived here from ET match the provider's
  `utcDate` exactly (16/16). The provider's knockout `(stage, utcDate)` keys are unique
  (32/32).
- **football-data.org is never the canonical source** for `kickoffUtc`, match numbers,
  bracket logic, standings, or advancement. Provider `utcDate` = cross-check only; provider
  IDs = adapter/provenance only and are **never committed** to official data.

## Validation (`validateKnockoutSchedule`)

Asserts: exactly 32 rows; match numbers 73-104 each present once; valid round values; valid
ISO-UTC kickoff strings; unique `matchNumber`, `matchId`, and `(round, kickoffUtc)`; source
ET date/time present; source date within Jun/Jul 2026; and `kickoffUtc == ET + 4h`. No
dependency on, or import of, provider IDs or football-data.org modules.

## Spot-checks

| Match | Round | Source (ET) | kickoffUtc | Provider utcDate (cross-check) |
|---|---|---|---|---|
| M73 | roundOf32 | 2026-06-28 15:00 | 2026-06-28T19:00:00Z | 2026-06-28T19:00:00Z |
| M85 | roundOf32 | 2026-07-02 23:00 | 2026-07-03T03:00:00Z (rollover) | 2026-07-03T03:00:00Z |
| M89 | roundOf16 | 2026-07-04 17:00 | 2026-07-04T21:00:00Z | - |
| M100 | quarterFinal | 2026-07-11 21:00 | 2026-07-12T01:00:00Z (rollover) | - |
| M103 | thirdPlace | 2026-07-18 17:00 | 2026-07-18T21:00:00Z | - |
| M104 | final | 2026-07-19 15:00 | 2026-07-19T19:00:00Z | - |

## Notes

- "Subject to change": FIFA may adjust knockout kickoff times. If the provider's `utcDate`
  later diverges from this transcription, the bridge will fail to map the affected playable
  knockout and **fail closed** (no write) rather than mis-map - re-transcribe from the
  updated official PDF when that happens.
