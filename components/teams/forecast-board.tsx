"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { FilterPills } from "@/components/ui/filter-pills";
import { SourceBadge } from "@/components/ui/source-badge";
import { MoverChip } from "@/components/ui/mover-chip";
import { FlagGlyph } from "@/components/flag-glyph";
import { ForecastBoardTable } from "@/components/teams/forecast-board-table";
import { ForecastBoardCards } from "@/components/teams/forecast-board-cards";
import {
  fetchPublicSafeLiveState,
  type LiveViewQualification,
} from "@/lib/live-client/public-safe-view.client";
import type { ForecastSourceKind } from "@/lib/ui/forecast-hero-data";
import { pct } from "@/lib/utils";
import {
  BOARD_STATUS_OPTIONS,
  BOARD_VIEW_OPTIONS,
  deriveStatus,
  matchesSearch,
  matchesStatusFilter,
  sortBoard,
  type BoardRow,
  type BoardStatus,
  type BoardStatusFilter,
  type BoardView,
} from "@/lib/ui/forecast-board";

const MOVEMENT_CAVEAT =
  "Movement reflects locked results and tournament path changes. The team-strength model is not re-rated after every match.";

export function ForecastBoard({ rows, source }: { rows: BoardRow[]; source: ForecastSourceKind }) {
  const [qual, setQual] = useState<Map<string, LiveViewQualification> | null>(null);
  const [view, setView] = useState<BoardView>("current");
  const [statusFilter, setStatusFilter] = useState<BoardStatusFilter>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    fetchPublicSafeLiveState().then((r) => {
      if (!alive) return;
      if (r.ok && r.state.status !== "unavailable") {
        setQual(new Map(r.state.standings.map((s) => [s.teamId, s.qualificationState])));
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const statusMap = useMemo(() => {
    const m = new Map<string, BoardStatus>();
    for (const row of rows) m.set(row.teamId, deriveStatus(row, qual));
    return m;
  }, [rows, qual]);
  const statusOf = (teamId: string): BoardStatus => statusMap.get(teamId) ?? "unknown";

  const visible = sortBoard(
    rows.filter((r) => matchesSearch(r, query) && matchesStatusFilter(statusOf(r.teamId), statusFilter)),
    view,
  );

  const topStrip = useMemo(() => [...rows].sort((a, b) => a.rank - b.rank).slice(0, 5), [rows]);

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="space-y-3">
        <Badge variant="accent">Forecast Board</Badge>
        <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">Every team&apos;s forecast</h1>
        <p className="max-w-2xl text-muted-foreground">
          The live-aware current forecast for all 48 teams — title chance, how far each can go, and how
          much has changed since the pre-tournament baseline.
        </p>
        <SourceBadge source={source} />
        <p className="max-w-2xl text-xs text-muted-foreground">
          The current forecast updates as results are locked and tournament paths change; the team-strength
          model is not re-rated after every match.
        </p>
      </header>

      {/* Top contenders strip */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        {topStrip.map((row) => (
          <div key={row.teamId} className="flex min-w-[150px] shrink-0 items-center gap-2 rounded-2xl border border-border/60 bg-card px-3 py-2">
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">{row.rank}</span>
            <FlagGlyph countryCode={row.countryCode} flag={row.flag} name={row.name} size={18} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{row.name}</div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tabular-nums text-primary">{pct(row.current.winner, 1)}</span>
                {row.winnerDeltaPp != null ? <MoverChip deltaPp={row.winnerDeltaPp} /> : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="space-y-3">
        <FilterPills options={BOARD_VIEW_OPTIONS} value={view} onChange={setView} ariaLabel="Forecast view" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a team…"
            aria-label="Search teams"
            className="w-full rounded-full border border-border bg-card px-4 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-xs"
          />
          <FilterPills options={BOARD_STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} ariaLabel="Filter by status" />
        </div>
      </div>

      {view === "movement" ? <p className="text-xs text-muted-foreground">{MOVEMENT_CAVEAT}</p> : null}
      {view === "baseline" ? <p className="text-xs text-muted-foreground">Pre-tournament model baseline.</p> : null}

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-border/70 bg-card p-6 text-sm text-muted-foreground">
          No teams match this filter.
        </div>
      ) : (
        <>
          <div className="md:hidden">
            <ForecastBoardCards rows={visible} statusOf={statusOf} view={view} />
          </div>
          <div className="hidden md:block">
            <ForecastBoardTable rows={visible} statusOf={statusOf} view={view} />
          </div>
        </>
      )}
    </div>
  );
}
