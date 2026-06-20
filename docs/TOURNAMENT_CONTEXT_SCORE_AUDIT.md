# Tournament-Context Score Audit (Phase 1.15A)

Re-audit of the pure, **unwired** tournament-context composite after the Phase 1.15A
scoring refinements (per-match altitude dose; weighted composite; documented skew).
Generated from `tournamentContextScores()` over all 48 teams (each with 3 stops).
The score remains a **candidate** heuristic and is **not** wired into the model.

## Distribution: before vs after

| Metric | Before (1.14) | After (1.15A) |
| --- | --- | --- |
| min | -0.160 | +0.014 |
| max | +0.864 | +0.899 |
| mean | +0.437 | +0.521 |
| median | +0.483 | +0.536 |
| stdev (pop.) | 0.235 | 0.178 |
| teams negative | ~6 | 0 |
| altitude sub-score min | **-1.000** (5 teams) | **-0.648** (1 team: Mexico) |
| altitude sub-score range | 1.99 | 1.65 |

## Top 10 (most favourable, after)

Paraguay +0.90, Argentina +0.79, Türkiye +0.75, South Korea +0.74, Australia +0.73,
Iran +0.73, Egypt +0.70, United States +0.68, New Zealand +0.68, Netherlands +0.66.
Drivers: short travel, clean rest, low/near-zero altitude burden, no time-zone shift.

## Bottom 10 (most difficult, after)

Mexico +0.40, Ecuador +0.38, England +0.33, Croatia +0.33, South Africa +0.30,
Algeria +0.23, Uzbekistan +0.19, Czechia +0.18, DR Congo +0.09, Colombia +0.01.
Drivers are now **rest congestion and travel** (e.g. Colombia/DR Congo/Croatia rest
`-0.40 / -0.40 / -0.39`), plus Mexico's genuine multi-match altitude exposure.

## Component ranges / means (after)

| Component | min | max | mean | range |
| --- | --- | --- | --- | --- |
| travel | -0.264 | +0.902 | +0.485 | 1.17 |
| rest | -0.472 | +1.000 | +0.321 | 1.47 |
| altitude | -0.648 | +1.000 | +0.864 | 1.65 |
| timeZone | -0.333 | +1.000 | +0.681 | 1.33 |
| venueContinuity | 0.000 | +0.500 | +0.146 | 0.50 |

## Findings

- **Altitude no longer dominates the negative tail.** A single high-altitude match
  is now a partial penalty (mean burden over 3 matches), so one-off Mexico City
  visitors (Colombia, Czechia) sit near neutral on altitude (`~+0.02`), while Mexico
  - which genuinely plays multiple high-altitude home matches - retains the only
  meaningfully negative altitude sub-score (`-0.648`). The new negative tail is
  driven by **rest/travel**, which is the more defensible signal.
- **time-zone / venue-continuity no longer over-influence the composite.** Both are
  down-weighted to `0.5` (named `COMPOSITE_WEIGHTS`), so travel/rest/altitude carry
  the main signal. They remain visible in the per-component breakdown.
- **Signed range / skew.** Sub-components use the signed range well (altitude down to
  -0.65, rest -0.47, travel -0.26, time-zone -0.33). The **composite** is now
  favourability-skewed to entirely positive (`+0.01..+0.90`), a direct consequence of
  altitude no longer punishing single matches. Per the agreed approach this is
  **documented, not hard-corrected**: integration (if approved) uses pairwise
  differences `(a - b)` behind a tight cap, so the constant offset cancels. The
  stdev tightened (0.235 -> 0.178); the spread that matters for pairwise differences
  is still ~0.89 (max - min).
- **No outliers look wrong.** Paraguay (short travel + repeat venue) tops; Mexico is
  correctly the most altitude-burdened; USA stays high on host-style rest scheduling
  despite more travel. Rankings are directionally sensible.

## Scope (unchanged)

Host/regional advantage is **excluded** (no double-counting); heat / venue-climate is
**deferred**; the score is **candidate** and **unwired**; model integration requires
separate approval.
