"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FilterPills } from "@/components/ui/filter-pills";
import { SourceBadge } from "@/components/ui/source-badge";
import { MovementCard } from "@/components/movement/movement-card";
import { MovementStageSelector } from "@/components/movement/movement-stage-selector";
import {
  fetchPublicSafeLiveState,
  type LiveViewQualification,
} from "@/lib/live-client/public-safe-view.client";
import type { ForecastSourceKind } from "@/lib/ui/forecast-hero-data";
import {
  MOVEMENT_MODE_OPTIONS,
  deriveMovementStatus,
  movementExplanation,
  movementStatusLabel,
  selectMovers,
  type MovementMode,
  type MovementRow,
  type MovementStage,
} from "@/lib/ui/forecast-movement";

const PAGE_CAVEAT =
  "The current forecast updates as results are locked and tournament paths change; the team-strength model is not re-rated after every match.";

const TOP_N = 6;

/** A titled list of mover cards (a single column). */
function MoverColumn({
  title,
  icon,
  rows,
  stage,
  qual,
}: {
  title: string;
  icon: React.ReactNode;
  rows: MovementRow[];
  stage: MovementStage;
  qual: Map<string, LiveViewQualification> | null;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <p className="text-xs text-muted-foreground">Since tournament start · Top movers shown</p>
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border/70 bg-card p-5 text-sm text-muted-foreground">
          No notable movement for this stage yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const status = deriveMovementStatus(row, stage, qual);
            return (
              <MovementCard
                key={row.teamId}
                row={row}
                stage={stage}
                status={status}
                statusLabel={movementStatusLabel(status, stage)}
                explanation={movementExplanation(row, stage, qual)}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function MovementSurface({
  rows,
  source,
  asOfLabel,
}: {
  rows: MovementRow[];
  source: ForecastSourceKind;
  asOfLabel: string | null;
}) {
  const [qual, setQual] = useState<Map<string, LiveViewQualification> | null>(null);
  const [stage, setStage] = useState<MovementStage>("winner");
  const [mode, setMode] = useState<MovementMode>("balanced");

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

  const { risers, fallers, biggest } = useMemo(() => selectMovers(rows, stage, TOP_N), [rows, stage]);

  const hasData = rows.length > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="space-y-3">
        <Badge variant="accent">Movement</Badge>
        <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">Probability movement</h1>
        <p className="max-w-2xl text-muted-foreground">
          Who rose and who fell since the tournament started — how far each team&apos;s chances have moved
          from the pre-tournament baseline, for the stage you choose.
        </p>
        <SourceBadge source={source} asOfLabel={asOfLabel} />
        <p className="max-w-2xl text-xs text-muted-foreground">{PAGE_CAVEAT}</p>
        <Link
          href="/teams"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          View full Forecast Board <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </header>

      {/* Controls */}
      <div className="space-y-3">
        <MovementStageSelector value={stage} onChange={setStage} />
        <FilterPills
          options={MOVEMENT_MODE_OPTIONS}
          value={mode}
          onChange={setMode}
          ariaLabel="Choose which movers to show"
        />
      </div>

      {!hasData ? (
        <div className="rounded-2xl border border-border/70 bg-card p-6 text-sm text-muted-foreground">
          Movement is unavailable right now. It compares the current forecast with the pre-tournament
          baseline; once both are published, risers and fallers appear here.
        </div>
      ) : mode === "balanced" ? (
        <div className="grid gap-6 md:grid-cols-2">
          <MoverColumn
            title="Biggest risers"
            icon={<TrendingUp className="h-5 w-5 text-win" aria-hidden />}
            rows={risers}
            stage={stage}
            qual={qual}
          />
          <MoverColumn
            title="Biggest fallers"
            icon={<TrendingDown className="h-5 w-5 text-loss" aria-hidden />}
            rows={fallers}
            stage={stage}
            qual={qual}
          />
        </div>
      ) : mode === "risers" ? (
        <MoverColumn
          title="Biggest risers"
          icon={<TrendingUp className="h-5 w-5 text-win" aria-hidden />}
          rows={risers}
          stage={stage}
          qual={qual}
        />
      ) : mode === "fallers" ? (
        <MoverColumn
          title="Biggest fallers"
          icon={<TrendingDown className="h-5 w-5 text-loss" aria-hidden />}
          rows={fallers}
          stage={stage}
          qual={qual}
        />
      ) : (
        <MoverColumn
          title="Biggest moves"
          icon={<TrendingUp className="h-5 w-5 text-primary" aria-hidden />}
          rows={biggest}
          stage={stage}
          qual={qual}
        />
      )}
    </div>
  );
}
