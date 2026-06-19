# Forecast Behaviour Audit (Phase 1.9, extended in Phase 1.10)

> **Frozen pre-tournament baseline forecast, using information available at tournament start.**
>
> Probabilities are **not** conditioned on any match played after 11 Jun 2026 and
> are **not** compared to actual 2026 outcomes. Sample matches below are
> **scheduled fixtures, not played**.

## 1. Scope - baseline vs live model

- **Baseline model (this audit):** uses information available at tournament start -
  the **11 Jun 2026** source-backed FIFA ranking + Elo rating snapshots, the
  **World Bank WDI 2024** structural prior (`candidate`: 46 teams source-backed,
  England/Scotland workbook-derived from ONS/Scottish-Government), capped
  placeholders, and the official schedule.
- **Live model (future phase):** will ingest completed match results and update
  standings / conditional probabilities. **Not** part of this baseline audit.

Deterministic seed `20260611`, 2000 iterations (Monte Carlo). Re-running
with the same seed yields identical probabilities (asserted in
`tests/forecast-behavior.test.ts`). The snapshot timestamp is intentionally
omitted (audit must not depend on the current date).

## 2. Model-input status summary

| Family | Status | In model |
|---|---|---|
| Elo rating | **source-backed** (11 Jun 2026 snapshot) | anchor (weight 1.0) |
| FIFA ranking | **source-backed** (11 Jun 2026 snapshot) | rank driver (cap +/-90) |
| Structural (GDP+pop) | candidate (46 World Bank source-backed; England/Scotland official-derived ONS/SG) | weak prior (<=10) |
| Climate suitability | candidate (46 CCKP 1991-2020 source-backed; England/Scotland official-derived Met Office) | weak prior, **capped +/-25** |
| Squad quality / Recent form | placeholder | **weight-capped** |
| Host / Regional / Manager | verified / candidate | structural flags |

Placeholder caps: per-driver +/-25, aggregate
+/-40 Elo-equivalent pts. The climate
`candidate` driver is separately capped at +/-25 (a
documented home-climate playability heuristic, calibration deferred).

## 3. Top-level probability snapshot

**Top 10 title probability**

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

**Top 10 reach round-of-16**

| # | Team | Reach R16 |
|--:|---|--:|
| 1 | Spain | 83.5% |
| 2 | France | 81.3% |
| 3 | Argentina | 74.7% |
| 4 | England | 73.2% |
| 5 | Mexico | 73.1% |
| 6 | Portugal | 70.7% |
| 7 | Brazil | 66.4% |
| 8 | Belgium | 65.3% |
| 9 | Switzerland | 63.7% |
| 10 | Germany | 61.9% |

**Group-winner probability** (audit-only sim: P(finish 1st), seed `20260611`, 4000
iters per group; ranks via the production Article-13 standings - this is NOT
qualifyTop2):

- **Group A:** Mexico 65% · South Korea 24% · Czechia 10% · South Africa 1%
- **Group B:** Switzerland 59% · Canada 35% · Bosnia & Herzegovina 5% · Qatar 0%
- **Group C:** Brazil 64% · Morocco 26% · Scotland 10% · Haiti 1%
- **Group D:** Türkiye 41% · United States 23% · Australia 18% · Paraguay 18%
- **Group E:** Germany 52% · Ecuador 41% · Ivory Coast 7% · Curaçao 0%
- **Group F:** Netherlands 56% · Japan 37% · Sweden 5% · Tunisia 3%
- **Group G:** Belgium 60% · Iran 25% · Egypt 13% · New Zealand 2%
- **Group H:** Spain 82% · Uruguay 17% · Cape Verde 1% · Saudi Arabia 0%
- **Group I:** France 68% · Norway 17% · Senegal 15% · Iraq 1%
- **Group J:** Argentina 85% · Austria 9% · Algeria 5% · Jordan 1%
- **Group K:** Portugal 55% · Colombia 41% · Uzbekistan 3% · DR Congo 2%
- **Group L:** England 64% · Croatia 30% · Panama 6% · Ghana 0%

**Sample scheduled matches** (W / D / L for the home side; not played)

| Match | Fixture | Home win / Draw / Away win |
|---|---|---|
| M1 | Mexico v South Africa | 85% / 12% / 3% |
| M5 | Haiti v Scotland | 12% / 21% / 67% |
| M11 | Netherlands v Japan | 46% / 26% / 28% |
| M19 | Argentina v Algeria | 79% / 16% / 6% |
| M21 | Ghana v Panama | 13% / 21% / 66% |

## 4. Contribution-by-status (two explicitly separate methods)

**Method A - signed net contribution per match** (directional, single match
Mexico v South Africa; Elo-equivalent pts, + favours home):

| Status | Signed net |
|---|--:|
| source-backed | 434.4 |
| verified | 60 |
| candidate | -3.1 |
| placeholder | 37 |

**Method B - absolute contribution magnitude, aggregated over all 72 group
fixtures** (overall influence; sum of |contribution| by status):

| Status | Abs magnitude | Share |
|---|--:|--:|
| source-backed | 19683 | 80.5% |
| verified | 540 | 2.2% |
| candidate | 1775 | 7.3% |
| placeholder | 2464 | 10.1% |

## 5. Sanity-check results (invariants - all PASS)

- Deterministic for a fixed seed; no NaN/Infinity anywhere.
- Every stage probability in [0,1]; stage funnel monotone (R32 >= R16 >= QF >= SF >= Final >= Winner).
- Winner probabilities sum to ~1; ~32 teams reach R32; each group's top-two sums to ~2.
- Match W/D/L sums to ~1; group-winner P(win) per group sums to ~1.
- Placeholder caps bind: max placeholder net magnitude over all fixtures =
  40 pts (<= 40).
- Elo and FIFA-ranking drivers are both `source-backed`; `fixtureSource === "official"`.

## 6. Finding - the forecast is now anchored by a source-backed input

Method B shows **source-backed** contribution magnitude now dominates: with Elo
promoted to source-backed (Phase 1.10), both the high-influence Elo anchor and the
capped FIFA-ranking driver come from cited 11 Jun 2026 snapshots. The weak
structural prior moved from `manual` to **`candidate`** in Phase 1.12 (46 teams
source-backed from the World Bank WDI 2024; England/Scotland are `official-derived`
from an ONS/Scottish-Government workbook since Phase 1.12.1), so plain `manual`
disappears from the status mix. The forecast is therefore anchored
by a **source-backed** input - a provenance/credibility improvement over the Phase
1.9 baseline, where manual Elo dominated. This is a status-mix shift only: **no
model weights were changed**, so the relative magnitude of Elo vs FIFA ranking is
unchanged (Elo still spans hundreds of Elo-equivalent pts while FIFA ranking is
capped at +/-90). That Elo still out-influences FIFA ranking is a **modelling /
calibration consideration, not a defect**.

## 7. Recommendation

Probabilities are sane, finite, deterministic, explainable, and not silently
distorted (placeholders are capped and disclosed). The main inputs are now
source-backed. The remaining open item is **calibration**: run a separate phase to
decide how the (now source-backed) Elo anchor and the source-backed FIFA ranking
should be balanced, rather than letting one input dominate by construction. No
model weights were changed in this phase.

---
_Regenerate with `WRITE_FORECAST_AUDIT=1 npx vitest run tests/forecast-behavior.test.ts`._
