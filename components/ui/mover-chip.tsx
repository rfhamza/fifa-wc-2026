import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatPpDelta,
  moverDirection,
  ppDeltaSrText,
} from "@/lib/ui/forecast-hero-data";

/**
 * Signed percentage-point delta chip (UX-1). Presentational: up/down/neutral
 * treatment with a colour cue, a visible "+X pts" label, and screen-reader text.
 */
export function MoverChip({
  deltaPp,
  className,
}: {
  deltaPp: number;
  className?: string;
}) {
  const dir = moverDirection(deltaPp);
  const Icon = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;
  const tone =
    dir === "up" ? "text-win" : dir === "down" ? "text-loss" : "text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-sm font-semibold tabular-nums",
        tone,
        className,
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span aria-hidden>{formatPpDelta(deltaPp)}</span>
      <span className="sr-only">{ppDeltaSrText(deltaPp)}</span>
    </span>
  );
}
