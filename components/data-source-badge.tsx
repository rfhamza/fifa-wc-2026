import { Badge } from "@/components/ui/badge";
import { sourceStatus, fixtureSource, bracket } from "@/lib/data";
import { isBracketActive } from "@/lib/simulation/bracket";
import type { FixtureSource, SourceStatus } from "@/lib/types";

const STATUS_COPY: Record<SourceStatus, { label: string; variant: "default" | "accent" | "muted" }> = {
  verified: { label: "Verified - official FIFA data", variant: "default" },
  candidate: { label: "Candidate - cross-verified, not official", variant: "accent" },
  mock: { label: "Mock - placeholder data", variant: "muted" },
};

const FIXTURE_COPY: Record<FixtureSource, string> = {
  official: "official fixture schedule",
  "position-generated": "position-generated (FIFA Art. 12.4) - schedule pending",
  "mock-generated": "mock-generated - placeholder schedule",
};

/**
 * Surfaces dataset provenance (A2/A3) so candidate/mock data is never implied to
 * be official. Reads the active dataset's status from the data layer.
 */
export function DataSourceBadge({ className }: { className?: string }) {
  const status = STATUS_COPY[sourceStatus];
  const bracketActive = isBracketActive(bracket);
  return (
    <div className={className}>
      <Badge variant={status.variant}>Data: {status.label}</Badge>{" "}
      <Badge variant="muted">Fixtures: {FIXTURE_COPY[fixtureSource]}</Badge>{" "}
      <Badge variant={bracketActive ? "default" : "muted"}>
        Bracket: {bracketActive ? "official path active" : "placeholder seeding"}
      </Badge>
    </div>
  );
}
