import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/teams/stat-tile";
import { formatPpDelta } from "@/lib/ui/forecast-hero-data";
import { pct } from "@/lib/utils";
import type { TeamOutlookStory } from "@/lib/ui/team-outlook";

/**
 * Team Outlook card (UX-6B) — a compact story summary at the top of the team page:
 * current status + title chance + reach-final, a soft "route from here", and the single
 * biggest forecast-movement interval. It summarizes; the full chart, movement list, and
 * match context remain in the sections below. Presentational; all data is precomputed.
 */
export function TeamOutlookCard({ story }: { story: TeamOutlookStory }) {
  const reachFinal = story.reachStages.find((s) => s.stage === "final") ?? null;
  const secondary = story.reachStages.filter((s) => s.stage !== "final");
  const move = story.biggestMovementInterval;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle>Current outlook</CardTitle>
        <Badge
          variant={
            story.currentStatus === "eliminated"
              ? "muted"
              : story.currentStatus === "active"
                ? "default"
                : "outline"
          }
        >
          {story.currentStatusLabel}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="Title chance"
            value={story.titleProbability != null ? pct(story.titleProbability) : "—"}
            hint={
              story.titleDeltaPp != null
                ? `${formatPpDelta(story.titleDeltaPp)} since tournament start`
                : story.currentRank != null
                  ? `Rank #${story.currentRank}`
                  : undefined
            }
          />
          <StatTile
            label="Reach final"
            value={reachFinal ? pct(reachFinal.probability) : "—"}
            hint={
              secondary.length > 0
                ? secondary.map((s) => `${s.label} ${pct(s.probability)}`).join(" · ")
                : undefined
            }
          />
        </div>

        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Route from here</div>
          {story.nextMatchNumber != null && story.routeState !== "eliminated" ? (
            <p className="text-sm">
              {story.routeState === "in-progress" ? "A match is in progress: " : "Next match: "}
              <Link
                href={`/bracket?match=${story.nextMatchNumber}`}
                className="font-medium text-primary hover:underline"
              >
                Match {story.nextMatchNumber}
              </Link>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{story.routeSummary}</p>
          )}
        </div>

        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Forecast movement</div>
          <p className="text-sm text-muted-foreground">
            {story.fallbackReason
              ? story.fallbackReason
              : move
                ? `The largest forecast movement came between ${move.fromLabel.toLowerCase()} and ${move.toLabel.toLowerCase()} (${formatPpDelta(move.deltaPp)}).`
                : "Title chance has held broadly steady across the public checkpoints."}
          </p>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {story.relevantMatchLinks.map((l) => (
            <Link key={l.href} href={l.href} className="text-xs font-medium text-primary hover:underline">
              {l.label}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
