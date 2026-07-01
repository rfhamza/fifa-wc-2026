import Link from "next/link";
import { ProbabilityMeter } from "@/components/charts/probability-meter";
import { MoverChip } from "@/components/ui/mover-chip";
import { FlagGlyph } from "@/components/flag-glyph";
import { TeamStatusBadge } from "@/components/teams/forecast-board-table";
import { pct } from "@/lib/utils";
import type { BoardRow, BoardStatus, BoardView } from "@/lib/ui/forecast-board";

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-secondary/40 py-1 text-center">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xs font-medium tabular-nums">{value}</div>
    </div>
  );
}

/** Mobile card layout (shown below md). Same rows/order as the desktop table. */
export function ForecastBoardCards({
  rows,
  statusOf,
  view,
}: {
  rows: BoardRow[];
  statusOf: (teamId: string) => BoardStatus;
  view: BoardView;
}) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const status = statusOf(row.teamId);
        const rank = view === "baseline" ? row.baselineRank ?? row.rank : row.rank;
        const headlineTitle = view === "baseline" ? row.baseline?.winner ?? null : row.current.winner;
        return (
          <li key={row.teamId} className="rounded-lg border border-border/60 bg-card/60 p-3">
            <div className="flex items-center gap-2.5">
              <span className="w-5 shrink-0 text-right text-sm text-muted-foreground tabular-nums">{rank}</span>
              <Link href={`/teams/${row.teamId}`} className="flex min-w-0 flex-1 items-center gap-2 transition-colors hover:text-primary">
                <FlagGlyph countryCode={row.countryCode} flag={row.flag} name={row.name} size={18} />
                <span className="min-w-0 flex-1 truncate font-medium">{row.name}</span>
              </Link>
              {view === "movement" && row.winnerDeltaPp != null ? <MoverChip deltaPp={row.winnerDeltaPp} /> : null}
              <span className="shrink-0 text-base font-bold tabular-nums text-primary">
                {headlineTitle == null ? "—" : pct(headlineTitle, 1)}
              </span>
            </div>

            {view !== "movement" ? (
              <ProbabilityMeter value={headlineTitle ?? 0} className="mt-2" color="bg-primary" />
            ) : null}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <TeamStatusBadge status={status} />
              {view === "current" && row.winnerDeltaPp != null ? <MoverChip deltaPp={row.winnerDeltaPp} /> : null}
            </div>

            {view === "current" ? (
              <div className="mt-2 grid grid-cols-2 gap-1">
                <Chip label="Reach final" value={pct(row.current.final, 0)} />
                <Chip label="Reach SF" value={pct(row.current.semiFinal, 0)} />
              </div>
            ) : null}

            {view === "movement" ? (
              <div className="mt-2 text-xs text-muted-foreground tabular-nums">
                {row.baseline ? pct(row.baseline.winner, 1) : "—"} <span aria-hidden>→</span>{" "}
                <span className="font-medium text-foreground">{pct(row.current.winner, 1)}</span> title chance
                {row.fromRank != null && row.toRank != null && row.rankDelta ? ` · #${row.fromRank} → #${row.toRank}` : ""}
              </div>
            ) : null}

            {view === "baseline" ? (
              <div className="mt-2 grid grid-cols-2 gap-1">
                <Chip label="Reach final" value={row.baseline ? pct(row.baseline.final, 0) : "—"} />
                <Chip label="Reach SF" value={row.baseline ? pct(row.baseline.semiFinal, 0) : "—"} />
              </div>
            ) : null}

            {view === "progression" ? (
              <div className="mt-2 grid grid-cols-5 gap-1">
                <Chip label="R16" value={pct(row.current.roundOf16, 0)} />
                <Chip label="QF" value={pct(row.current.quarterFinal, 0)} />
                <Chip label="SF" value={pct(row.current.semiFinal, 0)} />
                <Chip label="Final" value={pct(row.current.final, 0)} />
                <Chip label="Title" value={pct(row.current.winner, 1)} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
