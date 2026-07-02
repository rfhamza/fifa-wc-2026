import { BracketMatchCard } from "@/components/bracket/bracket-match-card";
import type { BracketRound as BracketRoundModel } from "@/lib/ui/bracket-view";

/** One round as a labelled column (desktop) / stacked section (mobile). */
export function BracketRound({
  round,
  selectedMatchNumber,
  onSelect,
  pathMatchNumbers,
  currentPathMatch = null,
  currentPathLabel = "Current match",
}: {
  round: BracketRoundModel;
  selectedMatchNumber: number | null;
  onSelect: (matchNumber: number) => void;
  pathMatchNumbers?: Set<number>;
  currentPathMatch?: number | null;
  currentPathLabel?: string;
}) {
  const resolved = round.nodes.filter((n) => n.state === "completed" || n.state === "live").length;
  return (
    <section className="min-w-0 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">{round.label}</h2>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {resolved}/{round.nodes.length} played
        </span>
      </div>
      <div className="space-y-3">
        {round.nodes.map((node) => (
          <BracketMatchCard
            key={node.matchNumber}
            node={node}
            selected={selectedMatchNumber === node.matchNumber}
            onSelect={onSelect}
            pathMatchNumbers={pathMatchNumbers}
            currentPathMatch={currentPathMatch}
            currentPathLabel={currentPathLabel}
          />
        ))}
      </div>
    </section>
  );
}
