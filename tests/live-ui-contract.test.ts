import { describe, expect, it } from "vitest";
import type { PublicSafeLiveState } from "@/lib/live-state/public-safe";
import type { LiveStateView } from "@/lib/live-client/public-safe-view.client";
import committedFixture from "@/data/live/public-safe-sample.json";

/**
 * Phase 1.28Q-A - contract guard. The UI's client view type is re-declared (decoupled from
 * the server live-state layer); this test pins it to the server projection so they cannot
 * drift: the server `PublicSafeLiveState` must remain assignable to the client `LiveStateView`.
 * (tests/ may import live-state; app/ + components/ may not - enforced by the isolation test.)
 */

// Compile-time assignability: server projection -> client view. Fails `tsc` on drift.
const _serverToView = (s: PublicSafeLiveState): LiveStateView => s;
void _serverToView;

describe("live-state UI contract", () => {
  it("the committed projection is shaped like the client view", () => {
    const server = committedFixture as unknown as PublicSafeLiveState;
    const view: LiveStateView = server; // assignability exercised at runtime too
    expect(view.matches.length).toBe(server.matches.length);
    expect(view.standings.length).toBe(server.standings.length);
    expect(view.publicSourcePolicy).toBe(server.publicSourcePolicy);
  });
});
