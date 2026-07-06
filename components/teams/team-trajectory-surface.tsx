"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterPills } from "@/components/ui/filter-pills";
import { SourceBadge } from "@/components/ui/source-badge";
import { MoverChip } from "@/components/ui/mover-chip";
import { TeamTrajectoryChart } from "@/components/charts/team-trajectory-chart";
import { TeamMatchHistory } from "@/components/teams/team-match-history";
import { TeamOutlookCard } from "@/components/teams/team-outlook-card";
import {
  fetchPublicSafeLiveState,
  type LiveViewMatch,
  type LiveViewQualification,
} from "@/lib/live-client/public-safe-view.client";
import { formatPpDelta } from "@/lib/ui/forecast-hero-data";
import { MOVEMENT_NEUTRAL_EXPLANATION } from "@/lib/ui/forecast-movement";
import { pct } from "@/lib/utils";
import {
  TRAJECTORY_STAGE_OPTIONS,
  deriveTeamHeroStatus,
  deriveTeamMatchContext,
  selectKeyMovements,
  selectTrajectorySeries,
  teamHeroStatusLabel,
  trajectoryStageLabel,
  type TeamHeroModel,
  type TeamMatchHistoryRow,
  type TeamTrajectoryModel,
  type TrajectoryStage,
} from "@/lib/ui/team-trajectory";
import { buildTeamOutlookStory } from "@/lib/ui/team-outlook";

const TRAJECTORY_CAPTION =
  "This view compares retained public forecast checkpoints — tournament start, group matchday 1, " +
  "group matchday 2, group stage complete, and the latest current projection — plus knockout-round " +
  "checkpoints as they are committed. It is not an after-every-match timeline.";

const MODEL_CAVEAT =
  "The current forecast updates as results are locked and tournament paths change; the " +
  "team-strength model is not re-rated after every match.";

/**
 * Team forecast trajectory surface (UX-6): hero strip, the public checkpoint
 * trajectory chart, the deterministic movement summary, live bracket context, match
 * forecast history, and the trust note. All forecast data arrives as serializable
 * props from the server page; the only client fetch is the public-safe live-state
 * (status + match context), mirroring the movement surface.
 */
export function TeamTrajectorySurface({
  teamId,
  teamName,
  hero,
  model,
  matchHistory,
  matchesObjectAvailable,
}: {
  teamId: string;
  teamName: string;
  hero: TeamHeroModel;
  model: TeamTrajectoryModel;
  matchHistory: TeamMatchHistoryRow[];
  matchesObjectAvailable: boolean;
}) {
  const [stage, setStage] = useState<TrajectoryStage>("winner");
  const [qual, setQual] = useState<Map<string, LiveViewQualification> | null>(null);
  const [liveMatches, setLiveMatches] = useState<LiveViewMatch[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetchPublicSafeLiveState().then((r) => {
      if (!alive) return;
      if (r.ok && r.state.status !== "unavailable") {
        setQual(new Map(r.state.standings.map((s) => [s.teamId, s.qualificationState])));
        setLiveMatches(r.state.matches);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const status = deriveTeamHeroStatus(teamId, hero.isZeroTitle, qual);
  const series = useMemo(() => selectTrajectorySeries(model, stage), [model, stage]);
  const movements = useMemo(() => selectKeyMovements(model, stage), [model, stage]);
  const context = useMemo(
    () => (liveMatches ? deriveTeamMatchContext(liveMatches, teamId) : null),
    [liveMatches, teamId],
  );
  const outlook = useMemo(
    () => buildTeamOutlookStory({ teamId, hero, model, status, context }),
    [teamId, hero, model, status, context],
  );

  return (
    <section className="space-y-6" aria-label={`Forecast trajectory for ${teamName}`}>
      {/* Team outlook story (UX-6B): compact summary above the detailed sections. */}
      <TeamOutlookCard story={outlook} />

      {/* Hero strip: current vs tournament-start title chance + status + source. */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Title chance</div>
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-3xl font-bold tabular-nums">
                {hero.currentTitleProbability != null ? pct(hero.currentTitleProbability) : "—"}
              </span>
              {hero.titleDeltaPp != null ? <MoverChip deltaPp={hero.titleDeltaPp} /> : null}
              <span className="text-xs text-muted-foreground">Since tournament start</span>
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              Tournament start: {hero.baselineTitleProbability != null ? pct(hero.baselineTitleProbability) : "—"}
              {hero.currentRank != null ? <> · Rank #{hero.currentRank}</> : null}
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Badge variant={status === "eliminated" ? "muted" : status === "active" ? "default" : "outline"}>
              {teamHeroStatusLabel(status)}
            </Badge>
            <SourceBadge source={hero.source} asOfLabel={hero.asOfLabel} />
            <Link
              href={`/bracket?team=${teamId}`}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Trace path in bracket <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Public checkpoint trajectory. */}
      <Card>
        <CardHeader>
          <CardTitle>Forecast trajectory</CardTitle>
          <CardDescription>{TRAJECTORY_CAPTION}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FilterPills
            options={TRAJECTORY_STAGE_OPTIONS}
            value={stage}
            onChange={setStage}
            ariaLabel="Choose which stage probability to chart"
          />
          {model.hasEnoughHistory ? (
            <>
              <TeamTrajectoryChart series={series} stage={stage} teamName={teamName} />
              {!model.hasGroupStageCheckpoint ? (
                <p className="text-xs text-muted-foreground">
                  The group-stage-complete checkpoint is unavailable; showing the
                  tournament-start baseline and the current projection.
                </p>
              ) : null}
            </>
          ) : (
            <div className="rounded-2xl border border-border/70 bg-secondary/30 p-5 text-sm text-muted-foreground">
              Not enough history yet.
              {model.points.length === 1 ? (
                <span className="tabular-nums">
                  {" "}
                  {model.points[0]!.label}: {pct(model.points[0]!.stages[stage])} {trajectoryStageLabel(stage)}.
                </span>
              ) : null}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{MODEL_CAVEAT}</p>
        </CardContent>
      </Card>

      {/* Deterministic movement summary over the public checkpoints. */}
      <Card>
        <CardHeader>
          <CardTitle>Movement summary</CardTitle>
          <CardDescription>
            {trajectoryStageLabel(stage)} in percentage points across the public checkpoints.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {movements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No movement to summarise yet.</p>
          ) : (
            <ul className="space-y-2">
              {movements.map((m) => (
                <li
                  key={`${m.fromLabel}-${m.toLabel}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-card px-4 py-3 text-sm"
                >
                  <span>{m.sentence}</span>
                  <span className="flex items-center gap-3 tabular-nums">
                    <span className="text-muted-foreground">
                      {pct(m.fromProbability)} → {pct(m.toProbability)}
                    </span>
                    <span className="font-semibold">{formatPpDelta(m.deltaPp)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">{MOVEMENT_NEUTRAL_EXPLANATION}</p>
        </CardContent>
      </Card>

      {/* Live bracket/match context (client live-state; no bracket tree here). */}
      <Card>
        <CardHeader>
          <CardTitle>Current match context</CardTitle>
          <CardDescription>
            Live results are provider-backed and may be delayed.{" "}
            <Link href={`/bracket?team=${teamId}`} className="font-medium text-primary hover:underline">
              View in the knockout bracket
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!context ? (
            <p className="text-sm text-muted-foreground">Live match context unavailable right now.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {context.inProgress ? (
                <ContextRow
                  label="In progress"
                  matchNumber={context.inProgress.matchNumber}
                  detail={context.inProgress.score ? `Score ${context.inProgress.score}` : null}
                />
              ) : null}
              {context.lastCompleted ? (
                <ContextRow
                  label="Last result"
                  matchNumber={context.lastCompleted.matchNumber}
                  detail={[
                    context.lastCompleted.score,
                    context.lastCompleted.won == null ? null : context.lastCompleted.won ? "Won" : "Lost",
                  ]
                    .filter(Boolean)
                    .join(" · ") || null}
                />
              ) : null}
              {context.nextScheduled ? (
                <ContextRow
                  label="Next match"
                  matchNumber={context.nextScheduled.matchNumber}
                  detail={null}
                />
              ) : null}
              {!context.inProgress && !context.lastCompleted && !context.nextScheduled ? (
                <li className="text-muted-foreground">No matches recorded for this team yet.</li>
              ) : null}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Match forecast history. */}
      <Card>
        <CardHeader>
          <CardTitle>Match forecast history</CardTitle>
          <CardDescription>
            Forecasts oriented to {teamName}; provenance is labelled per match.{" "}
            <Link href="/matches" className="font-medium text-primary hover:underline">
              Open the Match Forecast Centre
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TeamMatchHistory rows={matchHistory} matchesObjectAvailable={matchesObjectAvailable} />
        </CardContent>
      </Card>

      {/* Trust note. */}
      <Card>
        <CardHeader>
          <CardTitle>How to read this</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Tournament start</span> is the frozen
            pre-tournament forecast (11 Jun 2026).{" "}
            <span className="font-medium text-foreground">Group matchday 1 complete</span> and{" "}
            <span className="font-medium text-foreground">Group matchday 2 complete</span> are the
            checkpoints once every team had played its first and second group match.{" "}
            <span className="font-medium text-foreground">Group stage complete</span> is the
            checkpoint captured once all 72 group matches were locked.{" "}
            <span className="font-medium text-foreground">Current projection</span> is the latest
            published forecast.
          </p>
          <p>
            <span className="font-medium text-foreground">Percentage points</span> measure the
            difference between two probabilities, not a percent change.
          </p>
          <p>
            The current forecast updates as results are locked. This view shows retained public
            checkpoints — tournament start, group matchday 1, group matchday 2, group stage complete —
            and the latest current projection; knockout-round checkpoints (Round of 32 onward) appear
            once their snapshots are committed. It shows retained checkpoints, not every match.
          </p>
          <Link
            href="/methodology"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            How the model works <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </CardContent>
      </Card>
    </section>
  );
}

function ContextRow({
  label,
  matchNumber,
  detail,
}: {
  label: string;
  matchNumber: number;
  detail: string | null;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-card px-4 py-3">
      <span>
        <span className="font-medium">{label}:</span>{" "}
        <Link href={`/bracket?match=${matchNumber}`} className="font-medium text-primary hover:underline">
          Match {matchNumber}
        </Link>
      </span>
      {detail ? <span className="text-muted-foreground tabular-nums">{detail}</span> : null}
    </li>
  );
}
