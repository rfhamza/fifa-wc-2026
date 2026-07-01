import { MovementSurface } from "@/components/movement/movement-surface";
import {
  getRuntimeCurrentForecastSnapshot,
  getRuntimeCurrentSnapshotPolicy,
  getRuntimeCurrentVsBaselineComparison,
} from "@/lib/model/forecast-runtime-store";
import { getBaselineSnapshot } from "@/lib/model/forecast-snapshot-store";
import { buildMovementRows } from "@/lib/ui/forecast-movement";
import { formatAsOf } from "@/lib/ui/forecast-hero-data";
import { getTeam } from "@/lib/data";
import type { Team } from "@/lib/types";

export const metadata = {
  title: "Probability Movement · World Cup Probability Lab",
};

// The surface reads the runtime current forecast, so it must not be frozen at build. It
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

export default async function MovementPage() {
  const [current, comparison, policy] = await Promise.all([
    getRuntimeCurrentForecastSnapshot(),
    getRuntimeCurrentVsBaselineComparison(),
    getRuntimeCurrentSnapshotPolicy(),
  ]);
  const baseline = getBaselineSnapshot();

  const rows = buildMovementRows({ current, baseline, comparison, resolveTeam: safeTeam });
  const asOfLabel = formatAsOf(current?.meta.asOf ?? null);

  return <MovementSurface rows={rows} source={policy.currentSource} asOfLabel={asOfLabel} />;
}
