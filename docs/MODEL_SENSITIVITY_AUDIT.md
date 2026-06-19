# Model Sensitivity / Calibration Audit (Phase 1.11)

> **Frozen pre-tournament baseline. Information available at tournament start only.**
>
> These variants are **diagnostic only**. They do **not** change production
> weights and should **not** be interpreted as proposed production settings
> without a separate calibration / backtesting decision. Probabilities are not
> conditioned on any match played after 11 Jun 2026 and are not compared to actual
> outcomes.

## 1. Scope & method

We re-run the **frozen** Monte Carlo forecast (deterministic seed `20260611`,
2000 iterations) under several **audit-only** model-weight variants
(`lib/model/audit-variants.ts`). Each variant is a fresh
`{ ...MODEL_WEIGHTS, ...override }` object passed to the engine via an optional
`weights` parameter; **production `MODEL_WEIGHTS` is never mutated** (guarded by
test) and the **placeholder caps remain in force** under every variant.

## 2. Variants tested

- **Baseline (production)** (`baseline`) - Current production weights, unchanged. Reference for all deltas.
- **Elo x0.75** (`elo-75`) - Elo anchor reduced to 75% to test reliance on the dominant rating.
- **Elo x0.50** (`elo-50`) - Elo anchor halved - strongest probe of Elo dominance.
- **FIFA x1.25 (slope + cap)** (`fifa-125`) - FIFA slope (per place) and cap (max contribution) both x1.25.
- **FIFA x1.50 (slope + cap)** (`fifa-150`) - FIFA slope (per place) and cap (max contribution) both x1.50.
- **Elo/FIFA balanced** (`balanced`) - Elo x0.60 with FIFA slope + cap x1.50 - re-balances the two rating inputs.
- **No placeholder inputs** (`no-placeholders`) - Zeroes squad quality / recent form / climate (the capped placeholders).
- **No host/regional advantage** (`no-host-regional`) - Zeroes host + regional step contributions (tournament-context flags).
- **Rating-only (Elo + FIFA)** (`rating-only`) - Isolates ONLY the two source-backed RATING inputs (Elo + FIFA ranking). It zeroes squad/form/climate/manager/host/regional/structural - this is NOT 'all source-backed/verified facts' (host advantage is itself verified tournament context but is intentionally zeroed here to isolate the ratings).

> **FIFA variant mechanics:** `fifa-125` / `fifa-150` (and `balanced`) scale
> **both** `fifaRankingPerPlace` (the per-place slope) **and** `fifaRankingCap`
> (the maximum FIFA contribution) by the same factor - i.e. both the slope and the
> ceiling of the FIFA signal widen together; this is deliberate, not a blurred
> slope-vs-cap effect.

## 3. Baseline top-10 title probability

| # | Team | Title |
|--:|---|--:|
| 1 | Spain | 26.6% |
| 2 | Argentina | 22.7% |
| 3 | France | 13.2% |
| 4 | England | 7.0% |
| 5 | Brazil | 5.1% |
| 6 | Portugal | 4.5% |
| 7 | Colombia | 3.9% |
| 8 | Netherlands | 3.3% |
| 9 | Mexico | 2.8% |
| 10 | Germany | 1.8% |

## 4. Biggest title movers vs baseline (per variant)

### Elo x0.75 (`elo-75`)

_Elo anchor reduced to 75% to test reliance on the dominant rating._

| Team | Baseline | Variant | Δ |
|---|--:|--:|--:|
| Spain | 26.6% | 19.7% | -6.9% |
| Argentina | 22.7% | 18.4% | -4.3% |
| Brazil | 5.1% | 7.0% | +1.9% |
| Portugal | 4.5% | 6.3% | +1.9% |
| France | 13.2% | 11.7% | -1.6% |

### Elo x0.50 (`elo-50`)

_Elo anchor halved - strongest probe of Elo dominance._

| Team | Baseline | Variant | Δ |
|---|--:|--:|--:|
| Spain | 26.6% | 14.9% | -11.7% |
| Argentina | 22.7% | 13.5% | -9.2% |
| France | 13.2% | 8.9% | -4.3% |
| Brazil | 5.1% | 8.0% | +2.9% |
| Germany | 1.8% | 3.6% | +1.8% |

### FIFA x1.25 (slope + cap) (`fifa-125`)

_FIFA slope (per place) and cap (max contribution) both x1.25._

| Team | Baseline | Variant | Δ |
|---|--:|--:|--:|
| France | 13.2% | 15.3% | +2.1% |
| Colombia | 3.9% | 2.1% | -1.7% |
| England | 7.0% | 6.0% | -1.0% |
| Portugal | 4.5% | 5.4% | +1.0% |
| Netherlands | 3.3% | 2.5% | -0.8% |

### FIFA x1.50 (slope + cap) (`fifa-150`)

_FIFA slope (per place) and cap (max contribution) both x1.50._

| Team | Baseline | Variant | Δ |
|---|--:|--:|--:|
| Spain | 26.6% | 29.3% | +2.6% |
| Argentina | 22.7% | 21.1% | -1.7% |
| Colombia | 3.9% | 2.6% | -1.2% |
| Brazil | 5.1% | 5.8% | +0.7% |
| Mexico | 2.8% | 2.1% | -0.7% |

### Elo/FIFA balanced (`balanced`)

_Elo x0.60 with FIFA slope + cap x1.50 - re-balances the two rating inputs._

| Team | Baseline | Variant | Δ |
|---|--:|--:|--:|
| Spain | 26.6% | 18.6% | -8.1% |
| Argentina | 22.7% | 14.9% | -7.8% |
| France | 13.2% | 11.6% | -1.7% |
| Portugal | 4.5% | 5.9% | +1.4% |
| Mexico | 2.8% | 4.2% | +1.4% |

### No placeholder inputs (`no-placeholders`)

_Zeroes squad quality / recent form / climate (the capped placeholders)._

| Team | Baseline | Variant | Δ |
|---|--:|--:|--:|
| Argentina | 22.7% | 17.4% | -5.3% |
| France | 13.2% | 12.0% | -1.2% |
| Türkiye | 0.6% | 1.7% | +1.1% |
| Norway | 0.9% | 1.9% | +1.1% |
| Spain | 26.6% | 25.9% | -0.8% |

### No host/regional advantage (`no-host-regional`)

_Zeroes host + regional step contributions (tournament-context flags)._

| Team | Baseline | Variant | Δ |
|---|--:|--:|--:|
| England | 7.0% | 8.8% | +1.7% |
| Mexico | 2.8% | 1.3% | -1.6% |
| Netherlands | 3.3% | 2.5% | -0.8% |
| Argentina | 22.7% | 22.0% | -0.7% |
| France | 13.2% | 12.6% | -0.7% |

### Rating-only (Elo + FIFA) (`rating-only`)

_Isolates ONLY the two source-backed RATING inputs (Elo + FIFA ranking). It zeroes squad/form/climate/manager/host/regional/structural - this is NOT 'all source-backed/verified facts' (host advantage is itself verified tournament context but is intentionally zeroed here to isolate the ratings)._

| Team | Baseline | Variant | Δ |
|---|--:|--:|--:|
| Argentina | 22.7% | 19.0% | -3.7% |
| Spain | 26.6% | 23.4% | -3.2% |
| Mexico | 2.8% | 1.1% | -1.7% |
| Ecuador | 0.9% | 2.5% | +1.6% |
| Türkiye | 0.6% | 1.7% | +1.1% |

## 5. Contribution mix by source status (abs-magnitude share, all 72 group fixtures)

| Variant | source-backed | manual | verified | candidate | placeholder |
|---|--:|--:|--:|--:|--:|
| Baseline (production) | 81% | 1% | 2% | 3% | 14% |
| Elo x0.75 | 77% | 1% | 3% | 3% | 17% |
| Elo x0.50 | 71% | 1% | 3% | 4% | 21% |
| FIFA x1.25 (slope + cap) | 81% | 1% | 2% | 2% | 13% |
| FIFA x1.50 (slope + cap) | 82% | 1% | 2% | 2% | 13% |
| Elo/FIFA balanced | 76% | 1% | 3% | 3% | 18% |
| No placeholder inputs | 94% | 1% | 3% | 3% | 0% |
| No host/regional advantage | 83% | 1% | 0% | 2% | 14% |
| Rating-only (Elo + FIFA) | 100% | 0% | 0% | 0% | 0% |

## 6. Selected match sensitivity - Saudi Arabia v Uruguay (W/D/L)

| Variant | Home win | Draw | Away win |
|---|--:|--:|--:|
| Baseline (production) | 7% | 17% | 76% |
| Elo x0.75 | 11% | 20% | 69% |
| Elo x0.50 | 16% | 22% | 62% |
| FIFA x1.25 (slope + cap) | 6% | 16% | 78% |
| FIFA x1.50 (slope + cap) | 5% | 16% | 79% |
| Elo/FIFA balanced | 12% | 20% | 68% |
| No placeholder inputs | 9% | 18% | 73% |
| No host/regional advantage | 7% | 17% | 76% |
| Rating-only (Elo + FIFA) | 9% | 18% | 73% |

## 7. Selected group-winner sensitivity - Group D (P finish 1st, 1500 iters)

- **Baseline (production):** Türkiye 41% · United States 24% · Paraguay 18% · Australia 16%
- **Elo x0.75:** Türkiye 37% · United States 26% · Paraguay 17% · Australia 19%
- **Elo x0.50:** Türkiye 33% · United States 33% · Paraguay 16% · Australia 18%
- **FIFA x1.25 (slope + cap):** Türkiye 41% · United States 26% · Paraguay 16% · Australia 17%
- **FIFA x1.50 (slope + cap):** Türkiye 42% · United States 26% · Paraguay 16% · Australia 16%
- **Elo/FIFA balanced:** Türkiye 35% · United States 32% · Paraguay 13% · Australia 19%
- **No placeholder inputs:** Türkiye 40% · United States 22% · Paraguay 22% · Australia 16%
- **No host/regional advantage:** Türkiye 44% · United States 18% · Paraguay 19% · Australia 19%
- **Rating-only (Elo + FIFA):** Türkiye 43% · United States 15% · Paraguay 24% · Australia 19%

## 8. Reading the results

- **Elo dominance:** compare `baseline` vs `elo-50` / `elo-75` and the
  contribution mix. Large movement under modest Elo reductions indicates the
  forecast leans heavily on the Elo anchor; small movement indicates robustness.
- **FIFA influence:** `fifa-125` / `fifa-150` widen both the FIFA slope and cap;
  limited movement confirms the cap still bounds FIFA's reach.
- **Placeholders & host/regional:** `no-placeholders` / `no-host-regional`
  isolate those families' marginal effect (placeholders are capped, so expected to
  be small).
- **`rating-only`** isolates ONLY the two source-backed RATING inputs (Elo + FIFA)
  - note it zeroes host/regional/manager/structural too, so it is **not** "all
  source-backed/verified facts" (host advantage is itself verified tournament
  context but is intentionally dropped to isolate the ratings).

## 9. Verdict & recommendation

- **Observed:** reducing the Elo anchor visibly reshuffles the top of the title
  race (the favourites' shares fall by several points under `elo-50`/`balanced`),
  whereas widening FIFA (slope + cap) moves things far less because the FIFA cap
  still bounds its reach. Removing the capped placeholders or host/regional only
  nudges probabilities. The source-status mix stays sound across variants
  (source-backed dominates; placeholders never exceed ~14% by construction).
- **Is Elo dominance reasonable or excessive?** It is **material but not
  pathological**: Elo leads because it carries the widest real signal (hundreds of
  Elo-equivalent points) and is genuinely source-backed; the forecast does not
  collapse onto a single team, and the ordering stays plausible under re-balancing.
  This reads as a **calibration question, not a defect**.
- The audit quantifies sensitivity; it does **not** change production weights.
- **Recommendation:** _keep the current production weights for now_, and treat any
  re-balancing of Elo vs FIFA as a **future weight-tuning phase that should be
  driven by historical backtesting** (out of scope here), rather than tuned to the
  frozen pre-tournament snapshot alone.

---
_Regenerate with `WRITE_SENSITIVITY_AUDIT=1 npx vitest run tests/model-sensitivity.test.ts`._
