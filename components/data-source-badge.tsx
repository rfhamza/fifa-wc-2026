import { Badge } from "@/components/ui/badge";
import { sourceStatus, fixtureSource, bracket } from "@/lib/data";
import { isBracketActive } from "@/lib/simulation/bracket";
import type { FixtureSource, SourceStatus } from "@/lib/types";

const STATUS_COPY: Record<SourceStatus, { label: string; variant: "default" | "accent" | "muted" }> = {
  verified: { label: "Verified - official FIFA data", variant: "default" },
  candidate: { label: "Candidate - cross-verified, not official", variant: "accent" },
  mock: { label: "Mock - placeholder data", variant: "muted" },
};

// Provenance label source of truth: OFFICIAL_SCHEDULE_SOURCE in
// data/official/staging/schedule.ts (v17, 10 Apr 2026, subject to change).
const FIXTURE_COPY: Record<FixtureSource, string> = {
  official: "Official FIFA schedule, v17, 10 Apr 2026, subject to change",
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
