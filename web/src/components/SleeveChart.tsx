/**
 * SleeveChart.tsx: Real-time Recharts strategic sleeve valuation chart (valued 24/7).
 * Stacked area of Tier 1 Repo, Tier 2 Bonds, and Tier 3 Equities,
 * plus the repo-only benchmark reference line, with labelled axes in $M.
 * Includes accessible "View as table" toggle and keyboard-reachable tooltips.
 */

import React from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { Layers } from "lucide-react";
import { useReplayStore, selectSleeveChartData } from "../store/useReplayStore";
import { formatCurrency, formatMillions } from "../utils/formatters";
import ChartFrame from "./common/ChartFrame";

export const SleeveChart: React.FC = () => {
  const sleevePoints = useReplayStore((s) => s.sleevePoints);
  const chartData = selectSleeveChartData(sleevePoints);
  const lastPoint = chartData.length > 0 ? chartData[chartData.length - 1] : null;
  const lastTickTime = lastPoint?.time;

  // Accessible Table Alternative for Screen Readers & Keyboard Users
  const tableAlternative = (
    <table className="w-full text-left text-xs text-text-primary border-collapse">
      <thead className="bg-subtle text-text-secondary uppercase text-2xs sticky top-0 border-b border-border-subtle">
        <tr>
          <th className="py-2 px-3">Timestamp</th>
          <th className="py-2 px-3 text-right">Repo ($M)</th>
          <th className="py-2 px-3 text-right">Bonds ($M)</th>
          <th className="py-2 px-3 text-right">Equities ($M)</th>
          <th className="py-2 px-3 text-right">Total ($M)</th>
          <th className="py-2 px-3 text-right">Benchmark ($M)</th>
          <th className="py-2 px-3 text-right">Excess vs Repo</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border-subtle tabular-nums font-mono">
        {chartData.map((pt) => (
          <tr key={pt.ts} className="hover:bg-subtle/50">
            <td className="py-1.5 px-3 font-semibold text-text-primary">{pt.time}</td>
            <td className="py-1.5 px-3 text-right">{formatMillions(pt.repo, 2)}</td>
            <td className="py-1.5 px-3 text-right">{formatMillions(pt.bonds, 2)}</td>
            <td className="py-1.5 px-3 text-right">{formatMillions(pt.equities, 2)}</td>
            <td className="py-1.5 px-3 text-right font-bold text-text-primary">
              {formatMillions(pt.total, 2)}
            </td>
            <td className="py-1.5 px-3 text-right text-text-muted">
              {formatMillions(pt.benchmark, 2)}
            </td>
            <td
              className={`py-1.5 px-3 text-right font-medium ${
                pt.cum_excess >= 0 ? "text-pos" : "text-neg"
              }`}
            >
              {pt.cum_excess >= 0 ? "+" : ""}
              {formatCurrency(pt.cum_excess, 0)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartFrame
      title="Strategic Sleeve Valuation"
      units="$M USD"
      period="24/7 continuous valuation"
      lastUpdated={lastTickTime ? `Last tick: ${lastTickTime}` : undefined}
      tableAlternative={chartData.length > 0 ? tableAlternative : undefined}
      headerAction={
        <div className="flex items-center gap-3 text-2xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#38bdf8]" />
            <span className="text-text-secondary">Repo</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#f59e0b]" />
            <span className="text-text-secondary">Bonds (2Y)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#818cf8]" />
            <span className="text-text-secondary">Equities</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-t-2 border-dashed border-[#94a3b8]" />
            <span className="text-text-secondary">Repo-only Benchmark</span>
          </div>
        </div>
      }
    >
      {chartData.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center h-[260px] sm:h-[300px] bg-subtle/30 rounded-sm border border-dashed border-border-subtle p-6">
          <Layers className="w-8 h-8 text-text-muted mb-3" aria-hidden="true" />
          <h4 className="text-sm font-semibold text-text-primary">Strategic Sleeve Valuation (24/7)</h4>
          <p className="text-xs text-text-secondary mt-1 max-w-md">
            Awaiting simulation ticks. Sleeve value stacked across Tier 1 Repo, Tier 2 Bonds, and Tier 3 Equities,
            alongside the repo-only benchmark line, will stream here hour-by-hour through day and night.
          </p>
        </div>
      ) : (
        <div
          role="region"
          className="h-[260px] sm:h-[300px] w-full pt-1"
          tabIndex={0}
          aria-label="Strategic Sleeve Value Progression Chart"
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 10, right: 15, left: 10, bottom: 0 }}
            >
              <XAxis
                dataKey="time"
                stroke="var(--text-muted)"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "var(--border-subtle)" }}
              />
              <YAxis
                stroke="var(--text-muted)"
                fontSize={11}
                tickFormatter={(val) => `$${Number(val).toFixed(1)}M`}
                tickLine={false}
                axisLine={{ stroke: "var(--border-subtle)" }}
                domain={["auto", "auto"]}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const row = payload[0].payload;
                  return (
                    <div className="bg-surface border border-border-subtle rounded-sm shadow-md p-2.5 text-xs font-mono space-y-1.5 z-50">
                      <div className="font-semibold text-text-primary border-b border-border-subtle pb-1">
                        {row.time}
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-[#38bdf8]">Repo:</span>
                        <span className="tabular-nums font-semibold">{formatCurrency(row.repo, 0)}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-[#f59e0b]">Bonds (2Y):</span>
                        <span className="tabular-nums font-semibold">{formatCurrency(row.bonds, 0)}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-[#818cf8]">Equities:</span>
                        <span className="tabular-nums font-semibold">{formatCurrency(row.equities, 0)}</span>
                      </div>
                      <div className="flex justify-between gap-4 border-t border-border-subtle pt-1 text-text-primary font-bold">
                        <span>Total Sleeve:</span>
                        <span className="tabular-nums">{formatCurrency(row.total, 0)}</span>
                      </div>
                      <div className="flex justify-between gap-4 text-text-muted">
                        <span>Benchmark (Repo):</span>
                        <span className="tabular-nums">{formatCurrency(row.benchmark, 0)}</span>
                      </div>
                      <div className="flex justify-between gap-4 border-t border-border-subtle pt-1">
                        <span className="text-text-secondary">Excess vs Repo:</span>
                        <span
                          className={`tabular-nums font-bold ${
                            row.cum_excess >= 0 ? "text-pos" : "text-neg"
                          }`}
                        >
                          {row.cum_excess >= 0 ? "+" : ""}
                          {formatCurrency(row.cum_excess, 0)}
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
              {/* Stacked Areas */}
              <Area
                type="monotone"
                dataKey="repo_m"
                stackId="1"
                stroke="#38bdf8"
                fill="#38bdf8"
                fillOpacity={0.35}
                name="Repo"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="bonds_m"
                stackId="1"
                stroke="#f59e0b"
                fill="#f59e0b"
                fillOpacity={0.35}
                name="Bonds"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="equities_m"
                stackId="1"
                stroke="#818cf8"
                fill="#818cf8"
                fillOpacity={0.35}
                name="Equities"
                isAnimationActive={false}
              />
              {/* Benchmark Reference Line */}
              <Line
                type="monotone"
                dataKey="benchmark_m"
                stroke="#94a3b8"
                strokeDasharray="3 3"
                strokeWidth={1.5}
                dot={false}
                name="Repo-only Benchmark"
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartFrame>
  );
};

export default SleeveChart;
