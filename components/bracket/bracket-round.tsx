import { BracketMatchCard } from "@/components/bracket/bracket-match-card";
import { cn } from "@/lib/utils";
import type { BracketRound as BracketRoundModel } from "@/lib/ui/bracket-view";

/** One round as a labelled column (desktop) / stacked section (mobile). */
export function BracketRound({
  round,
  selectedMatchNumber,
  onSelect,
  pathMatchNumbers,
  currentPathMatch = null,
  currentPathLabel = "Current match",
  fill = false,
}: {
  round: BracketRoundModel;
  selectedMatchNumber: number | null;
  onSelect: (matchNumber: number) => void;
  pathMatchNumbers?: Set<number>;
  currentPathMatch?: number | null;
  currentPathLabel?: string;
  /** In the two-sided tree, distribute cards vertically so later rounds visually converge. */
  fill?: boolean;
}) {
  const resolved = round.nodes.filter((n) => n.state === "completed" || n.state === "live").length;
  return (
    <section className={cn("min-w-0 space-y-3", fill && "xl:flex xl:h-full xl:flex-col")}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">{round.label}</h2>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {resolved}/{round.nodes.length} played
        </span>
      </div>
      <div className={cn("space-y-3", fill && "xl:flex xl:flex-1 xl:flex-col xl:justify-around xl:gap-3 xl:space-y-0")}>
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
