"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  fetchPublicSafeLiveState,
  type LiveViewMatch,
} from "@/lib/live-client/public-safe-view.client";

/**
 * Phase 1.28Q-E - client context that fetches the sanitized public live-state ONCE
 * (no-store) and exposes a Map<matchNumber, LiveViewMatch>. It wraps the server-rendered
 * match sections; tiny `LiveResultSlot` leaves inside each server card read it by
 * matchNumber. Never throws; on any failure the map stays null and every slot renders
 * nothing, so the prediction cards are unchanged. No provider IDs/payloads/tokens cross
 * this boundary - only the already-sanitized view fields.
 */
type LiveMatchMap = Map<number, LiveViewMatch>;

const LiveMatchesContext = createContext<LiveMatchMap | null>(null);

/** Read the live match for a canonical matchNumber (undefined until loaded / if absent). */
export function useLiveMatch(matchNumber: number | undefined): LiveViewMatch | undefined {
  const map = useContext(LiveMatchesContext);
  if (!map || matchNumber === undefined) return undefined;
  return map.get(matchNumber);
}

export function LiveResultsProvider({ children }: { children: ReactNode }) {
  const [map, setMap] = useState<LiveMatchMap | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchPublicSafeLiveState().then((res) => {
      if (!alive) return;
      if (res.ok && res.state.status !== "unavailable") {
        const next: LiveMatchMap = new Map();
        for (const m of res.state.matches) next.set(m.matchNumber, m);
        setMap(next);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  return <LiveMatchesContext.Provider value={map}>{children}</LiveMatchesContext.Provider>;
}
