"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FlagGlyph } from "@/components/flag-glyph";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ProbabilityBar } from "@/components/charts/probability-bar";
import { cn, pct } from "@/lib/utils";
import {
  fetchPublicSafeLiveState,
  type LiveStateView,
  type LiveViewMatch,
  type TeamLookup,
} from "@/lib/live-client/public-safe-view.client";
import {
  formatKickoff,
  selectHomeMatches,
  type HomeMatchForecast,
  type MatchForecastIndex,
  type TeamContextIndex,
} from "@/lib/ui/home-sections";

interface HomeMatchesProps {
  /** Server-built map (matchNumber → true pre-match forecast); may be empty. */
  forecasts: MatchForecastIndex;
  /** Server-built map (teamId → current tournament context); may be empty. */
  context: TeamContextIndex;
  /** Server-built team identity lookup. */
  teams: TeamLookup;
}

type LoadState = "loading" | LiveStateView | "unavailable";

export function HomeMatches({ forecasts, context, teams }: HomeMatchesProps) {
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let active = true;
    fetchPublicSafeLiveState().then((r) => {
      if (!active) return;
      setState(r.ok ? r.state : "unavailable");
    });
    return () => {
      active = false;
    };
  }, []);

  const selection =
    typeof state === "object" ? selectHomeMatches(state.matches, Date.now()) : null;
  const title = selection?.title ?? "Next matches";

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            What the model forecasts for the fixtures coming up next.
          </p>
        </div>
        <Link href="/matches" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          More matches
        </Link>
      </div>

      {state === "loading" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl border border-border/60 bg-secondary/40" />
          ))}
        </div>
      ) : state === "unavailable" || !selection || selection.matches.length === 0 ? (
        <div className="rounded-2xl border border-border/70 bg-card p-6 text-sm text-muted-foreground">
          Upcoming fixtures will appear here as soon as the live schedule is available.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {selection.matches.map((m) => (
            <MatchCard key={m.matchNumber} match={m} forecast={forecasts[m.matchNumber]} context={context} teams={teams} />
          ))}
        </div>
      )}
    </section>
  );
}

function statusBadge(status: LiveViewMatch["status"]) {
  if (status === "in-progress") return { label: "Live", live: true as const };
  if (status === "scheduled") return { label: "Scheduled", live: false as const };
  return { label: status, live: false as const };
}

function TeamRow({
  teamId,
  teams,
  context,
}: {
  teamId: string;
  teams: TeamLookup;
  context: TeamContextIndex;
}) {
  const team = teams[teamId];
  const ctx = context[teamId];
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <FlagGlyph
          countryCode={team?.countryCode ?? ""}
          flag={team?.flag ?? teamId}
          name={team?.name ?? teamId}
          size={20}
        />
        <span className="truncate font-medium">{team?.name ?? teamId}</span>
      </div>
      {ctx ? (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {pct(ctx.winner, 0)} title chance
        </span>
      ) : null}
    </div>
  );
}

function MatchCard({
  match,
  forecast,
  context,
  teams,
}: {
  match: LiveViewMatch;
  forecast: HomeMatchForecast | undefined;
  context: TeamContextIndex;
  teams: TeamLookup;
}) {
  const badge = statusBadge(match.status);
  const kickoff = formatKickoff(match.kickoff);
  const teamsConfirmed = Boolean(match.teamA && match.teamB);

  // Orient the forecast to the match's A/B ordering.
  let oriented:
    | {
        aWin: number;
        draw: number;
        bWin: number;
        aAdv?: number;
        bAdv?: number;
        scoreA?: number;
        scoreB?: number;
        scoreP?: number;
      }
    | null = null;
  if (forecast && teamsConfirmed) {
    const homeIsA = forecast.homeTeamId === match.teamA;
    oriented = {
      aWin: homeIsA ? forecast.homeWin : forecast.awayWin,
      draw: forecast.draw,
      bWin: homeIsA ? forecast.awayWin : forecast.homeWin,
    };
    if (typeof forecast.homeAdvance === "number" && typeof forecast.awayAdvance === "number") {
      oriented.aAdv = homeIsA ? forecast.homeAdvance : forecast.awayAdvance;
      oriented.bAdv = homeIsA ? forecast.awayAdvance : forecast.homeAdvance;
    }
    if (forecast.topScoreline) {
      oriented.scoreA = homeIsA ? forecast.topScoreline.homeGoals : forecast.topScoreline.awayGoals;
      oriented.scoreB = homeIsA ? forecast.topScoreline.awayGoals : forecast.topScoreline.homeGoals;
      oriented.scoreP = forecast.topScoreline.probability;
    }
  }

  const nameA = teams[match.teamA]?.name ?? match.teamA;
  const nameB = teams[match.teamB]?.name ?? match.teamB;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="uppercase tracking-wide">Match {match.matchNumber}</span>
        <span className="flex items-center gap-2">
          {kickoff ? <span className="tabular-nums">{kickoff}</span> : null}
          <Badge variant={badge.live ? "default" : "outline"}>
            {badge.live ? (
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
            ) : null}
            {badge.label}
          </Badge>
        </span>
      </div>

      {teamsConfirmed ? (
        <div className="space-y-1.5">
          <TeamRow teamId={match.teamA} teams={teams} context={context} />
          <TeamRow teamId={match.teamB} teams={teams} context={context} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Forecast will appear once both teams are confirmed.
        </p>
      )}

      {teamsConfirmed ? (
        <div className="space-y-2 border-t border-border/60 pt-3">
          {oriented ? (
            <>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Model lean</div>
              <div className="text-sm tabular-nums">
                <span className="font-medium">{nameA}</span> {pct(oriented.aWin, 0)}
                <span className="text-muted-foreground"> · Draw {pct(oriented.draw, 0)} · </span>
                <span className="font-medium">{nameB}</span> {pct(oriented.bWin, 0)}
              </div>
              <ProbabilityBar
                homeWin={oriented.aWin}
                draw={oriented.draw}
                awayWin={oriented.bWin}
                showLabels={false}
                className="h-2"
              />
              {oriented.scoreA !== undefined && oriented.scoreB !== undefined && oriented.scoreP !== undefined ? (
                <div className="text-xs text-muted-foreground tabular-nums">
                  Likely scoreline: {oriented.scoreA}–{oriented.scoreB} · {pct(oriented.scoreP, 0)}
                </div>
              ) : null}
              {typeof oriented.aAdv === "number" && typeof oriented.bAdv === "number" ? (
                <div className="text-xs text-muted-foreground tabular-nums">
                  Chance to advance: {nameA} {pct(oriented.aAdv, 0)} · {nameB} {pct(oriented.bAdv, 0)}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Match forecast</div>
              <p className="text-sm text-muted-foreground">Pre-match forecast coming soon.</p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
