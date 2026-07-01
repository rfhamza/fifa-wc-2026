import { ForecastBoard } from "@/components/teams/forecast-board";
import {
  getRuntimeCurrentForecastSnapshot,
  getRuntimeCurrentSnapshotPolicy,
  getRuntimeCurrentVsBaselineComparison,
} from "@/lib/model/forecast-runtime-store";
import { getBaselineSnapshot } from "@/lib/model/forecast-snapshot-store";
import { buildBoardRows } from "@/lib/ui/forecast-board";
import { getTeam } from "@/lib/data";
import type { Team } from "@/lib/types";

export const metadata = {
  title: "Forecast Board · World Cup Probability Lab",
};

// The board reads the runtime current forecast, so it must not be frozen at build. It
// renders safely via the committed fallback when the Blob/token is unavailable.
export const dynamic = "force-dynamic";
export const revalidate = 0;

function safeTeam(id: string): Team | null {
  try {
    return getTeam(id);
  } catch {
    return null;
  }
}

export default async function TeamsPage() {
  const [current, comparison, policy] = await Promise.all([
    getRuntimeCurrentForecastSnapshot(),
    getRuntimeCurrentVsBaselineComparison(),
    getRuntimeCurrentSnapshotPolicy(),
  ]);
  const baseline = getBaselineSnapshot();

  const rows = buildBoardRows({ current, baseline, comparison, resolveTeam: safeTeam });

  return <ForecastBoard rows={rows} source={policy.currentSource} />;
}
