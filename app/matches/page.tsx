import { MatchForecastCentre } from "@/components/matches/match-forecast-centre";
import { getAllFixturePredictions } from "@/lib/model/forecast";
import {
  getRuntimeCurrentSnapshotPolicy,
  getRuntimeMatchForecasts,
} from "@/lib/model/forecast-runtime-store";
import {
  buildCentreRuntimeIndex,
  type CentreBaseMatch,
  type CentreSimIndex,
} from "@/lib/ui/match-centre";
import { teams } from "@/lib/data";
import type { TeamLookup } from "@/lib/live-client/public-safe-view.client";

export const metadata = {
  title: "Match Forecast Centre · World Cup Probability Lab",
};

// The centre reads the runtime match-forecast archive + live-state, so it must not be
// frozen at build. It renders safely (baseline simulation + honest states) when the
// Blob/token is unavailable.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const TEAM_LOOKUP: TeamLookup = Object.fromEntries(
  teams.map((t) => [t.id, { id: t.id, name: t.name, flag: t.flag, countryCode: t.countryCode }]),
);

export default async function MatchesPage() {
  // Pre-tournament simulation (group only) → baseline model estimate + key edges.
  const simIndex: CentreSimIndex = {};
  const baseMatches: CentreBaseMatch[] = [];
  for (const { fixture, prediction } of getAllFixturePredictions()) {
    if (fixture.matchNumber == null) continue;
    const base: CentreBaseMatch = {
      matchNumber: fixture.matchNumber,
      stage: "group",
      group: fixture.group,
      homeTeamId: fixture.homeTeamId,
      awayTeamId: fixture.awayTeamId,
    };
    if (fixture.kickoff) base.kickoff = fixture.kickoff;
    if (fixture.status) base.status = fixture.status;
    baseMatches.push(base);

    const sim: CentreSimIndex[number] = {
      homeTeamId: prediction.homeTeamId,
      awayTeamId: prediction.awayTeamId,
      homeWin: prediction.homeWin,
      draw: prediction.draw,
      awayWin: prediction.awayWin,
    };
    if (prediction.topScorelines[0]) sim.topScoreline = prediction.topScorelines[0];
    const favHome = prediction.explanation.positiveDrivers[0]?.label;
    const favAway = prediction.explanation.negativeDrivers[0]?.label;
    if (favHome) sim.favoursHome = favHome;
    if (favAway) sim.favoursAway = favAway;
    simIndex[fixture.matchNumber] = sim;
  }

  // Runtime match-forecast archive (provenance-tracked; group + knockout; Blob → null).
  const matchForecasts = await getRuntimeMatchForecasts();
  const matchesObjectAvailable = matchForecasts !== null;
  const runtimeIndex = buildCentreRuntimeIndex(
    matchForecasts
      ? {
          matchForecasts: matchForecasts.matchForecasts.map((e) => ({
            matchNumber: e.matchNumber,
            forecastProvenance: e.forecastProvenance,
            homeTeamId: e.homeTeamId,
            awayTeamId: e.awayTeamId,
            homeWin: e.homeWin,
            draw: e.draw,
            awayWin: e.awayWin,
            ...(e.topScorelines?.[0] ? { topScoreline: e.topScorelines[0] } : {}),
            ...(typeof e.homeAdvance === "number" ? { homeAdvance: e.homeAdvance } : {}),
            ...(typeof e.awayAdvance === "number" ? { awayAdvance: e.awayAdvance } : {}),
          })),
        }
      : null,
  );

  const source = (await getRuntimeCurrentSnapshotPolicy()).currentSource;

  return (
    <MatchForecastCentre
      baseMatches={baseMatches}
      simIndex={simIndex}
      runtimeIndex={runtimeIndex}
      matchesObjectAvailable={matchesObjectAvailable}
      teams={TEAM_LOOKUP}
      source={source}
    />
  );
}
