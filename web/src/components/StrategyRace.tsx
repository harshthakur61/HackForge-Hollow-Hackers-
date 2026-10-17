/**
 * StrategyRace.tsx: Cumulative Net P&L line chart over all settled nights comparing:
 * - S0: All-cash
 * - S1: Fixed 10%
 * - S2: Fixed 20%
 * - S3: Static baseline
 * - S4: zero-overdraft policy (default)
 * - S5: cost-optimal (uses overdraft)
 * - S6: oracle (upper bound, not deployable)
 * Features interactive toggleable lines and emphasized policy engine curves.
 */

import React, { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { Trophy } from "lucide-react";
import { useReplayStore } from "../store/useReplayStore";
import { formatMillions, formatCurrency } from "../utils/formatters";

interface StrategyConfig {
  key: string;
  label: string;
  color: string;
  strokeWidth: number;
  strokeDasharray?: string;
  defaultVisible: boolean;
}

const STRATEGIES: StrategyConfig[] = [
  {
    key: "S4_policy_zero_overdraft",
    label: "S4: zero-overdraft policy (default)",
    color: "#2563eb",
    strokeWidth: 3,
    defaultVisible: true,
  },
  {
    key: "S5_policy_cost_optimal",
    label: "S5: cost-optimal (uses overdraft)",
    color: "#10b981",
    strokeWidth: 3,
    defaultVisible: true,
  },
  {
    key: "S6_oracle",
    label: "S6: oracle (upper bound, not deployable)",
    color: "#8b5cf6",
    strokeWidth: 2,
    strokeDasharray: "4 4",
    defaultVisible: true,
  },
  {
    key: "S3_static",
    label: "S3: Static baseline",
    color: "#f59e0b",
    strokeWidth: 1.5,
    defaultVisible: true,
  },
  {
    key: "S2_fixed_20",
    label: "S2: Fixed 20%",
    color: "#f97316",
    strokeWidth: 1.5,
    defaultVisible: false,
  },
  {
    key: "S1_fixed_10",
    label: "S1: Fixed 10%",
    color: "#ef4444",
    strokeWidth: 1.5,
    defaultVisible: false,
  },
  {
    key: "S0_all_cash",
    label: "S0: All-cash",
    color: "#64748b",
    strokeWidth: 1.5,
    defaultVisible: false,
  },
];

export const StrategyRace: React.FC = () => {
  const settledHistory = useReplayStore((s) => s.settledHistory);

  // Visibility toggle map
  const [visibleMap, setVisibleMap] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    STRATEGIES.forEach((s) => {
      init[s.key] = s.defaultVisible;
    });
    return init;
  });

  const toggleLine = (key: string) => {
    setVisibleMap((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Build chart dataset from cumulative history
  const chartData = settledHistory.map((rec) => {
    const row: Record<string, any> = { date: rec.night_date.slice(5) }; // MM-DD
    STRATEGIES.forEach((s) => {
      const kpi = rec.cumulative[s.key];
      row[s.key] = kpi ? kpi.net_pnl : 0;
    });
    return row;
  });

  if (chartData.length < 2) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col items-center justify-center text-center h-[340px]">
        <Trophy className="w-10 h-10 text-muted-foreground/40 mb-3" />
        <h3 className="text-sm font-semibold text-foreground">Multi-Strategy Cumulative Race</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
          Awaiting settled nights. After 08:00 settlements occur, cumulative Net P&L trajectories will compare policy performance against oracle and static baselines.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">
            Cumulative Net P&L Race ({chartData.length} Nights Settled)
          </h3>
        </div>

        {/* Legend toggle buttons */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {STRATEGIES.map((s) => (
            <button
              key={s.key}
              onClick={() => toggleLine(s.key)}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all border ${
                visibleMap[s.key]
                  ? "bg-card text-foreground shadow-2xs border-border"
                  : "opacity-40 line-through text-muted-foreground border-transparent hover:opacity-70"
              }`}
            >
              <span
                className="inline-block w-2 h-2 rounded-full mr-1"
                style={{ backgroundColor: s.color }}
              />
              {s.key.split("_")[0]}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[280px] sm:h-[320px] w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
            <XAxis
              dataKey="date"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
            />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              tickFormatter={(val) => formatMillions(val, 1)}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-card border border-border p-3 rounded-lg shadow-lg text-xs font-mono space-y-1">
                      <div className="font-bold text-foreground border-b border-border pb-1">
                        Night: {label}
                      </div>
                      {payload.map((item) => (
                        <div
                          key={item.dataKey}
                          className="flex justify-between gap-4"
                          style={{ color: item.color }}
                        >
                          <span>{item.name}:</span>
                          <span className="font-bold">{formatCurrency(item.value as number)}</span>
                        </div>
                      ))}
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend
              verticalAlign="bottom"
              height={30}
              formatter={(value) => (
                <span className="text-[11px] text-muted-foreground font-medium">{value}</span>
              )}
            />

            {STRATEGIES.map(
              (s) =>
                visibleMap[s.key] && (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={s.strokeWidth}
                    strokeDasharray={s.strokeDasharray}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                )
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
