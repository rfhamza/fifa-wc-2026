"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface WinnerBarDatum {
  name: string;
  flag: string;
  winner: number; // 0..1
}

/** Horizontal bar chart of title-winning probability for the top contenders. */
export function WinnerBarChart({ data }: { data: WinnerBarDatum[] }) {
  const chartData = data.map((d) => ({
    ...d,
    // Recharts axis ticks are plain strings, so the inline-SVG FlagGlyph can't be used
    // here. England/Scotland have a text-code flag ("ENG"/"SCO"); show just the name for
    // those (avoids a redundant "ENG England") and keep the emoji prefix for the rest.
    label: /^[A-Za-z]{2,4}$/.test(d.flag) ? d.name : `${d.flag} ${d.name}`,
    value: +(d.winner * 100).toFixed(1),
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 34)}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 4, right: 36, bottom: 4, left: 8 }}
      >
        <XAxis type="number" hide domain={[0, "dataMax"]} />
        <YAxis
          type="category"
          dataKey="label"
          width={140}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "hsl(215 16% 42%)", fontSize: 12 }}
        />
        <Tooltip
          cursor={{ fill: "hsl(214 32% 91% / 0.6)" }}
          contentStyle={{
            background: "hsl(0 0% 100%)",
            border: "1px solid hsl(214 32% 91%)",
            borderRadius: 12,
            fontSize: 12,
            color: "hsl(222 47% 11%)",
            boxShadow: "0 4px 16px hsl(222 47% 11% / 0.08)",
          }}
          formatter={(value: number) => [`${value}%`, "Win title"]}
        />
        <Bar dataKey="value" radius={[4, 4, 4, 4]} barSize={16} label={{ position: "right", fill: "hsl(222 47% 20%)", fontSize: 11, formatter: (v: number) => `${v}%` }}>
          {chartData.map((_, i) => (
            <Cell key={i} fill="hsl(152 64% 38%)" fillOpacity={1 - i * 0.05} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
