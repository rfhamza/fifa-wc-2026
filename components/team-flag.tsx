import Link from "next/link";
import type { Team } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FlagGlyph } from "@/components/flag-glyph";

interface TeamFlagProps {
  team: Team;
  className?: string;
  showCode?: boolean;
  /** When true, render as a link to the team detail page. */
  link?: boolean;
}

/** Compact team identity: flag emoji + name (+ optional 3-letter code). */
export function TeamFlag({
  team,
  className,
  showCode = false,
  link = false,
}: TeamFlagProps) {
  const content = (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <FlagGlyph countryCode={team.countryCode} flag={team.flag} name={team.name} size={18} />
      <span className="font-medium">{team.name}</span>
      {showCode && (
        <span className="text-xs text-muted-foreground">{team.countryCode}</span>
      )}
    </span>
  );

  if (link) {
    return (
      <Link
        href={`/teams/${team.id}`}
        className="transition-colors hover:text-primary"
      >
        {content}
      </Link>
    );
  }
  return content;
}
