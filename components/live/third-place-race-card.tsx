import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LiveTeam } from "./live-team";
import {
  deriveThirdPlaceRace,
  type LiveViewStanding,
  type TeamLookup,
  type ThirdPlaceStatus,
} from "@/lib/live-client/public-safe-view.client";

function statusVariant(status: ThirdPlaceStatus): "default" | "accent" | "outline" | "muted" {
  if (status === "Clinched") return "default";
  if (status === "Top-eight zone") return "accent";
  if (status === "Eliminated") return "muted";
  return "outline"; // On the bubble / Still unresolved
}

/**
 * Compact third-place race summary. Cautious labels - "Clinched"/"Eliminated" come only from
 * the public qualificationState; ranking shows the CURRENT top-eight race, not final
 * qualification. No ranking table, no 495-combination explainer (progressive disclosure later).
 */
export function ThirdPlaceRaceCard({
  standings,
  lookup,
}: {
  standings: readonly LiveViewStanding[];
  lookup: TeamLookup;
}) {
  const race = deriveThirdPlaceRace(standings);
  if (race.totalThirdPlace === 0) return null;
  const preview = race.ranked.slice(0, 4);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Third-place race</CardTitle>
        <CardDescription>
          {race.qualifySlots} of {race.totalThirdPlace} third-place teams qualify - derived
          internally from FIFA rules.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="accent">{race.inZone} in top-eight zone</Badge>
          <Badge variant="outline">{race.bubble} on the bubble</Badge>
          <Badge variant="muted">{race.unresolved} unresolved</Badge>
          {race.clinched > 0 && <Badge variant="default">{race.clinched} clinched</Badge>}
          {race.eliminated > 0 && <Badge variant="muted">{race.eliminated} eliminated</Badge>}
        </div>
        {preview.length > 0 && (
          <ul className="space-y-1">
            {preview.map((e) => (
              <li key={e.teamId} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-4 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                    {e.rank}
                  </span>
                  <LiveTeam id={e.teamId} lookup={lookup} className="min-w-0" />
                  <span className="shrink-0 text-xs text-muted-foreground">Grp {e.group}</span>
                </span>
                <Badge variant={statusVariant(e.status)} className="shrink-0">
                  {e.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Current standing only; not final qualification unless clinched.
        </p>
      </CardContent>
    </Card>
  );
}
