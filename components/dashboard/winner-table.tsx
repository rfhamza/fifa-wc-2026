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
import { FlagGlyph } from "@/components/flag-glyph";
import type { Team, TournamentStageProbability } from "@/lib/types";
import { pct } from "@/lib/utils";

export interface WinnerRow {
  team: Team;
  probability: TournamentStageProbability;
}

const STAGE_COLUMNS: {
  key: keyof Omit<TournamentStageProbability, "teamId">;
  label: string;
}[] = [
  { key: "roundOf16", label: "R16" },
  { key: "quarterFinal", label: "QF" },
  { key: "semiFinal", label: "SF" },
  { key: "final", label: "Final" },
];

/** Ranked tournament outlook table with a winner-probability bar + stage columns. */
export function WinnerTable({ rows }: { rows: WinnerRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">#</TableHead>
          <TableHead>Team</TableHead>
          <TableHead className="min-w-[160px]">Win title</TableHead>
          {STAGE_COLUMNS.map((c) => (
            <TableHead key={c.key} className="text-right">
              {c.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={row.team.id}>
            <TableCell className="text-muted-foreground tabular-nums">
              {i + 1}
            </TableCell>
            <TableCell>
              <Link
                href={`/teams/${row.team.id}`}
                className="flex items-center gap-2 font-medium transition-colors hover:text-primary"
              >
                <FlagGlyph countryCode={row.team.countryCode} flag={row.team.flag} name={row.team.name} size={18} />
                {row.team.name}
              </Link>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <ProbabilityMeter
                  value={row.probability.winner}
                  className="min-w-[90px] flex-1"
                  color="bg-primary"
                />
                <span className="w-12 text-right text-sm font-semibold tabular-nums">
                  {pct(row.probability.winner, 1)}
                </span>
              </div>
            </TableCell>
            {STAGE_COLUMNS.map((c) => (
              <TableCell
                key={c.key}
                className="text-right text-sm tabular-nums text-muted-foreground"
              >
                {pct(row.probability[c.key], 0)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
