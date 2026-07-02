"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { BracketTree } from "@/components/bracket/bracket-tree";
import { BracketMatchDetail } from "@/components/bracket/bracket-match-detail";
import { BracketTeamPicker } from "@/components/bracket/bracket-team-picker";
import { BracketTeamPathSummary } from "@/components/bracket/bracket-team-path-summary";
import { BracketCopyLink } from "@/components/bracket/bracket-copy-link";
import {
  parseBracketSearchParams,
  updateBracketSearchParams,
} from "@/lib/ui/bracket-url-state";
import {
  fetchPublicSafeLiveState,
  type LiveViewBracketMatch,
  type LiveViewMatch,
  type TeamLookup,
} from "@/lib/live-client/public-safe-view.client";
import type { ForecastSourceKind } from "@/lib/ui/forecast-hero-data";
import { formatAsOf } from "@/lib/ui/forecast-hero-data";
import { buildBracketView } from "@/lib/ui/bracket-view";
import { buildBracketLayout } from "@/lib/ui/bracket-layout";
import { buildBracketDetailModel } from "@/lib/ui/bracket-detail";
import { buildTeamBracketPath, teamPathMatchNumbers } from "@/lib/ui/bracket-path";
import type { KnockoutMatchDefinition } from "@/lib/types";
import type { MatchForecastProvenance } from "@/lib/model/match-forecast";
import type { CentreRuntimeEntry } from "@/lib/ui/match-centre";

interface LiveBracketData {
  bracket: LiveViewBracketMatch[];
  matches: LiveViewMatch[];
  asOf: string | null;
}

export function BracketPage({
  skeleton,
  provenanceByMatch,
  forecastByMatch,
  matchesObjectAvailable,
  source,
  teams,
}: {
  skeleton: KnockoutMatchDefinition[];
  provenanceByMatch: Record<number, MatchForecastProvenance>;
  forecastByMatch: Record<number, CentreRuntimeEntry>;
  matchesObjectAvailable: boolean;
  source: ForecastSourceKind;
  teams: TeamLookup;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Injected validity for the pure URL-state helper (keeps it data-free + testable).
  const validMatchNumbers = useMemo(() => new Set(skeleton.map((m) => m.matchNumber)), [skeleton]);
  const validTeamIds = useMemo(() => new Set(Object.keys(teams)), [teams]);

  const [live, setLive] = useState<LiveBracketData | null>(null);
  // Seed selection from the URL on first render (deep link), then keep it reactively in sync.
  const [selectedMatchNumber, setSelectedMatchNumber] = useState<number | null>(
    () => parseBracketSearchParams(searchParams, { validMatchNumbers, validTeamIds }).matchNumber,
  );
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(
    () => parseBracketSearchParams(searchParams, { validMatchNumbers, validTeamIds }).teamId,
  );
  // A param that was present but invalid → a small "not found" notice (never a random selection).
  const [notFound, setNotFound] = useState<{ match: boolean; team: boolean }>(() => {
    const p = parseBracketSearchParams(searchParams, { validMatchNumbers, validTeamIds });
    return { match: p.invalidMatch, team: p.invalidTeam };
  });
  const panelRef = useRef<HTMLElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  // Focus/scroll only on a USER-initiated selection — never when hydrating from the URL
  // (deep link, browser back/forward, external query change), so a shared link never steals focus.
  const focusPanelOnSelect = useRef(false);
  const focusSummaryOnSelect = useRef(false);

  // Reactive URL → state sync: handles deep links, browser back/forward, and same-route query
  // navigation. Guarded functional updates make our own `router.replace` mirror a no-op (the
  // parsed values already equal state), so there is no update loop.
  useEffect(() => {
    const p = parseBracketSearchParams(searchParams, { validMatchNumbers, validTeamIds });
    setSelectedMatchNumber((cur) => (cur === p.matchNumber ? cur : p.matchNumber));
    setSelectedTeamId((cur) => (cur === p.teamId ? cur : p.teamId));
    setNotFound((cur) =>
      cur.match === p.invalidMatch && cur.team === p.invalidTeam ? cur : { match: p.invalidMatch, team: p.invalidTeam },
    );
  }, [searchParams, validMatchNumbers, validTeamIds]);

  // Mirror the selection into the address bar, PRESERVING any unknown params. `replace` (not
  // `push`) keeps a shareable/bookmarkable URL current without a history entry per selection.
  const syncUrl = (nextMatch: number | null, nextTeam: string | null) => {
    const params = updateBracketSearchParams(new URLSearchParams(searchParams.toString()), {
      matchNumber: nextMatch,
      teamId: nextTeam,
    });
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

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

  const layout = useMemo(() => buildBracketLayout(view, { matches: skeleton }), [view, skeleton]);

  const selectedNode = useMemo(() => {
    if (selectedMatchNumber == null) return null;
    for (const round of view.rounds) {
      const n = round.nodes.find((node) => node.matchNumber === selectedMatchNumber);
      if (n) return n;
    }
    if (view.thirdPlace?.matchNumber === selectedMatchNumber) return view.thirdPlace;
    return null;
  }, [view, selectedMatchNumber]);

  const detail = useMemo(() => {
    if (!selectedNode) return null;
    return buildBracketDetailModel({
      node: selectedNode,
      runtime: forecastByMatch[selectedNode.matchNumber],
      liveMatch: live?.matches.find((m) => m.matchNumber === selectedNode.matchNumber),
      matchesObjectAvailable,
    });
  }, [selectedNode, forecastByMatch, live, matchesObjectAvailable]);

  // Selected-team path (independent of match selection). Highlights + summary; no forecast math.
  const teamPath = useMemo(() => {
    if (selectedTeamId == null) return null;
    return buildTeamBracketPath({ teamId: selectedTeamId, view, graph: { matches: skeleton }, team: teams[selectedTeamId] });
  }, [selectedTeamId, view, skeleton, teams]);
  const pathSet = useMemo(() => (teamPath ? teamPathMatchNumbers(teamPath) : undefined), [teamPath]);

  // Scroll the panel into view + focus its heading region — ONLY on a user selection.
  useEffect(() => {
    if (selectedMatchNumber == null || !panelRef.current) return;
    if (!focusPanelOnSelect.current) return; // URL-driven hydration → do not steal focus
    focusPanelOnSelect.current = false;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    panelRef.current.focus({ preventScroll: true });
    panelRef.current.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [selectedMatchNumber]);

  // Scroll the path summary into view + focus it — ONLY on a user trace (separate from match).
  useEffect(() => {
    if (selectedTeamId == null || !summaryRef.current) return;
    if (!focusSummaryOnSelect.current) return; // URL-driven hydration → do not steal focus
    focusSummaryOnSelect.current = false;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    summaryRef.current.focus({ preventScroll: true });
    summaryRef.current.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  }, [selectedTeamId]);

  const handleSelect = (matchNumber: number) => {
    const next = selectedMatchNumber === matchNumber ? null : matchNumber;
    focusPanelOnSelect.current = next != null; // focus only when opening a panel
    setSelectedMatchNumber(next);
    syncUrl(next, selectedTeamId);
  };

  const handleClear = () => {
    const previous = selectedMatchNumber;
    setSelectedMatchNumber(null);
    syncUrl(null, selectedTeamId);
    if (previous != null) {
      document.getElementById(`bracket-card-${previous}`)?.focus();
    }
  };

  const handleSelectTeam = (teamId: string) => {
    focusSummaryOnSelect.current = true;
    setSelectedTeamId(teamId);
    syncUrl(selectedMatchNumber, teamId);
  };

  const handleClearTeam = () => {
    setSelectedTeamId(null);
    syncUrl(selectedMatchNumber, null);
  };

  const currentPathLabel = teamPath?.status === "active" ? "Current match" : "Last match";

  const asOfLabel = formatAsOf(live?.asOf ?? null);

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="space-y-3">
        <Badge variant="accent">Bracket</Badge>
        <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">Knockout bracket</h1>
        <p className="max-w-2xl text-muted-foreground">
          The official Round of 32 through the Final. Two halves converge into the Final (Match 104);
          the third-place match (Match 103) is separate. Teams and results fill in as matches are locked;
          slots yet to be decided show who they&apos;re waiting on.
        </p>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Select a match for its forecast detail · Trace a team to highlight its path.
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
        {/* Share the current bracket view (selected match and/or traced team) as a link. */}
        <BracketCopyLink matchNumber={selectedMatchNumber} teamId={selectedTeamId} />
        {notFound.match || notFound.team ? (
          <p role="status" className="text-sm text-muted-foreground">
            {notFound.match ? "Match not found." : null}
            {notFound.match && notFound.team ? " " : null}
            {notFound.team ? "Team not found." : null}
          </p>
        ) : null}
      </header>

      {/* Trace a team → path summary + highlighting (independent of match selection). */}
      <BracketTeamPicker
        teams={teams}
        selectedTeamId={selectedTeamId}
        onSelectTeam={handleSelectTeam}
        onClear={handleClearTeam}
      />
      {teamPath ? <BracketTeamPathSummary path={teamPath} onClear={handleClearTeam} summaryRef={summaryRef} /> : null}

      {/* True two-sided knockout bracket: left half → centered Final ← right half. */}
      <BracketTree
        layout={layout}
        selection={{
          selectedMatchNumber,
          onSelect: handleSelect,
          pathMatchNumbers: pathSet,
          currentPathMatch: teamPath?.currentMatchNumber ?? null,
          currentPathLabel,
        }}
      />

      {/* Selected-match detail panel — progressive disclosure, one at a time. */}
      {detail ? <BracketMatchDetail model={detail} onClose={handleClear} panelRef={panelRef} /> : null}
    </div>
  );
}
