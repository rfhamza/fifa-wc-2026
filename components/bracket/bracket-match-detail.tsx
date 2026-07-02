import Link from "next/link";
import { ArrowRight, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FlagGlyph } from "@/components/flag-glyph";
import { ProbabilityBar } from "@/components/charts/probability-bar";
import { BracketStatusBadge } from "@/components/bracket/bracket-status-badge";
import { pct, cn } from "@/lib/utils";
import { formatKickoff } from "@/lib/ui/home-sections";
import type { BracketParticipant } from "@/lib/ui/bracket-view";
import type { BracketDetailModel } from "@/lib/ui/bracket-detail";

function TeamRow({ p, goals, penalties }: { p: BracketParticipant; goals?: number; penalties?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      {p.teamId ? (
        <FlagGlyph countryCode={p.countryCode ?? ""} flag={p.flag ?? ""} name={p.name} size={22} />
      ) : (
        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-muted" aria-hidden />
      )}
      {p.teamId ? (
        <Link href={`/teams/${p.teamId}`} className="min-w-0 flex-1 truncate font-medium transition-colors hover:text-primary">
          {p.name}
        </Link>
      ) : (
        <span className="min-w-0 flex-1 truncate italic text-muted-foreground">{p.name}</span>
      )}
      {p.isWinner ? <Check className="h-4 w-4 shrink-0 text-primary" aria-label="Winner" /> : null}
      {goals != null ? (
        <span className="ml-auto flex shrink-0 items-baseline gap-1 tabular-nums">
          <span className="text-lg font-bold">{goals}</span>
          {penalties != null ? <span className="text-xs text-muted-foreground">({penalties})</span> : null}
        </span>
      ) : null}
    </div>
  );
}

/** Slim two-stat "chance to advance" (knockout), oriented to the node's A/B. */
function AdvanceRow({ aName, bName, aAdv, bAdv }: { aName: string; bName: string; aAdv: number; bAdv: number }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">Chance to advance</span>
      <span className="tabular-nums">
        <span className="font-medium text-foreground">{aName}</span> {pct(aAdv, 0)}
        <span className="mx-1.5 text-muted-foreground" aria-hidden>·</span>
        <span className="font-medium text-foreground">{bName}</span> {pct(bAdv, 0)}
      </span>
    </div>
  );
}

/**
 * One full-width selected-match detail panel (progressive disclosure). Presentational:
 * all truth/orientation is decided by buildBracketDetailModel; this only renders it.
 */
export function BracketMatchDetail({
  model,
  onClose,
  panelRef,
}: {
  model: BracketDetailModel;
  onClose: () => void;
  panelRef: React.RefObject<HTMLElement>;
}) {
  const { home, away, score, lean, scoreline, advance, agedWell, resolved } = model;
  const aName = home.teamId ? home.name : "Home";
  const bName = away.teamId ? away.name : "Away";
  const showForecast = resolved && lean != null;

  return (
    <section
      ref={panelRef}
      id="bracket-detail-panel"
      role="region"
      aria-labelledby="bracket-detail-heading"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className="scroll-mt-24 space-y-4 rounded-2xl border border-primary/40 bg-card p-5 shadow-sm ring-1 ring-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="bracket-detail-heading" className="text-lg font-semibold tracking-tight">
            Match {model.matchNumber} · {model.stageLabel}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <BracketStatusBadge state={model.state} />
            {formatKickoff(model.kickoff ?? undefined) ? (
              <span className="tabular-nums">{formatKickoff(model.kickoff ?? undefined)}</span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close match detail"
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden /> Close
        </button>
      </div>

      {/* Teams + actual score (score is already node-oriented) */}
      <div className="space-y-1.5 rounded-xl border border-border/60 bg-secondary/20 p-3">
        <TeamRow p={home} goals={score?.homeGoals} penalties={score?.penalties?.home} />
        <TeamRow p={away} goals={score?.awayGoals} penalties={score?.penalties?.away} />
      </div>

      {!resolved ? (
        <p className="text-sm text-muted-foreground">
          {model.state === "partial"
            ? "One side is decided; awaiting the opponent. The forecast appears once both teams are known."
            : "Both teams are still to be decided. The forecast appears once the matchup is set."}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Model forecast</span>
            <Badge variant={model.provenanceTone}>{model.provenanceLabel}</Badge>
            {agedWell ? (
              <Badge variant={agedWell === "called" ? "default" : "muted"}>
                {agedWell === "called" ? "Called it" : "Missed"}
              </Badge>
            ) : null}
          </div>

          {showForecast && lean ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-sm tabular-nums">
                <span><span className="font-medium">{aName}</span> {pct(lean.aWin, 0)}</span>
                <span className="text-muted-foreground">Draw {pct(lean.draw, 0)}</span>
                <span><span className="font-medium">{bName}</span> {pct(lean.bWin, 0)}</span>
              </div>
              <ProbabilityBar homeWin={lean.aWin} draw={lean.draw} awayWin={lean.bWin} showLabels={false} className="h-2" />
              {scoreline ? (
                <p className="text-sm text-muted-foreground tabular-nums">
                  Likely scoreline{" "}
                  <span className="font-medium text-foreground">
                    {aName} {scoreline.aGoals}–{scoreline.bGoals} {bName}
                  </span>{" "}
                  · {pct(scoreline.probability, 0)}
                </p>
              ) : null}
              {advance ? <AdvanceRow aName={aName} bName={bName} aAdv={advance.aAdv} bAdv={advance.bAdv} /> : null}
            </div>
          ) : (
            <p className={cn("text-sm text-muted-foreground")}>
              No model lean to show for this match yet — see the label above for why.
            </p>
          )}
        </div>
      )}

      <div className="border-t border-border/50 pt-3">
        <Link href="/matches" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          Open the Match Forecast Centre <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
