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
| 1 | Spain | 28.6% |
| 2 | Argentina | 21.6% |
| 3 | France | 14.3% |
| 4 | England | 8.0% |
| 5 | Portugal | 5.8% |
| 6 | Brazil | 4.8% |
| 7 | Netherlands | 2.4% |
| 8 | Colombia | 2.1% |
| 9 | Mexico | 1.9% |
| 10 | Germany | 1.8% |

## 4. Biggest title movers vs baseline (per variant)

### Elo x0.75 (`elo-75`)

_Elo anchor reduced to 75% to test reliance on the dominant rating._

| Team | Baseline | Variant | Δ |
|---|--:|--:|--:|
| Spain | 28.6% | 23.2% | -5.4% |
| Argentina | 21.6% | 18.6% | -2.9% |
| Mexico | 1.9% | 3.5% | +1.6% |
| England | 8.0% | 6.5% | -1.5% |
| France | 14.3% | 13.0% | -1.4% |

### Elo x0.50 (`elo-50`)

_Elo anchor halved - strongest probe of Elo dominance._

| Team | Baseline | Variant | Δ |
|---|--:|--:|--:|
| Spain | 28.6% | 17.3% | -11.2% |
| Argentina | 21.6% | 15.2% | -6.4% |
| France | 14.3% | 10.7% | -3.7% |
| Brazil | 4.8% | 7.3% | +2.5% |
| Mexico | 1.9% | 4.0% | +2.1% |

### FIFA x1.25 (slope + cap) (`fifa-125`)

_FIFA slope (per place) and cap (max contribution) both x1.25._

| Team | Baseline | Variant | Δ |
|---|--:|--:|--:|
| Argentina | 21.6% | 23.2% | +1.6% |
| England | 8.0% | 6.7% | -1.3% |
| France | 14.3% | 13.5% | -0.9% |
| Portugal | 5.8% | 6.6% | +0.8% |
| Belgium | 1.6% | 0.9% | -0.7% |

### FIFA x1.50 (slope + cap) (`fifa-150`)

_FIFA slope (per place) and cap (max contribution) both x1.50._

| Team | Baseline | Variant | Δ |
|---|--:|--:|--:|
| Spain | 28.6% | 30.3% | +1.7% |
| Argentina | 21.6% | 22.9% | +1.4% |
| France | 14.3% | 13.5% | -0.9% |
| England | 8.0% | 7.4% | -0.6% |
| Belgium | 1.6% | 1.1% | -0.5% |

### Elo/FIFA balanced (`balanced`)

_Elo x0.60 with FIFA slope + cap x1.50 - re-balances the two rating inputs._

| Team | Baseline | Variant | Δ |
|---|--:|--:|--:|
| Spain | 28.6% | 19.6% | -9.0% |
| Argentina | 21.6% | 14.5% | -7.1% |
| Mexico | 1.9% | 4.0% | +2.1% |
| Germany | 1.8% | 3.7% | +1.9% |
| Brazil | 4.8% | 6.2% | +1.4% |

### No placeholder/capped inputs (`no-placeholders`)

_Zeroes squad quality / recent form (capped placeholders) and the capped climate candidate (Phase 1.13)._

| Team | Baseline | Variant | Δ |
|---|--:|--:|--:|
| Argentina | 21.6% | 17.1% | -4.4% |
| France | 14.3% | 11.5% | -2.9% |
| England | 8.0% | 6.2% | -1.9% |
| Spain | 28.6% | 27.3% | -1.3% |
| Japan | 0.7% | 1.9% | +1.3% |

### No host/regional advantage (`no-host-regional`)

_Zeroes host + regional step contributions (tournament-context flags)._

| Team | Baseline | Variant | Δ |
|---|--:|--:|--:|
| France | 14.3% | 13.1% | -1.3% |
| Argentina | 21.6% | 22.7% | +1.1% |
| Mexico | 1.9% | 1.1% | -0.9% |
| Netherlands | 2.4% | 3.2% | +0.8% |
| Spain | 28.6% | 27.9% | -0.7% |

### Rating-only (Elo + FIFA) (`rating-only`)

_Isolates ONLY the two source-backed RATING inputs (Elo + FIFA ranking). It zeroes squad/form/climate/manager/host/regional/structural - this is NOT 'all source-backed/verified facts' (host advantage is itself verified tournament context but is intentionally zeroed here to isolate the ratings)._

| Team | Baseline | Variant | Δ |
|---|--:|--:|--:|
| Spain | 28.6% | 24.0% | -4.6% |
| Argentina | 21.6% | 17.3% | -4.2% |
| France | 14.3% | 11.5% | -2.9% |
| Colombia | 2.1% | 4.7% | +2.5% |
| Ecuador | 1.1% | 2.6% | +1.4% |

## 5. Contribution mix by source status (abs-magnitude share, all 72 group fixtures)

| Variant | source-backed | manual | verified | candidate | placeholder |
|---|--:|--:|--:|--:|--:|
| Baseline (production) | 80% | 0% | 2% | 8% | 10% |
| Elo x0.75 | 76% | 0% | 3% | 9% | 12% |
| Elo x0.50 | 70% | 0% | 3% | 12% | 15% |
| FIFA x1.25 (slope + cap) | 81% | 0% | 2% | 8% | 10% |
| FIFA x1.50 (slope + cap) | 81% | 0% | 2% | 7% | 9% |
| Elo/FIFA balanced | 75% | 0% | 3% | 10% | 13% |
| No placeholder/capped inputs | 93% | 0% | 3% | 4% | 0% |
| No host/regional advantage | 82% | 0% | 0% | 7% | 10% |
| Rating-only (Elo + FIFA) | 99% | 0% | 0% | 1% | 0% |

## 6. Selected match sensitivity - Saudi Arabia v Uruguay (W/D/L)

| Variant | Home win | Draw | Away win |
|---|--:|--:|--:|
| Baseline (production) | 6% | 16% | 78% |
| Elo x0.75 | 9% | 19% | 72% |
| Elo x0.50 | 14% | 22% | 64% |
| FIFA x1.25 (slope + cap) | 5% | 15% | 80% |
| FIFA x1.50 (slope + cap) | 5% | 15% | 81% |
| Elo/FIFA balanced | 10% | 20% | 70% |
| No placeholder/capped inputs | 9% | 18% | 73% |
| No host/regional advantage | 6% | 16% | 78% |
| Rating-only (Elo + FIFA) | 9% | 18% | 73% |

## 7. Selected group-winner sensitivity - Group D (P finish 1st, 1500 iters)

- **Baseline (production):** Türkiye 40% · United States 23% · Australia 18% · Paraguay 18%
- **Elo x0.75:** Türkiye 37% · United States 25% · Australia 20% · Paraguay 18%
- **Elo x0.50:** Türkiye 32% · United States 30% · Australia 20% · Paraguay 18%
- **FIFA x1.25 (slope + cap):** Türkiye 41% · United States 23% · Australia 18% · Paraguay 17%
- **FIFA x1.50 (slope + cap):** Türkiye 43% · United States 22% · Australia 18% · Paraguay 17%
- **Elo/FIFA balanced:** Türkiye 36% · United States 30% · Australia 19% · Paraguay 15%
- **No placeholder/capped inputs:** Türkiye 39% · United States 23% · Australia 17% · Paraguay 22%
- **No host/regional advantage:** Türkiye 45% · United States 17% · Australia 18% · Paraguay 20%
- **Rating-only (Elo + FIFA):** Türkiye 43% · United States 15% · Australia 19% · Paraguay 23%

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
