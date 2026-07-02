import { BracketPage } from "@/components/bracket/bracket-page";
import { officialKnockoutGraph } from "@/data/official/knockout-graph";
import {
  getRuntimeCurrentSnapshotPolicy,
  getRuntimeMatchForecasts,
} from "@/lib/model/forecast-runtime-store";
import { teams } from "@/lib/data";
import type { TeamLookup } from "@/lib/live-client/public-safe-view.client";
import type { MatchForecastProvenance } from "@/lib/model/match-forecast";
import type { CentreRuntimeEntry } from "@/lib/ui/match-centre";

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
  // Additive: a knockout-only serialized forecast index for the selected-match detail
  // panel (UX-4B). Projects only the public-safe fields the panel renders — no xG, no
  // provider ids. Does not change any runtime-helper API or forecast contract.
  const forecastByMatch: Record<number, CentreRuntimeEntry> = {};
  if (matchForecasts) {
    for (const e of matchForecasts.matchForecasts) {
      if (e.stage === "group") continue;
      provenanceByMatch[e.matchNumber] = e.forecastProvenance;
      const entry: CentreRuntimeEntry = {
        homeTeamId: e.homeTeamId,
        awayTeamId: e.awayTeamId,
        homeWin: e.homeWin,
        draw: e.draw,
        awayWin: e.awayWin,
        provenance: e.forecastProvenance,
      };
      const top = e.topScorelines?.[0];
      if (top) entry.topScoreline = { homeGoals: top.homeGoals, awayGoals: top.awayGoals, probability: top.probability };
      if (typeof e.homeAdvance === "number") entry.homeAdvance = e.homeAdvance;
      if (typeof e.awayAdvance === "number") entry.awayAdvance = e.awayAdvance;
      forecastByMatch[e.matchNumber] = entry;
    }
  }

  const source = (await getRuntimeCurrentSnapshotPolicy()).currentSource;

  return (
    <BracketPage
      skeleton={officialKnockoutGraph.matches}
      provenanceByMatch={provenanceByMatch}
      forecastByMatch={forecastByMatch}
      matchesObjectAvailable={matchesObjectAvailable}
      source={source}
      teams={TEAM_LOOKUP}
    />
  );
}
