"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterPills } from "@/components/ui/filter-pills";
import { FlagGlyph } from "@/components/flag-glyph";
import { cn } from "@/lib/utils";
import { formatPpDelta } from "@/lib/ui/forecast-hero-data";
import {
  RACE_DEFAULT_TOP_N,
  RACE_STAGE_OPTIONS,
  RACE_TOP_N_OPTIONS,
  raceAriaSummary,
  selectRaceView,
  type HomeForecastRaceModel,
  type RaceStage,
  type RaceTopN,
} from "@/lib/ui/home-trajectory-comparison";

/**
 * Home "forecast race" (multi-team comparison). Compares the top teams across the public
 * forecast checkpoints — Tournament start → Group stage complete → Current projection —
 * for a selected stage probability. The app's first multi-series chart.
 *
 * Identity is NOT carried by colour alone: every team appears in the ranked legend list
 * (swatch + name + value + movement) and the sr-only table, so the validated categorical
 * palette (which triggers the relief rule on a few light slots) is safe. Colour is bound
 * to the team entity via `colorIndex`, so changing the metric or Top-N never repaints a
 * surviving team's line. Linear segments only — no smoothing, no fake dense timeline.
 */

// Validated categorical palette (dataviz reference instance; light + dark stepped).
const RACE_COLOR_VARS = `
.forecast-race { --race-0:#2a78d6; --race-1:#1baf7a; --race-2:#eda100; --race-3:#008300; --race-4:#4a3aa7; --race-5:#e34948; --race-6:#e87ba4; --race-7:#eb6834; }
@media (prefers-color-scheme: dark) { .forecast-race { --race-0:#3987e5; --race-1:#199e70; --race-2:#c98500; --race-3:#008300; --race-4:#9085e9; --race-5:#e66767; --race-6:#d55181; --race-7:#d95926; } }
`;
const colorVar = (colorIndex: number): string => `var(--race-${colorIndex % 8})`;

export function HomeForecastRaceChart({ model }: { model: HomeForecastRaceModel }) {
  const [metric, setMetric] = useState<RaceStage>("winner");
  const [topN, setTopN] = useState<RaceTopN>(RACE_DEFAULT_TOP_N);

  const view = useMemo(() => selectRaceView(model, metric, topN), [model, metric, topN]);

  const canDraw = view.series.length > 0 && view.checkpointLabels.length >= 2;
  const chartData = useMemo(() => {
    return view.checkpointLabels.map((label, i) => {
      const row: Record<string, string | number> = { label };
      for (const s of view.series) {
        const v = s.points[i]?.valuePct;
        if (typeof v === "number") row[s.teamId] = v;
      }
      return row;
    });
  }, [view]);

  const yMax = useMemo(() => {
    const max = Math.max(0, ...view.series.flatMap((s) => s.points.map((p) => p.valuePct)));
    return Math.min(100, Math.max(5, Math.ceil((max * 1.15) / 5) * 5));
  }, [view]);

  const metricLabel = RACE_STAGE_OPTIONS.find((o) => o.value === metric)?.label ?? "Title chance";

  return (
    <Card className="forecast-race">
      <style>{RACE_COLOR_VARS}</style>
      <CardHeader>
        <CardTitle>Forecast race</CardTitle>
        <CardDescription>
          Compare top teams across the tournament-start baseline, the group-stage-complete
          checkpoint and the current projection. This chart compares retained forecast
          checkpoints, not every match.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <FilterPills
            options={RACE_STAGE_OPTIONS}
            value={metric}
            onChange={setMetric}
            ariaLabel="Choose which stage probability to compare"
          />
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium text-muted-foreground">Compare top teams</span>
            <select
              value={topN}
              onChange={(e) => setTopN(Number(e.target.value) as RaceTopN)}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {RACE_TOP_N_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {`Top ${n}`}
                </option>
              ))}
            </select>
          </label>
        </div>

        {canDraw ? (
          <>
            <figure aria-label={raceAriaSummary(view)} className="min-h-[300px]">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData} margin={{ top: 12, right: 44, bottom: 4, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="label"
                    interval={0}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    padding={{ left: 16, right: 16 }}
                  />
                  <YAxis
                    domain={[0, yMax]}
                    tickCount={4}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <Tooltip content={<RaceTooltip metricLabel={metricLabel} />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
                  {view.series.map((s) => (
                    <Line
                      key={s.teamId}
                      type="linear"
                      dataKey={s.teamId}
                      name={s.name}
                      stroke={colorVar(s.colorIndex)}
                      strokeWidth={2}
                      dot={{ r: 3, fill: colorVar(s.colorIndex), strokeWidth: 0 }}
                      activeDot={{ r: 5, stroke: "hsl(var(--card))", strokeWidth: 2 }}
                      isAnimationActive={false}
                      connectNulls
                    >
                      {/* Direct end-of-line identity label (composite encoding): every line
                          carries its team code at its endpoint, so lines that share a
                          recurring palette hue (Top 10/15) are still identifiable on the plot. */}
                      <LabelList
                        dataKey={s.teamId}
                        content={(p) => (
                          <EndCodeLabel {...p} code={s.countryCode} lastIndex={view.checkpointLabels.length - 1} />
                        )}
                      />
                    </Line>
                  ))}
                </LineChart>
              </ResponsiveContainer>

              {/* sr-only table twin — identity + values without relying on colour. */}
              <div className="sr-only">
                <table>
                  <caption>{metricLabel} by checkpoint for the top {view.series.length} teams</caption>
                  <thead>
                    <tr>
                      <th scope="col">Team</th>
                      {view.checkpointLabels.map((l) => (
                        <th key={l} scope="col">{l}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {view.series.map((s) => (
                      <tr key={s.teamId}>
                        <th scope="row">{s.name}</th>
                        {s.points.map((p) => (
                          <td key={p.label}>{p.valuePct}%</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </figure>

            {/* Ranked legend/list — carries identity (name), current value and movement,
                so the chart never relies on colour alone. */}
            <ol className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {view.legend.map((row) => (
                <li
                  key={row.teamId}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="tabular-nums text-xs text-muted-foreground">{row.position}</span>
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: colorVar(row.colorIndex) }}
                    />
                    <FlagGlyph countryCode={row.countryCode} flag={row.flag} name={row.name} size={16} />
                    <span className="truncate font-medium">{row.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 tabular-nums">
                    <span className="font-semibold">{row.currentValuePct}%</span>
                    {row.deltaPpSinceStart != null ? (
                      <span
                        className={cn(
                          "text-xs",
                          row.deltaPpSinceStart > 0.05
                            ? "text-win"
                            : row.deltaPpSinceStart < -0.05
                              ? "text-loss"
                              : "text-muted-foreground",
                        )}
                      >
                        {formatPpDelta(row.deltaPpSinceStart)}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted-foreground">
              Movement is shown in percentage points since tournament start. It is not an
              after-every-match timeline.
            </p>
          </>
        ) : (
          <p className="rounded-2xl border border-border/70 bg-secondary/30 p-5 text-sm text-muted-foreground">
            Not enough history yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Team code at the last point of a line — the on-plot identity that disambiguates
 * lines sharing a recurring palette hue. A card-coloured halo keeps it legible over lines. */
function EndCodeLabel(props: {
  x?: number | string;
  y?: number | string;
  index?: number;
  code: string;
  lastIndex: number;
}) {
  const { x, y, index, code, lastIndex } = props;
  if (index !== lastIndex || x == null || y == null) return null;
  return (
    <text
      x={Number(x) + 6}
      y={Number(y)}
      dy={3}
      className="fill-foreground"
      style={{ fontSize: 9, fontWeight: 600, paintOrder: "stroke", stroke: "hsl(var(--card))", strokeWidth: 3 }}
    >
      {code}
    </text>
  );
}

function RaceTooltip(props: {
  active?: boolean;
  label?: string;
  metricLabel: string;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
}) {
  if (!props.active || !props.payload || props.payload.length === 0) return null;
  const rows = [...props.payload]
    .filter((p) => typeof p.value === "number")
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return (
    <div className="max-w-[220px] rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-sm">
      <div className="font-medium text-foreground">
        {props.label}
        <span className="text-muted-foreground"> · {props.metricLabel}</span>
      </div>
      <ul className="mt-1 space-y-0.5">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center justify-between gap-3 tabular-nums">
            <span className="flex items-center gap-1.5 text-foreground">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
              {r.name}
            </span>
            <span>{r.value}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
