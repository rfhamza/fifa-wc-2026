import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { SourceBadge } from "@/components/ui/source-badge";
import { MoverChip } from "@/components/ui/mover-chip";
import { FlagGlyph } from "@/components/flag-glyph";
import { cn, pct } from "@/lib/utils";
import type { ForecastHeroData, HeroMover } from "@/lib/ui/forecast-hero-data";

/**
 * Home landing hero (UX-1). Presentational: renders the live-aware current forecast
 * headline (favourite + title probability), the runtime source badge, and the biggest
 * riser/faller vs the pre-tournament baseline, with graceful empty/fallback states.
 * All data arrives as already-public-safe props (see lib/ui/forecast-hero-data.ts).
 */
export function ForecastHero({ data }: { data: ForecastHeroData }) {
  const { favourite, riser, faller, source, asOfLabel } = data;
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-white via-white to-secondary/50 p-6 shadow-sm md:p-10 lg:p-12">
      <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />

      <div className="relative grid gap-8 lg:grid-cols-[1.3fr_1fr] lg:items-center">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="accent">FIFA World Cup 2026</Badge>
            <SourceBadge source={source} asOfLabel={asOfLabel} />
          </div>

          <h1 className="text-balance text-4xl font-bold tracking-tight lg:text-6xl">
            Who is favoured now?
          </h1>

          {favourite ? (
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
              <div className="flex items-center gap-3">
                <FlagGlyph
                  countryCode={favourite.countryCode}
                  flag={favourite.flag}
                  name={favourite.name}
                  size={34}
                />
                <span className="text-2xl font-semibold lg:text-3xl">{favourite.name}</span>
              </div>
              <div className="leading-none">
                <div className="text-4xl font-bold text-primary tabular-nums lg:text-5xl">
                  {pct(favourite.titleProbability, 1)}
                </div>
                <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                  to win the title
                </div>
              </div>
            </div>
          ) : (
            <p className="text-lg text-muted-foreground">
              The current forecast is temporarily unavailable. Showing the pre-tournament
              model below.
            </p>
          )}

          <p className="max-w-xl text-balance text-sm text-muted-foreground">
            The current forecast updates as results are locked and the path changes; the
            underlying team-strength model is not re-rated after every match.
          </p>

          <div className="flex flex-wrap gap-3 pt-1">
            <Link href="/matches" className={cn(buttonVariants({ size: "lg" }))}>
              See match forecasts
            </Link>
            <Link
              href="/methodology"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              How this works
            </Link>
            <Link
              href="/bracket"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              Explore the knockout bracket
            </Link>
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Biggest moves since tournament start
          </div>
          {riser || faller ? (
            <div className="space-y-3">
              {riser ? <MovementCard label="Biggest riser" mover={riser} /> : null}
              {faller ? <MovementCard label="Biggest faller" mover={faller} /> : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-border/70 bg-card p-5 text-sm text-muted-foreground">
              No notable title-probability movement versus the pre-tournament baseline yet.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function MovementCard({ label, mover }: { label: string; mover: HeroMover }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <MoverChip deltaPp={mover.deltaPp} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <FlagGlyph countryCode={mover.countryCode} flag={mover.flag} name={mover.name} size={22} />
        <span className="font-semibold">{mover.name}</span>
      </div>
      <div className="mt-1 text-sm text-muted-foreground tabular-nums">
        {pct(mover.fromProbability, 1)} <span aria-hidden>→</span>{" "}
        <span className="font-medium text-foreground">{pct(mover.toProbability, 1)}</span>{" "}
        to win the title
      </div>
    </div>
  );
}
