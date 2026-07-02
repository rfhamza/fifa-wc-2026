import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FlagGlyph } from "@/components/flag-glyph";
import type { BadgeProps } from "@/components/ui/badge";
import type { TeamBracketPath, TeamPathStatus } from "@/lib/ui/bracket-path";

function statusBadge(status: TeamPathStatus): { label: string; variant: BadgeProps["variant"] } {
  switch (status) {
    case "champion":
      return { label: "Champion", variant: "accent" };
    case "active":
      return { label: "Still alive", variant: "default" };
    case "third-place":
      return { label: "Third-place match", variant: "outline" };
    case "eliminated":
      return { label: "Eliminated", variant: "muted" };
    case "notInKnockout":
      return { label: "Not in knockout", variant: "muted" };
    default:
      return { label: "Status unavailable", variant: "muted" };
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 sm:block">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * The selected-team path summary card (progressive disclosure of a traced team). Presentational:
 * all path logic lives in buildBracketPath; cautious, deterministic copy only.
 */
export function BracketTeamPathSummary({
  path,
  onClear,
  summaryRef,
}: {
  path: TeamBracketPath;
  onClear: () => void;
  summaryRef: React.RefObject<HTMLElement>;
}) {
  const badge = statusBadge(path.status);
  const currentLabel = path.status === "active" ? "Current match" : "Last match";

  return (
    <section
      ref={summaryRef}
      id="bracket-team-path"
      role="region"
      aria-labelledby="bracket-team-path-heading"
      tabIndex={-1}
      className="scroll-mt-24 space-y-3 rounded-2xl border border-accent/40 bg-card p-4 shadow-sm ring-1 ring-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {path.countryCode ? (
            <FlagGlyph countryCode={path.countryCode} flag={path.flag ?? ""} name={path.name} size={20} />
          ) : null}
          <h2 id="bracket-team-path-heading" className="truncate text-base font-semibold">
            {path.name}&rsquo;s path
          </h2>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden /> Clear team path
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>

      <p className="text-sm text-muted-foreground">{path.summary}</p>

      {path.currentMatchNumber != null || path.nextMatch ? (
        <dl className="grid gap-2 sm:grid-cols-3">
          {path.currentMatchNumber != null ? (
            <Row label={currentLabel} value={`Match ${path.currentMatchNumber}`} />
          ) : null}
          {path.nextMatch ? <Row label="Next possible match" value={`Match ${path.nextMatch.matchNumber}`} /> : null}
          {path.nextMatch ? <Row label="Possible opponent" value={path.nextMatch.opponentLabel} /> : null}
        </dl>
      ) : null}
    </section>
  );
}
