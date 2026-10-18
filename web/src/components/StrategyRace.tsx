/**
 * StrategyRace.tsx: Cumulative Net P&L line chart over all settled nights comparing:
 * - S0_all_cash: All Cash (0 risk, 0 repo yield)
 * - S1_fixed_10: Fixed 10% Reserve (aggressive sweep)
 * - S2_fixed_20: Fixed 20% Reserve
 * - S3_static: Static Baseline (P98 fixed buffer)
 * - S4_policy_zero_overdraft: Zero-Overdraft Policy (conformal buffer)
 * - S5_policy_cost_optimal: Cost-Optimal Policy (quantile balancing)
 * - S6_oracle: Oracle (upper bound, not deployable)
 */

import React, { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { useReplayStore } from "../store/useReplayStore";
import { formatMillions, formatCurrency } from "../utils/formatters";
import ChartFrame from "./common/ChartFrame";

import { STRATEGY_LABELS } from "../utils/labels";

interface StrategyConfig {
  key: string;
  apiName: string;
  subtitle: string;
  color: string;
  strokeWidth: number;
  strokeDasharray?: string;
  defaultVisible: boolean;
}

const STRATEGIES: StrategyConfig[] = [
  {
    key: "S4_policy_zero_overdraft",
    apiName: "S4_policy_zero_overdraft",
    subtitle: STRATEGY_LABELS.S4_policy_zero_overdraft,
    color: "#0284c7",
    strokeWidth: 2.5,
    defaultVisible: true,
  },
  {
    key: "S5_policy_cost_optimal",
    apiName: "S5_policy_cost_optimal",
    subtitle: STRATEGY_LABELS.S5_policy_cost_optimal,
    color: "#15803d",
    strokeWidth: 2.5,
    defaultVisible: true,
  },
  {
    key: "S6_oracle",
    apiName: "S6_oracle",
    subtitle: STRATEGY_LABELS.S6_oracle,
    color: "#7c3aed",
    strokeWidth: 2,
    strokeDasharray: "4 4",
    defaultVisible: true,
  },
  {
    key: "S3_static",
    apiName: "S3_static",
    subtitle: STRATEGY_LABELS.S3_static,
    color: "#b45309",
    strokeWidth: 1.5,
    defaultVisible: true,
  },
  {
    key: "S2_fixed_20",
    apiName: "S2_fixed_20",
    subtitle: STRATEGY_LABELS.S2_fixed_20,
    color: "#ea580c",
    strokeWidth: 1.5,
    defaultVisible: false,
  },
  {
    key: "S1_fixed_10",
    apiName: "S1_fixed_10",
    subtitle: STRATEGY_LABELS.S1_fixed_10,
    color: "#b91c1c",
    strokeWidth: 1.5,
    defaultVisible: false,
  },
  {
    key: "S0_all_cash",
    apiName: "S0_all_cash",
    subtitle: STRATEGY_LABELS.S0_all_cash,
    color: "#64748b",
    strokeWidth: 1.5,
    defaultVisible: false,
  },
];

export const StrategyRace: React.FC = () => {
  const settledHistory = useReplayStore((s) => s.settledHistory);

  const [visibleMap, setVisibleMap] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    STRATEGIES.forEach((s) => {
      init[s.key] = s.defaultVisible;
    });
    return init;
  });

  const toggleStrategy = (key: string) => {
    setVisibleMap((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Build chart points from settledHistory
  const chartData = settledHistory.map((h) => {
    const pt: Record<string, any> = {
      date: h.night_date.slice(5),
      fullDate: h.night_date,
    };
    if (h.cumulative) {
      Object.entries(h.cumulative).forEach(([stratKey, kpi]) => {
        pt[stratKey] = kpi.net_pnl;
      });
    }
    return pt;
  });

  if (chartData.length === 0) {
    return (
      <div className="bg-surface border border-border-subtle rounded-md p-6 flex flex-col items-center justify-center text-center h-[340px]">
        <h4 className="text-sm font-semibold text-text-primary">Multi-Strategy Cumulative Performance</h4>
        <p className="text-xs text-text-secondary mt-1 max-w-sm">
          Awaiting settled nights. S0 through S6 cumulative net P&L progression will populate here as settlements occur.
        </p>
      </div>
    );
  }

  // Table alternative
  const tableAlternative = (
    <table className="w-full text-left text-xs text-text-primary border-collapse">
      <thead className="bg-subtle text-text-secondary uppercase text-2xs sticky top-0 border-b border-border-subtle">
        <tr>
          <th className="py-2 px-3">Date</th>
          <th className="py-2 px-3 text-right">S4 Net P&L</th>
          <th className="py-2 px-3 text-right">S5 Net P&L</th>
          <th className="py-2 px-3 text-right">S6 Oracle</th>
          <th className="py-2 px-3 text-right">S3 Static</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border-subtle tabular-nums font-mono">
        {chartData.slice(-15).map((pt) => (
          <tr key={pt.fullDate} className="hover:bg-subtle/50">
            <td className="py-1.5 px-3 font-semibold text-text-primary">{pt.fullDate}</td>
            <td className="py-1.5 px-3 text-right">{formatCurrency(pt["S4_policy_zero_overdraft"], 0)}</td>
            <td className="py-1.5 px-3 text-right">{formatCurrency(pt["S5_policy_cost_optimal"], 0)}</td>
            <td className="py-1.5 px-3 text-right text-purple-600 font-bold">{formatCurrency(pt["S6_oracle"], 0)}</td>
            <td className="py-1.5 px-3 text-right text-text-muted">{formatCurrency(pt["S3_static"], 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartFrame
      title="Cumulative Net P&L Race"
      units="$M USD"
      period={`${chartData.length} Nights Settled`}
      lastUpdated={chartData[chartData.length - 1]?.fullDate}
      tableAlternative={tableAlternative}
      headerAction={
        <div className="flex items-center gap-1.5 flex-wrap">
          {STRATEGIES.map((strat) => {
            const isVisible = visibleMap[strat.key];
            return (
              <button
                key={strat.key}
                type="button"
                onClick={() => toggleStrategy(strat.key)}
                aria-pressed={isVisible}
                className={`px-1.5 py-0.5 rounded-xs text-2xs font-mono font-medium border transition-colors ${
                  isVisible
                    ? "bg-subtle text-text-primary border-border-strong"
                    : "opacity-40 text-text-muted border-border-subtle line-through"
                }`}
                title={`${strat.apiName}: ${strat.subtitle}`}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1"
                  style={{ backgroundColor: strat.color }}
                  aria-hidden="true"
                />
                {strat.key.split("_")[0]}
              </button>
            );
          })}
        </div>
      }
    >
      <div role="region" className="h-[280px] sm:h-[300px] w-full pt-1" tabIndex={0} aria-label="Strategy Race Chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 15, left: 5, bottom: 0 }}>
            <XAxis
              dataKey="date"
              stroke="var(--text-muted)"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "var(--border-subtle)" }}
            />
            <YAxis
              stroke="var(--text-muted)"
              fontSize={11}
              tickFormatter={(val) => formatMillions(val, 1)}
              tickLine={false}
              axisLine={{ stroke: "var(--border-subtle)" }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div
                      role="tooltip"
                      tabIndex={0}
                      className="bg-surface border border-border-strong p-2.5 rounded-sm shadow-md text-xs font-mono space-y-1 text-text-primary max-w-xs"
                    >
                      <div className="font-bold border-b border-border-subtle pb-1">
                        Night: {data.fullDate}
                      </div>
                      {STRATEGIES.filter((s) => visibleMap[s.key]).map((strat) => (
                        <div
                          key={strat.key}
                          className="flex items-center justify-between gap-3 text-2xs"
                          style={{ color: strat.color }}
                        >
                          <span className="truncate">
                            {strat.apiName}
                            {strat.key === "S6_oracle" && " (upper bound)"}:
                          </span>
                          <span className="font-bold tabular-nums">
                            {formatCurrency(data[strat.key], 0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                }
                return null;
              }}
            />

            {STRATEGIES.map((strat) => {
              if (!visibleMap[strat.key]) return null;
              return (
                <Line
                  key={strat.key}
                  type="monotone"
                  dataKey={strat.key}
                  name={`${strat.apiName} (${strat.subtitle})`}
                  stroke={strat.color}
                  strokeWidth={strat.strokeWidth}
                  strokeDasharray={strat.strokeDasharray}
                  dot={false}
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
};

export default StrategyRace;
