# Squad/Player Leakage Control (Phase 1.17B)

## The leakage risk
The squad roster snapshot (`data/model-inputs/snapshots/squad-2026-06-11.ts`) is transcribed
from the FIFA final-squad PDF whose **generated version is dated AFTER the tournament start**:
- `squadDate = 2026-06-20` (PDF version generation date) - **after** the opening match
  (`2026-06-11T19:00:00Z`).
- `squadFreezeDate = 2026-06-10` (the intended pre-tournament freeze).
- `dataStatus = official_fifa_final_squad_pdf_post_tournament_start_version_leakage_risk`.

Because the committed PDF version postdates kickoff, we **cannot prove** it is byte-identical to a
pre-tournament final-list release. It may incorporate post-start edits. It is therefore treated as
**leakage-risk** and kept strictly as a standalone roster foundation.

## Rules (enforced + documented)
- **Do NOT** use this snapshot in active pre-tournament probabilities.
- **Do NOT** convert it into a model driver or feature.
- **Do NOT** promote the active `squadQuality` family from `placeholder`.
- **Do NOT** claim a verified pre-start squad baseline unless/until the PDF is proven identical to
  a pre-start final-list release.
- The model freeze and all wired inputs remain as before; `fixtureSource` stays `official`.

These are enforced by `lib/data/validate-squad.ts` (asserts `leakageRisk: true`, the exact
`dataStatus`, `squadType: final`, and the two dates) and by `tests/squad-no-wiring.test.ts`
(asserts `squadQuality` stays placeholder, `MODEL_WEIGHTS.squadQuality` unchanged, no `lib/model/*`
import of the squad layer, active value unchanged, `fixtureSource` official).

## What is acceptable now
A **standalone roster metadata foundation** for transparency, future opponent-Elo / squad work,
and historical backtesting - explicitly labelled leakage-risk and never feeding live probabilities.

## Path to remove the caveat
If a **pre-tournament** final-squad release (dated on/before the freeze) is later supplied and
shown to match this roster, the snapshot can be re-issued with an honest pre-start status; only
then could squad data be considered for (still separately approved) model use.
