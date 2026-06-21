# Historical source-pack templates (Phase 1.18B-0)

**Header-only column templates — NOT data.** These `*.template.csv` files contain only a header
row to document the column contract for each historical source pack (see
`docs/BACKTESTING_DATA_CONTRACT.md` and `lib/backtesting/types.ts`).

- **No historical data is committed here.** Raw source files stay **outside** the repo; a later
  phase (1.18B+) transcribes supplied source files into derived snapshots under
  `data/historical/snapshots/` with provenance + SHA-256 checksums.
- These templates are **not imported by any code** (production or backtesting); they are
  documentation only.
- Leakage rule: every as-of/date column must be **strictly before** the tournament's opening
  kickoff. No proprietary player rating / market-value columns may be added (see
  `BACKTEST_FORBIDDEN_FIELDS`).

One template per pack: tournament-identity, match-results, pre-tournament-elo,
pre-tournament-fifa, historical-macro, recent-form, managers (optional), squad-roster (optional).
