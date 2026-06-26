import { cn } from "@/lib/utils";
import type { TeamLookup } from "@/lib/live-client/public-safe-view.client";

/** Compact team identity (flag + name) resolved from the server-provided lookup. */
export function LiveTeam({
  id,
  lookup,
  className,
}: {
  id: string | null;
  lookup: TeamLookup;
  className?: string;
}) {
  if (!id) return <span className="text-muted-foreground">TBD</span>;
  const team = lookup[id];
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="text-base leading-none" aria-hidden>
        {team?.flag ?? "·"}
      </span>
      <span className="font-medium">{team?.name ?? id}</span>
    </span>
  );
}
