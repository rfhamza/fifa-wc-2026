import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TeamFlag } from "@/components/team-flag";
import type { ProbabilityDelta, Team } from "@/lib/types";
import { signedPct } from "@/lib/utils";

export interface StandoutRow {
  team: Team;
  delta: ProbabilityDelta;
}

/**
 * Standout contenders — teams furthest ABOVE the field baseline (mean) for the
 * chosen metric. This is intentionally NOT "top movers": it does not compare to
 * a prior snapshot. Snapshot-over-snapshot movers arrive with run history later
 * (see lib/model/snapshot-delta.ts).
 */
export function StandoutContenders({ rows }: { rows: StandoutRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Standout contenders</CardTitle>
        <CardDescription>
          Furthest above the field baseline (average win probability) — not a
          snapshot-over-snapshot change, which arrives with run history.
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
