import { cn } from "@/lib/utils";

interface ProbabilityBarProps {
  homeWin: number;
  draw: number;
  awayWin: number;
  className?: string;
  /** Show inline percentage labels inside the segments. */
  showLabels?: boolean;
}

/**
 * Segmented win / draw / loss bar. Pure presentation — it just renders the
 * three probabilities (which are expected to sum to ~1) as proportional bands.
 */
export function ProbabilityBar({
  homeWin,
  draw,
  awayWin,
  className,
  showLabels = true,
}: ProbabilityBarProps) {
  const segments = [
    { key: "home", value: homeWin, color: "bg-win" },
    { key: "draw", value: draw, color: "bg-draw" },
    { key: "away", value: awayWin, color: "bg-loss" },
  ];
  return (
    <div
      className={cn(
        "flex h-7 w-full overflow-hidden rounded-md bg-muted text-[11px] font-semibold",
        className,
      )}
    >
      {segments.map((s) => (
        <div
          key={s.key}
          className={cn(
            "flex items-center justify-center text-background transition-all",
            s.color,
          )}
          style={{ width: `${Math.max(0, s.value * 100)}%` }}
        >
          {showLabels && s.value >= 0.08 ? `${Math.round(s.value * 100)}%` : ""}
        </div>
      ))}
    </div>
  );
}
