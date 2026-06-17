import { cn } from "@/lib/utils";
import { pct } from "@/lib/utils";

interface ProbabilityMeterProps {
  value: number; // 0..1
  label?: string;
  className?: string;
  /** Tailwind color class for the fill, e.g. "bg-primary". */
  color?: string;
}

/** A single horizontal probability bar with an optional label and value. */
export function ProbabilityMeter({
  value,
  label,
  className,
  color = "bg-primary",
}: ProbabilityMeterProps) {
  return (
    <div className={cn("space-y-1", className)}>
      {label && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-semibold tabular-nums">{pct(value, 1)}</span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
        />
      </div>
    </div>
  );
}
