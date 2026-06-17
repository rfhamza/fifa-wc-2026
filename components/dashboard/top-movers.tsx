import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TeamFlag } from "@/components/team-flag";
import type { ProbabilityDelta, Team } from "@/lib/types";
import { signedPct } from "@/lib/utils";

export interface MoverRow {
  team: Team;
  delta: ProbabilityDelta;
}

/**
 * Top movers placeholder. Phase one shows the biggest positive gaps versus the
 * field average; later this will diff two dated snapshots to show real change.
 */
export function TopMovers({ rows }: { rows: MoverRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top movers</CardTitle>
        <CardDescription>
          Standout title contenders vs. the field average (placeholder — will
          track snapshot-over-snapshot change later).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map(({ team, delta }) => (
          <div key={team.id} className="flex items-center justify-between">
            <TeamFlag team={team} link />
            <span className="text-sm font-semibold tabular-nums text-primary">
              {signedPct(delta.delta)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
