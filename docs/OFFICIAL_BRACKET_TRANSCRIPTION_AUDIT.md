# Official Bracket Transcription Audit (Phase 1.3)

Status: **CANDIDATE** - awaiting user confirmation before flipping to `verified`.

## Source

- File: `FWC26_regulations_EN.pdf` (user-supplied official FIFA World Cup 26
  regulations; 98 pages). The PDF itself is NOT committed.
- Extraction tool: `pdftotext -layout` (poppler-utils) - text extraction, not OCR.
- Pages used:
  - p.23, Art. 12.6  - Round of 32 skeleton (M73-M88)
  - p.24, Art. 12.7  - Round of 16 (M89-M96)
  - p.25, Art. 12.8  - Quarter-finals (M97-M100)
  - p.25, Art. 12.9  - Semi-finals (M101-M102)
  - p.25, Art. 12.10 - Play-off for third place (M103)
  - p.25, Art. 12.11 - Final (M104)
  - p.80-97, Annexe C - 495 third-placed combinations (Options 1-495)
  - p.26-27, Art. 13 - third-placed ranking criteria (reference only; already
    implemented in `lib/simulation/standings.ts` as `rankThirdPlacedTeams`)

## Graph encoded (M73-M104) -> `data/official/knockout-graph.ts`

32 matches total:

- R32 (M73-M88), 16 matches. Eight are group winner vs best-third; the eight
  third-place slots and their eligible-group sets (verbatim from Art. 12.6):
  - M74 = 1E vs 3rd of **ABCDF** (slot T1)
  - M77 = 1I vs 3rd of **CDFGH** (slot T2)
  - M79 = 1A vs 3rd of **CEFHI** (slot T3)
  - M80 = 1L vs 3rd of **EHIJK** (slot T4)
  - M81 = 1D vs 3rd of **BEFIJ** (slot T5)
  - M82 = 1G vs 3rd of **AEHIJ** (slot T6)
  - M85 = 1B vs 3rd of **EFGIJ** (slot T7)
  - M87 = 1K vs 3rd of **DEIJL** (slot T8)
- R16 (M89-M96): M89=W74/W77, M90=W73/W75, M91=W76/W78, M92=W79/W80,
  M93=W83/W84, M94=W81/W82, M95=W86/W88, M96=W85/W87.
- QF (M97-M100): M97=W89/W90, M98=W93/W94, M99=W91/W92, M100=W95/W96.
- SF (M101-M102): M101=W97/W98, M102=W99/W100.
- Third place (M103): loser(M101) vs loser(M102).
- Final (M104): W101 vs W102.

## Annexe C encoded -> `data/official/third-place-allocation.ts`

- Rows transcribed: **495** (Options 1-495), one per `C(12,8)` combination.
- PDF column order: `1A 1B 1D 1E 1G 1I 1K 1L` (the group winner each best-third
  faces). Mapped to knockout-graph slots:
  - col 1A -> T3, col 1B -> T7, col 1D -> T5, col 1E -> T1,
    col 1G -> T6, col 1I -> T2, col 1K -> T8, col 1L -> T4.
- Key = the eight selected third-placed groups, normalized (sorted, uppercase),
  e.g. `"EFGHIJKL"`. Value = `{ T1..T8 -> group letter }`.

## Validation results (all PASS)

Run via `npm run test` (see `tests/bracket.test.ts`,
`tests/third-place-allocation.test.ts`, `tests/official-bracket-data.test.ts`):

- `validateGraph(officialKnockoutGraph)` -> no errors (16 R32 matches, all 12
  winners + 12 runners-up used once, 8 third slots T1-T8, propagation valid,
  final fed by SF winners, M103 fed by SF losers).
- `validateAllocation` -> coverage `{ combinations: 495, expected: 495,
  complete: true }`, no errors.
- `validateBracket(officialBracket)` -> `valid: true`.
- Allocation has exactly 495 keys; every key has 8 groups; every row fills all
  eight T-slots; assigned groups equal the key groups exactly (no duplicate, no
  unselected group assigned).
- **Independent source cross-check:** every Annexe C column value lies within the
  Art. 12.6 eligible-group set for that column (0 violations across all 495 rows).
- Realiser on the real graph + allocation resolves **32 distinct** R32 teams;
  stage counts 16 / 8 / 4 / 2 / 1; deterministic.
- Tournament invariants under a verified-for-test copy: R32=32, R16=16, QF=8,
  SF=4, Final=2, Winner=1.

## Ambiguous rows / transcription risks

- None detected. The extraction used the embedded PDF text layer (not OCR), the
  strict row pattern matched exactly 495 rows numbered 1-495 with no gaps, and
  all structural + eligibility cross-checks passed with zero violations.
- Residual risk is limited to the PDF's own text layer correctness; the
  eligibility cross-check makes a silent mis-transcription very unlikely (a wrong
  letter would almost certainly fall outside the column's eligible set).

## Activation status

- `data/official/bracket.ts` -> `sourceStatus: "candidate"`.
- Production gate `isBracketActive` requires `"verified"`, so the **production
  simulator still uses placeholder seeding**. The official path is exercised in
  tests only, via a verified-marked COPY (preview), never the shipped data.

## Manual spot-checks for reviewer

### R32 third-place slot mapping (graph)

| Slot | R32 match | Annexe C column | Eligible groups (Art. 12.6) |
| ---- | --------- | --------------- | --------------------------- |
| T1   | M74       | 1E              | ABCDF                       |
| T2   | M77       | 1I              | CDFGH                       |
| T3   | M79       | 1A              | CEFHI                       |
| T4   | M80       | 1L              | EHIJK                       |
| T5   | M81       | 1D              | BEFIJ                       |
| T6   | M82       | 1G              | AEHIJ                       |
| T7   | M85       | 1B              | EFGIJ                       |
| T8   | M87       | 1K              | DEIJL                       |

### Sample Annexe C rows (verify against the noted PDF page)

The PDF prints columns in the order `1A 1B 1D 1E 1G 1I 1K 1L`; the table below
already remaps them to slots T1..T8 (mapping: 1A->T3, 1B->T7, 1D->T5, 1E->T1,
1G->T6, 1I->T2, 1K->T8, 1L->T4).

| Option | Page | Key      | T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 |
| ------ | ---- | -------- | -- | -- | -- | -- | -- | -- | -- | -- |
| 1      | 80   | EFGHIJKL | F  | G  | E  | K  | I  | H  | J  | L  |
| 60     | 82   | BDFGHIJK | D  | F  | H  | K  | B  | J  | G  | I  |
| 150    | 85   | BCDEFHKL | D  | F  | C  | K  | B  | H  | E  | L  |
| 248    | 88   | ACDFGHIL | C  | D  | H  | I  | F  | A  | G  | L  |
| 372    | 93   | ABCGHJKL | C  | G  | H  | K  | B  | A  | J  | L  |
| 460    | 96   | ABCDFGHI | C  | F  | H  | I  | B  | A  | G  | D  |

Annexe C spans **pages 80-97** (Options 1-495), about 29 options per page
(p.80 has 18 rows, p.97 has 13). Page for any option N (approx):
p.80 = 1-18, then p.81+ in blocks of 29 (p.81 = 19-47, p.82 = 48-76, ...,
p.96 = 454-482, p.97 = 483-495).

## Reviewer checklist before flipping to `verified`

- [ ] Spot-check 5-10 Annexe C options against the PDF (e.g. Option 1 ->
      `EFGHIJKL` -> T1=F, T2=G, T3=E, T4=K, T5=I, T6=H, T7=J, T8=L).
- [ ] Confirm the R32 third-place eligible sets match Art. 12.6 (table above).
- [ ] Confirm the column->slot mapping (1A->T3, 1B->T7, 1D->T5, 1E->T1,
      1G->T6, 1I->T2, 1K->T8, 1L->T4).
- [ ] Confirm R16/QF/SF/3rd/final propagation matches Art. 12.7-12.11.
- [ ] Confirm you want production to use the official bracket (this flips
      `isBracketActive` to true and changes public forecasts).
- [ ] On approval: set `sourceStatus: "verified"` and update validationStatus
      notes; CI must stay green.
