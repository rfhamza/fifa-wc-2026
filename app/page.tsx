import { ForecastHero } from "@/components/home/forecast-hero";
import { HomeKnockoutRadial } from "@/components/home/home-knockout-radial";
import { HomeForecastRaceChart } from "@/components/home/home-forecast-race-chart";
import { HomeMatches } from "@/components/home/home-matches";
import { HomeContenders } from "@/components/home/home-contenders";
import { TrustStrip } from "@/components/home/trust-strip";
import { officialKnockoutGraph } from "@/data/official/knockout-graph";
import {
  getRuntimeCurrentForecastSnapshot,
  getRuntimeCurrentSnapshotPolicy,
  getRuntimeCurrentVsBaselineComparison,
  getRuntimeCurrentVsBaselineMovers,
  getRuntimeMatchForecasts,
} from "@/lib/model/forecast-runtime-store";
import { listForecastSnapshots } from "@/lib/model/forecast-snapshot-store";
import { buildHomeForecastRaceModel } from "@/lib/ui/home-trajectory-comparison";
import { buildForecastHeroData } from "@/lib/ui/forecast-hero-data";
import {
  buildContenders,
  buildMatchForecastIndex,
  buildTeamContextIndex,
} from "@/lib/ui/home-sections";
import {
  selectMatchDriverChips,
  type MatchDriverSelection,
} from "@/lib/ui/match-drivers";
import { computeDrivers } from "@/lib/model/predict";
import { buildFeatureSet } from "@/lib/model/features";
import { getTeam, teams } from "@/lib/data";
import type { Team } from "@/lib/types";
import type { TeamLookup } from "@/lib/live-client/public-safe-view.client";

// The hero + sections read the runtime (Blob-backed) current forecast, so the home
// page must not be frozen at build time. It still renders safely via the committed
// fallback when the Blob/token is unavailable.
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

const TEAM_LOOKUP: TeamLookup = Object.fromEntries(
  teams.map((t) => [t.id, { id: t.id, name: t.name, flag: t.flag, countryCode: t.countryCode }]),
);

export default async function DashboardPage() {
  const [current, policy, movers, comparison, matchForecasts] = await Promise.all([
    getRuntimeCurrentForecastSnapshot(),
    getRuntimeCurrentSnapshotPolicy(),
    getRuntimeCurrentVsBaselineMovers({ movers: { stage: "winner", mode: "signed", topN: 1 } }),
    getRuntimeCurrentVsBaselineComparison(),
    getRuntimeMatchForecasts(),
  ]);

  const heroData = buildForecastHeroData({ snapshot: current, policy, movers, resolveTeam: safeTeam });
  const contenders = buildContenders({ snapshot: current, comparison, resolveTeam: safeTeam, topN: 5 });
  const matchForecastIndex = buildMatchForecastIndex(matchForecasts);
  const teamContextIndex = buildTeamContextIndex(current);

  // Compact "why the model leans" chips per match, derived from the SAME driver
  // decomposition the forecast is built from (computeDrivers). No new model
  // calculation — it reads the existing signed contributions and the pure
  // selector filters/ranks/labels them. Server-side so the model stays off the
  // client bundle.
  const matchDriverIndex: Record<number, MatchDriverSelection> = {};
  for (const [num, f] of Object.entries(matchForecastIndex)) {
    const home = safeTeam(f.homeTeamId);
    const away = safeTeam(f.awayTeamId);
    if (!home || !away) continue;
    const drivers = computeDrivers(buildFeatureSet(home), buildFeatureSet(away));
    matchDriverIndex[Number(num)] = selectMatchDriverChips(drivers, {
      homeTeamId: home.id,
      homeTeamName: home.name,
      awayTeamId: away.id,
      awayTeamName: away.name,
    });
  }

  // Multi-team forecast race across the public milestone checkpoints (Tournament start,
  // Group matchday 1 / 2, Group stage complete, and future round milestones as they are
  // committed) from the committed chain; the current projection is appended from the
  // runtime current when it is a live Blob read. The non-milestone committed dev
  // checkpoints (locked counts 54 and 73) are filtered out by the public policy.
  const raceModel = buildHomeForecastRaceModel({
    committedMilestones: listForecastSnapshots(),
    current,
    source: policy.currentSource,
    resolveTeam: safeTeam,
  });

  return (
    <div className="space-y-10 animate-fade-in">
      <ForecastHero data={heroData} />
      <HomeKnockoutRadial skeleton={officialKnockoutGraph.matches} teams={TEAM_LOOKUP} />
      <HomeForecastRaceChart model={raceModel} />
      <HomeMatches
        forecasts={matchForecastIndex}
        drivers={matchDriverIndex}
        context={teamContextIndex}
        teams={TEAM_LOOKUP}
      />
      <HomeContenders rows={contenders} />
      <TrustStrip />
    </div>
  );
}
