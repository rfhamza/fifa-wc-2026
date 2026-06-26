import { Badge } from "@/components/ui/badge";
import { sourceStatus, fixtureSource, bracket } from "@/lib/data";
import { isBracketActive } from "@/lib/simulation/bracket";
import type { FixtureSource, SourceStatus } from "@/lib/types";

// "Model inputs" provenance tracks the dataset's `sourceStatus` (team identities +
// model feature values) - deliberately scoped so it never reads as a claim about
// fixtures or the bracket, which have their own (now official) provenance below.
const STATUS_COPY: Record<SourceStatus, { label: string; variant: "default" | "accent" | "muted" }> = {
  verified: { label: "verified", variant: "default" },
  candidate: { label: "candidate / mixed-source", variant: "accent" },
  mock: { label: "placeholder", variant: "muted" },
};

// Provenance label source of truth: OFFICIAL_SCHEDULE_SOURCE in
// data/official/staging/schedule.ts (v17, 10 Apr 2026, subject to change).
const FIXTURE_COPY: Record<FixtureSource, string> = {
  official: "official FIFA schedule v17",
  "position-generated": "position-generated (FIFA Art. 12.4) - schedule pending",
  "mock-generated": "mock-generated - placeholder schedule",
};

/**
 * Surfaces dataset + serving provenance (A2/A3) so candidate/mock data is never
 * implied to be official. Reads the active dataset's status from the data layer.
 * Labels are scoped per concern (model inputs / fixtures / bracket / live results /
 * probabilities) rather than one broad "Data" label, because those now have
 * different source statuses. Live-results + probabilities labels are static truth
 * statements (no fetch, no token, no provider data).
 */
export function DataSourceBadge({ className }: { className?: string }) {
  const status = STATUS_COPY[sourceStatus];
  const bracketActive = isBracketActive(bracket);
  return (
    <div className={className}>
      <Badge variant={status.variant}>Model inputs: {status.label}</Badge>{" "}
      <Badge variant={fixtureSource === "official" ? "default" : "muted"}>
        Fixtures: {FIXTURE_COPY[fixtureSource]}
      </Badge>{" "}
      <Badge variant={bracketActive ? "default" : "muted"}>
        Bracket: {bracketActive ? "official path active" : "placeholder seeding"}
      </Badge>{" "}
      <Badge variant="muted">Live results: provider-backed delayed</Badge>{" "}
      <Badge variant="muted">Probabilities: model estimates</Badge>
    </div>
  );
}
