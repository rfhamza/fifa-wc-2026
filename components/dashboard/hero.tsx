import { Badge } from "@/components/ui/badge";
import { FlagGlyph } from "@/components/flag-glyph";
import type { Team, TournamentStageProbability } from "@/lib/types";
import { pct } from "@/lib/utils";

interface HeroProps {
  favourite: { team: Team; probability: TournamentStageProbability };
  iterations: number;
  teamsCount: number;
}

/** Premium hero banner for the forecast dashboard. */
export function Hero({ favourite, iterations, teamsCount }: HeroProps) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-secondary/30 p-6 md:p-8 lg:p-12">
      <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative max-w-2xl space-y-4">
        <Badge variant="accent">FIFA World Cup 2026 · Forecast Lab</Badge>
        <h1 className="text-3xl font-bold tracking-tight text-balance lg:text-5xl">
          Explainable probabilities for every team, match and stage.
        </h1>
        <p className="text-balance text-muted-foreground">
          A transparent baseline model blends Elo, FIFA ranking, squad quality,
          form, manager cohesion, host advantage and climate familiarity — then
          a Monte Carlo engine simulates the tournament{" "}
          <span className="font-semibold text-foreground">
            {iterations.toLocaleString()}
          </span>{" "}
          times across all {teamsCount} teams.
        </p>
        <div className="flex flex-wrap items-center gap-6 pt-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Current favourite
            </div>
            <div className="mt-1 flex items-center gap-2 text-xl font-semibold">
              <FlagGlyph countryCode={favourite.team.countryCode} flag={favourite.team.flag} name={favourite.team.name} size={24} />
              {favourite.team.name}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Win probability
            </div>
            <div className="mt-1 text-xl font-semibold text-primary">
              {pct(favourite.probability.winner, 1)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
