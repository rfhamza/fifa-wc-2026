import { cn } from "@/lib/utils";

interface StatTileProps {
  label: string;
  value: string | number;
  hint?: string;
  className?: string;
}

/** Compact labelled metric tile used across team pages. */
export function StatTile({ label, value, hint, className }: StatTileProps) {
  return (
    <div className={cn("rounded-lg border border-border/60 bg-secondary/30 p-4", className)}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
