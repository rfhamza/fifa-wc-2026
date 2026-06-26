import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  freshnessLabel,
  friendlyPolicyLabel,
  formatRelativeTime,
  type LiveStateView,
} from "@/lib/live-client/public-safe-view.client";

/**
 * Phase 1.28Q-A - calm, transparent live-data badge. Premium-dark, theme-ready (semantic
 * tokens only). Shows source policy, freshness/status, asOf, a calm "may be delayed" note,
 * and compact Football-Data.org attribution. No provider IDs / URLs / tokens.
 */
export function LiveDataBadge({
  view,
  nowMs,
  compact = false,
  className,
}: {
  view: LiveStateView;
  nowMs: number;
  compact?: boolean;
  className?: string;
}) {
  const fresh = freshnessLabel(view);
  const delayed = fresh !== "Up to date";
  const asOf = formatRelativeTime(view.generatedAt || view.asOf, nowMs);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Badge variant={delayed ? "muted" : "default"}>
        <span
          className={cn(
            "mr-1.5 inline-block h-1.5 w-1.5 rounded-full",
            delayed ? "bg-muted-foreground" : "bg-primary",
          )}
          aria-hidden
        />
        {friendlyPolicyLabel(view.publicSourcePolicy)}
      </Badge>
      <Badge variant="outline">{fresh}</Badge>
      <Badge variant="outline">as of {asOf}</Badge>
      {!compact && delayed && (
        <span className="text-xs text-muted-foreground">Data may be delayed.</span>
      )}
      {!compact && (
        <span className="text-xs text-muted-foreground">
          {view.attribution.sourceUrl ? (
            <a
              href={view.attribution.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:underline"
            >
              {view.attribution.text}
            </a>
          ) : (
            view.attribution.text
          )}
        </span>
      )}
    </div>
  );
}
