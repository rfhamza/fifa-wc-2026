import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProbabilityBar } from "@/components/charts/probability-bar";
import { FlagGlyph } from "@/components/flag-glyph";
import type { Fixture, FixtureSource, MatchPrediction, Team, Venue } from "@/lib/types";
import { pct } from "@/lib/utils";
import { MapPin } from "lucide-react";

interface FixtureCardProps {
  fixture: Fixture;
  prediction: MatchPrediction;
  home: Team;
  away: Team;
  venue: Venue;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** Short per-fixture provenance chip so generated order is never implied official. */
const SOURCE_CHIP: Record<FixtureSource, string | null> = {
  official: "Official",
  "position-generated": "Position-generated",
  "mock-generated": "Mock",
};

/** Rich match prediction card: teams, venue, W/D/L, xG, scorelines, drivers. */
export function FixtureCard({
  fixture,
  prediction,
  home,
  away,
  venue,
}: FixtureCardProps) {
  const topDriver = prediction.explanation.positiveDrivers[0];
  const topAgainst = prediction.explanation.negativeDrivers[0];
  const sourceChip = SOURCE_CHIP[fixture.source ?? "position-generated"];
  const isOfficial = fixture.source === "official";

  return (
    <Card className="transition-colors hover:border-primary/40">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <Badge variant="outline">
            {isOfficial && fixture.matchNumber ? `Match ${fixture.matchNumber} · ` : ""}
            Group {fixture.group} · MD{fixture.matchday}
          </Badge>
          {sourceChip && (
            <Badge variant={isOfficial ? "default" : "muted"}>{sourceChip}</Badge>
          )}
        </div>
        {isOfficial && (
          <div className="text-right text-[11px] text-muted-foreground">
            {dateFormatter.format(new Date(fixture.date))} · subject to change
          </div>
        )}

        {/* Teams + expected goals */}
        <div className="flex items-center justify-between gap-2">
          <TeamSide team={home} xg={prediction.expectedHomeGoals} align="left" />
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            vs
          </span>
          <TeamSide team={away} xg={prediction.expectedAwayGoals} align="right" />
        </div>

        {/* Win / draw / loss bar */}
        <ProbabilityBar
          homeWin={prediction.homeWin}
          draw={prediction.draw}
          awayWin={prediction.awayWin}
        />
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>{home.countryCode} win {pct(prediction.homeWin)}</span>
          <span>Draw {pct(prediction.draw)}</span>
          <span>{away.countryCode} win {pct(prediction.awayWin)}</span>
        </div>

        {/* Most likely scorelines */}
        <div className="flex flex-wrap gap-1.5">
          {prediction.topScorelines.slice(0, 3).map((s, i) => (
            <Badge key={i} variant={i === 0 ? "default" : "secondary"}>
              {s.homeGoals}–{s.awayGoals} · {pct(s.probability)}
            </Badge>
          ))}
        </div>

        {/* Key drivers */}
        <div className="space-y-1 border-t border-border/60 pt-3 text-xs">
          {topDriver && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="text-win">▲</span>
              <span className="font-medium text-foreground">
                {topDriver.label}
              </span>
              favours {home.name}
            </div>
          )}
          {topAgainst && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="text-loss">▼</span>
              <span className="font-medium text-foreground">
                {topAgainst.label}
              </span>
              favours {away.name}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <MapPin className="h-3 w-3" />
          {isOfficial ? `${venue.name}, ${venue.city}` : "Venue pending official schedule"}
        </div>
      </CardContent>
    </Card>
  );
}

function TeamSide({
  team,
  xg,
  align,
}: {
  team: Team;
  xg: number;
  align: "left" | "right";
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 flex-col ${align === "right" ? "items-end text-right" : ""}`}
    >
      <div className="flex items-center gap-2">
        {align === "left" && (
          <FlagGlyph countryCode={team.countryCode} flag={team.flag} name={team.name} size={20} />
        )}
        <span className="truncate font-semibold">{team.name}</span>
        {align === "right" && (
          <FlagGlyph countryCode={team.countryCode} flag={team.flag} name={team.name} size={20} />
        )}
      </div>
      <span className="text-xs text-muted-foreground">xG {xg.toFixed(2)}</span>
    </div>
  );
}
