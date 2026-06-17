import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ProbabilityMeter } from "@/components/charts/probability-meter";
import { GROUP_IDS, getTeamsInGroup } from "@/lib/data";
import { getStageProbability } from "@/lib/model/forecast";

export const metadata = {
  title: "Teams · World Cup Probability Lab",
};

export default function TeamsPage() {
  return (
    <div className="space-y-8 animate-fade-in">
      <header className="space-y-2">
        <Badge variant="accent">Teams</Badge>
        <h1 className="text-3xl font-bold tracking-tight">All 48 teams</h1>
        <p className="max-w-2xl text-muted-foreground">
          Browse every qualified nation by group. Open a team for its full
          feature profile, stage probabilities and model explanations.
        </p>
      </header>

      {GROUP_IDS.map((groupId) => (
        <section key={groupId} className="space-y-3">
          <h2 className="text-lg font-semibold">Group {groupId}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {getTeamsInGroup(groupId).map((team) => {
              const prob = getStageProbability(team.id);
              return (
                <Link key={team.id} href={`/teams/${team.id}`}>
                  <Card className="h-full transition-colors hover:border-primary/40">
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{team.flag}</span>
                          <div>
                            <div className="font-semibold leading-tight">
                              {team.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              #{team.fifaRanking} · {team.confederation}
                            </div>
                          </div>
                        </div>
                      </div>
                      <ProbabilityMeter
                        label="Reach last 16"
                        value={prob?.roundOf16 ?? 0}
                        color="bg-accent"
                      />
                      <ProbabilityMeter
                        label="Win title"
                        value={prob?.winner ?? 0}
                        color="bg-primary"
                      />
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
