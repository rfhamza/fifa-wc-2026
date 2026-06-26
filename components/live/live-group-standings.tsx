import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LiveTeam } from "./live-team";
import {
  groupStandings,
  type LiveViewQualification,
  type LiveViewStanding,
  type TeamLookup,
} from "@/lib/live-client/public-safe-view.client";

function qualChip(state: LiveViewQualification) {
  if (state === "qualified") return <Badge variant="default">Through</Badge>;
  if (state === "eliminated") return <Badge variant="muted">Out</Badge>;
  return <Badge variant="outline">Undecided</Badge>;
}

/** Compact per-group standings (stacked cards, not a wide spreadsheet). */
export function LiveGroupStandings({
  standings,
  lookup,
}: {
  standings: readonly LiveViewStanding[];
  lookup: TeamLookup;
}) {
  const groups = groupStandings(standings);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Group standings</CardTitle>
        <CardDescription>Derived internally from results (FIFA Article 13).</CardDescription>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Standings not available yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
            {groups.map((g) => (
              <div key={g.group} className="rounded-lg border border-border/60 bg-secondary/20 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Group {g.group}
                </div>
                <ul className="space-y-1">
                  {g.rows.map((r) => (
                    <li
                      key={r.teamId}
                      className={cn(
                        "flex items-center justify-between gap-2 text-sm",
                        r.position <= 2 && "font-medium",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="w-4 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                          {r.position}
                        </span>
                        <LiveTeam id={r.teamId} lookup={lookup} className="min-w-0" />
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {r.points} pts
                        </span>
                        {qualChip(r.qualificationState)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
