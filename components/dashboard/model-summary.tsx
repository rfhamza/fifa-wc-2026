import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MODEL_WEIGHTS } from "@/lib/model/config";

const SIGNALS: { label: string; weight: number; unit: string }[] = [
  { label: "Elo rating", weight: MODEL_WEIGHTS.elo, unit: "×" },
  { label: "FIFA ranking", weight: MODEL_WEIGHTS.fifaRankingPerPlace, unit: "pts/place" },
  { label: "Squad quality", weight: MODEL_WEIGHTS.squadQuality, unit: "pts/pt" },
  { label: "Recent form", weight: MODEL_WEIGHTS.recentForm, unit: "pts/pt" },
  { label: "Manager cohesion", weight: MODEL_WEIGHTS.manager, unit: "pts" },
  { label: "Host advantage", weight: MODEL_WEIGHTS.host, unit: "pts" },
  { label: "Regional edge", weight: MODEL_WEIGHTS.regional, unit: "pts" },
  { label: "Climate familiarity", weight: MODEL_WEIGHTS.climate, unit: "pts/pt" },
];

/** Card summarising the model's inputs and tunable weights. */
export function ModelSummary() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Model summary</CardTitle>
        <CardDescription>
          A transparent, Elo-anchored baseline. Every signal below is a tunable
          weight in <code className="text-xs">lib/model/config.ts</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {SIGNALS.map((s) => (
          <div
            key={s.label}
            className="flex items-center justify-between text-sm"
          >
            <span className="text-muted-foreground">{s.label}</span>
            <Badge variant="muted" className="tabular-nums">
              {s.weight} {s.unit}
            </Badge>
          </div>
        ))}
        <Link
          href="/methodology"
          className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
        >
          Read the full methodology →
        </Link>
      </CardContent>
    </Card>
  );
}
