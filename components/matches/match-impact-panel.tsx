import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { TeamLookup } from "@/lib/live-client/public-safe-view.client";
import type { ImpactMoverRow, ImpactMovement, MatchImpactSummary } from "@/lib/ui/match-impact";

/**
 * Match Impact panel — the progressive-disclosure body shown only after a user opens
 * "What changed?" on a completed match card. Presentational; all data is precomputed and
 * public-safe. Status events (advanced / eliminated) are per-match exact; probability
 * movement is checkpoint-interval framed (never attributed to the single match alone).
 */
const signedPp = (pp: number): string => `${pp >= 0 ? "+" : ""}${pp.toFixed(1)} pp`;

export function MatchImpactPanel({
  summary,
  teams,
}: {
  summary: MatchImpactSummary;
  teams: TeamLookup;
}) {
  const name = (id: string) => teams[id]?.name ?? id;

  return (
    <div
      id={`impact-panel-${summary.matchNumber}`}
      className="space-y-3 border-t border-border/60 pt-3"
    >
      <p className="text-sm text-foreground">{summary.headline}</p>

      {summary.statusEvents.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {summary.statusEvents.map((e) => (
            <Badge key={`${e.teamId}-${e.event}`} variant={e.event === "advanced" ? "default" : "muted"}>
              {name(e.teamId)} {e.event === "advanced" ? "advanced" : "eliminated"}
            </Badge>
          ))}
        </div>
      ) : null}

      {summary.participantMovements.length > 0 ? (
        <div className="space-y-2">
          {summary.participantMovements.map((m) => (
            <ParticipantMovement key={m.teamId} movement={m} teamName={name(m.teamId)} />
          ))}
        </div>
      ) : null}

      {summary.topRisers.length > 0 || summary.topFallers.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <MoverList label="Biggest risers" rows={summary.topRisers} teams={teams} />
          <MoverList label="Biggest fallers" rows={summary.topFallers} teams={teams} />
        </div>
      ) : null}

      {summary.interval ? (
        <p className="text-xs text-muted-foreground">
          Across this forecast interval: {summary.interval.beforeLabel} to {summary.interval.afterLabel}. Probability
          movement reflects every result locked over that interval, not this match alone.
        </p>
      ) : null}

      {summary.bracketLinks.length > 0 ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {summary.bracketLinks.map((l) => (
            <Link key={l.href} href={l.href} className="text-xs font-medium text-primary hover:underline">
              {l.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ParticipantMovement({ movement, teamName }: { movement: ImpactMovement; teamName: string }) {
  const title = movement.stages.find((s) => s.stage === "winner");
  const rest = movement.stages.filter((s) => s.stage !== "winner");
  return (
    <div className="text-sm">
      <div className="tabular-nums">
        <span className="font-medium">{teamName}</span>
        {title ? (
          <span className="text-muted-foreground">
            {" "}
            — Title chance {title.fromPct.toFixed(1)}% to {title.toPct.toFixed(1)}% ({signedPp(title.deltaPp)})
          </span>
        ) : null}
      </div>
      {rest.length > 0 ? (
        <div className="text-xs text-muted-foreground tabular-nums">
          {rest.map((s) => `${s.label} ${signedPp(s.deltaPp)}`).join(" · ")}
        </div>
      ) : null}
    </div>
  );
}

function MoverList({ label, rows, teams }: { label: string; rows: ImpactMoverRow[]; teams: TeamLookup }) {
  if (rows.length === 0) {
    return (
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm text-muted-foreground">None beyond the neutral range.</div>
      </div>
    );
  }
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <ul className="mt-1 space-y-0.5">
        {rows.map((r) => (
          <li key={r.teamId} className="flex items-center justify-between gap-3 text-sm tabular-nums">
            <span className="truncate">{teams[r.teamId]?.name ?? r.teamId}</span>
            <span className={r.deltaPp >= 0 ? "text-win" : "text-loss"}>{signedPp(r.deltaPp)} title chance</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
