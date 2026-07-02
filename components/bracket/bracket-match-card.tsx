import Link from "next/link";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FlagGlyph } from "@/components/flag-glyph";
import { BracketStatusBadge } from "@/components/bracket/bracket-status-badge";
import { cn } from "@/lib/utils";
import type { BracketNode, BracketParticipant, BracketScore } from "@/lib/ui/bracket-view";

function ScoreCell({ node, side }: { node: BracketNode; side: "home" | "away" }) {
  if (!node.score) return null;
  const goals: keyof BracketScore = side === "home" ? "homeGoals" : "awayGoals";
  const pen = node.score.penalties?.[side];
  return (
    <span className="ml-auto flex shrink-0 items-baseline gap-1 tabular-nums">
      <span className="text-sm font-semibold">{node.score[goals]}</span>
      {pen != null ? <span className="text-[10px] text-muted-foreground">({pen})</span> : null}
    </span>
  );
}

function ParticipantLine({ node, p, side }: { node: BracketNode; p: BracketParticipant; side: "home" | "away" }) {
  const emphasis = p.isWinner ? "font-semibold text-foreground" : "text-foreground";
  const inner = (
    <>
      {p.teamId ? (
        <FlagGlyph countryCode={p.countryCode ?? ""} flag={p.flag ?? ""} name={p.name} size={16} />
      ) : (
        <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-muted" aria-hidden />
      )}
      <span className={cn("min-w-0 truncate text-sm", p.teamId ? emphasis : "italic text-muted-foreground")}>
        {p.name}
      </span>
      {p.isWinner ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Winner" /> : null}
    </>
  );
  return (
    <div className="flex items-center gap-2">
      {p.teamId ? (
        <Link
          href={`/teams/${p.teamId}`}
          className="flex min-w-0 flex-1 items-center gap-2 transition-colors hover:text-primary"
        >
          {inner}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2">{inner}</div>
      )}
      <ScoreCell node={node} side={side} />
    </div>
  );
}

/**
 * One knockout match node: teams/placeholders, status, score + winner, forecast badge.
 * Lightweight — the rich forecast lives in the selected-match detail panel. The header row
 * is a real button that opens/closes the detail panel; team links stay siblings of it (no
 * nested interactive elements).
 */
export function BracketMatchCard({
  node,
  selected = false,
  onSelect,
  pathMatchNumbers,
  currentPathMatch = null,
  currentPathLabel = "Current match",
}: {
  node: BracketNode;
  selected?: boolean;
  onSelect?: (matchNumber: number) => void;
  /** Match numbers on the traced team's path (for soft highlight); undefined when none traced. */
  pathMatchNumbers?: Set<number>;
  currentPathMatch?: number | null;
  /** Label for the traced team's current/last node ("Current match" vs "Last match"). */
  currentPathLabel?: string;
}) {
  const highlight = node.state === "live";
  const onPath = pathMatchNumbers?.has(node.matchNumber) ?? false;
  const pathRole: "current" | "on-path" | null = onPath
    ? node.matchNumber === currentPathMatch
      ? "current"
      : "on-path"
    : null;
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-3 shadow-sm transition-colors",
        selected
          ? "border-primary ring-2 ring-primary/30"
          : pathRole === "current"
            ? "border-accent ring-2 ring-accent/40"
            : pathRole === "on-path"
              ? "border-accent/50 ring-1 ring-accent/20"
              : highlight
                ? "border-primary/50 ring-1 ring-primary/20"
                : "border-border/60",
      )}
    >
      <button
        type="button"
        id={`bracket-card-${node.matchNumber}`}
        aria-expanded={selected}
        aria-controls="bracket-detail-panel"
        onClick={() => onSelect?.(node.matchNumber)}
        className="mb-2 flex w-full items-center justify-between gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Match {node.matchNumber}
        </span>
        <BracketStatusBadge state={node.state} />
      </button>
      {pathRole ? (
        <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-accent">
          {pathRole === "current" ? currentPathLabel : "On path"}
        </div>
      ) : null}
      <div className="space-y-1.5">
        <ParticipantLine node={node} p={node.home} side="home" />
        <ParticipantLine node={node} p={node.away} side="away" />
      </div>
      {node.forecast ? (
        <div className="mt-2.5 border-t border-border/50 pt-2">
          <Badge variant={node.forecast.tone} className="text-[10px]">
            {node.forecast.label}
          </Badge>
        </div>
      ) : null}
    </div>
  );
}
