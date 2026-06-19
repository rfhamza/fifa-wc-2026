# Forecast Behaviour Audit (Phase 1.9)

> **Frozen pre-tournament baseline forecast, using information available at tournament start.**
>
> Probabilities are **not** conditioned on any match played after 11 Jun 2026 and
> are **not** compared to actual 2026 outcomes. Sample matches below are
> **scheduled fixtures, not played**.

## 1. Scope - baseline vs live model

- **Baseline model (this audit):** uses information available at tournament start -
  the **11 Jun 2026** source-backed FIFA ranking snapshot, manual Elo, manual
  structural priors, capped placeholders, and the official schedule.
- **Live model (future phase):** will ingest completed match results and update
  standings / conditional probabilities. **Not** part of Phase 1.9.

Deterministic seed `20260611`, 2000 iterations (Monte Carlo). Re-running
with the same seed yields identical probabilities (asserted in
`tests/forecast-behavior.test.ts`). The snapshot timestamp is intentionally
omitted (audit must not depend on the current date).

## 2. Model-input status summary

| Family | Status | In model |
|---|---|---|
| FIFA ranking | **source-backed** (11 Jun 2026 snapshot) | rank driver (cap +/-90) |
| Elo rating | manual | anchor (weight 1.0) |
| Structural (GDP+pop) | manual | weak prior (<=10) |
| Squad quality / Recent form / Climate | placeholder | **weight-capped** |
| Host / Regional / Manager | verified / candidate | structural flags |

Placeholder caps: per-driver +/-25, aggregate
+/-40 Elo-equivalent pts.

## 3. Top-level probability snapshot

**Top 10 title probability**

| # | Team | Title |
|--:|---|--:|
| 1 | Argentina | 19.3% |
| 2 | France | 16.2% |
| 3 | Spain | 14.2% |
| 4 | England | 9.5% |
| 5 | Brazil | 8.3% |
| 6 | Portugal | 7.5% |
| 7 | Netherlands | 5.3% |
| 8 | Germany | 4.6% |
| 9 | Belgium | 2.1% |
| 10 | Mexico | 2.0% |

**Top 10 reach round-of-16**

| # | Team | Reach R16 |
|--:|---|--:|
| 1 | France | 80.0% |
| 2 | England | 74.7% |
| 3 | Argentina | 73.4% |
| 4 | Spain | 72.5% |
| 5 | Germany | 71.3% |
| 6 | Portugal | 71.0% |
| 7 | Brazil | 70.6% |
| 8 | Belgium | 64.7% |
| 9 | Mexico | 64.6% |
| 10 | United States | 58.9% |

**Group-winner probability** (audit-only sim: P(finish 1st), seed `20260611`, 4000
iters per group; ranks via the production Article-13 standings - this is NOT
qualifyTop2):

- **Group A:** Mexico 52% · South Korea 28% · Czechia 14% · South Africa 5%
- **Group B:** Switzerland 41% · Canada 35% · Qatar 15% · Bosnia & Herzegovina 9%
- **Group C:** Brazil 64% · Morocco 28% · Scotland 7% · Haiti 1%
- **Group D:** United States 50% · Türkiye 22% · Australia 21% · Paraguay 7%
- **Group E:** Germany 67% · Ivory Coast 16% · Ecuador 15% · Curaçao 2%
- **Group F:** Netherlands 60% · Japan 23% · Sweden 12% · Tunisia 5%
- **Group G:** Belgium 53% · Iran 26% · Egypt 20% · New Zealand 1%
- **Group H:** Spain 73% · Uruguay 24% · Saudi Arabia 2% · Cape Verde 1%
- **Group I:** France 72% · Senegal 18% · Norway 8% · Iraq 2%
- **Group J:** Argentina 81% · Austria 10% · Algeria 8% · Jordan 1%
- **Group K:** Portugal 66% · Colombia 28% · Uzbekistan 4% · DR Congo 3%
- **Group L:** England 63% · Croatia 30% · Panama 6% · Ghana 2%

**Sample scheduled matches** (W / D / L for the home side; not played)

| Match | Fixture | Home win / Draw / Away win |
|---|---|---|
| M1 | Mexico v South Africa | 70% / 20% / 11% |
| M5 | Haiti v Scotland | 19% / 24% / 58% |
| M11 | Netherlands v Japan | 55% / 24% / 21% |
| M19 | Argentina v Algeria | 74% / 18% / 8% |
| M21 | Ghana v Panama | 27% / 26% / 48% |

## 4. Contribution-by-status (two explicitly separate methods)

**Method A - signed net contribution per match** (directional, single match
Mexico v South Africa; Elo-equivalent pts, + favours home):

| Status | Signed net |
|---|--:|
| source-backed | 64.4 |
| manual | 175.9 |
| verified | 60 |
| candidate | 0 |
| placeholder | 40 |

**Method B - absolute contribution magnitude, aggregated over all 72 group
fixtures** (overall influence; sum of |contribution| by status):

| Status | Abs magnitude | Share |
|---|--:|--:|
| source-backed | 3090 | 15.6% |
| manual | 12182 | 61.4% |
| verified | 540 | 2.7% |
| candidate | 627 | 3.2% |
| placeholder | 3392 | 17.1% |

## 5. Sanity-check results (invariants - all PASS)

- Deterministic for a fixed seed; no NaN/Infinity anywhere.
- Every stage probability in [0,1]; stage funnel monotone (R32 >= R16 >= QF >= SF >= Final >= Winner).
- Winner probabilities sum to ~1; ~32 teams reach R32; each group's top-two sums to ~2.
- Match W/D/L sums to ~1; group-winner P(win) per group sums to ~1.
- Placeholder caps bind: max placeholder net magnitude over all fixtures =
  40 pts (<= 40).
- FIFA-ranking driver is `source-backed`; Elo driver is `manual`; `fixtureSource === "official"`.

## 6. Finding - manual Elo dominates source-backed FIFA ranking

Method B shows **manual** contribution magnitude greatly exceeds **source-backed**
(FIFA ranking is capped at +/-90 while Elo spans hundreds of Elo-equivalent pts).
The forecast is therefore anchored by a **manual** input, not the source-backed
one. This is expected given current weights and is **not a defect**, but it means
source-backed FIFA ranking has limited influence today.

## 7. Recommendation

Probabilities are sane, finite, deterministic, explainable, and not silently
distorted (placeholders are capped and disclosed). **Before ingesting Elo**, run a
**separate calibration phase** to decide how the manual Elo anchor and the
source-backed FIFA ranking should be balanced (and how a future source-backed Elo
snapshot should be weighted) - rather than letting a manual input dominate. No
model weights were changed in this phase.

---
_Regenerate with `WRITE_FORECAST_AUDIT=1 npx vitest run tests/forecast-behavior.test.ts`._
