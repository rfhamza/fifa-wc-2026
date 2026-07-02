"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { BracketRound } from "@/components/bracket/bracket-round";
import { BracketMatchCard } from "@/components/bracket/bracket-match-card";
import {
  fetchPublicSafeLiveState,
  type LiveViewBracketMatch,
  type LiveViewMatch,
  type TeamLookup,
} from "@/lib/live-client/public-safe-view.client";
import type { ForecastSourceKind } from "@/lib/ui/forecast-hero-data";
import { formatAsOf } from "@/lib/ui/forecast-hero-data";
import { buildBracketView } from "@/lib/ui/bracket-view";
import type { KnockoutMatchDefinition } from "@/lib/types";
import type { MatchForecastProvenance } from "@/lib/model/match-forecast";

interface LiveBracketData {
  bracket: LiveViewBracketMatch[];
  matches: LiveViewMatch[];
  asOf: string | null;
}

export function BracketPage({
  skeleton,
  provenanceByMatch,
  matchesObjectAvailable,
  source,
  teams,
}: {
  skeleton: KnockoutMatchDefinition[];
  provenanceByMatch: Record<number, MatchForecastProvenance>;
  matchesObjectAvailable: boolean;
  source: ForecastSourceKind;
  teams: TeamLookup;
}) {
  const [live, setLive] = useState<LiveBracketData | null>(null);

  useEffect(() => {
    let alive = true;
    fetchPublicSafeLiveState().then((r) => {
      if (!alive) return;
      if (r.ok && r.state.status !== "unavailable") {
        setLive({ bracket: r.state.bracket, matches: r.state.matches, asOf: r.state.asOf });
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const view = useMemo(
    () =>
      buildBracketView({
        skeleton,
        liveBracket: live?.bracket ?? [],
        liveMatches: live?.matches ?? [],
        provenanceByMatch,
        matchesObjectAvailable,
        resolveTeam: (id) => teams[id] ?? null,
      }),
    [skeleton, live, provenanceByMatch, matchesObjectAvailable, teams],
  );

  const asOfLabel = formatAsOf(live?.asOf ?? null);

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="space-y-3">
        <Badge variant="accent">Bracket</Badge>
        <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">Knockout bracket</h1>
        <p className="max-w-2xl text-muted-foreground">
          The official Round of 32 through the Final. Teams and results fill in as matches are locked;
          slots yet to be decided show who they&apos;re waiting on.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <SourceBadge source={source} asOfLabel={asOfLabel} />
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/matches" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            Open the Match Forecast Centre <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link href="/live" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            Tournament State <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </header>

      {/* Main title tree: stacked round sections on mobile, columns at xl+. */}
      <div className="grid gap-6 xl:grid-cols-5">
        {view.rounds.map((round) => (
          <BracketRound key={round.stage} round={round} />
        ))}
      </div>

      {/* Third-place play-off — its own section, never in the title tree. */}
      {view.thirdPlace ? (
        <section className="space-y-3 border-t border-border/60 pt-6">
          <h2 className="text-sm font-semibold tracking-tight">Third place</h2>
          <div className="max-w-sm">
            <BracketMatchCard node={view.thirdPlace} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
