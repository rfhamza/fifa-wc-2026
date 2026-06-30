import { ForecastHero } from "@/components/home/forecast-hero";
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
import {
  getRuntimeCurrentForecastSnapshot,
  getRuntimeCurrentSnapshotPolicy,
  getRuntimeCurrentVsBaselineMovers,
} from "@/lib/model/forecast-runtime-store";
import { buildForecastHeroData } from "@/lib/ui/forecast-hero-data";
import { getTeam } from "@/lib/data";
import type { Team } from "@/lib/types";

// The hero reads the runtime (Blob-backed) current forecast, so the home page must not
// be frozen at build time. It still renders safely via the committed fallback when the
// Blob/token is unavailable.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Team lookup that never throws (returns null for an unknown id). */
function safeTeam(id: string): Team | null {
  try {
    return getTeam(id);
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  // Live-aware headline (runtime current → committed fallback → source badge).
  const [runtimeCurrent, runtimePolicy, runtimeMovers] = await Promise.all([
    getRuntimeCurrentForecastSnapshot(),
    getRuntimeCurrentSnapshotPolicy(),
    getRuntimeCurrentVsBaselineMovers({ movers: { stage: "winner", mode: "signed", topN: 1 } }),
  ]);
  const heroData = buildForecastHeroData({
    snapshot: runtimeCurrent,
    policy: runtimePolicy,
    movers: runtimeMovers,
    resolveTeam: safeTeam,
  });

  // Pre-tournament baseline field (the reference the live forecast moves against).
  const snapshot = getSnapshot();
  const ranking = getWinnerRanking();
  const rows: WinnerRow[] = ranking.map((probability) => ({
    team: getTeam(probability.teamId),
    probability,
  }));
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
      <ForecastHero data={heroData} />

      <DataSourceBadge />

      {LIVE_STATE_UI_ENABLED && <LiveTeaser />}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle>Full field — pre-tournament model</CardTitle>
            <CardDescription>
              The baseline reference the live forecast moves against: each team&apos;s
              share of {snapshot.iterations.toLocaleString()} simulated tournaments, with
              stage-by-stage reach. Not re-simulated from live results.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WinnerTable rows={rows} />
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Top contenders</CardTitle>
              <CardDescription>Baseline title probability, top 10.</CardDescription>
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
