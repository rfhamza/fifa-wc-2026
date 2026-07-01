import Link from "next/link";
import { ProbabilityMeter } from "@/components/charts/probability-meter";
import { MoverChip } from "@/components/ui/mover-chip";
import { Badge } from "@/components/ui/badge";
import { FlagGlyph } from "@/components/flag-glyph";
import { pct } from "@/lib/utils";
import {
  movementStageLabel,
  movementRankMove,
  type MovementRow,
  type MovementStage,
  type MovementStatus,
} from "@/lib/ui/forecast-movement";

/** Notable-status badge — only Eliminated / 0% surface (keeps the card premium). */
function MovementStatusBadge({ status, label }: { status: MovementStatus; label: string }) {
  if (status === "eliminated") return <Badge variant="muted">{label}</Badge>;
  if (status === "zero-stage") return <Badge variant="outline">{label}</Badge>;
  return null;
}

/**
 * A single story-led mover card: team, current stage chance, baseline → current, the
 * signed movement chip, rank move, a notable-status badge, and a safe explanation line.
 * Presentational (no hooks); status/label/explanation are computed by the client surface.
 */
export function MovementCard({
  row,
  stage,
  status,
  statusLabel,
  explanation,
}: {
  row: MovementRow;
  stage: MovementStage;
  status: MovementStatus;
  statusLabel: string;
  explanation: string;
}) {
  const cell = row.stages[stage];
  const stageLabel = movementStageLabel(stage);
  const rankMove = movementRankMove(row);

  return (
    <li className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-center gap-2.5">
        <span className="w-6 shrink-0 text-right text-sm text-muted-foreground tabular-nums">{row.rank}</span>
        <Link
          href={`/teams/${row.teamId}`}
          className="flex min-w-0 flex-1 items-center gap-2 transition-colors hover:text-primary"
        >
          <FlagGlyph countryCode={row.countryCode} flag={row.flag} name={row.name} size={20} />
          <span className="min-w-0 truncate font-semibold">{row.name}</span>
        </Link>
        <MoverChip deltaPp={cell.deltaPp} />
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{stageLabel}</div>
          <div className="text-2xl font-bold tabular-nums text-primary">{pct(cell.to, 1)}</div>
        </div>
        <MovementStatusBadge status={status} label={statusLabel} />
      </div>

      <ProbabilityMeter value={cell.to} className="mt-2" color="bg-primary" />

      <div className="mt-2 text-xs text-muted-foreground tabular-nums">
        <span className="font-medium text-foreground">{pct(cell.from, 1)}</span> baseline{" "}
        <span aria-hidden>→</span> <span className="font-medium text-foreground">{pct(cell.to, 1)}</span> now
        {rankMove !== "—" ? <span> · {rankMove}</span> : null}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{explanation}</p>
    </li>
  );
}
