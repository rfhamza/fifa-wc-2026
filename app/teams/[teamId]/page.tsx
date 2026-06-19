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
} from "@/data/model-inputs";
import { StageFunnelChart } from "@/components/charts/stage-funnel-chart";
import { ProbabilityBar } from "@/components/charts/probability-bar";
import { teams, teamById, getTeam, getVenue, getFixturesForTeam } from "@/lib/data";
import {
  getStageProbability,
  predictFixture,
} from "@/lib/model/forecast";
import { pct } from "@/lib/utils";
import { Users, ThermometerSun } from "lucide-react";

export function generateStaticParams() {
  return teams.map((t) => ({ teamId: t.id }));
}

export default function TeamPage({ params }: { params: { teamId: string } }) {
  const team = teamById.get(params.teamId);
  if (!team) notFound();

  const prob = getStageProbability(team.id);
  const fixtures = getFixturesForTeam(team.id);
  const fifa = getFifaRanking(team.id);
  const elo = getEloRating(team.id);
  const struct = getStructuralEconomic(team.id);
  // Row-level structural provenance: World Bank source-backed rows show the data
  // year; England/Scotland are honestly flagged manual (no separate WB economy).
  const gdpPerCapita = struct?.gdpPerCapitaCurrentUsd ?? team.gdpPerCapita;
  const population = struct?.population ?? team.population;
  const structuralHint =
    struct?.mappingStatus === "source-backed"
      ? `source-backed - World Bank ${struct.populationYear}`
      : struct?.mappingStatus === "official-derived"
        ? `official-derived - ONS/Scottish Gov ${struct.populationYear}`
        : "manual";

  return (
    <div className="space-y-8 animate-fade-in">
      <Link
        href="/teams"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← All teams
      </Link>

      {/* Overview */}
      <header className="flex flex-wrap items-center gap-4">
        <span className="text-6xl">{team.flag}</span>
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

      {/* Core metrics (model inputs carry an honest source status; Phase 1.7) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
        <StatTile label="Climate familiarity" value={`${team.climateFamiliarity}/100`} hint={`${MODEL_INPUT_SOURCES.climateFamiliarity.status} - capped`} />
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
        <StatTile label="Win title" value={pct(prob?.winner ?? 0, 1)} />
        <StatTile label="Reach last 16" value={pct(prob?.roundOf16 ?? 0, 0)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Signal cards */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Manager cohesion signal
            </CardTitle>
            <CardDescription>
              Same-nationality managers are used as a lightweight squad-cohesion
              proxy in the baseline model.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-sm">
              Manager nationality:{" "}
              <span className="font-medium">{team.managerNationality}</span>
            </p>
            <Badge variant={team.sameNationalityManager ? "default" : "muted"}>
              {team.sameNationalityManager
                ? "Domestic manager — cohesion bonus applied"
                : "Foreign manager — no cohesion bonus"}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ThermometerSun className="h-4 w-4 text-accent" /> Acclimatization signal
            </CardTitle>
            <CardDescription>
              How well the squad is expected to cope with North American summer
              venues (heat, humidity, altitude).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Climate familiarity</span>
              <span className="font-semibold">{team.climateFamiliarity}/100</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${team.climateFamiliarity}%` }}
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
            Share of simulated tournaments in which {team.name} reaches each
            stage.
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
                  <span className="font-medium">vs {opponent.flag} {opponent.name}</span>
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
