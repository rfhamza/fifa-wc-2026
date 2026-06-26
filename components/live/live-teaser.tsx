"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { LiveDataBadge } from "./live-data-badge";
import {
  fetchPublicSafeLiveState,
  type LiveStateView,
} from "@/lib/live-client/public-safe-view.client";

/**
 * Compact, non-intrusive homepage teaser: shows source/freshness at a glance and links to
 * /live. Renders nothing until live data is available, so it never disturbs the homepage or
 * the forecast layout if the API is down.
 */
export function LiveTeaser() {
  const [data, setData] = useState<{ view: LiveStateView; nowMs: number } | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchPublicSafeLiveState().then((result) => {
      if (!alive) return;
      if (result.ok && result.state.status !== "unavailable") {
        setData({ view: result.state, nowMs: Date.now() });
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!data) return null;

  return (
    <Link
      href="/live"
      className="group inline-flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/20 px-3 py-1.5 transition-colors hover:bg-secondary/40"
    >
      <LiveDataBadge view={data.view} nowMs={data.nowMs} compact />
      <span className="inline-flex items-center text-xs font-medium text-muted-foreground group-hover:text-foreground">
        Tournament State
        <ChevronRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}
