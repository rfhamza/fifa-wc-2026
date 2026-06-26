"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { LiveDataBadge } from "./live-data-badge";
import { LatestMatchesPanel } from "./latest-matches-panel";
import { LiveGroupStandings } from "./live-group-standings";
import { LiveBracketStatus } from "./live-bracket-status";
import { ThirdPlaceRaceCard } from "./third-place-race-card";
import {
  fetchPublicSafeLiveState,
  type LiveStateView,
  type TeamLookup,
} from "@/lib/live-client/public-safe-view.client";

type ViewState =
  | { phase: "loading" }
  | { phase: "ready"; view: LiveStateView; nowMs: number }
  | { phase: "unavailable" };

/**
 * Client container: fetches the sanitized /api/live-state (no-store) and renders the live
 * panels, a loading state, or a calm non-blocking fallback. Never throws; never blocks the
 * rest of the app.
 */
export function LiveTournamentState({ teamLookup }: { teamLookup: TeamLookup }) {
  const [state, setState] = useState<ViewState>({ phase: "loading" });

  useEffect(() => {
    let alive = true;
    void fetchPublicSafeLiveState().then((result) => {
      if (!alive) return;
      if (result.ok && result.state.status !== "unavailable") {
        setState({ phase: "ready", view: result.state, nowMs: Date.now() });
      } else {
        setState({ phase: "unavailable" });
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  if (state.phase === "loading") {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Loading live tournament state...
        </CardContent>
      </Card>
    );
  }

  if (state.phase === "unavailable") {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Live tournament data is temporarily unavailable. The rest of the app is unaffected.
        </CardContent>
      </Card>
    );
  }

  const { view, nowMs } = state;
  return (
    <div className="space-y-6">
      <LiveDataBadge view={view} nowMs={nowMs} />
      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <LatestMatchesPanel matches={view.matches} lookup={teamLookup} />
        <ThirdPlaceRaceCard standings={view.standings} lookup={teamLookup} />
      </div>
      <LiveGroupStandings standings={view.standings} lookup={teamLookup} />
      <LiveBracketStatus bracket={view.bracket} lookup={teamLookup} />
    </div>
  );
}
