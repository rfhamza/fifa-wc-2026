"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrajectoryChartPoint } from "@/lib/ui/team-trajectory";
import { trajectoryAriaSummary, type TrajectoryStage } from "@/lib/ui/team-trajectory";
import { formatPpDelta } from "@/lib/ui/forecast-hero-data";

/**
 * Team forecast trajectory chart (UX-6) — the app's first line/area chart.
 * Renders the PUBLIC checkpoint series (Tournament start → Group stage complete →
 * Current projection) for one stage. Honest with sparse data: linear segments only
 * (no smoothing), prominent point markers, y-axis anchored at 0, and no rendering
 * below two points (the surface gates that). Single series → no legend; the card
 * title names it. All colors come from CSS-variable tokens so light/dark both work.
 */
export function TeamTrajectoryChart({
  series,
  stage,
  teamName,
}: {
  series: TrajectoryChartPoint[];
  stage: TrajectoryStage;
  teamName: string;
}) {
  if (series.length < 2) return null; // the surface shows the empty state instead

  const baselinePct = series.find((p) => p.isBaseline)?.valuePct ?? null;
  const maxPct = Math.max(...series.map((p) => p.valuePct));
  const yMax = Math.min(100, Math.max(5, Math.ceil(maxPct * 1.25)));

  return (
    <figure aria-label={trajectoryAriaSummary(teamName, stage, series)} className="min-h-[280px]">
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={series} margin={{ top: 24, right: 28, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="trajectoryFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary) / 0.16)" />
              <stop offset="100%" stopColor="hsl(var(--primary) / 0)" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
          <XAxis
            dataKey="shortLabel"
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
          {baselinePct != null ? (
            <ReferenceLine
              y={baselinePct}
              stroke="hsl(var(--muted-foreground))"
              strokeOpacity={0.5}
              strokeDasharray="4 4"
            />
          ) : null}
          <Tooltip
            content={<TrajectoryTooltip />}
            cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
          />
          <Area
            type="linear"
            dataKey="valuePct"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            fill="url(#trajectoryFill)"
            isAnimationActive={false}
            dot={<TrajectoryDot />}
            activeDot={{ r: 6, fill: "hsl(var(--primary))", stroke: "hsl(var(--card))", strokeWidth: 2 }}
          >
            <LabelList dataKey="valuePct" content={<LatestValueLabel series={series} />} />
          </Area>
        </AreaChart>
      </ResponsiveContainer>

      {/* Table-view twin for screen readers (tooltips enhance, never gate). The wrapper
          div carries sr-only: a table keeps its intrinsic width and would overflow. */}
      <div className="sr-only">
        <table>
          <caption>Forecast trajectory data</caption>
        <thead>
          <tr>
            <th scope="col">Checkpoint</th>
            <th scope="col">Probability</th>
            <th scope="col">Since tournament start</th>
          </tr>
        </thead>
          <tbody>
            {series.map((p) => (
              <tr key={p.label}>
                <th scope="row">{p.label}</th>
                <td>{p.valuePct}%</td>
                <td>{p.deltaPpSinceBaseline == null ? "—" : formatPpDelta(p.deltaPpSinceBaseline)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/** Point markers: Tournament start is hollow (shape, not colour, distinguishes it);
 * the latest point is larger. Every marker keeps a card-coloured ring for separation. */
function TrajectoryDot(props: { cx?: number; cy?: number; payload?: TrajectoryChartPoint }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return null;
  if (payload.isBaseline) {
    return (
      <circle cx={cx} cy={cy} r={4.5} fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth={2} />
    );
  }
  const r = payload.isLatest ? 5.5 : 4.5;
  return <circle cx={cx} cy={cy} r={r} fill="hsl(var(--primary))" stroke="hsl(var(--card))" strokeWidth={2} />;
}

/** Selective direct label: the value appears only at the latest point (text tokens). */
function LatestValueLabel(props: {
  x?: number | string;
  y?: number | string;
  value?: number | string;
  index?: number;
  series: TrajectoryChartPoint[];
}) {
  const { x, y, value, index, series } = props;
  if (index == null || index !== series.length - 1 || x == null || y == null) return null;
  return (
    <text
      x={Number(x)}
      y={Number(y) - 12}
      textAnchor="end"
      className="fill-foreground text-xs font-semibold"
    >
      {value}%
    </text>
  );
}

/** Tooltip: checkpoint label, date, value, and pp change since tournament start. */
function TrajectoryTooltip(props: {
  active?: boolean;
  payload?: Array<{ payload: TrajectoryChartPoint }>;
}) {
  const point = props.active ? props.payload?.[0]?.payload : undefined;
  if (!point) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-sm">
      <div className="font-medium text-foreground">
        {point.label}
        {point.asOfLabel ? <span className="text-muted-foreground"> · {point.asOfLabel}</span> : null}
      </div>
      <div className="mt-1 tabular-nums text-foreground">{point.valuePct}%</div>
      {point.deltaPpSinceBaseline != null && !point.isBaseline ? (
        <div className="text-muted-foreground">
          Since tournament start {formatPpDelta(point.deltaPpSinceBaseline)}
        </div>
      ) : null}
    </div>
  );
}
