"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TournamentStageProbability } from "@/lib/types";

const STAGES: {
  key: keyof Omit<TournamentStageProbability, "teamId">;
  label: string;
}[] = [
  { key: "roundOf32", label: "R32" },
  { key: "roundOf16", label: "R16" },
  { key: "quarterFinal", label: "QF" },
  { key: "semiFinal", label: "SF" },
  { key: "final", label: "Final" },
  { key: "winner", label: "Win" },
];

/** Funnel of a single team's probability of reaching each knockout stage. */
export function StageFunnelChart({
  probability,
}: {
  probability: TournamentStageProbability;
}) {
  const data = STAGES.map((s) => ({
    stage: s.label,
    value: +(probability[s.key] * 100).toFixed(1),
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" vertical={false} />
        <XAxis
          dataKey="stage"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "hsl(215 16% 42%)", fontSize: 12 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fill: "hsl(215 16% 52%)", fontSize: 11 }}
          unit="%"
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
          formatter={(value: number) => [`${value}%`, "Probability"]}
        />
        <Bar dataKey="value" fill="hsl(199 89% 42%)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
