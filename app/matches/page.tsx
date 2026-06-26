import { FixtureCard } from "@/components/matches/fixture-card";
import { LiveResultsProvider } from "@/components/matches/live-results-provider";
import { Badge } from "@/components/ui/badge";
import { getAllFixturePredictions } from "@/lib/model/forecast";
import { getTeam, getVenue } from "@/lib/data";
import { LIVE_STATE_UI_ENABLED } from "@/lib/live-client/config";
import type { GroupId } from "@/lib/types";

export const metadata = {
  title: "Match Predictor · World Cup Probability Lab",
};

export default function MatchesPage() {
  const predictions = getAllFixturePredictions();

  // Group fixtures by their group letter for a tidy, scannable layout.
  const byGroup = new Map<GroupId, typeof predictions>();
  for (const item of predictions) {
    const list = byGroup.get(item.fixture.group) ?? [];
    list.push(item);
    byGroup.set(item.fixture.group, list);
  }

  const sections = [...byGroup.entries()].map(([groupId, items]) => (
    <section key={groupId} className="space-y-4">
      <h2 className="text-xl font-semibold">Group {groupId}</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
        {items.map(({ fixture, prediction }) => (
          <FixtureCard
            key={fixture.id}
            fixture={fixture}
            prediction={prediction}
            home={getTeam(fixture.homeTeamId)}
            away={getTeam(fixture.awayTeamId)}
            venue={getVenue(fixture.venueId)}
          />
        ))}
      </div>
    </section>
  ));

  // Wrap in the live-results provider (one no-store fetch shared by all cards) only when the
  // live UI is enabled; otherwise render identical prediction-only cards.
  const board = LIVE_STATE_UI_ENABLED ? (
    <LiveResultsProvider>
      <div className="space-y-8">{sections}</div>
    </LiveResultsProvider>
  ) : (
    <div className="space-y-8">{sections}</div>
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="space-y-2">
        <Badge variant="accent">Match Predictor</Badge>
        <h1 className="text-3xl font-bold tracking-tight">
          Group-stage fixture forecasts
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Every group-stage match with win/draw/loss probabilities, expected
          goals, most-likely scorelines and key drivers, following the official
          FIFA schedule v17 (subject to change). Forecasts are pre-match model
          estimates. Completed matches show actual results from the public
          live-state feed where available; probabilities are not yet recalculated
          from live results.
        </p>
      </header>

      {board}
    </div>
  );
}
