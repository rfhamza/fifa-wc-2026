import Link from "next/link";
import { FlagGlyph } from "@/components/flag-glyph";
import { Badge } from "@/components/ui/badge";
import { ProbabilityBar } from "@/components/charts/probability-bar";
import { cn, pct } from "@/lib/utils";
import { formatKickoff } from "@/lib/ui/home-sections";
import {
  agedWellVerdict,
  matchProvenanceLabel,
  provenanceTone,
  stageLabel,
  type MatchCentreRow,
} from "@/lib/ui/match-centre";
import type { LiveViewMatch, TeamLookup } from "@/lib/live-client/public-safe-view.client";

/**
 * Compact Match Forecast Centre card (UX-2A). Shows teams, kickoff/status, actual
 * result, a compact model lean + top scoreline (+ knockout advancement), a highly
 * visible provenance badge, and — only for a genuine captured pre-match forecast —
 * an "aged well?" verdict. Presentational; all data is already public-safe.
 */
export function MatchForecastCard({
  row,
  live,
  teams,
}: {
  row: MatchCentreRow;
  live: LiveViewMatch | undefined;
  teams: TeamLookup;
}) {
  const kickoff = formatKickoff(row.kickoff);
  const teamsConfirmed = Boolean(row.teamA && row.teamB);
  const nameA = row.teamA ? teams[row.teamA]?.name ?? row.teamA : "To be confirmed";
  const nameB = row.teamB ? teams[row.teamB]?.name ?? row.teamB : "To be confirmed";
  const kind = row.forecast.kind;
  const verdict = agedWellVerdict(row.forecast, live);

  // Orient a present forecast to the card's A/B ordering.
  const data = row.forecast.data;
  let lean: { aWin: number; draw: number; bWin: number; scoreA?: number; scoreB?: number; scoreP?: number; aAdv?: number; bAdv?: number } | null = null;
  if (data && teamsConfirmed) {
    const homeIsA = data.homeTeamId === row.teamA;
    lean = {
      aWin: homeIsA ? data.homeWin : data.awayWin,
      draw: data.draw,
      bWin: homeIsA ? data.awayWin : data.homeWin,
    };
    if (data.topScoreline) {
      lean.scoreA = homeIsA ? data.topScoreline.homeGoals : data.topScoreline.awayGoals;
      lean.scoreB = homeIsA ? data.topScoreline.awayGoals : data.topScoreline.homeGoals;
      lean.scoreP = data.topScoreline.probability;
    }
    if (typeof data.homeAdvance === "number" && typeof data.awayAdvance === "number") {
      lean.aAdv = homeIsA ? data.homeAdvance : data.awayAdvance;
      lean.bAdv = homeIsA ? data.awayAdvance : data.homeAdvance;
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="uppercase tracking-wide">
          Match {row.matchNumber} · {stageLabel(row.stage)}
        </span>
        <span className="flex items-center gap-2">
          {kickoff ? <span className="tabular-nums">{kickoff}</span> : null}
          <StatusBadge status={row.status} />
        </span>
      </div>

      {/* Teams + actual score */}
      <div className="space-y-1.5">
        <TeamLine name={nameA} teamId={row.teamA} teams={teams} goals={row.actual?.goalsA} showScore={Boolean(row.actual)} />
        <TeamLine name={nameB} teamId={row.teamB} teams={teams} goals={row.actual?.goalsB} showScore={Boolean(row.actual)} />
        {row.actual?.penalties ? (
          <div className="text-xs text-muted-foreground tabular-nums">
            Penalties {row.actual.penalties.a}–{row.actual.penalties.b}
          </div>
        ) : null}
      </div>

      {/* Provenance + aged-well */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={provenanceTone(kind)}>{matchProvenanceLabel(kind)}</Badge>
        {verdict ? (
          <Badge variant={verdict === "called" ? "default" : "muted"}>
            {verdict === "called" ? "Called it" : "Missed"}
          </Badge>
        ) : null}
      </div>

      {/* Forecast body */}
      {lean ? (
        <div className="space-y-2 border-t border-border/60 pt-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Model lean</div>
          <div className="text-sm tabular-nums">
            <span className="font-medium">{nameA}</span> {pct(lean.aWin, 0)}
            <span className="text-muted-foreground"> · Draw {pct(lean.draw, 0)} · </span>
            <span className="font-medium">{nameB}</span> {pct(lean.bWin, 0)}
          </div>
          <ProbabilityBar homeWin={lean.aWin} draw={lean.draw} awayWin={lean.bWin} showLabels={false} className="h-2" />
          {lean.scoreA !== undefined && lean.scoreB !== undefined && lean.scoreP !== undefined ? (
            <div className="text-xs text-muted-foreground tabular-nums">
              Likely scoreline: {lean.scoreA}–{lean.scoreB} · {pct(lean.scoreP, 0)}
            </div>
          ) : null}
          {typeof lean.aAdv === "number" && typeof lean.bAdv === "number" ? (
            <div className="text-xs text-muted-foreground tabular-nums">
              Chance to advance: {nameA} {pct(lean.aAdv, 0)} · {nameB} {pct(lean.bAdv, 0)}
            </div>
          ) : null}
          {kind === "baseline-model-estimate" && (row.forecast.keyEdges?.favoursHome || row.forecast.keyEdges?.favoursAway) ? (
            <div className="text-xs text-muted-foreground">
              Key edges:{" "}
              {row.forecast.keyEdges?.favoursHome ? `${row.forecast.keyEdges.favoursHome} favours ${nameA}` : null}
              {row.forecast.keyEdges?.favoursHome && row.forecast.keyEdges?.favoursAway ? " · " : null}
              {row.forecast.keyEdges?.favoursAway ? `${row.forecast.keyEdges.favoursAway} favours ${nameB}` : null}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="border-t border-border/60 pt-3 text-sm text-muted-foreground">
          {kind === "no-pre-match-captured"
            ? "No pre-match forecast was captured for this match."
            : kind === "coming-soon"
              ? "Pre-match forecast coming soon."
              : "Forecast unavailable right now."}
        </p>
      )}

      {/* Knockout rows (M73–M104) deep-link into the bracket view. */}
      {row.stage !== "group" ? (
        <Link
          href={`/bracket?match=${row.matchNumber}`}
          className="text-xs font-medium text-primary hover:underline"
        >
          View in bracket
        </Link>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: LiveViewMatch["status"] }) {
  if (status === "in-progress") {
    return (
      <Badge variant="default">
        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
        Live
      </Badge>
    );
  }
  const label = status === "complete" ? "Full time" : status === "scheduled" ? "Scheduled" : status;
  return <Badge variant="outline">{label}</Badge>;
}

function TeamLine({
  name,
  teamId,
  teams,
  goals,
  showScore,
}: {
  name: string;
  teamId?: string;
  teams: TeamLookup;
  goals?: number;
  showScore: boolean;
}) {
  const team = teamId ? teams[teamId] : undefined;
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <FlagGlyph countryCode={team?.countryCode ?? ""} flag={team?.flag ?? "•"} name={team?.name ?? name} size={20} />
        <span className={cn("truncate", team ? "font-medium" : "text-muted-foreground")}>{name}</span>
      </div>
      {showScore ? (
        <span className="shrink-0 text-lg font-bold tabular-nums">{typeof goals === "number" ? goals : "–"}</span>
      ) : null}
    </div>
  );
}
