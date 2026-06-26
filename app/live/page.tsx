import type { Metadata } from "next";
import { teams } from "@/lib/data";
import { LIVE_STATE_UI_ENABLED } from "@/lib/live-client/config";
import { LiveTournamentState } from "@/components/live/live-tournament-state";
import type { TeamLookup } from "@/lib/live-client/public-safe-view.client";

export const metadata: Metadata = {
  title: "Tournament State - World Cup Probability Lab",
  description:
    "Live FIFA World Cup 2026 tournament state - latest matches, internally derived group standings, Round-of-32 status, and the third-place race. Provider-backed and may be delayed.",
};

/**
 * Phase 1.28Q-A - the "Tournament State" surface. Static server shell that builds a minimal
 * team lookup (id -> name/flag) from official data and hands it to the client container,
 * which fetches the sanitized /api/live-state at runtime (no-store). No probability/model
 * change; existing pages untouched.
 */
export default function LivePage() {
  if (!LIVE_STATE_UI_ENABLED) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Tournament State</h1>
        <p className="text-sm text-muted-foreground">This view is not currently enabled.</p>
      </div>
    );
  }

  const teamLookup: TeamLookup = Object.fromEntries(
    teams.map((t) => [t.id, { id: t.id, name: t.name, flag: t.flag, countryCode: t.countryCode }]),
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Tournament State</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Live tournament state from a provider-backed feed. Standings and the bracket are
          derived internally using FIFA rules (Article 13). Data may be delayed; this does not
          change the model&apos;s probabilities.
        </p>
      </header>
      <LiveTournamentState teamLookup={teamLookup} />
    </div>
  );
}
