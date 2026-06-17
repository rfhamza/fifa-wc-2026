import { Badge } from "@/components/ui/badge";
import { sourceStatus, fixtureSource } from "@/lib/data";
import type { FixtureSource, SourceStatus } from "@/lib/types";

const STATUS_COPY: Record<SourceStatus, { label: string; variant: "default" | "accent" | "muted" }> = {
  verified: { label: "Verified · official FIFA data", variant: "default" },
  candidate: { label: "Candidate · cross-verified, not official", variant: "accent" },
  mock: { label: "Mock · placeholder data", variant: "muted" },
};

const FIXTURE_COPY: Record<FixtureSource, string> = {
  official: "official fixture schedule",
  generated: "fixture order simulated · pending official schedule",
};

/**
 * Surfaces dataset provenance (A2/A3) so candidate/mock data is never implied to
 * be official. Reads the active dataset's status from the data layer.
 */
export function DataSourceBadge({ className }: { className?: string }) {
  const status = STATUS_COPY[sourceStatus];
  return (
    <div className={className}>
      <Badge variant={status.variant}>Data: {status.label}</Badge>{" "}
      <Badge variant="muted">Fixtures: {FIXTURE_COPY[fixtureSource]}</Badge>
    </div>
  );
}
