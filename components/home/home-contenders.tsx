import Link from "next/link";
import { FlagGlyph } from "@/components/flag-glyph";
import { MoverChip } from "@/components/ui/mover-chip";
import { buttonVariants } from "@/components/ui/button";
import { cn, pct } from "@/lib/utils";
import type { HomeContenderRow } from "@/lib/ui/home-sections";

/**
 * Compact "Current top contenders" section (UX-1 revision). Shows only the top few
 * teams by current runtime title probability, with movement since baseline — not the
 * full field (that lives on the dedicated Teams page).
 */
export function HomeContenders({ rows }: { rows: HomeContenderRow[] }) {
  return (
    <section className="rounded-3xl border border-border/70 bg-card p-6 shadow-sm md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Current top contenders</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ranked by the live-aware title probability, with movement since the
            pre-tournament baseline.
          </p>
        </div>
        <Link
          href="/teams"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          View all teams
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">
          Contenders will appear once the current forecast is available.
        </p>
      ) : (
        <ol className="mt-5 space-y-2">
          {rows.map((row) => (
            <li
              key={row.teamId}
              className="flex items-center gap-3 rounded-2xl border border-border/60 bg-secondary/30 px-4 py-3"
            >
              <span className="w-5 text-sm font-semibold tabular-nums text-muted-foreground">
                {row.rank}
              </span>
              <FlagGlyph
                countryCode={row.countryCode}
                flag={row.flag}
                name={row.name}
                size={22}
              />
              <span className="min-w-0 flex-1 truncate font-medium">{row.name}</span>
              {row.winnerDeltaPp !== null ? (
                <MoverChip deltaPp={row.winnerDeltaPp} className="hidden sm:inline-flex" />
              ) : null}
              <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">
                final {pct(row.final, 0)}
              </span>
              <span className="w-14 text-right text-lg font-bold text-primary tabular-nums">
                {pct(row.titleProbability, 1)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
