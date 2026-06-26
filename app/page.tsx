import { Hero } from "@/components/dashboard/hero";
import { WinnerTable, type WinnerRow } from "@/components/dashboard/winner-table";
import { ModelSummary } from "@/components/dashboard/model-summary";
import {
  StandoutContenders,
  type StandoutRow,
} from "@/components/dashboard/standout-contenders";
import { DataSourceBadge } from "@/components/data-source-badge";
import { LiveTeaser } from "@/components/live/live-teaser";
import { LIVE_STATE_UI_ENABLED } from "@/lib/live-client/config";
import { WinnerBarChart } from "@/components/charts/winner-bar-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSnapshot, getStandoutContenders, getWinnerRanking } from "@/lib/model/forecast";
import { getTeam, teams } from "@/lib/data";

export default function DashboardPage() {
  const snapshot = getSnapshot();
  const ranking = getWinnerRanking();

  const rows: WinnerRow[] = ranking.map((probability) => ({
    team: getTeam(probability.teamId),
    probability,
  }));

  const favourite = rows[0]!;
  const chartData = rows.slice(0, 10).map((r) => ({
    name: r.team.name,
    flag: r.team.flag,
    winner: r.probability.winner,
  }));

  const standouts: StandoutRow[] = getStandoutContenders("winner", 5).map((delta) => ({
    team: getTeam(delta.teamId),
    delta,
  }));

  return (
    <div className="space-y-8 animate-fade-in">
      <Hero
        favourite={favourite}
        iterations={snapshot.iterations}
        teamsCount={teams.length}
      />

      <DataSourceBadge />

      {LIVE_STATE_UI_ENABLED && <LiveTeaser />}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Tournament win probability</CardTitle>
            <CardDescription>
              Share of {snapshot.iterations.toLocaleString()} simulated
              tournaments each team won, with stage-by-stage reach.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WinnerTable rows={rows} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Top contenders</CardTitle>
              <CardDescription>Title probability, top 10.</CardDescription>
            </CardHeader>
            <CardContent>
              <WinnerBarChart data={chartData} />
            </CardContent>
          </Card>
          <StandoutContenders rows={standouts} />
          <ModelSummary />
        </div>
      </div>
    </div>
  );
}
