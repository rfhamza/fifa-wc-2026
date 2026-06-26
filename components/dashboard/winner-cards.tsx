import Link from "next/link";
import { ProbabilityMeter } from "@/components/charts/probability-meter";
import { FlagGlyph } from "@/components/flag-glyph";
import { pct } from "@/lib/utils";
import { STAGE_COLUMNS, type WinnerRow } from "./winner-table";

/**
 * Mobile stacked-card layout for the tournament outlook (shown below `md`, where the
 * rich table would overflow ~375-430px viewports). Same rows, same order, same `pct()`
 * values as the desktop table - this is a presentation alternative, not a data change.
 * Rank, flag, team and win-title probability are prominent; R16/QF/SF/Final sit in a
 * compact secondary row (progressive disclosure).
 */
export function WinnerCards({ rows }: { rows: WinnerRow[] }) {
  return (
    <ul className="space-y-2">
      {rows.map((row, i) => (
        <li
          key={row.team.id}
          className="rounded-lg border border-border/60 bg-card/40 p-3"
        >
          <Link
            href={`/teams/${row.team.id}`}
            className="flex items-center gap-2.5 transition-colors hover:text-primary"
          >
            <span className="w-5 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
              {i + 1}
            </span>
            <FlagGlyph
              countryCode={row.team.countryCode}
              flag={row.team.flag}
              name={row.team.name}
              size={18}
            />
            <span className="min-w-0 flex-1 truncate font-medium">{row.team.name}</span>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">
              {pct(row.probability.winner, 1)}
            </span>
          </Link>
          <ProbabilityMeter
            value={row.probability.winner}
            className="mt-2"
            color="bg-primary"
          />
          <div className="mt-2 grid grid-cols-4 gap-1 text-center">
            {STAGE_COLUMNS.map((c) => (
              <div key={c.key} className="rounded bg-secondary/30 py-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {c.label}
                </div>
                <div className="text-xs font-medium tabular-nums">
                  {pct(row.probability[c.key], 0)}
                </div>
              </div>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
