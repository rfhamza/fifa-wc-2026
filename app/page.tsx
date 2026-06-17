import { Hero } from "@/components/dashboard/hero";
import { WinnerTable, type WinnerRow } from "@/components/dashboard/winner-table";
import { ModelSummary } from "@/components/dashboard/model-summary";
import { TopMovers, type MoverRow } from "@/components/dashboard/top-movers";
import { WinnerBarChart } from "@/components/charts/winner-bar-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSnapshot, getTopMovers, getWinnerRanking } from "@/lib/model/forecast";
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

  const movers: MoverRow[] = getTopMovers("winner", 5).map((delta) => ({
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
          <TopMovers rows={movers} />
          <ModelSummary />
        </div>
      </div>
    </div>
  );
}
