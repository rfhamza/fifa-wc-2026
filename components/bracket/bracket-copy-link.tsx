"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { serializeBracketSearchParams } from "@/lib/ui/bracket-url-state";

/**
 * Copy-link affordance for the bracket view (UX-4D). Builds a CANONICAL share URL from the
 * currently-selected match/team ONLY — never the raw address bar — so a shared link carries
 * exactly the selection (`/bracket`, `/bracket?match=N`, `/bracket?team=id`,
 * `/bracket?team=id&match=N`) and no unknown/noisy params. Client-only; no third-party SDK, no
 * page instrumentation, no tracking. Degrades gracefully when the Clipboard API is unavailable.
 */
type CopyState = "idle" | "copied" | "unavailable" | "failed";

export function BracketCopyLink({
  matchNumber,
  teamId,
}: {
  matchNumber: number | null;
  teamId: string | null;
}) {
  const [state, setState] = useState<CopyState>("idle");

  const buildShareUrl = (): string => {
    const qs = serializeBracketSearchParams({ matchNumber, teamId }).toString();
    const path = qs ? `/bracket?${qs}` : "/bracket";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}${path}`;
  };

  const onCopy = async () => {
    const url = buildShareUrl();
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setState("unavailable"); // "Copy from address bar"
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
      window.setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("failed");
    }
  };

  const feedback =
    state === "copied"
      ? "Link copied"
      : state === "unavailable"
        ? "Copy from address bar"
        : state === "failed"
          ? "Copy failed"
          : "";

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onCopy}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-sm font-medium",
          "hover:bg-secondary/60 hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <Link2 className="h-4 w-4" aria-hidden />
        Copy bracket view link
      </button>
      <span role="status" aria-live="polite" className="min-h-[1rem] text-xs text-muted-foreground">
        {feedback}
      </span>
    </span>
  );
}
