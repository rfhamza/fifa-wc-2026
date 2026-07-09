import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatTile } from "@/components/teams/stat-tile";
import {
  MODEL_INPUT_SOURCES,
  getFifaRanking,
  getEloRating,
  getStructuralEconomic,
  getClimateSuitability,
} from "@/data/model-inputs";
import { climateSuitabilityTo100 } from "@/lib/model/climate-suitability";
import { StageFunnelChart } from "@/components/charts/stage-funnel-chart";
import { ProbabilityBar } from "@/components/charts/probability-bar";
import { FlagGlyph } from "@/components/flag-glyph";
import { teamById, getTeam, getVenue, getFixturesForTeam } from "@/lib/data";
import {
  getStageProbability,
  predictFixture,
} from "@/lib/model/forecast";
import {
  getRuntimeCurrentForecastSnapshot,
  getRuntimeCurrentSnapshotPolicy,
  getRuntimeCurrentVsBaselineComparison,
  getRuntimeMatchForecasts,
} from "@/lib/model/forecast-runtime-store";
import {
  getBaselineSnapshot,
  getTeamForecastTrajectory,
} from "@/lib/model/forecast-snapshot-store";
import {
  buildTeamHeroModel,
  buildTeamMatchHistoryRows,
  buildTeamTrajectoryModel,
  type TeamMatchForecastInput,
} from "@/lib/ui/team-trajectory";
import { TeamTrajectorySurface } from "@/components/teams/team-trajectory-surface";
import type { TeamStrength } from "@/lib/ui/team-outlook";
import { pct } from "@/lib/utils";
import { Users, ThermometerSun } from "lucide-react";

// Live-aware page (UX-6): reads the rolling runtime current forecast per request, so it
// must opt out of static generation — the same pattern as /teams, /movement and /bracket.
// The legacy predictFixture cards keep their process-memoized baseline simulation; the
// first request per server process pays that cost once (precedent: /matches).
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TeamPage({ params }: { params: { teamId: string } }) {
  const team = teamById.get(params.teamId);
  if (!team) notFound();

  // Live-aware trajectory inputs: runtime current + comparison + policy + match
  // forecasts (Blob, server-only), plus the committed snapshot chain (static imports).
  const [current, comparison, policy, matchForecasts] = await Promise.all([
    getRuntimeCurrentForecastSnapshot(),
    getRuntimeCurrentVsBaselineComparison(),
    getRuntimeCurrentSnapshotPolicy(),
    getRuntimeMatchForecasts(),
  ]);
  const baseline = getBaselineSnapshot();
  const trajectory = getTeamForecastTrajectory(team.id);

  const hero = buildTeamHeroModel({
    teamId: team.id,
    current,
    baseline,
    comparison,
    source: policy.currentSource,
  });
  const trajectoryModel = buildTeamTrajectoryModel({
    trajectory,
    runtimeCurrent: current,
    runtimeSource: policy.currentSource,
  });

  // Public-safe projection of the team's match-forecast entries (no scorelines/ids
  // beyond what the history rows render) — the same idiom as /bracket's page shell.
  const matchesObjectAvailable = matchForecasts !== null;
  const teamEntries: TeamMatchForecastInput[] | null = matchForecasts
    ? matchForecasts.matchForecasts
        .filter((e) => e.homeTeamId === team.id || e.awayTeamId === team.id)
        .map((e) => ({
          matchNumber: e.matchNumber,
          stage: e.stage,
          forecastProvenance: e.forecastProvenance,
          homeTeamId: e.homeTeamId,
          awayTeamId: e.awayTeamId,
          homeWin: e.homeWin,
          draw: e.draw,
          awayWin: e.awayWin,
          ...(typeof e.homeAdvance === "number" ? { homeAdvance: e.homeAdvance } : {}),
          ...(typeof e.awayAdvance === "number" ? { awayAdvance: e.awayAdvance } : {}),
        }))
    : null;
  const matchHistory = buildTeamMatchHistoryRows({
    teamId: team.id,
    fixtures: getFixturesForTeam(team.id)
      .filter((f): f is typeof f & { matchNumber: number } => typeof f.matchNumber === "number")
      .map((f) => ({
        matchNumber: f.matchNumber,
        homeTeamId: f.homeTeamId,
        awayTeamId: f.awayTeamId,
      })),
    entries: teamEntries,
    resolveTeam: (id) => {
      const t = teamById.get(id);
      return t ? { id: t.id, name: t.name, flag: t.flag, countryCode: t.countryCode } : null;
    },
  });

  // Public team-strength inputs (FIFA rank, Elo rating/rank, squad quality) for the outlook
  // card's upset/mismatch context. Already-public values (shown as tiles below); passed as a
  // serializable map so the client selector can compare the viewed team vs its opponents.
  const teamStrengthById: Record<string, TeamStrength> = {};
  for (const [id, t] of teamById) {
    const f = getFifaRanking(id);
    const e = getEloRating(id);
    teamStrengthById[id] = {
      fifaRank: f?.fifaRank ?? t.fifaRanking ?? null,
      eloRating: e?.eloRating ?? t.elo ?? null,
      eloRank: e?.eloRank ?? null,
      squadQuality: t.squadQuality ?? null,
    };
  }

  const prob = getStageProbability(team.id);
  const fixtures = getFixturesForTeam(team.id);
  const fifa = getFifaRanking(team.id);
  const elo = getEloRating(team.id);
  const struct = getStructuralEconomic(team.id);
  // Row-level structural provenance: World Bank source-backed rows show the data
  // year; England/Scotland are official-derived (no separate WB economy).
  const gdpPerCapita = struct?.gdpPerCapitaCurrentUsd ?? team.gdpPerCapita;
  const population = struct?.population ?? team.population;
  const structuralHint =
    struct?.mappingStatus === "source-backed"
      ? `source-backed - World Bank ${struct.populationYear}`
      : struct?.mappingStatus === "official-derived"
        ? `official-derived - ONS/Scottish Gov ${struct.populationYear}`
        : "manual";

  // Phase 1.13: climate familiarity is now a candidate 12-month playability score
  // (CCKP 1991-2020; England/Scotland Met Office), capped in the model.
  const climate = getClimateSuitability(team.id);
  const climateScore = climate
    ? Math.round(climateSuitabilityTo100(climate))
    : team.climateFamiliarity;
  const climateHint =
    climate?.dataStatus === "source-backed"
      ? "candidate - CCKP 1991-2020 (capped)"
      : climate?.dataStatus === "official-derived"
        ? "candidate - Met Office 1991-2020 (capped)"
        : `${MODEL_INPUT_SOURCES.climateFamiliarity.status} - capped`;

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/teams"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← All teams
        </Link>
        <Link
          href={`/bracket?team=${team.id}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          Trace path in bracket
        </Link>
      </div>

      {/* Overview */}
      <header className="flex flex-wrap items-center gap-4">
        <FlagGlyph countryCode={team.countryCode} flag={team.flag} name={team.name} size={56} />
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">{team.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Group {team.group}</Badge>
            <Badge variant="outline">{team.confederation}</Badge>
            <Badge variant="muted">FIFA #{team.fifaRanking}</Badge>
            {team.drawSlot ? (
              <Badge variant="default">Draw slot {team.drawSlot} (official)</Badge>
            ) : (
              <Badge variant="muted">Draw position TBD</Badge>
            )}
          </div>
        </div>
      </header>

      {/* Forecast trajectory (UX-6): current vs tournament start, public checkpoints,
          movement summary, live match context, match forecast history, trust note. */}
      <TeamTrajectorySurface
        teamId={team.id}
        teamName={team.name}
        hero={hero}
        model={trajectoryModel}
        matchHistory={matchHistory}
        matchesObjectAvailable={matchesObjectAvailable}
        teamStrengthById={teamStrengthById}
      />

      {/* Core metrics (model inputs carry an honest source status; Phase 1.7) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {fifa && (
          <StatTile
            label="FIFA ranking"
            value={`#${fifa.fifaRank}`}
            hint={`${MODEL_INPUT_SOURCES.fifaRanking.status} - ${fifa.fifaPoints} pts`}
          />
        )}
        <StatTile
          label="Elo rating"
          value={elo ? elo.eloRating : team.elo}
          hint={
            elo
              ? `${MODEL_INPUT_SOURCES.eloRating.status} - #${elo.eloRank}`
              : MODEL_INPUT_SOURCES.eloRating.status
          }
        />
        <StatTile label="Squad quality" value={`${team.squadQuality}/100`} hint={`${MODEL_INPUT_SOURCES.squadQuality.status} - capped`} />
        <StatTile label="Recent form" value={`${team.recentForm}/100`} hint={`${MODEL_INPUT_SOURCES.recentForm.status} - capped`} />
        <StatTile label="Climate familiarity" value={`${climateScore}/100`} hint={climateHint} />
        <StatTile
          label="GDP per capita"
          value={`$${(gdpPerCapita / 1000).toFixed(1)}k`}
          hint={structuralHint}
        />
        <StatTile
          label="Population"
          value={`${(population / 1_000_000).toFixed(1)}M`}
          hint={structuralHint}
        />
        <StatTile label="Baseline title chance" value={pct(prob?.winner ?? 0, 1)} />
        <StatTile label="Baseline reach round of 16" value={pct(prob?.roundOf16 ?? 0, 0)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Signal cards */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Manager cohesion signal
            </CardTitle>
            <CardDescription>
              A same-nationality-manager proxy, tracked for transparency but{" "}
              <strong>currently disabled (zero model weight) pending out-of-sample
              backtest</strong>. A crude binary signal confounded with strength already
              captured by Elo/FIFA; it does not affect probabilities today.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-sm">
              Manager nationality:{" "}
              <span className="font-medium">{team.managerNationality}</span>
            </p>
            <Badge variant="muted">
              {team.sameNationalityManager
                ? "Domestic manager — disabled pending backtest"
                : "Foreign manager — disabled pending backtest"}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ThermometerSun className="h-4 w-4 text-accent" /> Home climate suitability
            </CardTitle>
            <CardDescription>
              Year-round football-playability of the home climate (1991-2020 monthly
              normals). A candidate prior, capped in the model - not a
              tournament-acclimatization score.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Climate suitability</span>
              <span className="font-semibold">{climateScore}/100</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${climateScore}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stage probabilities */}
      <Card>
        <CardHeader>
          <CardTitle>Stage probabilities</CardTitle>
          <CardDescription>
            Share of simulated tournaments in which {team.name} reaches each stage
            in the pre-tournament baseline.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {prob ? (
            <StageFunnelChart probability={prob} />
          ) : (
            <p className="text-sm text-muted-foreground">No data.</p>
          )}
        </CardContent>
      </Card>

      {/* Model explanations: the team's three group matches */}
      <Card>
        <CardHeader>
          <CardTitle>Model explanations — group matches</CardTitle>
          <CardDescription>
            Each prediction shown from {team.name}&apos;s perspective, with the
            single biggest driver for and against.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {fixtures.map((fixture) => {
            const prediction = predictFixture(fixture);
            const teamIsHome = fixture.homeTeamId === team.id;
            const opponent = getTeam(
              teamIsHome ? fixture.awayTeamId : fixture.homeTeamId,
            );
            // Venue only shown for an official schedule; otherwise it is pending.
            const venueLabel =
              fixture.source === "official"
                ? getVenue(fixture.venueId).city
                : "Venue pending official schedule";
            // Re-orient probabilities so "win" is always this team's win.
            const teamWin = teamIsHome ? prediction.homeWin : prediction.awayWin;
            const oppWin = teamIsHome ? prediction.awayWin : prediction.homeWin;
            const driver = prediction.explanation.positiveDrivers[0];
            return (
              <div
                key={fixture.id}
                className="space-y-3 rounded-lg border border-border/60 p-4"
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    vs <FlagGlyph countryCode={opponent.countryCode} flag={opponent.flag} name={opponent.name} size={16} /> {opponent.name}
                  </span>
                  <Badge variant="outline">MD{fixture.matchday}</Badge>
                </div>
                <ProbabilityBar
                  homeWin={teamWin}
                  draw={prediction.draw}
                  awayWin={oppWin}
                  showLabels={false}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Win {pct(teamWin)}</span>
                  <span>Draw {pct(prediction.draw)}</span>
                  <span>Lose {pct(oppWin)}</span>
                </div>
                {driver && (
                  <p className="text-xs text-muted-foreground">
                    Top driver:{" "}
                    <span className="font-medium text-foreground">
                      {driver.label}
                    </span>{" "}
                    favours {teamIsHome ? team.name : opponent.name}.
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground">{venueLabel}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
