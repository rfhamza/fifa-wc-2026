import { BracketRound } from "@/components/bracket/bracket-round";
import { BracketMatchCard } from "@/components/bracket/bracket-match-card";
import type { BracketHalf, BracketLayout } from "@/lib/ui/bracket-layout";
import type { BracketNode } from "@/lib/ui/bracket-view";
import type { KnockoutStage } from "@/lib/types";

interface SelectionProps {
  selectedMatchNumber: number | null;
  onSelect: (matchNumber: number) => void;
  pathMatchNumbers?: Set<number>;
  currentPathMatch: number | null;
  currentPathLabel: string;
}

type StageCol = { stage: KnockoutStage & keyof BracketHalf; label: string };

// Column order per side so both halves converge on the centered Final. The SAME array
// order works for desktop (flex-row) and mobile (flex-col stacked) — no mirroring.
const LEFT_COLS: StageCol[] = [
  { stage: "roundOf32", label: "Round of 32" },
  { stage: "roundOf16", label: "Round of 16" },
  { stage: "quarterFinal", label: "Quarter-finals" },
  { stage: "semiFinal", label: "Semi-final" },
];
const RIGHT_COLS: StageCol[] = [
  { stage: "semiFinal", label: "Semi-final" },
  { stage: "quarterFinal", label: "Quarter-finals" },
  { stage: "roundOf16", label: "Round of 16" },
  { stage: "roundOf32", label: "Round of 32" },
];

function HalfColumns({
  half,
  cols,
  selection,
}: {
  half: BracketHalf;
  cols: StageCol[];
  selection: SelectionProps;
}) {
  return (
    <>
      {cols.map((col) => (
        <div key={col.stage} className="xl:w-[150px] xl:shrink-0">
          <BracketRound
            round={{ stage: col.stage, label: col.label, nodes: half[col.stage] }}
            selectedMatchNumber={selection.selectedMatchNumber}
            onSelect={selection.onSelect}
            pathMatchNumbers={selection.pathMatchNumbers}
            currentPathMatch={selection.currentPathMatch}
            currentPathLabel={selection.currentPathLabel}
            fill
          />
        </div>
      ))}
    </>
  );
}

function CenterCard({ node, title, selection }: { node: BracketNode; title: string; selection: SelectionProps }) {
  return (
    <div className="space-y-2 xl:w-[170px] xl:shrink-0 xl:self-center">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <BracketMatchCard
        node={node}
        selected={selection.selectedMatchNumber === node.matchNumber}
        onSelect={selection.onSelect}
        pathMatchNumbers={selection.pathMatchNumbers}
        currentPathMatch={selection.currentPathMatch}
        currentPathLabel={selection.currentPathLabel}
      />
    </div>
  );
}

/**
 * True two-sided knockout bracket: left half → centered Final ← right half, with the
 * third-place match kept separate. Desktop lays out as converging columns (horizontally
 * scrollable if the viewport is narrow); below xl it stacks into labelled halves. Text
 * stays left-to-right on both sides (no mirroring). Presentational — all selection/path
 * state is owned by the page.
 */
export function BracketTree({ layout, selection }: { layout: BracketLayout; selection: SelectionProps }) {
  return (
    <div className="space-y-8">
      <div className="xl:overflow-x-auto xl:pb-2">
        <div className="flex flex-col gap-8 xl:flex-row xl:items-stretch xl:gap-4">
          {/* Left half */}
          <div className="space-y-3 xl:flex xl:flex-row xl:gap-4 xl:space-y-0">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground xl:hidden">
              Left half
            </h2>
            <HalfColumns half={layout.left} cols={LEFT_COLS} selection={selection} />
          </div>

          {/* Final (centered) */}
          {layout.final ? <CenterCard node={layout.final} title="Final" selection={selection} /> : null}

          {/* Right half */}
          <div className="space-y-3 xl:flex xl:flex-row xl:gap-4 xl:space-y-0">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground xl:hidden">
              Right half
            </h2>
            <HalfColumns half={layout.right} cols={RIGHT_COLS} selection={selection} />
          </div>
        </div>
      </div>

      {/* Third-place play-off — separate, never in the title tree. */}
      {layout.thirdPlace ? (
        <section className="space-y-3 border-t border-border/60 pt-6">
          <h2 className="text-sm font-semibold tracking-tight">Third place</h2>
          <div className="max-w-sm">
            <BracketMatchCard
              node={layout.thirdPlace}
              selected={selection.selectedMatchNumber === layout.thirdPlace.matchNumber}
              onSelect={selection.onSelect}
              pathMatchNumbers={selection.pathMatchNumbers}
              currentPathMatch={selection.currentPathMatch}
              currentPathLabel={selection.currentPathLabel}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
