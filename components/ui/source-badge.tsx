import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  sourceLabel,
  sourceTone,
  type ForecastSourceKind,
} from "@/lib/ui/forecast-hero-data";

/**
 * Forecast source/freshness badge (UX-1). Presentational: shows whether the headline
 * forecast is the live Blob current, a committed fallback, or unavailable, plus an
 * optional "as of" label. Never renders a token, Blob URL, or raw error.
 */
export function SourceBadge({
  source,
  asOfLabel,
  className,
}: {
  source: ForecastSourceKind;
  asOfLabel?: string | null;
  className?: string;
}) {
  const tone = sourceTone(source);
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Badge variant={tone}>
        <span
          className={cn(
            "mr-1.5 inline-block h-1.5 w-1.5 rounded-full",
            source === "blob" ? "bg-primary" : "bg-muted-foreground",
          )}
          aria-hidden
        />
        {sourceLabel(source)}
      </Badge>
      {asOfLabel ? <Badge variant="outline">as of {asOfLabel}</Badge> : null}
    </div>
  );
}
