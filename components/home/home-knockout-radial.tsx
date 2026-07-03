"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FlagGlyph } from "@/components/flag-glyph";
import { cn } from "@/lib/utils";
import {
  fetchPublicSafeLiveState,
  type LiveStateView,
  type TeamLookup,
} from "@/lib/live-client/public-safe-view.client";
import { serializeBracketSearchParams } from "@/lib/ui/bracket-url-state";
import { buildBracketView, type BracketTeamRef } from "@/lib/ui/bracket-view";
import {
  buildBracketRadialModel,
  radialAriaSummary,
  type RadialSlot,
} from "@/lib/ui/bracket-radial";
import type { KnockoutGraph, KnockoutMatchDefinition } from "@/lib/types";

/**
 * Home "Road to the trophy" radial — a premium, flag-first tournament-state glyph. The
 * Round of 32 sits on the outer ring; winners advance inward round by round; the two
 * finalists flank a champion focal point at the centre. It reuses the SAME trusted data
 * pipeline as /bracket (the official graph skeleton + public-safe live-state overlay) via
 * the pure `buildBracketRadialModel`, and links every node into /bracket for detail — it
 * carries NO scores, forecast bars, or match cards.
 *
 * Rendering is mixed: an aria-hidden SVG layer draws the ring guides, connector lines and
 * the trophy disc; an HTML overlay places the interactive flag chips (via `FlagGlyph`) as
 * links. Identity/state never rely on colour alone — alive/eliminated/awaiting are also
 * carried by border style, opacity, the presence of an inward connector, the ranked legend
 * and an sr-only table.
 */

interface HomeKnockoutRadialProps {
  /** Official knockout graph matches (M73–M104) — the reliable skeleton. */
  skeleton: KnockoutMatchDefinition[];
  /** Public-safe team identity lookup. */
  teams: TeamLookup;
}

type LoadState = "loading" | LiveStateView | "unavailable";

export function HomeKnockoutRadial({ skeleton, teams }: HomeKnockoutRadialProps) {
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let active = true;
    fetchPublicSafeLiveState().then((r) => {
      if (!active) return;
      setState(r.ok ? r.state : "unavailable");
    });
    return () => {
      active = false;
    };
  }, []);

  const live = typeof state === "object" && state.status !== "unavailable" ? state : null;

  const model = useMemo(() => {
    const resolveTeam = (id: string): BracketTeamRef | null => teams[id] ?? null;
    const view = buildBracketView({
      skeleton,
      liveBracket: live?.bracket ?? [],
      liveMatches: live?.matches ?? [],
      provenanceByMatch: {},
      matchesObjectAvailable: false,
      resolveTeam,
    });
    const graph: KnockoutGraph = { matches: skeleton };
    return buildBracketRadialModel(view, graph);
  }, [skeleton, teams, live]);

  const ringSlots = model.slots.filter((s) => s.stage !== "champion");
  const champion = model.slots.find((s) => s.stage === "champion")!;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Road to the trophy</CardTitle>
        <CardDescription>
          Winners move inward. Faded teams are out. Open the full bracket for details.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {state === "loading" ? (
          <div className="mx-auto w-full max-w-[560px]">
            <div className="aspect-square w-full animate-pulse rounded-full border border-border/60 bg-secondary/40" />
          </div>
        ) : (
          <figure aria-label={radialAriaSummary(model)} className="mx-auto w-full max-w-[560px]">
            <div className="relative aspect-square w-full">
              {/* Decorative geometry: ring guides, connectors, centre disc. */}
              <svg
                viewBox="0 0 1000 1000"
                aria-hidden
                className="absolute inset-0 h-full w-full"
                preserveAspectRatio="xMidYMid meet"
              >
                {model.rings.map((ring) => (
                  <circle
                    key={ring.stage}
                    cx={500}
                    cy={500}
                    r={ring.radiusFrac * 500}
                    fill="none"
                    style={{ stroke: "hsl(var(--border))", opacity: 0.5 }}
                    strokeWidth={1}
                  />
                ))}
                {model.connectors.map((c) => (
                  <line
                    key={c.key}
                    x1={c.x1Frac * 1000}
                    y1={c.y1Frac * 1000}
                    x2={c.x2Frac * 1000}
                    y2={c.y2Frac * 1000}
                    strokeLinecap="round"
                    style={
                      c.kind === "advanced"
                        ? { stroke: "hsl(var(--foreground) / 0.5)" }
                        : { stroke: "hsl(var(--border))" }
                    }
                    strokeWidth={c.kind === "advanced" ? 3 : 1.5}
                  />
                ))}
                <circle
                  cx={500}
                  cy={500}
                  r={92}
                  style={{ fill: "hsl(var(--card))", stroke: "hsl(var(--border))" }}
                  strokeWidth={1.5}
                />
              </svg>

              {/* Ring labels sit in the empty top seam; hidden on the smallest screens. */}
              {model.rings.map((ring) => (
                <span
                  key={`label-${ring.stage}`}
                  className="pointer-events-none absolute hidden -translate-x-1/2 -translate-y-1/2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70 sm:block"
                  style={{ left: "50%", top: `${(0.5 - ring.radiusFrac * 0.5) * 100}%` }}
                >
                  {ring.shortLabel}
                </span>
              ))}

              {/* Interactive flag chips. */}
              {ringSlots.map((slot) => (
                <RadialChip key={slot.key} slot={slot} />
              ))}

              {/* Champion focal point. */}
              <ChampionFocal slot={champion} />
            </div>

            {/* Ranked-free legend; identity is on the flags + this list, never colour alone. */}
            <figcaption className="mt-5 space-y-3">
              <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span aria-hidden className="h-3 w-3 rounded-full border border-border bg-card shadow-sm" />
                  Solid — still in the running
                </li>
                <li className="flex items-center gap-2">
                  <span aria-hidden className="h-3 w-3 rounded-full border border-dashed border-border/70 bg-card opacity-45" />
                  Faded, dashed — eliminated
                </li>
                <li className="flex items-center gap-2">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full border border-dashed border-muted-foreground/40 bg-muted/40" />
                  Hollow — awaiting teams
                </li>
              </ul>
              <p className="text-xs text-muted-foreground">
                Third-place match is shown in the full bracket.
              </p>
            </figcaption>

            {/* Accessible table twin — every knockout match, including the third-place match. */}
            <div className="sr-only">
              <table>
                <caption>Knockout matches and their current status.</caption>
                <thead>
                  <tr>
                    <th scope="col">Round</th>
                    <th scope="col">Match</th>
                    <th scope="col">Home</th>
                    <th scope="col">Away</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {model.tableRows.map((row) => (
                    <tr key={row.matchNumber}>
                      <td>{row.stageLabel}</td>
                      <td>Match {row.matchNumber}</td>
                      <td>{row.homeName}</td>
                      <td>{row.awayName}</td>
                      <td>{row.statusLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </figure>
        )}

        <div className="flex justify-center">
          <Link
            href="/bracket"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            Open the full bracket
            <span aria-hidden>→</span>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

/** Deep link into /bracket carrying the richest existing state for this slot. */
function slotHref(slot: RadialSlot): string {
  const teamId = slot.participant.teamId;
  const qs = serializeBracketSearchParams({
    teamId,
    matchNumber: slot.matchNumber,
  }).toString();
  return qs ? `/bracket?${qs}` : "/bracket";
}

function accessibleName(slot: RadialSlot): string {
  const who = slot.participant.name || slot.participant.placeholder || "Awaiting teams";
  return `${who} — ${slot.stageLabel}, Match ${slot.matchNumber} — view in bracket`;
}

const CHIP_LINK =
  "absolute -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 motion-safe:transition-transform motion-safe:hover:scale-110";

function RadialChip({ slot }: { slot: RadialSlot }) {
  const style = { left: `${slot.xFrac * 100}%`, top: `${slot.yFrac * 100}%` } as const;

  if (slot.slotState === "tbd") {
    return (
      <Link href={slotHref(slot)} aria-label={accessibleName(slot)} className={CHIP_LINK} style={style}>
        <span
          aria-hidden
          className="block h-2.5 w-2.5 rounded-full border border-dashed border-muted-foreground/40 bg-muted/40 sm:h-3 sm:w-3"
        />
      </Link>
    );
  }

  const eliminated = slot.slotState === "eliminated";
  const live = slot.slotState === "live";
  return (
    <Link href={slotHref(slot)} aria-label={accessibleName(slot)} className={CHIP_LINK} style={style}>
      <span
        aria-hidden
        className={cn(
          "flex h-[22px] w-[22px] items-center justify-center overflow-hidden rounded-full bg-card sm:h-[26px] sm:w-[26px]",
          eliminated
            ? "border border-dashed border-border/70 opacity-45 grayscale"
            : live
              ? "border border-primary shadow-sm ring-1 ring-primary/40"
              : "border border-border shadow-sm",
        )}
      >
        <FlagGlyph
          countryCode={slot.participant.countryCode ?? ""}
          flag={slot.participant.flag ?? ""}
          name={slot.participant.name}
          size={16}
        />
      </span>
    </Link>
  );
}

function ChampionFocal({ slot }: { slot: RadialSlot }) {
  const resolved = slot.slotState === "champion";
  const label = resolved
    ? `Champion: ${slot.participant.name} — view in bracket`
    : "Final — champion not decided yet — view in bracket";
  return (
    <Link
      href="/bracket?match=104"
      aria-label={label}
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-transform motion-safe:hover:scale-105"
    >
      <span
        aria-hidden
        className={cn(
          "relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-card shadow-sm sm:h-14 sm:w-14",
          resolved ? "border-2 border-primary ring-2 ring-primary/25" : "border border-border",
        )}
      >
        {resolved ? (
          <>
            <FlagGlyph
              countryCode={slot.participant.countryCode ?? ""}
              flag={slot.participant.flag ?? ""}
              name={slot.participant.name}
              size={26}
            />
            <Trophy className="absolute -right-0 -top-0 h-3.5 w-3.5 text-primary" aria-hidden />
          </>
        ) : (
          <Trophy className="h-6 w-6 text-muted-foreground" aria-hidden />
        )}
      </span>
    </Link>
  );
}
