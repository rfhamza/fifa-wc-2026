"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { FilterPills } from "@/components/ui/filter-pills";
import { SourceBadge } from "@/components/ui/source-badge";
import { MatchForecastCard } from "@/components/matches/match-forecast-card";
import {
  fetchPublicSafeLiveState,
  type LiveViewMatch,
  type TeamLookup,
} from "@/lib/live-client/public-safe-view.client";
import type { ForecastSourceKind } from "@/lib/ui/forecast-hero-data";
import {
  buildMatchCentreModel,
  filterMatches,
  orderMatches,
  type CentreBaseMatch,
  type CentreRuntimeIndex,
  type CentreSimIndex,
  type MatchCentreFilter,
} from "@/lib/ui/match-centre";

const FILTERS: ReadonlyArray<{ value: MatchCentreFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "live", label: "Live" },
  { value: "completed", label: "Completed" },
  { value: "group", label: "Group" },
  { value: "knockout", label: "Knockout" },
];

export function MatchForecastCentre({
  baseMatches,
  simIndex,
  runtimeIndex,
  matchesObjectAvailable,
  teams,
  source,
}: {
  baseMatches: CentreBaseMatch[];
  simIndex: CentreSimIndex;
  runtimeIndex: CentreRuntimeIndex;
  matchesObjectAvailable: boolean;
  teams: TeamLookup;
  source: ForecastSourceKind;
}) {
  const [live, setLive] = useState<LiveViewMatch[] | null | "loading">("loading");
  const [filter, setFilter] = useState<MatchCentreFilter>("all");

  useEffect(() => {
    let alive = true;
    fetchPublicSafeLiveState().then((r) => {
      if (!alive) return;
      setLive(r.ok && r.state.status !== "unavailable" ? r.state.matches : null);
    });
    return () => {
      alive = false;
    };
  }, []);

  const liveMatches = Array.isArray(live) ? live : [];
  const liveMap = new Map<number, LiveViewMatch>(liveMatches.map((m) => [m.matchNumber, m]));
  const rows = orderMatches(
    filterMatches(
      buildMatchCentreModel({ liveMatches, baseMatches, simIndex, runtimeIndex, matchesObjectAvailable }),
      filter,
    ),
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="space-y-3">
        <Badge variant="accent">Match Forecast Centre</Badge>
        <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">Match forecasts</h1>
        <p className="max-w-2xl text-muted-foreground">
          Upcoming and live fixtures first, then completed matches. Each card shows the model lean and
          the most-likely scoreline, and labels whether the forecast was captured before kickoff, is a
          retrospective estimate, or was not captured — never presented as more than it is.
        </p>
        <SourceBadge source={source} />
      </header>

      <FilterPills options={FILTERS} value={filter} onChange={setFilter} ariaLabel="Filter matches" />

      {live === "loading" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-2xl border border-border/60 bg-secondary/40" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border/70 bg-card p-6 text-sm text-muted-foreground">
          No matches to show for this filter yet.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
          {rows.map((row) => (
            <MatchForecastCard key={row.matchNumber} row={row} live={liveMap.get(row.matchNumber)} teams={teams} />
          ))}
        </div>
      )}
    </div>
  );
}
