# Forecast Behaviour Audit (Phase 1.9, extended in Phase 1.10)

> **Frozen pre-tournament baseline forecast, using information available at tournament start.**
>
> Probabilities are **not** conditioned on any match played after 11 Jun 2026 and
> are **not** compared to actual 2026 outcomes. Sample matches below are
> **scheduled fixtures, not played**.

## 1. Scope - baseline vs live model

- **Baseline model (this audit):** uses information available at tournament start -
  the **11 Jun 2026** source-backed FIFA ranking + Elo rating snapshots, the
  **World Bank WDI 2024** structural prior (now `candidate`: 46 teams source-backed,
  England/Scotland manual), capped placeholders, and the official schedule.
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
| Structural (GDP+pop) | candidate (46 World Bank source-backed; England/Scotland manual) | weak prior (<=10) |
| Squad quality / Recent form / Climate | placeholder | **weight-capped** |
| Host / Regional / Manager | verified / candidate | structural flags |

Placeholder caps: per-driver +/-25, aggregate
+/-40 Elo-equivalent pts.

## 3. Top-level probability snapshot

**Top 10 title probability**

| # | Team | Title |
|--:|---|--:|
| 1 | Spain | 27.9% |
| 2 | Argentina | 23.6% |
| 3 | France | 12.0% |
| 4 | England | 6.6% |
| 5 | Brazil | 5.3% |
| 6 | Portugal | 4.5% |
| 7 | Colombia | 3.7% |
| 8 | Netherlands | 2.5% |
| 9 | Mexico | 2.1% |
| 10 | Germany | 1.7% |

**Top 10 reach round-of-16**

| # | Team | Reach R16 |
|--:|---|--:|
| 1 | Spain | 83.0% |
| 2 | France | 79.5% |
| 3 | Argentina | 75.8% |
| 4 | Mexico | 73.6% |
| 5 | England | 73.4% |
| 6 | Belgium | 66.8% |
| 7 | Brazil | 66.3% |
| 8 | Portugal | 65.3% |
| 9 | Germany | 62.4% |
| 10 | Switzerland | 61.1% |

**Group-winner probability** (audit-only sim: P(finish 1st), seed `20260611`, 4000
iters per group; ranks via the production Article-13 standings - this is NOT
qualifyTop2):

- **Group A:** Mexico 65% · South Korea 24% · Czechia 10% · South Africa 1%
- **Group B:** Switzerland 56% · Canada 40% · Bosnia & Herzegovina 4% · Qatar 1%
- **Group C:** Brazil 65% · Morocco 24% · Scotland 10% · Haiti 1%
- **Group D:** Türkiye 39% · United States 27% · Australia 17% · Paraguay 17%
- **Group E:** Germany 52% · Ecuador 39% · Ivory Coast 9% · Curaçao 0%
- **Group F:** Netherlands 55% · Japan 36% · Sweden 6% · Tunisia 3%
- **Group G:** Belgium 58% · Iran 25% · Egypt 15% · New Zealand 1%
- **Group H:** Spain 82% · Uruguay 17% · Cape Verde 1% · Saudi Arabia 0%
- **Group I:** France 67% · Senegal 17% · Norway 16% · Iraq 0%
- **Group J:** Argentina 82% · Austria 9% · Algeria 7% · Jordan 2%
- **Group K:** Portugal 53% · Colombia 42% · Uzbekistan 3% · DR Congo 1%
- **Group L:** England 62% · Croatia 30% · Panama 7% · Ghana 0%

**Sample scheduled matches** (W / D / L for the home side; not played)

| Match | Fixture | Home win / Draw / Away win |
|---|---|---|
| M1 | Mexico v South Africa | 86% / 12% / 2% |
| M5 | Haiti v Scotland | 13% / 21% / 66% |
| M11 | Netherlands v Japan | 45% / 26% / 29% |
| M19 | Argentina v Algeria | 77% / 17% / 7% |
| M21 | Ghana v Panama | 14% / 22% / 64% |

## 4. Contribution-by-status (two explicitly separate methods)

**Method A - signed net contribution per match** (directional, single match
Mexico v South Africa; Elo-equivalent pts, + favours home):

| Status | Signed net |
|---|--:|
| source-backed | 434.4 |
| verified | 60 |
| candidate | 1.2 |
| placeholder | 40 |

**Method B - absolute contribution magnitude, aggregated over all 72 group
fixtures** (overall influence; sum of |contribution| by status):

| Status | Abs magnitude | Share |
|---|--:|--:|
| source-backed | 19683 | 80.8% |
| verified | 540 | 2.2% |
| candidate | 759 | 3.1% |
| placeholder | 3392 | 13.9% |

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
source-backed from the World Bank WDI 2024; England/Scotland remain manual), so
`manual` all but disappears from the status mix. The forecast is therefore anchored
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
