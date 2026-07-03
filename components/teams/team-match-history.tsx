"use client";

import Link from "next/link";
import { FlagGlyph } from "@/components/flag-glyph";
import { Badge } from "@/components/ui/badge";
import { pct } from "@/lib/utils";
import type { TeamMatchHistoryRow } from "@/lib/ui/team-trajectory";

/**
 * Team match forecast history (UX-6). Presentational list of team-oriented rows:
 * opponent, stage, provenance label, and the forecast oriented to this team.
 * Knockout rows deep-link into the bracket; rows without a captured forecast stay
 * honest. All data arrives public-safe via props.
 */
export function TeamMatchHistory({
  rows,
  matchesObjectAvailable,
}: {
  rows: TeamMatchHistoryRow[];
  matchesObjectAvailable: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No captured match forecasts for this team yet.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {!matchesObjectAvailable ? (
        <p className="text-xs text-muted-foreground">
          Match forecasts are unavailable right now; showing the known fixtures.
        </p>
      ) : null}
      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.matchNumber}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 text-sm"
          >
            <span className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Match {row.matchNumber} · {row.stageLabel}
              </span>
              {row.opponent ? (
                <span className="flex items-center gap-1.5">
                  <FlagGlyph
                    countryCode={row.opponent.countryCode}
                    flag={row.opponent.flag}
                    name={row.opponent.name}
                    size={16}
                  />
                  <span className="font-medium">vs {row.opponent.name}</span>
                </span>
              ) : (
                <span className="text-muted-foreground">Opponent not decided yet</span>
              )}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              {row.hasForecast && row.teamWin != null ? (
                <span className="tabular-nums text-muted-foreground">
                  Win {pct(row.teamWin, 0)}
                  {row.draw != null ? <> · Draw {pct(row.draw, 0)}</> : null}
                  {row.teamAdvance != null ? <> · Advance {pct(row.teamAdvance, 0)}</> : null}
                </span>
              ) : null}
              <Badge variant={row.hasForecast ? "outline" : "muted"}>{row.provenanceLabel}</Badge>
              {row.isKnockout ? (
                <Link
                  href={`/bracket?match=${row.matchNumber}`}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  View in bracket
                </Link>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
