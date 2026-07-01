import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProbabilityMeter } from "@/components/charts/probability-meter";
import { MoverChip } from "@/components/ui/mover-chip";
import { Badge } from "@/components/ui/badge";
import { FlagGlyph } from "@/components/flag-glyph";
import { pct } from "@/lib/utils";
import type { BoardRow, BoardStatus, BoardView } from "@/lib/ui/forecast-board";

/** Notable-status badge (only eliminated / 0% title chance are surfaced). */
export function TeamStatusBadge({ status }: { status: BoardStatus }) {
  if (status === "eliminated") return <Badge variant="muted">Eliminated</Badge>;
  if (status === "zero-title") return <Badge variant="outline">0% title chance</Badge>;
  return null;
}

function TeamCell({ row, status }: { row: BoardRow; status: BoardStatus }) {
  return (
    <Link href={`/teams/${row.teamId}`} className="flex items-center gap-2 font-medium transition-colors hover:text-primary">
      <FlagGlyph countryCode={row.countryCode} flag={row.flag} name={row.name} size={18} />
      <span className="truncate">{row.name}</span>
      <TeamStatusBadge status={status} />
    </Link>
  );
}

function rankMove(row: BoardRow): string {
  if (row.fromRank == null || row.toRank == null || row.rankDelta === 0 || row.rankDelta == null) return "—";
  return `#${row.fromRank} → #${row.toRank}`;
}

/** Desktop table/list hybrid. Columns switch by view. */
export function ForecastBoardTable({
  rows,
  statusOf,
  view,
}: {
  rows: BoardRow[];
  statusOf: (teamId: string) => BoardStatus;
  view: BoardView;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">#</TableHead>
          <TableHead>Team</TableHead>
          {view === "current" ? (
            <>
              <TableHead className="min-w-[150px]">Title chance</TableHead>
              <TableHead className="text-right">Move</TableHead>
              <TableHead className="text-right">Reach final</TableHead>
              <TableHead className="text-right">Reach SF</TableHead>
            </>
          ) : null}
          {view === "movement" ? (
            <>
              <TableHead className="text-right">Baseline title</TableHead>
              <TableHead className="text-right">Current title</TableHead>
              <TableHead className="text-right">Movement</TableHead>
              <TableHead className="text-right">Rank move</TableHead>
            </>
          ) : null}
          {view === "baseline" ? (
            <>
              <TableHead className="text-right">Baseline title</TableHead>
              <TableHead className="text-right">Reach final</TableHead>
              <TableHead className="text-right">Reach SF</TableHead>
            </>
          ) : null}
          {view === "progression" ? (
            <>
              <TableHead className="text-right">R16</TableHead>
              <TableHead className="text-right">QF</TableHead>
              <TableHead className="text-right">SF</TableHead>
              <TableHead className="text-right">Final</TableHead>
              <TableHead className="text-right">Title</TableHead>
            </>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const status = statusOf(row.teamId);
          const rank = view === "baseline" ? row.baselineRank ?? row.rank : row.rank;
          return (
            <TableRow key={row.teamId}>
              <TableCell className="text-muted-foreground tabular-nums">{rank}</TableCell>
              <TableCell><TeamCell row={row} status={status} /></TableCell>

              {view === "current" ? (
                <>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <ProbabilityMeter value={row.current.winner} className="min-w-[80px] flex-1" color="bg-primary" />
                      <span className="w-12 text-right text-sm font-semibold tabular-nums">{pct(row.current.winner, 1)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {row.winnerDeltaPp == null ? <span className="text-muted-foreground">—</span> : <MoverChip deltaPp={row.winnerDeltaPp} className="justify-end" />}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{pct(row.current.final, 0)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{pct(row.current.semiFinal, 0)}</TableCell>
                </>
              ) : null}

              {view === "movement" ? (
                <>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{row.baseline ? pct(row.baseline.winner, 1) : "—"}</TableCell>
                  <TableCell className="text-right text-sm font-semibold tabular-nums">{pct(row.current.winner, 1)}</TableCell>
                  <TableCell className="text-right">
                    {row.winnerDeltaPp == null ? <span className="text-muted-foreground">—</span> : <MoverChip deltaPp={row.winnerDeltaPp} className="justify-end" />}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{rankMove(row)}</TableCell>
                </>
              ) : null}

              {view === "baseline" ? (
                <>
                  <TableCell className="text-right text-sm font-semibold tabular-nums">{row.baseline ? pct(row.baseline.winner, 1) : "—"}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{row.baseline ? pct(row.baseline.final, 0) : "—"}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{row.baseline ? pct(row.baseline.semiFinal, 0) : "—"}</TableCell>
                </>
              ) : null}

              {view === "progression" ? (
                <>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{pct(row.current.roundOf16, 0)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{pct(row.current.quarterFinal, 0)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{pct(row.current.semiFinal, 0)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{pct(row.current.final, 0)}</TableCell>
                  <TableCell className="text-right text-sm font-semibold tabular-nums">{pct(row.current.winner, 1)}</TableCell>
                </>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
