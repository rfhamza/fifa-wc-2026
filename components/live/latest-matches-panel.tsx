import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LiveTeam } from "./live-team";
import {
  selectLatestMatches,
  type LiveViewMatch,
  type TeamLookup,
} from "@/lib/live-client/public-safe-view.client";

function statusBadge(status: LiveViewMatch["status"]) {
  if (status === "in-progress") return <Badge variant="accent">Live</Badge>;
  if (status === "complete") return <Badge variant="muted">Final</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

/** Latest in-progress + recently completed matches. Premium rows, not a raw table. */
export function LatestMatchesPanel({
  matches,
  lookup,
}: {
  matches: readonly LiveViewMatch[];
  lookup: TeamLookup;
}) {
  const rows = selectLatestMatches(matches);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Latest matches</CardTitle>
        <CardDescription>In-progress and most recently completed.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No completed or in-progress matches yet.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {rows.map((m) => {
              const hasScore = typeof m.goalsA === "number" && typeof m.goalsB === "number";
              return (
                <li key={m.matchId} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex items-center gap-2 text-sm">
                    {statusBadge(m.status)}
                    <span className="text-xs text-muted-foreground tabular-nums">{m.matchId}</span>
                  </div>
                  <div className="flex flex-1 items-center justify-end gap-3 text-sm">
                    <LiveTeam id={m.teamA} lookup={lookup} />
                    <span className="min-w-[2.5rem] text-center font-semibold tabular-nums">
                      {hasScore ? `${m.goalsA}-${m.goalsB}` : "v"}
                    </span>
                    <LiveTeam id={m.teamB} lookup={lookup} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
