import { cn } from "@/lib/utils";
import { FlagGlyph } from "@/components/flag-glyph";
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
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      {team ? (
        <FlagGlyph countryCode={team.countryCode} flag={team.flag} name={team.name} size={16} />
      ) : (
        <span className="shrink-0 text-base leading-none" aria-hidden>
          ·
        </span>
      )}
      <span className="min-w-0 truncate font-medium">{team?.name ?? id}</span>
    </span>
  );
}
