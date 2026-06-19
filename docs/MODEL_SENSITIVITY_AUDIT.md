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
- **No placeholder/capped inputs** (`no-placeholders`) - Zeroes squad quality / recent form (capped placeholders) and the capped climate candidate (Phase 1.13).
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
| 1 | Spain | 29.1% |
| 2 | Argentina | 23.5% |
| 3 | France | 13.1% |
| 4 | Portugal | 5.9% |
| 5 | England | 5.9% |
| 6 | Brazil | 4.7% |
| 7 | Colombia | 3.2% |
| 8 | Netherlands | 2.5% |
| 9 | Mexico | 1.8% |
| 10 | Germany | 1.7% |

## 4. Biggest title movers vs baseline (per variant)

### Elo x0.75 (`elo-75`)

_Elo anchor reduced to 75% to test reliance on the dominant rating._

| Team | Baseline | Variant | Δ |
|---|--:|--:|--:|
| Argentina | 23.5% | 18.1% | -5.4% |
| Spain | 29.1% | 24.6% | -4.5% |
| England | 5.9% | 7.5% | +1.6% |
| Mexico | 1.8% | 2.9% | +1.1% |
| Belgium | 1.0% | 1.9% | +0.9% |

### Elo x0.50 (`elo-50`)

_Elo anchor halved - strongest probe of Elo dominance._

| Team | Baseline | Variant | Δ |
|---|--:|--:|--:|
| Spain | 29.1% | 17.2% | -11.9% |
| Argentina | 23.5% | 14.5% | -8.9% |
| Mexico | 1.8% | 4.0% | +2.3% |
| France | 13.1% | 10.9% | -2.1% |
| Germany | 1.7% | 3.5% | +1.8% |

### FIFA x1.25 (slope + cap) (`fifa-125`)

_FIFA slope (per place) and cap (max contribution) both x1.25._

| Team | Baseline | Variant | Δ |
|---|--:|--:|--:|
| Spain | 29.1% | 26.7% | -2.5% |
| England | 5.9% | 7.6% | +1.7% |
| France | 13.1% | 14.8% | +1.7% |
| Argentina | 23.5% | 22.7% | -0.8% |
| Netherlands | 2.5% | 3.1% | +0.7% |

### FIFA x1.50 (slope + cap) (`fifa-150`)

_FIFA slope (per place) and cap (max contribution) both x1.50._

| Team | Baseline | Variant | Δ |
|---|--:|--:|--:|
| England | 5.9% | 8.9% | +3.0% |
| Argentina | 23.5% | 21.9% | -1.5% |
| Netherlands | 2.5% | 3.6% | +1.1% |
| Portugal | 5.9% | 5.0% | -1.0% |
| Colombia | 3.2% | 2.4% | -0.8% |

### Elo/FIFA balanced (`balanced`)

_Elo x0.60 with FIFA slope + cap x1.50 - re-balances the two rating inputs._

| Team | Baseline | Variant | Δ |
|---|--:|--:|--:|
| Spain | 29.1% | 20.6% | -8.5% |
| Argentina | 23.5% | 17.3% | -6.3% |
| Mexico | 1.8% | 3.9% | +2.1% |
| England | 5.9% | 7.7% | +1.8% |
| Portugal | 5.9% | 7.8% | +1.8% |

### No placeholder/capped inputs (`no-placeholders`)

_Zeroes squad quality / recent form (capped placeholders) and the capped climate candidate (Phase 1.13)._

| Team | Baseline | Variant | Δ |
|---|--:|--:|--:|
| Argentina | 23.5% | 18.1% | -5.4% |
| Spain | 29.1% | 23.8% | -5.3% |
| England | 5.9% | 7.6% | +1.8% |
| Mexico | 1.8% | 3.3% | +1.6% |
| Netherlands | 2.5% | 4.0% | +1.6% |

### No host/regional advantage (`no-host-regional`)

_Zeroes host + regional step contributions (tournament-context flags)._

| Team | Baseline | Variant | Δ |
|---|--:|--:|--:|
| Argentina | 23.5% | 21.1% | -2.4% |
| England | 5.9% | 7.3% | +1.4% |
| Brazil | 4.7% | 5.9% | +1.2% |
| Netherlands | 2.5% | 3.5% | +1.1% |
| Spain | 29.1% | 28.3% | -0.8% |

### Rating-only (Elo + FIFA) (`rating-only`)

_Isolates ONLY the two source-backed RATING inputs (Elo + FIFA ranking). It zeroes squad/form/climate/manager/host/regional/structural - this is NOT 'all source-backed/verified facts' (host advantage is itself verified tournament context but is intentionally zeroed here to isolate the ratings)._

| Team | Baseline | Variant | Δ |
|---|--:|--:|--:|
| Spain | 29.1% | 23.4% | -5.7% |
| Argentina | 23.5% | 19.0% | -4.5% |
| England | 5.9% | 8.0% | +2.1% |
| Portugal | 5.9% | 4.2% | -1.8% |
| Ecuador | 1.1% | 2.5% | +1.4% |

## 5. Contribution mix by source status (abs-magnitude share, all 72 group fixtures)

| Variant | source-backed | manual | verified | candidate | placeholder |
|---|--:|--:|--:|--:|--:|
| Baseline (production) | 80% | 0% | 2% | 7% | 10% |
| Elo x0.75 | 76% | 0% | 3% | 9% | 12% |
| Elo x0.50 | 70% | 0% | 3% | 11% | 15% |
| FIFA x1.25 (slope + cap) | 81% | 0% | 2% | 7% | 10% |
| FIFA x1.50 (slope + cap) | 82% | 0% | 2% | 7% | 9% |
| Elo/FIFA balanced | 75% | 0% | 3% | 9% | 13% |
| No placeholder/capped inputs | 94% | 0% | 3% | 4% | 0% |
| No host/regional advantage | 83% | 0% | 0% | 7% | 10% |
| Rating-only (Elo + FIFA) | 100% | 0% | 0% | 0% | 0% |

## 6. Selected match sensitivity - Saudi Arabia v Uruguay (W/D/L)

| Variant | Home win | Draw | Away win |
|---|--:|--:|--:|
| Baseline (production) | 6% | 16% | 78% |
| Elo x0.75 | 9% | 19% | 72% |
| Elo x0.50 | 14% | 22% | 64% |
| FIFA x1.25 (slope + cap) | 5% | 15% | 80% |
| FIFA x1.50 (slope + cap) | 4% | 15% | 81% |
| Elo/FIFA balanced | 10% | 19% | 70% |
| No placeholder/capped inputs | 9% | 18% | 73% |
| No host/regional advantage | 6% | 16% | 78% |
| Rating-only (Elo + FIFA) | 9% | 18% | 73% |

## 7. Selected group-winner sensitivity - Group D (P finish 1st, 1500 iters)

- **Baseline (production):** Türkiye 41% · United States 22% · Paraguay 19% · Australia 18%
- **Elo x0.75:** Türkiye 39% · United States 24% · Paraguay 17% · Australia 20%
- **Elo x0.50:** Türkiye 33% · United States 31% · Paraguay 17% · Australia 20%
- **FIFA x1.25 (slope + cap):** Türkiye 42% · United States 23% · Paraguay 17% · Australia 18%
- **FIFA x1.50 (slope + cap):** Türkiye 42% · United States 23% · Paraguay 16% · Australia 18%
- **Elo/FIFA balanced:** Türkiye 34% · United States 30% · Paraguay 15% · Australia 20%
- **No placeholder/capped inputs:** Türkiye 40% · United States 23% · Paraguay 21% · Australia 16%
- **No host/regional advantage:** Türkiye 46% · United States 17% · Paraguay 20% · Australia 18%
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
