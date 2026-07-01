import { BracketPage } from "@/components/bracket/bracket-page";
import { officialKnockoutGraph } from "@/data/official/knockout-graph";
import {
  getRuntimeCurrentSnapshotPolicy,
  getRuntimeMatchForecasts,
} from "@/lib/model/forecast-runtime-store";
import { teams } from "@/lib/data";
import type { TeamLookup } from "@/lib/live-client/public-safe-view.client";
import type { MatchForecastProvenance } from "@/lib/model/match-forecast";

export const metadata = {
  title: "Knockout Bracket · World Cup Probability Lab",
};

// The bracket overlays live-state + the runtime match-forecast archive on the official
// graph skeleton, so it must not be frozen at build. It renders safely (skeleton only,
// "Awaiting teams") when the Blob/token/live-state is unavailable.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const TEAM_LOOKUP: TeamLookup = Object.fromEntries(
  teams.map((t) => [t.id, { id: t.id, name: t.name, flag: t.flag, countryCode: t.countryCode }]),
);

export default async function Bracket() {
  // Runtime knockout match-forecast provenance (group entries are irrelevant here).
  const matchForecasts = await getRuntimeMatchForecasts();
  const matchesObjectAvailable = matchForecasts !== null;
  const provenanceByMatch: Record<number, MatchForecastProvenance> = {};
  if (matchForecasts) {
    for (const e of matchForecasts.matchForecasts) {
      if (e.stage === "group") continue;
      provenanceByMatch[e.matchNumber] = e.forecastProvenance;
    }
  }

  const source = (await getRuntimeCurrentSnapshotPolicy()).currentSource;

  return (
    <BracketPage
      skeleton={officialKnockoutGraph.matches}
      provenanceByMatch={provenanceByMatch}
      matchesObjectAvailable={matchesObjectAvailable}
      source={source}
      teams={TEAM_LOOKUP}
    />
  );
}
