import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MODEL_WEIGHTS } from "@/lib/model/config";
import {
  weightedSignals,
  claimStatusLabel,
  type ClaimStatus,
  type ModelSignalTruth,
} from "@/lib/model/model-truth";

/** Descriptive unit per signal key (not a weight literal). */
const UNIT: Record<string, string> = {
  eloRating: "×",
  fifaRanking: "pts/place",
  squadQuality: "pts/pt",
  recentForm: "pts/pt",
  managerCohesion: "pts",
  hostAdvantage: "pts",
  regionalAdvantage: "pts",
  climateFamiliarity: "pts/pt",
  structural: "pts (weak)",
  tournamentContext: "pts (capped)",
};

function statusVariant(status: ClaimStatus): "default" | "accent" | "outline" | "muted" {
  if (status === "active-validated") return "default";
  if (status === "experimental") return "outline";
  return "muted"; // placeholder / others
}

/** Primary weight value for display (per-place for FIFA), read from MODEL_WEIGHTS. */
function primaryWeight(s: ModelSignalTruth): number {
  const key = Array.isArray(s.weightRef) ? s.weightRef[0] : s.weightRef;
  return key ? MODEL_WEIGHTS[key] : 0;
}

/** Card summarising the model's inputs, their tunable weights, and how strongly each is claimed. */
export function ModelSummary() {
  const signals = weightedSignals();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Model summary</CardTitle>
        <CardDescription>
          A transparent, Elo-anchored baseline. Elo, FIFA, host and regional are active and
          backtested; the rest are capped or experimental priors (not yet backtested). Manager
          cohesion is tracked but currently has zero weight pending validation. Every weight
          lives in <code className="text-xs">lib/model/config.ts</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {signals.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate text-muted-foreground">{s.label}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              <Badge variant={statusVariant(s.claimStatus)} className="text-[10px]">
                {claimStatusLabel(s.claimStatus)}
              </Badge>
              <Badge variant="muted" className="tabular-nums">
                {primaryWeight(s)} {UNIT[s.key] ?? "pts"}
              </Badge>
            </span>
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
