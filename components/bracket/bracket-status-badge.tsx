import { Badge } from "@/components/ui/badge";
import type { BracketNodeState } from "@/lib/ui/bracket-view";

/** Node status chip: Scheduled / Live / Completed / Awaiting teams / Awaiting opponent. */
export function BracketStatusBadge({ state }: { state: BracketNodeState }) {
  switch (state) {
    case "live":
      return <Badge variant="default">Live</Badge>;
    case "completed":
      return <Badge variant="muted">Completed</Badge>;
    case "scheduled":
      return <Badge variant="outline">Scheduled</Badge>;
    case "partial":
      return <Badge variant="outline">Awaiting opponent</Badge>;
    default:
      return <Badge variant="muted">Awaiting teams</Badge>;
  }
}
