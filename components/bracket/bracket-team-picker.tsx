"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { FlagGlyph } from "@/components/flag-glyph";
import { cn } from "@/lib/utils";
import type { TeamLookup } from "@/lib/live-client/public-safe-view.client";

/** Compact "Trace a team" search/select: filters the team list; selection is user-driven. */
export function BracketTeamPicker({
  teams,
  selectedTeamId,
  onSelectTeam,
  onClear,
}: {
  teams: TeamLookup;
  selectedTeamId: string | null;
  onSelectTeam: (teamId: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return Object.values(teams)
      .filter((t) => t.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [teams, query]);

  return (
    <div className="space-y-2">
      <label htmlFor="bracket-team-search" className="text-sm font-medium">
        Trace a team
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id="bracket-team-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a team…"
          aria-label="Trace a team"
          className="w-full rounded-full border border-border bg-card px-4 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-xs"
        />
        {selectedTeamId ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden /> Clear team path
          </button>
        ) : null}
      </div>
      {results.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Team results">
          {results.map((t) => {
            const active = selectedTeamId === t.id;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    onSelectTeam(t.id);
                    setQuery("");
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:bg-secondary/60",
                  )}
                >
                  <FlagGlyph countryCode={t.countryCode} flag={t.flag} name={t.name} size={16} />
                  {t.name}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
