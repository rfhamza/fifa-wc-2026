"use client";

import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { computeScenarioStandings } from "@/lib/simulation/scenario";
import type { GroupId } from "@/lib/types";
import { Minus, Plus, RotateCcw } from "lucide-react";

export interface ScenarioFixture {
  fixtureId: string;
  matchday: number;
  homeTeamId: string;
  awayTeamId: string;
  homeName: string;
  awayName: string;
  homeFlag: string;
  awayFlag: string;
  defaultHomeGoals: number;
  defaultAwayGoals: number;
}

export interface ScenarioGroup {
  id: GroupId;
  teams: { id: string; name: string; flag: string }[];
  fixtures: ScenarioFixture[];
}

type ScoreOverride = Record<string, { home: number; away: number }>;

export function ScenarioSimulator({ groups }: { groups: ScenarioGroup[] }) {
  const [groupId, setGroupId] = useState<GroupId>(groups[0]!.id);
  const [overrides, setOverrides] = useState<ScoreOverride>({});

  const group = groups.find((g) => g.id === groupId)!;
  const teamIds = group.teams.map((t) => t.id);
  const teamName = (id: string) =>
    group.teams.find((t) => t.id === id)?.name ?? id;
  const teamFlag = (id: string) =>
    group.teams.find((t) => t.id === id)?.flag ?? "";

  // Effective score for a fixture: override if present, else model default.
  const scoreFor = (f: ScenarioFixture) =>
    overrides[f.fixtureId] ?? {
      home: f.defaultHomeGoals,
      away: f.defaultAwayGoals,
    };

  // Baseline standings use the model defaults only (no overrides).
  const baseline = useMemo(
    () =>
      computeScenarioStandings(
        groupId,
        teamIds,
        group.fixtures.map((f) => ({
          fixtureId: f.fixtureId,
          homeTeamId: f.homeTeamId,
          awayTeamId: f.awayTeamId,
          homeGoals: f.defaultHomeGoals,
          awayGoals: f.defaultAwayGoals,
          overridden: false,
        })),
      ),
    [groupId, group.fixtures, teamIds],
  );

  // Scenario standings reflect the current overrides.
  const scenario = useMemo(
    () =>
      computeScenarioStandings(
        groupId,
        teamIds,
        group.fixtures.map((f) => {
          const s = scoreFor(f);
          return {
            fixtureId: f.fixtureId,
            homeTeamId: f.homeTeamId,
            awayTeamId: f.awayTeamId,
            homeGoals: s.home,
            awayGoals: s.away,
            overridden: !!overrides[f.fixtureId],
          };
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupId, group.fixtures, overrides],
  );

  const baselineTop2 = new Set(
    baseline.filter((s) => s.rank <= 2).map((s) => s.teamId),
  );

  const setScore = (
    f: ScenarioFixture,
    side: "home" | "away",
    delta: number,
  ) => {
    setOverrides((prev) => {
      const current = prev[f.fixtureId] ?? {
        home: f.defaultHomeGoals,
        away: f.defaultAwayGoals,
      };
      const nextVal = Math.max(0, Math.min(9, current[side] + delta));
      return {
        ...prev,
        [f.fixtureId]: { ...current, [side]: nextVal },
      };
    });
  };

  const reset = () => setOverrides({});

  return (
    <div className="space-y-6">
      {/* Group selector */}
      <div className="flex flex-wrap items-center gap-2">
        {groups.map((g) => (
          <Button
            key={g.id}
            size="sm"
            variant={g.id === groupId ? "default" : "outline"}
            onClick={() => setGroupId(g.id)}
          >
            {g.id}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={reset} className="ml-auto">
          <RotateCcw className="h-3.5 w-3.5" /> Reset to model
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Editable fixtures */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Group {groupId} fixtures — override any result
          </h3>
          {group.fixtures.map((f) => {
            const s = scoreFor(f);
            const edited = !!overrides[f.fixtureId];
            return (
              <div
                key={f.fixtureId}
                className={cn(
                  "rounded-lg border p-3",
                  edited ? "border-primary/50 bg-primary/5" : "border-border/60",
                )}
              >
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex flex-1 items-center gap-1.5">
                    {f.homeFlag} {f.homeName}
                  </span>
                  <Stepper
                    value={s.home}
                    onChange={(d) => setScore(f, "home", d)}
                  />
                  <span className="text-muted-foreground">–</span>
                  <Stepper
                    value={s.away}
                    onChange={(d) => setScore(f, "away", d)}
                  />
                  <span className="flex flex-1 items-center justify-end gap-1.5 text-right">
                    {f.awayName} {f.awayFlag}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Live standings */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Projected standings
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-6">#</TableHead>
                <TableHead>Team</TableHead>
                <TableHead className="text-right">Pld</TableHead>
                <TableHead className="text-right">GD</TableHead>
                <TableHead className="text-right">Pts</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scenario.map((s) => {
                const qualifies = s.rank <= 2;
                const wasTop2 = baselineTop2.has(s.teamId);
                const changed = qualifies !== wasTop2;
                return (
                  <TableRow key={s.teamId}>
                    <TableCell
                      className={cn(
                        "tabular-nums",
                        qualifies ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {s.rank}
                    </TableCell>
                    <TableCell className="font-medium">
                      {teamFlag(s.teamId)} {teamName(s.teamId)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.played}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.goalDifference > 0 ? "+" : ""}
                      {s.goalDifference}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {s.points}
                    </TableCell>
                    <TableCell className="text-right">
                      {qualifies ? (
                        <Badge variant={changed ? "accent" : "default"}>
                          {changed ? "▲ Qualifies" : "Qualifies"}
                        </Badge>
                      ) : s.rank === 3 ? (
                        <Badge variant="muted">3rd — maybe</Badge>
                      ) : changed ? (
                        <Badge variant="outline">▼ Out</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Out
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground">
            Top two qualify directly. Third place may still advance as one of the
            eight best third-placed teams (computed across all groups in the full
            simulation). Highlighted rows changed vs. the model&apos;s baseline.
          </p>
        </div>
      </div>
    </div>
  );
}

function Stepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (delta: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        size="icon"
        variant="outline"
        className="h-6 w-6"
        onClick={() => onChange(-1)}
        aria-label="decrease"
      >
        <Minus className="h-3 w-3" />
      </Button>
      <span className="w-5 text-center text-base font-semibold tabular-nums">
        {value}
      </span>
      <Button
        size="icon"
        variant="outline"
        className="h-6 w-6"
        onClick={() => onChange(1)}
        aria-label="increase"
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}
