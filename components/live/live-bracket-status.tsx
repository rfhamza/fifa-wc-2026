import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LiveTeam } from "./live-team";
import {
  summariseBracket,
  type LiveViewBracketMatch,
  type TeamLookup,
} from "@/lib/live-client/public-safe-view.client";

/**
 * Compact Round-of-32 resolution status. Internally derived (never the provider bracket).
 * Future: this is the seam that grows into a premium animated bracket canvas.
 */
export function LiveBracketStatus({
  bracket,
  lookup,
}: {
  bracket: readonly LiveViewBracketMatch[];
  lookup: TeamLookup;
}) {
  const r32 = summariseBracket(bracket, "roundOf32");
  const resolved = bracket
    .filter((b) => b.round === "roundOf32" && b.resolution === "resolved")
    .sort((a, b) => a.matchNumber - b.matchNumber)
    .slice(0, 6);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Round of 32</CardTitle>
        <CardDescription>Slot resolution, derived internally from results.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="default">{r32.resolved} resolved</Badge>
          <Badge variant="outline">{r32.partial} partial</Badge>
          <Badge variant="muted">{r32.unresolved} unresolved</Badge>
          <span className="self-center text-xs text-muted-foreground tabular-nums">
            of {r32.total}
          </span>
        </div>
        {resolved.length > 0 && (
          <ul className="divide-y divide-border/60">
            {resolved.map((b) => (
              <li key={b.matchNumber} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <span className="text-xs text-muted-foreground tabular-nums">M{b.matchNumber}</span>
                <span className="flex flex-1 items-center justify-end gap-2">
                  <LiveTeam id={b.homeTeamId} lookup={lookup} />
                  <span className="text-xs text-muted-foreground">v</span>
                  <LiveTeam id={b.awayTeamId} lookup={lookup} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
