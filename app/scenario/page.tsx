import { Badge } from "@/components/ui/badge";
import {
  ScenarioSimulator,
  type ScenarioGroup,
} from "@/components/scenario/scenario-simulator";
import { GROUP_IDS, getTeamsInGroup, getFixturesForGroup, getTeam } from "@/lib/data";
import { predictFixture } from "@/lib/model/forecast";

export const metadata = {
  title: "Scenario Lab · World Cup Probability Lab",
};

export default function ScenarioPage() {
  // Build serializable scenario data for every group, seeding each fixture
  // with the model's most-likely scoreline as the default result.
  const groups: ScenarioGroup[] = GROUP_IDS.map((groupId) => ({
    id: groupId,
    teams: getTeamsInGroup(groupId).map((t) => ({
      id: t.id,
      name: t.name,
      flag: t.flag,
      countryCode: t.countryCode,
      fifaRanking: t.fifaRanking,
    })),
    fixtures: getFixturesForGroup(groupId).map((fixture) => {
      const prediction = predictFixture(fixture);
      const top = prediction.topScorelines[0];
      const home = getTeam(fixture.homeTeamId);
      const away = getTeam(fixture.awayTeamId);
      return {
        fixtureId: fixture.id,
        matchday: fixture.matchday,
        homeTeamId: fixture.homeTeamId,
        awayTeamId: fixture.awayTeamId,
        homeName: home.name,
        awayName: away.name,
        homeFlag: home.flag,
        awayFlag: away.flag,
        homeCountryCode: home.countryCode,
        awayCountryCode: away.countryCode,
        defaultHomeGoals: top?.homeGoals ?? 0,
        defaultAwayGoals: top?.awayGoals ?? 0,
      };
    }),
  }));

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="space-y-2">
        <Badge variant="accent">Scenario Lab</Badge>
        <h1 className="text-3xl font-bold tracking-tight">
          What-if group simulator
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Override any group result and watch the standings and qualification
          recompute instantly. Results start from the model&apos;s most-likely
          scoreline. Phase one focuses on the group stage; the architecture is
          ready for full knockout re-simulation later.
        </p>
      </header>

      <ScenarioSimulator groups={groups} />
    </div>
  );
}
